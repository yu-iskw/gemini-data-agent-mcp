import { validateConfig, type AppConfig } from '@gemini-data-agents/core';
import { connectMcpTestClient } from '@gemini-data-agents/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMcpServer } from '../server.js';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

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
  let client: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ client, close } = await connectMcpTestClient(
      createMcpServer,
      auditConfig,
      'audit-inventory',
    ));
  });

  afterAll(async () => {
    await close();
  });

  it('registers audit thin-slice tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('audit.conversations.list');
    expect(names).toContain('audit.messages.list');
    expect(names).toContain('audit.data_agents.inventory');
    expect(names).toContain('audit.governance_report.generate');
  });
});
