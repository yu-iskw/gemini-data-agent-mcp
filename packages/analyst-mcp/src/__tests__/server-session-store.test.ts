import { validateConfig } from '@gemini-data-agents/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';

import { createMcpServer } from '../server.js';
import { InMemorySessionStore } from '../session/store.js';

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

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

function setupFetchRouter(): void {
  mockFetch.mockImplementation(async (input: string | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.includes(':chat')) {
      return jsonResponse([{ systemMessage: { text: { parts: ['MCP chat response'] } } }]);
    }
    return jsonResponse({});
  });
}

const config = validateConfig({
  api_version: 'v1beta',
  agents: {
    'test-agent': {
      data_agent: 'projects/my-project/locations/us-central1/dataAgents/test-agent',
      tools: ['query_data_agent', 'chat_data_agent'],
    },
  },
});

describe('createMcpServer session store sharing', () => {
  it('shares analyst session state across MCP server instances', async () => {
    setupFetchRouter();
    const sessionStore = new InMemorySessionStore();
    sessionStore.createSession({
      session_id: 'sess-shared',
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'owner',
        client_name: 'claude-code',
      },
      agent: 'test-agent',
      conversation_name: 'projects/my-project/locations/us-central1/conversations/conv-1',
      intent: 'explore',
    });

    const serverA = createMcpServer(config, sessionStore);
    const serverB = createMcpServer(config, sessionStore);

    const client = new Client({ name: 'test-client', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await serverB.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: 'gda.sessions.chat',
        arguments: {
          session_id: 'sess-shared',
          prompt: 'Continue analysis',
          expected_revision: 1,
          tenant_id: 'tenant-1',
          user_id: 'owner',
          client_name: 'claude-code',
        },
      });

      expect(result.isError).toBeFalsy();
      expect(mockFetch).toHaveBeenCalled();
    } finally {
      await client.close();
      await serverA.close();
      await serverB.close();
    }
  });
});
