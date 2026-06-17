import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStubIdTokenVerifier } from '../../auth/google-id-token-verifier.js';
import { GOOGLE_CREDENTIAL_CLIENT_MESSAGE } from '../../auth/google-token-errors.js';
import { createStubTokenVerifier, resetOidcDiscoveryCacheForTests } from '../oauth.js';
import { startMcpHttpServer } from '../start-http-server.js';
import { GOOGLE_CREDENTIAL_ERROR_CODE } from '../user-token-middleware.js';

import {
  defaultGoogleAccessToken,
  defaultGoogleIdToken,
  defaultHttpOauthFields,
  defaultUserTokenConfig,
  testIssuer,
} from './http-test-fixtures.js';

import type { AppConfig } from '../../types.js';

const mcpToken = 'mcp-access-token';

function stubOidcDiscovery(): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: testIssuer,
            authorization_endpoint: `${testIssuer}/auth`,
            token_endpoint: `${testIssuer}/token`,
            jwks_uri: `${testIssuer}/jwks`,
          }),
          { status: 200 },
        );
      }
      return realFetch(input, init);
    }),
  );
}

function buildConfig(port: number): AppConfig {
  const baseUrl = `http://127.0.0.1:${port}/mcp`;
  return {
    api_version: 'v1beta',
    server: {
      name: 'user-token-redaction-test',
      log_level: 'ERROR',
      transport: 'http',
      host: '127.0.0.1',
      port,
      public_url: baseUrl,
      http: { path: '/mcp', user_token: defaultUserTokenConfig() },
      oauth: defaultHttpOauthFields({
        enabled: true,
        resource_url: baseUrl,
        issuer: testIssuer,
        allowed_audiences: [baseUrl],
      }),
    },
    security: {
      redaction: {
        enabled: true,
        show_service_account: 'hidden',
        redact_headers: true,
        redact_tokens: true,
        redact_raw_request_body: true,
        redact_raw_response_body: true,
      },
      audit: { enabled: false, include_prompt: false, include_response: false },
      persistence: { enabled: false },
      raw_passthrough: { enabled: false, allowed_methods: [], allowed_path_patterns: [] },
    },
    agents: {
      'my-agent': {
        project: 'p',
        location: 'l',
        api_version: 'v1beta',
        data_agent: 'projects/p/locations/l/dataAgents/my-agent',
        auth: { mode: 'user_token' },
        tools: ['query_data_agent'],
      },
    },
  };
}

afterEach(async () => {
  resetOidcDiscoveryCacheForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('user_token error redaction', () => {
  it('returns stable JSON-RPC error without policy details', async () => {
    stubOidcDiscovery();

    const handle = await startMcpHttpServer({
      config: buildConfig(0),
      createMcpServer: () => new McpServer({ name: 'redaction-test', version: '0.1.0' }),
      testTokenVerifier: createStubTokenVerifier(
        new Map([
          [
            mcpToken,
            {
              principalId: 'sub:user|client:bff-client',
              sub: 'user',
              clientId: 'bff-client',
            },
          ],
        ]),
      ),
      testIdTokenVerifier: createStubIdTokenVerifier(new Map()),
    });

    const response = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        'X-Google-Access-Token': defaultGoogleAccessToken,
        'X-Google-Id-Token': 'unknown-id-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'redaction-test', version: '0.1.0' },
        },
      }),
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: { code?: number; message?: string } };
    expect(body.error?.code).toBe(GOOGLE_CREDENTIAL_ERROR_CODE);
    expect(body.error?.message).toBe(GOOGLE_CREDENTIAL_CLIENT_MESSAGE);
    expect(JSON.stringify(body)).not.toContain('accounts.google.com');
    expect(JSON.stringify(body)).not.toContain('issuer');
    expect(JSON.stringify(body)).not.toContain('at_hash');

    await handle.close();
  });
});

describe('session init cleanup', () => {
  it('releases session capacity when initialize fails after session assignment', async () => {
    stubOidcDiscovery();

    const config = buildConfig(0);
    config.server.http!.sessions = { max_sessions: 1 };

    const verifier = createStubTokenVerifier(
      new Map([
        [
          mcpToken,
          {
            principalId: 'sub:user|client:bff-client',
            sub: 'user',
            clientId: 'bff-client',
          },
        ],
      ]),
    );
    const idVerifier = createStubIdTokenVerifier(
      new Map([
        [
          defaultGoogleIdToken,
          {
            issuer: 'https://accounts.google.com',
            subject: 'user',
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          },
        ],
      ]),
    );

    const originalHandleRequest = StreamableHTTPServerTransport.prototype.handleRequest;
    const handleRequestSpy = vi
      .spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest')
      .mockImplementation(async function (
        this: StreamableHTTPServerTransport,
        ...args: Parameters<typeof originalHandleRequest>
      ) {
        await originalHandleRequest.apply(this, args);
        throw new Error('simulated initialize failure');
      });

    const handle = await startMcpHttpServer({
      config,
      createMcpServer: () => new McpServer({ name: 'init-cleanup-test', version: '0.1.0' }),
      testTokenVerifier: verifier,
      testIdTokenVerifier: idVerifier,
    });

    const initializeBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'init-cleanup-test', version: '0.1.0' },
      },
    };

    const googleHeaders = {
      'X-Google-Access-Token': defaultGoogleAccessToken,
      'X-Google-Id-Token': defaultGoogleIdToken,
    };

    const failed = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        ...googleHeaders,
      },
      body: JSON.stringify(initializeBody),
    });
    expect(handleRequestSpy).toHaveBeenCalled();
    // handleRequest may send the HTTP response before the simulated failure propagates
    expect([200, 500]).toContain(failed.status);

    handleRequestSpy.mockRestore();

    const retry = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        ...googleHeaders,
      },
      body: JSON.stringify({ ...initializeBody, id: 2 }),
    });
    expect(retry.status).toBe(200);

    await handle.close();
  });
});
