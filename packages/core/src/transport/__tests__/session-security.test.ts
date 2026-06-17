import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createStubTokenVerifier,
  derivePrincipalId,
  resetOidcDiscoveryCacheForTests,
} from '../oauth.js';
import { startMcpHttpServer } from '../start-http-server.js';

import { defaultHttpOauthFields, testIssuer } from './http-test-fixtures.js';

import type { AppConfig } from '../../types.js';

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
            authorization_endpoint: `${testIssuer}/protocol/openid-connect/auth`,
            token_endpoint: `${testIssuer}/protocol/openid-connect/token`,
            jwks_uri: `${testIssuer}/protocol/openid-connect/certs`,
          }),
          { status: 200 },
        );
      }
      return realFetch(input, init);
    }),
  );
}

function createTestMcpServer(): McpServer {
  const server = new McpServer({ name: 'session-security-test', version: '0.1.0' });
  server.tool('ping', 'Ping', { message: z.string().optional() }, async ({ message }) => ({
    content: [{ type: 'text', text: message ?? 'pong' }],
  }));
  return server;
}

function buildConfig(port: number): AppConfig {
  const baseUrl = `http://127.0.0.1:${port}/mcp`;
  return {
    api_version: 'v1beta',
    server: {
      name: 'session-security-test',
      log_level: 'ERROR',
      transport: 'http',
      host: '127.0.0.1',
      port,
      public_url: baseUrl,
      http: {
        path: '/mcp',
        sessions: { max_sessions: 100, idle_ttl_ms: 60_000, max_sessions_per_principal: 50 },
      },
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
        auth: { mode: 'adc' },
        tools: ['query_data_agent'],
      },
    },
  };
}

const initializeBody = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'session-security', version: '0.1.0' },
  },
};

const activeServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  resetOidcDiscoveryCacheForTests();
  vi.unstubAllGlobals();
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    await server?.close();
  }
});

describe('derivePrincipalId', () => {
  it('prefers namespaced sub|client composite when both are present', () => {
    expect(derivePrincipalId({ sub: 'user-1', azp: 'client-a' })).toBe(
      'sub:user-1|client:client-a',
    );
  });

  it('falls back to namespaced sub or client', () => {
    expect(derivePrincipalId({ sub: 'user-1' })).toBe('sub:user-1');
    expect(derivePrincipalId({ azp: 'client-a' })).toBe('client:client-a');
  });
});

describe('session principal binding', () => {
  it('returns 403 when another principal reuses a session id', async () => {
    stubOidcDiscovery();
    const verifier = createStubTokenVerifier(
      new Map([
        ['token-a', { principalId: 'user-a' }],
        ['token-b', { principalId: 'user-b' }],
      ]),
    );

    const handle = await startMcpHttpServer({
      config: buildConfig(0),
      createMcpServer: createTestMcpServer,
      testTokenVerifier: verifier,
    });
    activeServers.push(handle);

    const initResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer token-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(initializeBody),
    });

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const hijackResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer token-b',
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId!,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping', params: {} }),
    });

    expect(hijackResponse.status).toBe(403);
  });

  it('allows the owning principal to GET the session', async () => {
    stubOidcDiscovery();
    const verifier = createStubTokenVerifier(new Map([['token-a', { principalId: 'user-a' }]]));

    const handle = await startMcpHttpServer({
      config: buildConfig(0),
      createMcpServer: createTestMcpServer,
      testTokenVerifier: verifier,
    });
    activeServers.push(handle);

    const initResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer token-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(initializeBody),
    });
    const sessionId = initResponse.headers.get('mcp-session-id');

    const getResponse = await fetch(handle.bindUrl.href, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        Authorization: 'Bearer token-a',
        'Mcp-Session-Id': sessionId!,
      },
    });

    expect(getResponse.status).not.toBe(403);
  });
});
