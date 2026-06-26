import { parseGoogleApiError } from '../google-api/errors.js';
import { API_HOST } from '../google-api/versions.js';
import { DataAgentMcpError } from '../types.js';

import type { ResolvedCredentials } from '../auth/index.js';
import type { ApiVersion } from '../types.js';

export type GoogleRestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface GoogleRestRequest {
  method: GoogleRestMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  timeoutMs?: number;
  agent?: string;
  version?: ApiVersion;
}

export interface GoogleRestTransport {
  request<TResponse>(request: GoogleRestRequest): Promise<TResponse>;
}

interface CreateGoogleRestTransportOptions {
  credentials: ResolvedCredentials;
  defaultVersion?: ApiVersion;
  defaultAgent?: string;
  defaultTimeoutMs?: number;
}

function buildUrl(path: string, query?: GoogleRestRequest['query']): string {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(`${API_HOST}/${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export function createGoogleRestTransport(
  options: CreateGoogleRestTransportOptions,
): GoogleRestTransport {
  const {
    credentials,
    defaultVersion = 'v1beta',
    defaultAgent = 'unknown',
    defaultTimeoutMs,
  } = options;

  return {
    async request<TResponse>(request: GoogleRestRequest): Promise<TResponse> {
      const url = buildUrl(request.path, request.query);
      const agent = request.agent ?? defaultAgent;
      const version = request.version ?? defaultVersion;
      const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;

      const headers = await credentials.getRequestHeaders();
      const init: RequestInit = {
        method: request.method,
        headers: {
          ...headers,
          ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
      };

      if (request.body !== undefined && ['POST', 'PATCH', 'DELETE'].includes(request.method)) {
        init.body = JSON.stringify(request.body);
      }

      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const name = err instanceof Error ? err.name : '';
        if (name === 'AbortError' || message.includes('timeout')) {
          throw new DataAgentMcpError('TIMEOUT', `Request timed out: ${message}`, true, { agent });
        }
        throw new DataAgentMcpError('NETWORK_ERROR', `Network error: ${message}`, true, { agent });
      }

      const responseBody = await parseResponseBody(response);
      if (!response.ok) {
        throw parseGoogleApiError(response.status, responseBody, agent, version);
      }

      return responseBody as TResponse;
    },
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
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
