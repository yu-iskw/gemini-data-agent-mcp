import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startMcpHttpServer } from '../start-http-server.js';

import type { AppConfig } from '../../types.js';

function createTestMcpServer(): McpServer {
  const server = new McpServer({ name: 'http-health-test', version: '0.1.0' });
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
      name: 'http-health-test',
      log_level: 'ERROR',
      transport: 'http',
      host: '127.0.0.1',
      port: 0,
      public_url: baseUrl,
      http: { path: '/mcp' },
      oauth: {
        enabled: false,
        resource_url: baseUrl,
        issuer: 'http://localhost:8080/realms/master',
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
        auth: { mode: 'adc' },
        tools: ['query_data_agent'],
      },
    },
  };
}

const activeServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  delete process.env.MCP_ALLOW_INSECURE_HTTP;
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    await server?.close();
  }
});

describe('HTTP health endpoint', () => {
  it('returns 200 from GET /healthz without authentication', async () => {
    process.env.MCP_ALLOW_INSECURE_HTTP = 'true';
    const handle = await startMcpHttpServer({
      config: buildConfig(),
      createMcpServer: createTestMcpServer,
    });
    activeServers.push(handle);

    const healthUrl = new URL('/healthz', handle.bindUrl.origin).href;
    const response = await fetch(healthUrl);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
