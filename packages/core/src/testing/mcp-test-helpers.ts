import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { vi, type MockInstance } from 'vitest';

import { createConversationMessagesClient } from '../google/conversation-messages-client.js';
import { createConversationsClient } from '../google/conversations-client.js';
import { createDataAgentsClient } from '../google/data-agents-client.js';
import { createOperationsClient } from '../google/operations-client.js';
import { createRoleGoogleClients, type RoleGoogleClients } from '../mcp/role-clients.js';
import { mcpRuntimeDeps } from '../mcp/runtime-deps.js';

import { createFakeGoogleRestTransport } from './fake-transport.js';

import type { GoogleRestRequest } from '../google/transport.js';
import type { AppConfig } from '../types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function buildFakeRoleClients(
  handler: (request: GoogleRestRequest) => unknown,
): RoleGoogleClients {
  const transport = createFakeGoogleRestTransport({ handler });
  return {
    transport,
    dataAgents: createDataAgentsClient(transport),
    conversations: createConversationsClient(transport),
    conversationMessages: createConversationMessagesClient(transport),
    operations: createOperationsClient(transport),
  };
}

export function mockRoleGoogleClients(
  handler: (request: GoogleRestRequest) => unknown,
): MockInstance {
  return vi
    .spyOn(mcpRuntimeDeps, 'createRoleGoogleClients')
    .mockImplementation(async (config, agentName, transport) =>
      createRoleGoogleClients(
        config,
        agentName,
        transport ?? createFakeGoogleRestTransport({ handler }),
      ),
    );
}

type McpToolEnvelope = {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message?: string };
};

export function parseMcpToolEnvelope(
  result: Awaited<ReturnType<Client['callTool']>>,
): McpToolEnvelope {
  const structured = result.structuredContent as McpToolEnvelope | undefined;
  if (structured && typeof structured.ok === 'boolean') {
    return structured;
  }
  const text = (result.content as [{ text?: string }])[0]?.text ?? '{}';
  return JSON.parse(text) as McpToolEnvelope;
}

export function mcpToolErrorText(result: Awaited<ReturnType<Client['callTool']>>): string {
  return (result.content as [{ text?: string }])[0]?.text ?? '';
}

export async function connectMcpTestClient(
  createServer: (config: AppConfig) => McpServer,
  config: AppConfig,
  clientName: string,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer(config);
  const client = new Client({ name: clientName, version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
