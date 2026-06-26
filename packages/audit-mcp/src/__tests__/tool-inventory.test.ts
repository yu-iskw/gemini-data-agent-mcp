import { validateConfig } from '@gemini-data-agents/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMcpServer } from '../server.js';

import type { AppConfig } from '@gemini-data-agents/core';

const auditConfig: AppConfig = validateConfig({
  api_version: 'v1beta',
  agents: {
    audit: {
      data_agent: 'projects/my-project/locations/global/dataAgents/audit-agent',
      tools: ['query_data_agent'],
    },
  },
});

describe('audit MCP tool inventory', () => {
  let client: Client | undefined;
  let cleanup: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const server = createMcpServer(auditConfig);
    const clientInst = new Client({ name: 'audit-inventory', version: '0.1.0' });
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

  it('registers audit thin-slice tools', async () => {
    const { tools } = await client!.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('audit.conversations.list');
    expect(names).toContain('audit.messages.list');
    expect(names).toContain('audit.data_agents.inventory');
    expect(names).toContain('audit.governance_report.generate');
  });
});
