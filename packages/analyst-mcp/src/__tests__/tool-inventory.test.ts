import { gdaToolNames, validateConfig, type AppConfig } from '@gemini-data-agents/core';
import { connectMcpTestClient } from '@gemini-data-agents/core/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMcpServer } from '../server.js';
import { InMemorySessionStore } from '../session/store.js';
import { registerTools } from '../tools.js';

const minimalConfig: AppConfig = validateConfig({
  api_version: 'v1beta',
  agents: {
    'test-agent': {
      data_agent: 'projects/my-project/locations/us-central1/dataAgents/test-agent',
      tools: [
        'query_data_agent',
        'chat_data_agent',
        'create_data_agent_conversation',
        'list_conversation_messages',
      ],
    },
  },
});

describe('analyst MCP tool inventory', () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ client, close } = await connectMcpTestClient(
      createMcpServer,
      minimalConfig,
      'inventory-test',
    ));
  });

  afterAll(async () => {
    await close();
  });

  it('includes analyst and session tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain(gdaToolNames.dataAgents.query);
    expect(names).toContain(gdaToolNames.sessions.create);
    expect(names).toContain(gdaToolNames.registry.listAgents);
  });

  it('does not expose raw passthrough or admin/registry mutation tools', async () => {
    const { tools } = await client!.listTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('raw_data_agent_request');
    expect(names).not.toContain(gdaToolNames.registry.generateAnalystYaml);
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
      expect(names).toContain(gdaToolNames.operations.get);
    } finally {
      await clientInst.close();
      await server.close();
    }
  });
});
