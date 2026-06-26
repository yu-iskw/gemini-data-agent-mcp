import { validateConfig, type AppConfig, type GoogleRestRequest } from '@gemini-data-agents/core';
import {
  connectMcpTestClient,
  mockRoleGoogleClients,
  parseMcpToolEnvelope,
} from '@gemini-data-agents/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMcpServer } from '../server.js';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const project = 'my-gcp-project';
const location = 'us-central1';
const dataAgentName = `projects/${project}/locations/${location}/dataAgents/admin`;
const operationName = `projects/${project}/locations/${location}/operations/op-1`;

function adminConfig(): AppConfig {
  return validateConfig({
    api_version: 'v1beta',
    agents: {
      admin: {
        data_agent: dataAgentName,
        tools: ['query_data_agent'],
      },
    },
  });
}

function adminAgentGetResponse() {
  return {
    name: dataAgentName,
    displayName: 'Admin Agent',
    description: 'Primary admin agent',
  };
}

function handleAdminRfcGet(request: GoogleRestRequest): unknown | undefined {
  if (request.method === 'GET' && request.path.endsWith('/dataAgents/admin')) {
    return adminAgentGetResponse();
  }
  if (request.method === 'GET' && request.path.endsWith('/dataAgents')) {
    return {
      dataAgents: [adminAgentGetResponse()],
      nextPageToken: 'next-admin-page',
    };
  }
  if (request.method === 'GET' && request.path.endsWith('/operations/op-1')) {
    return {
      name: operationName,
      done: true,
      response: { '@type': 'type.googleapis.com/google.protobuf.Empty' },
    };
  }
  return undefined;
}

function handleAdminRfcMutations(request: GoogleRestRequest): unknown | undefined {
  if (request.method === 'POST' && request.path.endsWith(':getIamPolicy')) {
    throw new Error('getIamPolicy should not be called on admin MCP');
  }
  if (
    request.method === 'POST' &&
    request.path.endsWith('/dataAgents') &&
    !request.path.includes(':')
  ) {
    return { name: dataAgentName, displayName: 'Created Agent' };
  }
  if (request.method === 'PATCH' && request.path.endsWith('/dataAgents/admin')) {
    return { name: dataAgentName, displayName: 'Patched Agent' };
  }
  if (request.method === 'DELETE' && request.path.endsWith('/dataAgents/admin')) {
    return {};
  }
  if (request.method === 'POST' && request.path.endsWith(':setIamPolicy')) {
    const body = request.body as { policy?: { bindings: unknown[] } };
    return body.policy ?? body;
  }
  return undefined;
}

function createAdminRfcFakeHandler() {
  return (request: GoogleRestRequest) => {
    const response = handleAdminRfcGet(request) ?? handleAdminRfcMutations(request);
    if (response !== undefined) {
      return response;
    }
    throw new Error(`Unexpected request: ${request.method} ${request.path}`);
  };
}

describe.sequential('Admin MCP — RFC Google tools', () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ client, close } = await connectMcpTestClient(
      createMcpServer,
      adminConfig(),
      'admin-rfc-integration',
    ));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRoleGoogleClients(createAdminRfcFakeHandler());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('data_agents.list returns mapped agents', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.list',
      arguments: { project, location, agent: 'admin' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({
      agents: [
        expect.objectContaining({
          name: dataAgentName,
          displayName: 'Admin Agent',
        }),
      ],
      nextPageToken: 'next-admin-page',
    });
  });

  it('data_agents.get returns a single agent', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.get',
      arguments: { name: dataAgentName, agent: 'admin' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({
      name: dataAgentName,
      displayName: 'Admin Agent',
    });
  });

  it('data_agents.patch updates an agent', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.patch',
      arguments: {
        name: dataAgentName,
        data_agent: { displayName: 'Patched Agent' },
        update_mask: 'displayName',
        agent: 'admin',
      },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({ displayName: 'Patched Agent' });
  });

  it('data_agents.set_iam_policy sets IAM bindings', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.set_iam_policy',
      arguments: {
        resource: dataAgentName,
        policy: { bindings: [{ role: 'roles/viewer', members: ['user:admin@example.com'] }] },
        agent: 'admin',
      },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({
      bindings: [{ role: 'roles/viewer', members: ['user:admin@example.com'] }],
    });
  });

  it('data_agents.delete removes an agent', async () => {
    const result = await client.callTool({
      name: 'gda.data_agents.delete',
      arguments: { name: dataAgentName, agent: 'admin' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({ deleted: true, name: dataAgentName });
  });

  it('operations.get returns a completed operation', async () => {
    const result = await client.callTool({
      name: 'gda.operations.get',
      arguments: { name: operationName, agent: 'admin' },
    });

    expect(result.isError).toBeFalsy();
    const envelope = parseMcpToolEnvelope(result);
    expect(envelope.data).toMatchObject({
      name: operationName,
      done: true,
    });
  });
});
