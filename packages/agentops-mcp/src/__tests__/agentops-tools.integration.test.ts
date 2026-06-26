import { validateConfig, type AppConfig } from '@gemini-data-agents/core';
import {
  connectMcpTestClient,
  mcpToolErrorText,
  parseMcpToolEnvelope,
} from '@gemini-data-agents/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMcpServer } from '../server.js';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const dataAgent = 'projects/my-project/locations/global/dataAgents/agentops';
const validCase = { id: 'case-1', input: 'What is revenue?' };

function agentopsConfig(): AppConfig {
  return validateConfig({
    api_version: 'v1beta',
    agents: {
      agentops: {
        data_agent: dataAgent,
        tools: ['query_data_agent'],
      },
    },
  });
}

describe.sequential('AgentOps MCP — offline eval tools', () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ client, close } = await connectMcpTestClient(
      createMcpServer,
      agentopsConfig(),
      'agentops-integration',
    ));
  });

  afterAll(async () => {
    await close();
  });

  it('agentops.offline_eval.validate_cases accepts valid cases', async () => {
    const result = await client.callTool({
      name: 'agentops.offline_eval.validate_cases',
      arguments: { cases: [validCase] },
    });

    expect(result.isError).toBeFalsy();
    expect(parseMcpToolEnvelope(result).data).toMatchObject({ valid: true, caseCount: 1 });
  });

  it('agentops.offline_eval.validate_cases rejects invalid cases', async () => {
    const result = await client.callTool({
      name: 'agentops.offline_eval.validate_cases',
      arguments: { cases: [{ id: ' ', input: 'x' }] },
    });

    expect(result.isError).toBe(true);
    expect(mcpToolErrorText(result)).toContain('Error [');
  });

  it('agentops.offline_eval.summarize_result returns summary with explicit counts', async () => {
    const result = await client.callTool({
      name: 'agentops.offline_eval.summarize_result',
      arguments: {
        run_id: 'run-1',
        cases: [validCase],
        pass_count: 1,
        fail_count: 0,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(parseMcpToolEnvelope(result).data).toMatchObject({
      runId: 'run-1',
      caseCount: 1,
      passCount: 1,
      failCount: 0,
    });
  });

  it('agentops.offline_eval.summarize_result requires counts when cases are supplied', async () => {
    const result = await client.callTool({
      name: 'agentops.offline_eval.summarize_result',
      arguments: { run_id: 'run-2', cases: [validCase] },
    });

    expect(result.isError).toBe(true);
    expect(mcpToolErrorText(result)).toContain('pass_count');
  });

  it('agentops.offline_eval.run queues stub evaluation', async () => {
    const result = await client.callTool({
      name: 'agentops.offline_eval.run',
      arguments: { data_agent: dataAgent, cases: [validCase] },
    });

    expect(result.isError).toBeFalsy();
    expect(parseMcpToolEnvelope(result).data).toMatchObject({
      status: 'pending',
    });
  });

  it('agentops.offline_eval.run rejects invalid cases', async () => {
    const result = await client.callTool({
      name: 'agentops.offline_eval.run',
      arguments: { data_agent: dataAgent, cases: [{ id: '', input: '' }] },
    });

    expect(result.isError).toBe(true);
  });
});
