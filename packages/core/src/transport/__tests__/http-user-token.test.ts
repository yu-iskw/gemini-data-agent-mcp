import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearCredentialCache, resolveCredentials } from '../../auth/resolver.js';
import { createStubTokenVerifier, resetOidcDiscoveryCacheForTests } from '../oauth.js';
import { startMcpHttpServer } from '../start-http-server.js';

import type { AppConfig } from '../../types.js';

const testIssuer = 'https://auth.example.com/realms/test';
const mcpToken = 'mcp-access-token';
const userGoogleToken = 'user-google-access-token';

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

function createEgressProbeServer(): McpServer {
  const server = new McpServer({ name: 'user-token-test', version: '0.1.0' });
  server.tool('egress_auth', 'Return egress Authorization header', {}, async () => {
    clearCredentialCache();
    const creds = await resolveCredentials({ mode: 'user_token' });
    const headers = await creds.getRequestHeaders();
    return {
      content: [{ type: 'text', text: headers.Authorization ?? '' }],
    };
  });
  return server;
}

function buildUserTokenConfig(port: number): AppConfig {
  const baseUrl = `http://127.0.0.1:${port}/mcp`;
  return {
    api_version: 'v1beta',
    server: {
      name: 'user-token-test',
      log_level: 'ERROR',
      transport: 'http',
      host: '127.0.0.1',
      port,
      public_url: baseUrl,
      http: { path: '/mcp' },
      oauth: {
        enabled: true,
        resource_url: baseUrl,
        issuer: testIssuer,
        scopes_supported: ['mcp:tools'],
        required_scopes: ['mcp:tools'],
      },
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
    clientInfo: { name: 'user-token-test', version: '0.1.0' },
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

async function readJsonRpcResult(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await response.json()) as { result?: unknown };
    return body.result;
  }

  const text = await response.text();
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  if (!dataLine) {
    throw new Error(`No SSE data in response: ${text}`);
  }
  const payload = JSON.parse(dataLine.slice('data: '.length)) as { result?: unknown };
  return payload.result;
}

describe('HTTP user_token egress', () => {
  it('uses X-Google-Access-Token for Data Agent egress, not MCP Authorization', async () => {
    stubOidcDiscovery();
    const verifier = createStubTokenVerifier(new Map([[mcpToken, { principalId: 'bff-client' }]]));

    const handle = await startMcpHttpServer({
      config: buildUserTokenConfig(0),
      createMcpServer: createEgressProbeServer,
      testTokenVerifier: verifier,
    });
    activeServers.push(handle);

    const initResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        'X-Google-Access-Token': userGoogleToken,
      },
      body: JSON.stringify(initializeBody),
    });
    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId!,
        'X-Google-Access-Token': userGoogleToken,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    const toolResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId!,
        'X-Google-Access-Token': userGoogleToken,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'egress_auth', arguments: {} },
      }),
    });

    expect(toolResponse.status).toBe(200);
    const result = (await readJsonRpcResult(toolResponse)) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const egressAuth = result.content?.[0]?.text ?? '';
    expect(egressAuth).toBe(`Bearer ${userGoogleToken}`);
    expect(egressAuth).not.toContain(mcpToken);
  });

  it('does not read user token when no agent uses user_token mode', async () => {
    stubOidcDiscovery();
    const verifier = createStubTokenVerifier(new Map([[mcpToken, { principalId: 'bff-client' }]]));

    const config = buildUserTokenConfig(0);
    config.agents['my-agent'].auth = { mode: 'adc' };

    const handle = await startMcpHttpServer({
      config,
      createMcpServer: createEgressProbeServer,
      testTokenVerifier: verifier,
    });
    activeServers.push(handle);

    const initResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        'X-Google-Access-Token': userGoogleToken,
      },
      body: JSON.stringify(initializeBody),
    });
    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id');

    await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId!,
        'X-Google-Access-Token': userGoogleToken,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    const toolResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId!,
        'X-Google-Access-Token': userGoogleToken,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'egress_auth', arguments: {} },
      }),
    });

    expect(toolResponse.status).toBe(200);
    const result = (await readJsonRpcResult(toolResponse)) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
    expect(result.isError ?? result.content?.[0]?.text?.includes('AUTH_MISSING_USER_TOKEN')).toBe(
      true,
    );
  });
});
