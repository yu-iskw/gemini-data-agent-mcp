import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startMcpHttpServer } from '../start-http-server.js';

import { defaultHttpOauthFields } from './http-test-fixtures.js';

import type { AppConfig } from '../../types.js';

function createTestMcpServer(): McpServer {
  const server = new McpServer({ name: 'http-origin-test', version: '0.1.0' });
  server.tool('ping', 'Ping', { message: z.string().optional() }, async ({ message }) => ({
    content: [{ type: 'text', text: message ?? 'pong' }],
  }));
  return server;
}

function buildConfig(allowedOrigins: string[] = []): AppConfig {
  const baseUrl = 'http://127.0.0.1:0/mcp';
  return {
    api_version: 'v1beta',
    server: {
      name: 'http-origin-test',
      log_level: 'ERROR',
      transport: 'http',
      host: '127.0.0.1',
      port: 0,
      public_url: baseUrl,
      http: {
        path: '/mcp',
        ...(allowedOrigins.length > 0 ? { cors: { allowed_origins: allowedOrigins } } : {}),
      },
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

const initializeBody = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'http-origin-test', version: '0.1.0' },
  },
};

const activeServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  delete process.env.MCP_ALLOW_INSECURE_HTTP;
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    await server?.close();
  }
});

describe('HTTP Origin validation', () => {
  it('rejects foreign Origin on POST, GET, and DELETE with 403', async () => {
    process.env.MCP_ALLOW_INSECURE_HTTP = 'true';
    const handle = await startMcpHttpServer({
      config: buildConfig(['https://app.example.com']),
      createMcpServer: createTestMcpServer,
    });
    activeServers.push(handle);

    const foreignOrigin = 'https://evil.example.com';

    const postResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Origin: foreignOrigin,
      },
      body: JSON.stringify(initializeBody),
    });
    expect(postResponse.status).toBe(403);

    const getResponse = await fetch(handle.bindUrl.href, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        Origin: foreignOrigin,
      },
    });
    expect(getResponse.status).toBe(403);

    const deleteResponse = await fetch(handle.bindUrl.href, {
      method: 'DELETE',
      headers: {
        Origin: foreignOrigin,
      },
    });
    expect(deleteResponse.status).toBe(403);
  });

  it('accepts canonical public_url origin and allowlisted origins', async () => {
    process.env.MCP_ALLOW_INSECURE_HTTP = 'true';
    const handle = await startMcpHttpServer({
      config: buildConfig(['https://app.example.com']),
      createMcpServer: createTestMcpServer,
    });
    activeServers.push(handle);

    const canonicalResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:0',
      },
      body: JSON.stringify(initializeBody),
    });
    expect(canonicalResponse.status).toBe(200);

    const allowedResponse = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Origin: 'https://app.example.com',
      },
      body: JSON.stringify(initializeBody),
    });
    expect(allowedResponse.status).toBe(200);
  });

  it('accepts requests without an Origin header', async () => {
    process.env.MCP_ALLOW_INSECURE_HTTP = 'true';
    const handle = await startMcpHttpServer({
      config: buildConfig(),
      createMcpServer: createTestMcpServer,
    });
    activeServers.push(handle);

    const response = await fetch(handle.bindUrl.href, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(initializeBody),
    });

    expect(response.status).toBe(200);
  });
});
