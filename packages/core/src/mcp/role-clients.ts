import { resolveCredentials } from '../auth/index.js';
import { resolveAgentConfig, resolveTimeout } from '../config/validation.js';
import { createConversationMessagesClient } from '../google/conversation-messages-client.js';
import { createConversationsClient } from '../google/conversations-client.js';
import { createDataAgentsClient } from '../google/data-agents-client.js';
import { createOperationsClient } from '../google/operations-client.js';
import { createGoogleRestTransport } from '../google/transport.js';
import { DataAgentMcpError } from '../types.js';

import type { ConversationMessagesClient } from '../google/conversation-messages-client.js';
import type { ConversationsClient } from '../google/conversations-client.js';
import type { DataAgentsClient } from '../google/data-agents-client.js';
import type { OperationsClient } from '../google/operations-client.js';
import type { GoogleRestTransport } from '../google/transport.js';
import type { AppConfig, AgentConfig } from '../types.js';

export interface RoleGoogleClients {
  transport: GoogleRestTransport;
  dataAgents: DataAgentsClient;
  conversations: ConversationsClient;
  conversationMessages: ConversationMessagesClient;
  operations: OperationsClient;
}

export function resolveDefaultAgentName(config: AppConfig, preferred?: string): string {
  const names = Object.keys(config.agents);
  if (preferred !== undefined) {
    if (!Object.hasOwn(config.agents, preferred)) {
      throw new DataAgentMcpError(
        'AGENT_NOT_FOUND',
        `Agent not found. Available: ${names.join(', ') || '(none)'}`,
        false,
      );
    }
    return preferred;
  }
  const first = names[0];
  if (!first) {
    throw new DataAgentMcpError('AGENT_NOT_FOUND', 'No agents configured.', false);
  }
  return first;
}

export function resolveAgentForRole(config: AppConfig, agentName?: string): AgentConfig {
  const name = resolveDefaultAgentName(config, agentName);
  return resolveAgentConfig(config, name);
}

export async function createRoleGoogleClients(
  config: AppConfig,
  agentName?: string,
): Promise<{ agentName: string; agent: AgentConfig; clients: RoleGoogleClients }> {
  const resolvedName = resolveDefaultAgentName(config, agentName);
  const agent = resolveAgentConfig(config, resolvedName);
  const credentials = await resolveCredentials(agent.auth);
  const transport = createGoogleRestTransport({
    credentials,
    defaultVersion: agent.api_version,
    defaultAgent: resolvedName,
    defaultTimeoutMs: resolveTimeout() * 1000,
  });

  return {
    agentName: resolvedName,
    agent,
    clients: {
      transport,
      dataAgents: createDataAgentsClient(transport),
      conversations: createConversationsClient(transport),
      conversationMessages: createConversationMessagesClient(transport),
      operations: createOperationsClient(transport),
    },
  };
}
