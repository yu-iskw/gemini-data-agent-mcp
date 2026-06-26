import { validateConfig, type AppConfig, type GoogleRestRequest } from '@gemini-data-agents/core';
import {
  connectMcpTestClient,
  mcpToolErrorText,
  mockRoleGoogleClients,
  parseMcpToolEnvelope,
} from '@gemini-data-agents/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMcpServer } from '../server.js';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const dataAgent = 'projects/my-project/locations/global/dataAgents/agentops';
const project = 'my-project';
const location = 'global';
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
      name: 'gda.offline_eval.validate_cases',
      arguments: { cases: [validCase] },
    });

    expect(result.isError).toBeFalsy();
    expect(parseMcpToolEnvelope(result).data).toMatchObject({ valid: true, caseCount: 1 });
  });

  it('agentops.offline_eval.validate_cases rejects invalid cases', async () => {
    const result = await client.callTool({
      name: 'gda.offline_eval.validate_cases',
      arguments: { cases: [{ id: ' ', input: 'x' }] },
    });

    expect(result.isError).toBe(true);
    expect(mcpToolErrorText(result)).toContain('Error [');
  });

  it('agentops.offline_eval.summarize_result returns summary with explicit counts', async () => {
    const result = await client.callTool({
      name: 'gda.offline_eval.summarize_result',
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
      name: 'gda.offline_eval.summarize_result',
      arguments: { run_id: 'run-2', cases: [validCase] },
    });

    expect(result.isError).toBe(true);
    expect(mcpToolErrorText(result)).toContain('pass_count');
  });

  it('agentops.offline_eval.run queues stub evaluation', async () => {
    const result = await client.callTool({
      name: 'gda.offline_eval.run',
      arguments: { data_agent: dataAgent, cases: [validCase] },
    });

    expect(result.isError).toBeFalsy();
    expect(parseMcpToolEnvelope(result).data).toMatchObject({
      status: 'pending',
    });
  });

  it('agentops.offline_eval.run rejects invalid cases', async () => {
    const result = await client.callTool({
      name: 'gda.offline_eval.run',
      arguments: { data_agent: dataAgent, cases: [{ id: '', input: '' }] },
    });

    expect(result.isError).toBe(true);
  });
});

function createAgentOpsFakeHandler() {
  return (request: GoogleRestRequest) => {
    if (
      request.method === 'POST' &&
      request.path.endsWith('/dataAgents') &&
      !request.path.includes(':')
    ) {
      return { name: dataAgent, displayName: 'Created Agent' };
    }
    if (request.method === 'PATCH' && request.path.endsWith('/dataAgents/agentops')) {
      return { name: dataAgent, displayName: 'Patched Agent' };
    }
    throw new Error(`Unexpected request: ${request.method} ${request.path}`);
  };
}

describe.sequential('AgentOps MCP — Google-backed tools', () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeEach(() => {
    mockRoleGoogleClients(createAgentOpsFakeHandler());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeAll(async () => {
    ({ client, close } = await connectMcpTestClient(
      createMcpServer,
      agentopsConfig(),
      'agentops-google-integration',
    ));
  });

  afterAll(async () => {
    await close();
  });

  it('data_agents.create creates an agent', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.create',
      arguments: {
        project,
        location,
        data_agent: { displayName: 'Created Agent' },
        agent: 'agentops',
      },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({ displayName: 'Created Agent' });
  });
  it('data_agents.patch rejects publishedContext mask', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.patch_staging',
      arguments: {
        name: dataAgent,
        data_agent: { displayName: 'Should Not Patch' },
        update_mask: 'dataAnalyticsAgent.publishedContext',
        agent: 'agentops',
      },
    });

    expect(result.isError).toBe(true);
    expect(mcpToolErrorText(result)).toMatch(/publishedContext|disallowed/);
  });

  it('data_agents.patch allows stagingContext mask', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.patch_staging',
      arguments: {
        name: dataAgent,
        data_agent: { displayName: 'Patched Agent' },
        update_mask: 'dataAnalyticsAgent.stagingContext',
        agent: 'agentops',
      },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({ displayName: 'Patched Agent' });
  });
});
