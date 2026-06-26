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
    if (request.method === 'GET' && request.path.endsWith('/dataAgents:listAccessible')) {
      return {
        dataAgents: [{ name: agentName, displayName: 'Accessible Agent' }],
      };
    }

    if (
      request.method === 'GET' &&
      request.path.endsWith(`/dataAgents/${agentName.split('/').pop()}`)
    ) {
      return {
        name: agentName,
        dataAnalyticsAgent: {
          publishedContext: {
            datasourceReferences: {
              bq: {
                tableReferences: [
                  { projectId: project, datasetId: 'retailops_demo', tableId: 'products' },
                ],
              },
            },
          },
        },
      };
    }

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
        conversations: [
          {
            name: conversationName,
            dataAgent: `${agentName}-1`,
            updateTime: '2026-06-20T10:00:00.000Z',
          },
        ],
      };
    }

    if (request.method === 'GET' && request.path.includes('/messages')) {
      return {
        conversationMessages: [
          { name: `${conversationName}/messages/m1`, role: 'user', content: 'hello' },
        ],
      };
    }

    if (request.method === 'POST' && request.path.endsWith(':getIamPolicy')) {
      return {
        bindings: [{ role: 'roles/viewer', members: ['user:auditor@example.com'] }],
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
      name: 'gda.data_agents.inventory',
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
      name: 'gda.governance_reports.generate',
      arguments: { project, location, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      summary: {
        dataAgentCount: 2,
        usageWindowDays: 30,
        findingCount: 2,
        unusedAgentCount: 1,
      },
      scope: {
        projects: [project],
        locations: [location],
        dataAgents: [`${agentName}-1`, `${agentName}-2`],
      },
      agentUsage: expect.arrayContaining([
        expect.objectContaining({ name: `${agentName}-1`, usedInWindow: true }),
        expect.objectContaining({ name: `${agentName}-2`, usedInWindow: false }),
      ]),
      possiblyUnused: [expect.objectContaining({ name: `${agentName}-2` })],
      inventoryTruncated: false,
      findings: expect.arrayContaining([
        expect.objectContaining({ category: 'inventory', severity: 'low' }),
        expect.objectContaining({ category: 'inventory', severity: 'medium' }),
      ]),
    });
  });

  it('audit.conversations.list returns conversations', async () => {
    const result = await client.callTool({
      name: 'gda.conversations.list',
      arguments: { project, location, page_size: 25, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      conversations: [
        expect.objectContaining({
          name: conversationName,
          dataAgent: `${agentName}-1`,
        }),
      ],
    });
  });

  it('audit.messages.list returns conversation messages', async () => {
    const result = await client.callTool({
      name: 'gda.conversation_messages.list',
      arguments: { conversation: conversationName, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      conversationMessages: [{ name: `${conversationName}/messages/m1` }],
    });
  });

  it('audit.data_agents.list_accessible returns accessible agents', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.list_accessible',
      arguments: { project, location, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({
      agents: [expect.objectContaining({ name: agentName })],
    });
  });

  it('audit.data_agents.datasources summarizes BigQuery tables', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.datasources',
      arguments: { name: agentName, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({
      name: agentName,
      published: {
        bigQueryTables: [{ projectId: project, datasetId: 'retailops_demo', tableId: 'products' }],
      },
    });
  });

  it('audit.data_agents.usage summarizes per-agent activity', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.usage',
      arguments: { project, location, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({
      windowDays: 30,
      agents: expect.arrayContaining([
        expect.objectContaining({ name: `${agentName}-1`, usedInWindow: true }),
        expect.objectContaining({ name: `${agentName}-2`, usedInWindow: false }),
      ]),
    });
  });

  it('audit.data_agents.get_iam_policy returns IAM bindings', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.get_iam_policy',
      arguments: { resource: agentName, agent: 'audit' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({
      bindings: [{ role: 'roles/viewer', members: ['user:auditor@example.com'] }],
    });
  });
});
