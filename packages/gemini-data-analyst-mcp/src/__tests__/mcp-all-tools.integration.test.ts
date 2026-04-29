import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { validateConfig } from 'gemini-data-agent-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMcpServer } from '../server.js';

import type * as GoogleAuthLibrary from 'google-auth-library';

const mockHeaders = { Authorization: 'Bearer mock-token' };
const mockClient = {
  getRequestHeaders: vi.fn().mockResolvedValue(mockHeaders),
};

vi.mock('google-auth-library', async (importOriginal) => {
  const actual = await importOriginal<typeof GoogleAuthLibrary>();
  return {
    ...actual,
    GoogleAuth: vi.fn().mockImplementation(function () {
      return {
        getClient: vi.fn().mockResolvedValue(mockClient),
      };
    }),
  };
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

function setupFetchRouter(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    const method = init?.method ?? 'GET';

    if (url.includes(':chat')) {
      return jsonResponse([{ systemMessage: { text: { parts: ['MCP chat response'] } } }]);
    }
    if (url.includes(':queryData')) {
      return jsonResponse({
        naturalLanguageAnswer: 'nl answer',
        generatedQuery: 'SELECT 1',
      });
    }
    if (method === 'POST' && url.includes('/conversations')) {
      return jsonResponse({
        name: 'projects/my-gcp-project/locations/us-central1/conversations/conv-integration-1',
      });
    }
    if (url.includes('/messages')) {
      return jsonResponse({
        messages: [{ id: 'm1' }],
        nextPageToken: undefined,
      });
    }
    if (url.includes('operations/')) {
      return jsonResponse({
        name: 'projects/my-gcp-project/locations/us-central1/operations/op-1',
        done: true,
      });
    }

    return jsonResponse({});
  });
}

const actor = {
  tenant_id: 't1',
  user_id: 'u1',
  client_name: 'test-client',
};

function analystConfig() {
  return validateConfig({
    agents: {
      'my-agent': {
        project: 'my-gcp-project',
        location: 'us-central1',
        api_version: 'v1beta',
        data_agent: 'projects/my-gcp-project/locations/us-central1/dataAgents/my-agent',
        auth: { mode: 'adc' },
        capabilities: {
          query_data: true,
          chat: true,
          raw_passthrough: false,
        },
      },
    },
  });
}

