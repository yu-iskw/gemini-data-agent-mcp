import { validateConfig } from '@gemini-data-agents/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';

import { InMemorySessionStore } from '../session/store.js';
import { registerTools } from '../tools.js';

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

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const config = validateConfig({
  api_version: 'v1beta',
  agents: {
    'test-agent': {
      data_agent: 'projects/my-project/locations/us-central1/dataAgents/test-agent',
      tools: [
        'query_data_agent',
        'chat_data_agent',
        'create_data_agent_conversation',
        'list_conversation_messages',
      ],
    },
  },
});

describe('session tool authorization', () => {
  it('rejects unauthorized session_chat before calling the remote data agent', async () => {
    mockFetch.mockClear();
    const sessionStore = new InMemorySessionStore();
    sessionStore.createSession({
      session_id: 'sess-private',
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'owner',
        client_name: 'claude-code',
      },
      agent: 'test-agent',
      conversation_name: 'projects/my-project/locations/us-central1/conversations/conv-private',
      intent: 'explore',
    });

    const server = new McpServer({ name: 'test-server', version: '0.1.0' });
    registerTools(server, config, sessionStore);

    const client = new Client({ name: 'test-client', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: 'gda.sessions.chat',
        arguments: {
          session_id: 'sess-private',
          prompt: 'Summarize private data',
          expected_revision: 1,
          tenant_id: 'tenant-1',
          user_id: 'intruder',
          client_name: 'codex',
        },
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('ACCESS_DENIED');
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
