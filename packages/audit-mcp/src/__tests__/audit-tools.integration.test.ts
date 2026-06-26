import { validateConfig, type AppConfig, type GoogleRestRequest } from '@gemini-data-agents/core';
import {
  connectMcpTestClient,
  mockRoleGoogleClients,
  parseMcpToolEnvelope,
} from '@gemini-data-agents/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMcpServer } from '../server.js';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const project = 'my-project';
const location = 'global';
const agentName = 'projects/my-project/locations/global/dataAgents/audit-agent';
const conversationName = `projects/${project}/locations/${location}/conversations/c1`;

function auditConfig(): AppConfig {
  return validateConfig({
    api_version: 'v1beta',
    agents: {
      audit: {
        data_agent: agentName,
        tools: ['query_data_agent'],
      },
    },
  });
}

function createAuditFakeHandler() {
  let dataAgentListCalls = 0;

  return (request: GoogleRestRequest) => {
    if (request.method === 'GET' && request.path.endsWith('/dataAgents')) {
      dataAgentListCalls += 1;
      if (dataAgentListCalls === 1) {
        return {
          dataAgents: [
            {
              name: `${agentName}-1`,
              displayName: 'Audit Agent One',
            },
          ],
          nextPageToken: 'page-2',
        };
      }
      return {
        dataAgents: [
          {
            name: `${agentName}-2`,
            displayName: 'Audit Agent Two',
            description: 'Documented agent',
            labels: { owner: 'audit-team' },
          },
        ],
      };
    }

    if (request.method === 'GET' && request.path.endsWith('/conversations')) {
      return {
        conversations: [{ name: conversationName }],
        nextPageToken: 'conv-page-2',
      };
    }

    if (request.method === 'GET' && request.path.includes('/messages')) {
      return {
        conversationMessages: [
          { name: `${conversationName}/messages/m1`, role: 'user', content: 'hello' },
        ],
      };
    }

    throw new Error(`Unexpected request: ${request.method} ${request.path}`);
  };
}

describe.sequential('Audit MCP — Google-backed tools', () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ client, close } = await connectMcpTestClient(
      createMcpServer,
      auditConfig(),
      'audit-integration',
    ));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRoleGoogleClients(createAuditFakeHandler());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('audit.data_agents.inventory returns mapped agents', async () => {
    const result = await client.callTool({
      name: 'audit.data_agents.inventory',
      arguments: { project, location, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      count: 1,
      agents: [
        expect.objectContaining({
          name: `${agentName}-1`,
          missingDescription: true,
          missingOwnerLabel: true,
        }),
      ],
      nextPageToken: 'page-2',
    });
  });

  it('audit.governance_report.generate paginates inventory and builds findings', async () => {
    const result = await client.callTool({
      name: 'audit.governance_report.generate',
      arguments: { project, location, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      summary: {
        dataAgentCount: 2,
        findingCount: 2,
      },
      scope: {
        projects: [project],
        locations: [location],
        dataAgents: [`${agentName}-1`, `${agentName}-2`],
      },
      findings: expect.arrayContaining([
        expect.objectContaining({ category: 'inventory', severity: 'low' }),
        expect.objectContaining({ category: 'inventory', severity: 'medium' }),
      ]),
    });
  });

  it('audit.conversations.list returns conversations', async () => {
    const result = await client.callTool({
      name: 'audit.conversations.list',
      arguments: { project, location, page_size: 25, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      conversations: [{ name: conversationName }],
      nextPageToken: 'conv-page-2',
    });
  });

  it('audit.messages.list returns conversation messages', async () => {
    const result = await client.callTool({
      name: 'audit.messages.list',
      arguments: { conversation: conversationName, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      conversationMessages: [{ name: `${conversationName}/messages/m1` }],
    });
  });
});
