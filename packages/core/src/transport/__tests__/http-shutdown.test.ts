import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startMcpHttpServer } from '../start-http-server.js';

import { defaultHttpOauthFields } from './http-test-fixtures.js';

import type { AppConfig } from '../../types.js';

function createTestMcpServer(): McpServer {
  const server = new McpServer({ name: 'http-shutdown-test', version: '0.1.0' });
  server.tool('ping', 'Ping', { message: z.string().optional() }, async ({ message }) => ({
    content: [{ type: 'text', text: message ?? 'pong' }],
  }));
  return server;
}

function buildConfig(): AppConfig {
  const baseUrl = 'http://127.0.0.1:0/mcp';
  return {
    api_version: 'v1beta',
    server: {
      name: 'http-shutdown-test',
      log_level: 'ERROR',
      transport: 'http',
      host: '127.0.0.1',
      port: 0,
      public_url: baseUrl,
      http: { path: '/mcp' },
      oauth: defaultHttpOauthFields({
        enabled: false,
        resource_url: baseUrl,
        issuer: 'http://localhost:8080/realms/master',
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

describe('HTTP server shutdown', () => {
  afterEach(() => {
    delete process.env.MCP_ALLOW_INSECURE_HTTP;
  });

  it('closes listener and sessions on handle.close()', async () => {
    process.env.MCP_ALLOW_INSECURE_HTTP = 'true';
    const handle = await startMcpHttpServer({
      config: buildConfig(),
      createMcpServer: createTestMcpServer,
    });

    const initResponse = await fetch(handle.bindUrl.href, {
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
          clientInfo: { name: 'shutdown-test', version: '0.1.0' },
        },
      }),
    });
    expect(initResponse.status).toBe(200);
    expect(initResponse.headers.get('mcp-session-id')).toBeTruthy();

    await handle.close();

    await expect(
      fetch(handle.bindUrl.href, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'shutdown-test', version: '0.1.0' },
          },
        }),
      }),
    ).rejects.toThrow();
  });
});
