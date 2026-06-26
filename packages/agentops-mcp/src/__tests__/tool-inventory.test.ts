import { validateConfig } from '@gemini-data-agents/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMcpServer } from '../server.js';

import type { AppConfig } from '@gemini-data-agents/core';

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
  let client: Client | undefined;
  let cleanup: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const server = createMcpServer(agentopsConfig);
    const clientInst = new Client({ name: 'agentops-inventory', version: '0.1.0' });
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

  it('registers agentops offline eval tools', async () => {
    const { tools } = await client!.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('agentops.offline_eval.validate_cases');
    expect(names).toContain('agentops.offline_eval.summarize_result');
    expect(names).toContain('agentops.offline_eval.run');
  });
});
