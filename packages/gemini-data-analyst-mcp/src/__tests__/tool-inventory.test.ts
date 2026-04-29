import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validateConfig } from 'gemini-data-agent-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMcpServer } from '../server.js';
import { InMemorySessionStore } from '../session/store.js';
import { registerTools } from '../tools.js';

import type { AppConfig } from 'gemini-data-agent-core';

const minimalConfig: AppConfig = validateConfig({
  agents: {
    'test-agent': {
      project: 'my-project',
      location: 'us-central1',
      api_version: 'v1beta',
      data_agent: 'projects/my-project/locations/us-central1/dataAgents/test-agent',
      auth: { mode: 'adc' },
      capabilities: {
        query_data: true,
        chat: true,
        raw_passthrough: false,
      },
    },
  },
});

describe('analyst MCP tool inventory', () => {
  let client: Client | undefined;
  let transportCleanup: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const server = createMcpServer(minimalConfig);
    const clientInst = new Client({ name: 'inventory-test', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await clientInst.connect(clientTransport);
    client = clientInst;
    transportCleanup = async () => {
      await clientInst.close();
      await server.close();
    };
  });

  afterAll(async () => {
    await transportCleanup?.();
  });

  it('includes analyst and session tools', async () => {
    const { tools } = await client!.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('query_data_agent');
    expect(names).toContain('session_create');
    expect(names).toContain('list_data_agents');
  });

  it('does not expose raw passthrough or admin/registry mutation tools', async () => {
    const { tools } = await client!.listTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('raw_data_agent_request');
    expect(names).not.toContain('generate_analyst_registry_yaml');
    expect(names).not.toContain('create_remote_data_agent');
  });
});

describe('registerTools standalone inventory', () => {
  it('matches expected tool names via MCP server introspection', async () => {
    const sessionStore = new InMemorySessionStore();
    const server = new McpServer({ name: 't', version: '0.1.0' });
    registerTools(server, minimalConfig, sessionStore);
    const clientInst = new Client({ name: 'c', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await clientInst.connect(clientTransport);
    try {
      const { tools } = await clientInst.listTools();
      const names = tools.map((t) => t.name);
      expect(names.length).toBeGreaterThan(10);
      expect(names).toContain('get_operation');
    } finally {
      await clientInst.close();
      await server.close();
    }
  });
});
