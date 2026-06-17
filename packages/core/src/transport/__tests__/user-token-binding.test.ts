import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createStubIdTokenVerifier } from '../../auth/google-id-token-verifier.js';
import { createStubTokenVerifier, resetOidcDiscoveryCacheForTests } from '../oauth.js';
import { startMcpHttpServer } from '../start-http-server.js';

import {
  defaultGoogleAccessToken,
  defaultGoogleIdToken,
  defaultHttpOauthFields,
  defaultUserTokenConfig,
  testIssuer,
} from './http-test-fixtures.js';

import type { AppConfig } from '../../types.js';

const mcpToken = 'mcp-access-token';
const googleIdTokenA = 'google-id-token-a';
const googleIdTokenB = 'google-id-token-b';
const googleUserSub = 'google-user-1';

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

function buildBindingConfig(port: number): AppConfig {
  const baseUrl = `http://127.0.0.1:${port}/mcp`;
  return {
    api_version: 'v1beta',
    server: {
      name: 'user-token-binding-test',
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

const initializeBody = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'binding-test', version: '0.1.0' },
  },
};

const activeServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  resetOidcDiscoveryCacheForTests();
  vi.unstubAllGlobals();
  while (activeServers.length > 0) {
    await activeServers.pop()?.close();
  }
});

function googleHeaders(idToken: string): Record<string, string> {
  return {
    'X-Google-Access-Token': defaultGoogleAccessToken,
    'X-Google-Id-Token': idToken,
  };
}

describe('user_token session binding', () => {
  it('rejects Google identity switch on an existing MCP session', async () => {
    stubOidcDiscovery();

    const verifier = createStubTokenVerifier(
      new Map([
        [
          mcpToken,
          {
            principalId: 'sub:google-user-1|client:bff-client',
            sub: googleUserSub,
            clientId: 'bff-client',
          },
        ],
      ]),
    );
    const idVerifier = createStubIdTokenVerifier(
      new Map([
        [
          googleIdTokenA,
          {
            issuer: 'https://accounts.google.com',
            subject: googleUserSub,
            clientId: 'google-client',
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          },
        ],
        [
          googleIdTokenB,
          {
            issuer: 'https://accounts.google.com',
            subject: 'other-user',
            clientId: 'google-client',
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          },
        ],
      ]),
    );

    const handle = await startMcpHttpServer({
      config: buildBindingConfig(0),
      createMcpServer: () => {
        const server = new McpServer({ name: 'binding-test', version: '0.1.0' });
        server.tool('ping', 'Ping', { message: z.string().optional() }, async ({ message }) => ({
          content: [{ type: 'text', text: message ?? 'pong' }],
        }));
        return server;
      },
      testTokenVerifier: verifier,
      testIdTokenVerifier: idVerifier,
    });
    activeServers.push(handle);

    const initResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        ...googleHeaders(googleIdTokenA),
      },
      body: JSON.stringify(initializeBody),
    });
    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const switched = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId!,
        ...googleHeaders(googleIdTokenB),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });

    expect(switched.status).toBe(403);
  });

  it('rejects untrusted MCP ingress client for user_token mode', async () => {
    stubOidcDiscovery();

    const verifier = createStubTokenVerifier(
      new Map([
        [
          mcpToken,
          { principalId: 'sub:google-user-1', sub: googleUserSub, clientId: 'evil-client' },
        ],
      ]),
    );
    const idVerifier = createStubIdTokenVerifier(
      new Map([
        [
          defaultGoogleIdToken,
          {
            issuer: 'https://accounts.google.com',
            subject: googleUserSub,
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          },
        ],
      ]),
    );

    const handle = await startMcpHttpServer({
      config: buildBindingConfig(0),
      createMcpServer: () => new McpServer({ name: 'binding-test', version: '0.1.0' }),
      testTokenVerifier: verifier,
      testIdTokenVerifier: idVerifier,
    });
    activeServers.push(handle);

    const response = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        ...googleHeaders(defaultGoogleIdToken),
      },
      body: JSON.stringify(initializeBody),
    });

    expect(response.status).toBe(403);
  });
});
