import { validateConfig } from '@gemini-data-agents/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMcpServer } from '../server.js';

import type { AppConfig } from '@gemini-data-agents/core';

const adminConfig: AppConfig = validateConfig({
  api_version: 'v1beta',
  agents: {
    admin: {
      data_agent: 'projects/my-project/locations/us-central1/dataAgents/x',
      tools: ['query_data_agent'],
    },
  },
});

describe('admin MCP tool inventory', () => {
  let client: Client | undefined;
  let cleanup: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const server = createMcpServer(adminConfig);
    const clientInst = new Client({ name: 'admin-inventory', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await clientInst.connect(clientTransport);
    client = clientInst;
    cleanup = async () => {
      await clientInst.close();
      await server.close();
    };
  });

  afterAll(async () => {
    await cleanup?.();
  });

  it('includes YAML and inspection tools', async () => {
    const { tools } = await client!.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('generate_analyst_registry_yaml');
    expect(names).toContain('validate_analyst_registry_yaml');
    expect(names).toContain('diff_analyst_registry_yaml');
    expect(names).toContain('inspect_admin_auth');
  });

  it('includes remote lifecycle stubs', async () => {
    const { tools } = await client!.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('list_remote_data_agents');
    expect(names).toContain('create_remote_data_agent');
  });
});
