import { DataAgentMcpError } from '../types.js';

import {
  buildQueryDataUrl,
  buildA2ASendUrl,
  buildA2AStreamUrl,
  buildOperationUrl,
  extractDataAgentId,
  normalizeDataAgentName,
} from './endpoints.js';
import { parseGoogleApiError } from './errors.js';

import type { ResolvedCredentials } from '../auth/index.js';
import type { ApiVersion, GoogleApiResponse } from '../types.js';

interface QueryDataOptions {
  project: string;
  location: string;
  version: ApiVersion;
  query: string;
  dataAgent?: string;
  generationOptions?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timeoutMs?: number;
}

interface A2AMessageOptions {
  project: string;
  location: string;
  dataAgentId: string;
  version: ApiVersion;
  message: string;
  blocking?: boolean;
  returnLro?: boolean;
  timeoutMs?: number;
}

interface GetOperationOptions {
  version: ApiVersion;
  operationName: string;
  agent: string;
  timeoutMs?: number;
}

interface RawRequestOptions {
  version: ApiVersion;
  method: string;
  url: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  agent: string;
  timeoutMs?: number;
}

class GeminiDataAgentClient {
  constructor(private readonly credentials: ResolvedCredentials) {}

  async queryData(options: QueryDataOptions): Promise<GoogleApiResponse> {
    const url = buildQueryDataUrl(options.version, options.project, options.location);

    const requestBody: Record<string, unknown> = {
      query: options.query,
    };

    if (options.dataAgent) {
      requestBody['dataAgent'] = normalizeDataAgentName(
        options.dataAgent,
        options.project,
        options.location,
      );
    }

    if (options.generationOptions) {
      requestBody['generationOptions'] = options.generationOptions;
    }

    if (options.context) {
      requestBody['context'] = options.context;
    }

    return this.post(url, requestBody, options.version, 'unknown', options.timeoutMs);
  }

  async sendA2AMessage(options: A2AMessageOptions): Promise<GoogleApiResponse> {
    const dataAgentId = extractDataAgentId(options.dataAgentId);
    const url = buildA2ASendUrl(options.version, options.project, options.location, dataAgentId);

    const requestBody = {
      message: {
        role: 'user',
        parts: [{ text: options.message }],
      },
      configuration: {
        blocking: options.blocking ?? true,
      },
      return_lro: options.returnLro ?? false,
    };

    return this.post(url, requestBody, options.version, 'unknown', options.timeoutMs);
  }

  async streamA2AMessage(options: A2AMessageOptions): Promise<GoogleApiResponse> {
    const dataAgentId = extractDataAgentId(options.dataAgentId);
    const url = buildA2AStreamUrl(options.version, options.project, options.location, dataAgentId);

    const requestBody = {
      message: {
        role: 'user',
        parts: [{ text: options.message }],
      },
    };

    return this.post(url, requestBody, options.version, 'unknown', options.timeoutMs);
  }

  async getOperation(options: GetOperationOptions): Promise<GoogleApiResponse> {
    const url = buildOperationUrl(options.version, options.operationName);
    return this.get(url, options.version, options.agent, options.timeoutMs);
  }

  async rawRequest(options: RawRequestOptions): Promise<GoogleApiResponse> {
    const urlObj = new URL(options.url);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        urlObj.searchParams.set(key, value);
      }
    }

    const headers = await this.credentials.getRequestHeaders();

    const init: RequestInit = {
      method: options.method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
    };

    if (options.body && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(options.method)) {
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(urlObj.toString(), init);
    const responseBody = await this.parseResponseBody(response);

    if (!response.ok) {
      throw parseGoogleApiError(response.status, responseBody, options.agent, options.version);
    }

    return responseBody as GoogleApiResponse;
  }

  private async post(
    url: string,
    body: Record<string, unknown>,
    version: string,
    agent: string,
    timeoutMs?: number,
  ): Promise<GoogleApiResponse> {
    const headers = await this.credentials.getRequestHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });

    const responseBody = await this.parseResponseBody(response);

    if (!response.ok) {
      throw parseGoogleApiError(response.status, responseBody, agent, version);
    }

    return responseBody as GoogleApiResponse;
  }

  private async get(
    url: string,
    version: string,
    agent: string,
    timeoutMs?: number,
  ): Promise<GoogleApiResponse> {
    const headers = await this.credentials.getRequestHeaders();

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });

    const responseBody = await this.parseResponseBody(response);

    if (!response.ok) {
      throw parseGoogleApiError(response.status, responseBody, agent, version);
    }

    return responseBody as GoogleApiResponse;
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        return { raw: await response.text() };
      }
    }
    return { raw: await response.text() };
  }
}

export function createClient(credentials: ResolvedCredentials): GeminiDataAgentClient {
  return new GeminiDataAgentClient(credentials);
}

export function wrapNetworkError(err: unknown, agent: string): DataAgentMcpError {
  if (err instanceof DataAgentMcpError) return err;

  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);

  if (name === 'AbortError' || message.includes('timeout')) {
    return new DataAgentMcpError('TIMEOUT', `Request timed out: ${message}`, true, { agent });
  }

  return new DataAgentMcpError('NETWORK_ERROR', `Network error: ${message}`, true, { agent });
}