describe.sequential('Analyst MCP — exercise every registered tool', () => {
  let mockFetch: ReturnType<typeof setupFetchRouter>;

  beforeEach(() => {
    mockFetch = setupFetchRouter();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function connectAnalystClient(config = analystConfig()) {
    const server = createMcpServer(config);
    const client = new Client({ name: 'integration-client', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return {
      client,
      server,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  it('lists tools and excludes raw_data_agent_request', async () => {
    const { client, close } = await connectAnalystClient();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).not.toContain('raw_data_agent_request');
      expect(names).toContain('query_data_agent');
      expect(names).toContain('session_create');
    } finally {
      await close();
    }
  });

  it('list_data_agents and get_data_agent_config succeed without network', async () => {
    const { client, close } = await connectAnalystClient();
    try {
      let r = await client.callTool({ name: 'list_data_agents', arguments: {} });
      expect(r.isError).toBeFalsy();
      expect(JSON.stringify(r.content)).toContain('my-agent');

      r = await client.callTool({
        name: 'get_data_agent_config',
        arguments: { agent: 'my-agent' },
      });
      expect(r.isError).toBeFalsy();
      expect(JSON.stringify(r.content)).toContain('my-gcp-project');
    } finally {
      await close();
    }
  });

  it('query_data_agent uses mocked Gemini API', async () => {
    const { client, close } = await connectAnalystClient();
    try {
      const r = await client.callTool({
        name: 'query_data_agent',
        arguments: {
          agent: 'my-agent',
          prompt: 'What is revenue?',
        },
      });
      expect(r.isError).toBeFalsy();
      expect(JSON.stringify(r.content)).toContain('MCP chat response');
      expect(mockFetch).toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it('chat_data_agent and conversation tools succeed', async () => {
    const { client, close } = await connectAnalystClient();
    try {
      let r = await client.callTool({
        name: 'chat_data_agent',
        arguments: {
          agent: 'my-agent',
          prompt: 'Hello',
        },
      });
      expect(r.isError).toBeFalsy();

      r = await client.callTool({
        name: 'create_data_agent_conversation',
        arguments: {
          agent: 'my-agent',
        },
      });
      expect(r.isError).toBeFalsy();
      expect(JSON.stringify(r.content)).toContain('conv-integration-1');

      r = await client.callTool({
        name: 'list_conversation_messages',
        arguments: {
          agent: 'my-agent',
          conversation:
            'projects/my-gcp-project/locations/us-central1/conversations/conv-integration-1',
        },
      });
      expect(r.isError).toBeFalsy();
    } finally {
      await close();
    }
  });

  it('get_operation succeeds', async () => {
    const { client, close } = await connectAnalystClient();
    try {
      const r = await client.callTool({
        name: 'get_operation',
        arguments: {
          agent: 'my-agent',
          operation_name: 'projects/my-gcp-project/locations/us-central1/operations/op-1',
        },
      });
      expect(r.isError).toBeFalsy();
      expect(JSON.stringify(r.content)).toContain('op-1');
    } finally {
      await close();
    }
  });

  it('session tools chain succeeds', async () => {
    const { client, close } = await connectAnalystClient();
    try {
      let r = await client.callTool({
        name: 'session_create',
        arguments: {
          agent: 'my-agent',
          tenant_id: actor.tenant_id,
          user_id: actor.user_id,
          client_name: actor.client_name,
        },
      });
      expect(r.isError).toBeFalsy();
      const sessionCreateText = (r.content as [{ text?: string }])[0]?.text ?? '';
      const session = JSON.parse(sessionCreateText)['session'] as {
        session_id: string;
        revision: number;
      };

      r = await client.callTool({
        name: 'session_chat',
        arguments: {
          session_id: session.session_id,
          prompt: 'Hi',
          expected_revision: session.revision,
          tenant_id: actor.tenant_id,
          user_id: actor.user_id,
          client_name: actor.client_name,
        },
      });
      expect(r.isError).toBeFalsy();
      const chatText = (r.content as [{ text?: string }])[0]?.text ?? '';
      const updated = JSON.parse(chatText)['session'] as { revision: number };

      r = await client.callTool({
        name: 'session_switch_intent',
        arguments: {
          session_id: session.session_id,
          target_intent: 'report',
          expected_revision: updated.revision,
          tenant_id: actor.tenant_id,
          user_id: actor.user_id,
          client_name: actor.client_name,
        },
      });
      expect(r.isError).toBeFalsy();

      r = await client.callTool({
        name: 'session_fork',
        arguments: {
          parent_session_id: session.session_id,
          tenant_id: actor.tenant_id,
          user_id: actor.user_id,
          client_name: actor.client_name,
        },
      });
      expect(r.isError).toBeFalsy();

      const forkText = (r.content as [{ text?: string }])[0]?.text ?? '';
      const child = JSON.parse(forkText)['session'] as { session_id: string; revision: number };

      r = await client.callTool({
        name: 'session_reset',
        arguments: {
          session_id: child.session_id,
          target_revision: 1,
          expected_revision: child.revision,
          tenant_id: actor.tenant_id,
          user_id: actor.user_id,
          client_name: actor.client_name,
        },
      });
      expect(r.isError).toBeFalsy();

      r = await client.callTool({
        name: 'session_handoff',
        arguments: {
          session_id: session.session_id,
          tenant_id: actor.tenant_id,
          user_id: actor.user_id,
          client_name: actor.client_name,
        },
      });
      expect(r.isError).toBeFalsy();
    } finally {
      await close();
    }
  });

  it('lists resources and prompts', async () => {
    const { client, close } = await connectAnalystClient();
    try {
      const resources = await client.listResources();
      expect(resources.resources.length).toBeGreaterThan(0);
      const prompts = await client.listPrompts();
      expect(prompts.prompts.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
