import type { Conversation, DataAgent } from '../google/types.js';
import type { ApiVersion } from '../types.js';
import type { RoleGoogleClients } from './role-clients.js';

export type AgentUsageConfidence = 'low' | 'medium';

export type AgentUsageSummary = {
  name: string;
  usedInWindow: boolean;
  lastActivityAt?: string;
  conversationCountInWindow: number;
  confidence: AgentUsageConfidence;
};

export const DEFAULT_USAGE_WINDOW_DAYS = 30;
const DEFAULT_CONVERSATION_USAGE_MAX_PAGES = 20;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseConversationActivityTime(conversation: Conversation): Date | null {
  const raw = conversation.updateTime ?? conversation.createTime;
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function conversationLinkedAgentNames(conversation: Conversation): string[] {
  if (conversation.dataAgent) {
    return [conversation.dataAgent];
  }
  if (Array.isArray(conversation.agents) && conversation.agents.length > 0) {
    return conversation.agents;
  }
  return [];
}

export function summarizeAgentUsage(input: {
  agents: DataAgent[];
  conversations: Conversation[];
  windowDays: number;
  windowEnd?: Date;
}): AgentUsageSummary[] {
  const windowEnd = input.windowEnd ?? new Date();
  const windowStart = new Date(windowEnd.getTime() - input.windowDays * MS_PER_DAY);

  const usageByAgent = new Map<string, { count: number; lastActivity?: Date }>();

  for (const conversation of input.conversations) {
    const activityAt = parseConversationActivityTime(conversation);
    if (activityAt && activityAt < windowStart) {
      continue;
    }

    const linkedAgents = conversationLinkedAgentNames(conversation);
    if (linkedAgents.length === 0) {
      continue;
    }

    for (const agentName of linkedAgents) {
      const current = usageByAgent.get(agentName) ?? { count: 0 };
      current.count += 1;
      if (activityAt && (!current.lastActivity || activityAt > current.lastActivity)) {
        current.lastActivity = activityAt;
      }
      usageByAgent.set(agentName, current);
    }
  }

  return input.agents.map((agent) => {
    const usage = usageByAgent.get(agent.name);
    const conversationCountInWindow = usage?.count ?? 0;
    return {
      name: agent.name,
      usedInWindow: conversationCountInWindow > 0,
      lastActivityAt: usage?.lastActivity?.toISOString(),
      conversationCountInWindow,
      confidence: usage ? 'medium' : 'low',
    };
  });
}

export async function listConversationsForUsage(
  clients: RoleGoogleClients,
  input: {
    project: string;
    location: string;
    version: ApiVersion;
    windowDays: number;
    filter?: string;
    maxPages?: number;
    pageSize?: number;
  },
): Promise<{ conversations: Conversation[]; truncated: boolean }> {
  const maxPages = input.maxPages ?? DEFAULT_CONVERSATION_USAGE_MAX_PAGES;
  const pageSize = input.pageSize ?? 100;
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - input.windowDays * MS_PER_DAY);

  const conversations: Conversation[] = [];
  let pageToken: string | undefined;
  let truncated = false;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await clients.conversations.list({
      project: input.project,
      location: input.location,
      pageSize,
      pageToken,
      filter: input.filter,
      version: input.version,
    });

    const pageConversations = response.conversations ?? [];
    if (pageConversations.length === 0) {
      break;
    }

    let allOlderThanWindow = true;
    for (const conversation of pageConversations) {
      const activityAt = parseConversationActivityTime(conversation);
      if (!activityAt || activityAt >= windowStart) {
        conversations.push(conversation);
        allOlderThanWindow = false;
      }
    }

    pageToken = response.nextPageToken;
    if (!pageToken) {
      break;
    }
    if (allOlderThanWindow) {
      break;
    }
    if (page + 1 >= maxPages) {
      truncated = true;
    }
  }

  return { conversations, truncated };
}

export async function buildAgentUsageReport(
  clients: RoleGoogleClients,
  input: {
    project: string;
    location: string;
    version: ApiVersion;
    windowDays: number;
    agents: DataAgent[];
    conversationFilter?: string;
    agentName?: string;
  },
): Promise<{
  windowDays: number;
  agents: AgentUsageSummary[];
  conversationsTruncated: boolean;
}> {
  const conversationFilter =
    input.conversationFilter ?? (input.agentName ? `agents:"${input.agentName}"` : undefined);

  const { conversations, truncated } = await listConversationsForUsage(clients, {
    project: input.project,
    location: input.location,
    version: input.version,
    windowDays: input.windowDays,
    filter: conversationFilter,
  });

  return {
    windowDays: input.windowDays,
    agents: summarizeAgentUsage({
      agents: input.agents,
      conversations,
      windowDays: input.windowDays,
    }),
    conversationsTruncated: truncated,
  };
}
