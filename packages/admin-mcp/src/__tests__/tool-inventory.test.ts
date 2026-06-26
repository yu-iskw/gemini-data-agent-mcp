import { validateConfig, type AppConfig } from '@gemini-data-agents/core';
import { connectMcpTestClient } from '@gemini-data-agents/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMcpServer } from '../server.js';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

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
  let client: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ client, close } = await connectMcpTestClient(
      createMcpServer,
      adminConfig,
      'admin-inventory',
    ));
  });

  afterAll(async () => {
    await close();
  });

  it('includes YAML and inspection tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('generate_analyst_registry_yaml');
    expect(names).toContain('validate_analyst_registry_yaml');
    expect(names).toContain('diff_analyst_registry_yaml');
    expect(names).toContain('inspect_admin_auth');
  });

  it('includes RFC admin lifecycle read tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('data_agents.list');
    expect(names).toContain('data_agents.get');
    expect(names).toContain('data_agents.get_iam_policy');
    expect(names).toContain('operations.get');
  });
});
