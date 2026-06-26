import { validateConfig, type AppConfig } from '@gemini-data-agents/core';
import { connectMcpTestClient } from '@gemini-data-agents/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMcpServer } from '../server.js';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const agentopsConfig: AppConfig = validateConfig({
  api_version: 'v1beta',
  agents: {
    agentops: {
      data_agent: 'projects/my-project/locations/global/dataAgents/agentops',
      tools: ['query_data_agent'],
    },
  },
});

describe('agentops MCP tool inventory', () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ client, close } = await connectMcpTestClient(
      createMcpServer,
      agentopsConfig,
      'agentops-inventory',
    ));
  });

  afterAll(async () => {
    await close();
  });

  it('registers agentops offline eval tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('agentops.offline_eval.validate_cases');
    expect(names).toContain('agentops.offline_eval.summarize_result');
    expect(names).toContain('agentops.offline_eval.run');
  });
});
