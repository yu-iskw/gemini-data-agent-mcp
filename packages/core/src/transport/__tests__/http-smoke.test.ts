import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { startMcpHttpServer } from '../start-http-server.js';

import type { AppConfig } from '../../types.js';

const testIssuer = 'https://auth.example.com/realms/test';

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
  const server = new McpServer({ name: 'http-smoke-test', version: '0.1.0' });
  server.tool('ping', 'Ping', { message: z.string().optional() }, async ({ message }) => ({
    content: [{ type: 'text', text: message ?? 'pong' }],
  }));
  return server;
}

function buildHttpTestConfig(port: number, oauthEnabled: boolean): AppConfig {
  const baseUrl = `http://127.0.0.1:${port}/mcp`;

  return {
    api_version: 'v1beta',
    server: {
      name: 'http-smoke-test',
      log_level: 'ERROR',
      transport: 'http',
      host: '127.0.0.1',
      port,
      http: { path: '/mcp' },
      oauth: {
        enabled: oauthEnabled,
        resource_url: baseUrl,
        issuer: testIssuer,
        scopes_supported: ['mcp:tools'],
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
        project: 'my-gcp-project',
        location: 'us-central1',
        api_version: 'v1beta',
        data_agent: 'projects/my-gcp-project/locations/us-central1/dataAgents/my-agent',
        auth: { mode: 'adc' },
        tools: ['query_data_agent'],
      },
    },
  };
}

const activeServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    await server?.close();
  }
});

describe('HTTP MCP transport', () => {
  it('accepts initialize request when oauth is disabled', async () => {
    const config = buildHttpTestConfig(0, false);
    const handle = await startMcpHttpServer({
      config,
      createMcpServer: createTestMcpServer,
    });
    activeServers.push(handle);

    const response = await fetch(handle.baseUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'http-smoke', version: '0.1.0' },
        },
      }),
    });

    expect(response.status).toBe(200);
    const sessionId = response.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await response.json()) as { result?: { serverInfo?: { name?: string } } };
      expect(body.result?.serverInfo?.name).toBe('http-smoke-test');
    } else {
      const text = await response.text();
      expect(text).toContain('http-smoke-test');
    }
  });

  it('returns 401 with WWW-Authenticate when oauth is enabled and token is missing', async () => {
    stubOidcDiscovery();
    const config = buildHttpTestConfig(0, true);
    const handle = await startMcpHttpServer({
      config,
      createMcpServer: createTestMcpServer,
    });
    activeServers.push(handle);

    const response = await fetch(handle.baseUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'http-smoke', version: '0.1.0' },
        },
      }),
    });

    expect(response.status).toBe(401);
    const wwwAuth = response.headers.get('www-authenticate') ?? '';
    expect(wwwAuth.toLowerCase()).toContain('bearer');
    expect(wwwAuth).toContain('resource_metadata');
  });

  it('serves protected resource metadata when oauth is enabled', async () => {
    stubOidcDiscovery();
    const config = buildHttpTestConfig(0, true);
    const handle = await startMcpHttpServer({
      config,
      createMcpServer: createTestMcpServer,
    });
    activeServers.push(handle);

    const metadataUrl = new URL('/.well-known/oauth-protected-resource/mcp', handle.baseUrl.origin)
      .href;
    const response = await fetch(metadataUrl);
    expect(response.status).toBe(200);

    const metadata = (await response.json()) as {
      resource?: string;
      authorization_servers?: string[];
    };
    expect(metadata.resource).toBe(config.server.oauth?.resource_url);
    expect(metadata.authorization_servers?.[0]).toBe(config.server.oauth?.issuer);
  });
});
