import { gdaToolNames, validateConfig, type AppConfig } from '@gemini-data-agents/core';
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
    expect(names).toContain(gdaToolNames.registry.generateAnalystYaml);
    expect(names).toContain(gdaToolNames.registry.validateAnalystYaml);
    expect(names).toContain(gdaToolNames.registry.diffAnalystYaml);
    expect(names).toContain(gdaToolNames.auth.inspect);
  });

  it('includes RFC admin lifecycle read tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain(gdaToolNames.dataAgents.list);
    expect(names).toContain(gdaToolNames.dataAgents.get);
    expect(names).not.toContain(gdaToolNames.dataAgents.create);
    expect(names).toContain(gdaToolNames.dataAgents.patch);
    expect(names).toContain(gdaToolNames.dataAgents.delete);
    expect(names).toContain(gdaToolNames.dataAgents.setIamPolicy);
    expect(names).toContain(gdaToolNames.operations.get);
    expect(names).not.toContain(gdaToolNames.dataAgents.getIamPolicy);
    expect(names).not.toContain(gdaToolNames.dataAgents.patchStaging);
  });
});
