import {
  annotations,
  buildAgentUsageReport,
  buildGovernanceReport,
  createServerAuditEmitter,
  DEFAULT_USAGE_WINDOW_DAYS,
  executeRoleGoogleTool,
  extractDatasourceReferences,
  gdaToolNames,
  mapDataAgentSummary,
  mapInventoryAgent,
  mcpInputSchemas,
} from '@gemini-data-agents/core';
import { z } from 'zod';

import type { AppConfig } from '@gemini-data-agents/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAuditTools(server: McpServer, config: AppConfig): void {
  const emitAudit = createServerAuditEmitter('audit', config.security);

  registerAuditConversationsList(server, config, emitAudit);
  registerAuditMessagesList(server, config, emitAudit);
  registerAuditDataAgentsInventory(server, config, emitAudit);
  registerAuditDataAgentsListAccessible(server, config, emitAudit);
  registerAuditDataAgentsDatasources(server, config, emitAudit);
  registerAuditDataAgentsGetIamPolicy(server, config, emitAudit);
  registerAuditDataAgentsUsage(server, config, emitAudit);
  registerAuditGovernanceReportGenerate(server, config, emitAudit);
}

function registerAuditConversationsList(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('List Conversations');
  server.registerTool(
    gdaToolNames.conversations.list,
    {
      title: ann.title,
      description: 'List conversations for audit review.',
      inputSchema: {
        project: mcpInputSchemas.project,
        location: mcpInputSchemas.location,
        page_size: mcpInputSchemas.pageSize,
        page_token: mcpInputSchemas.pageToken,
        filter: mcpInputSchemas.filter,
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.conversations.list,
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ project: a.project, location: a.location }),
        run: async ({ clients, version }, a) =>
          clients.conversations.list({
            project: a.project,
            location: a.location,
            pageSize: a.page_size,
            pageToken: a.page_token,
            filter: a.filter,
            version,
          }),
      }),
  );
}

function registerAuditMessagesList(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('List Conversation Messages');
  server.registerTool(
    gdaToolNames.conversationMessages.list,
    {
      title: ann.title,
      description: 'List messages in a conversation for audit review.',
      inputSchema: {
        conversation: z.string().min(1).describe('Full conversation resource name.'),
        page_size: mcpInputSchemas.pageSize,
        page_token: mcpInputSchemas.pageToken,
        filter: mcpInputSchemas.filter,
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.conversationMessages.list,
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ resource_name: a.conversation }),
        run: async ({ clients, version }, a) =>
          clients.conversationMessages.list({
            conversation: a.conversation,
            pageSize: a.page_size,
            pageToken: a.page_token,
            filter: a.filter,
            version,
          }),
      }),
  );
}

function registerAuditDataAgentsInventory(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Data Agents Inventory');
  server.registerTool(
    gdaToolNames.dataAgents.inventory,
    {
      title: ann.title,
      description: 'Inventory Data Agents with summary metadata for audit.',
      inputSchema: {
        project: mcpInputSchemas.project,
        location: mcpInputSchemas.location,
        page_size: mcpInputSchemas.pageSize,
        page_token: mcpInputSchemas.pageToken,
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.dataAgents.inventory,
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ project: a.project, location: a.location }),
        run: async ({ clients, version }, a) => {
          const response = await clients.dataAgents.list({
            project: a.project,
            location: a.location,
            pageSize: a.page_size,
            pageToken: a.page_token,
            version,
          });
          const agents = response.dataAgents ?? [];
          return {
            count: agents.length,
            agents: agents.map(mapInventoryAgent),
            nextPageToken: response.nextPageToken,
          };
        },
      }),
  );
}

function registerAuditDataAgentsListAccessible(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('List Accessible Data Agents');
  server.registerTool(
    gdaToolNames.dataAgents.listAccessible,
    {
      title: ann.title,
      description: 'List Data Agents accessible to the caller in a project and location.',
      inputSchema: {
        project: mcpInputSchemas.project,
        location: mcpInputSchemas.location,
        page_size: mcpInputSchemas.pageSize,
        page_token: mcpInputSchemas.pageToken,
        filter: mcpInputSchemas.filter,
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.dataAgents.listAccessible,
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ project: a.project, location: a.location }),
        run: async ({ clients, version }, a) => {
          const response = await clients.dataAgents.listAccessible({
            project: a.project,
            location: a.location,
            pageSize: a.page_size,
            pageToken: a.page_token,
            filter: a.filter,
            version,
          });
          return {
            agents: (response.dataAgents ?? []).map(mapDataAgentSummary),
            nextPageToken: response.nextPageToken,
          };
        },
      }),
  );
}

function registerAuditDataAgentsDatasources(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Data Agent Datasources');
  server.registerTool(
    gdaToolNames.dataAgents.datasources,
    {
      title: ann.title,
      description:
        'Summarize datasource references (tables, explores, databases) from a Data Agent config.',
      inputSchema: {
        name: mcpInputSchemas.resourceName,
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.dataAgents.datasources,
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ resource_name: a.name }),
        run: async ({ clients, version }, a) => {
          const agent = await clients.dataAgents.get({ name: a.name, version });
          return extractDatasourceReferences(agent);
        },
      }),
  );
}

function registerAuditDataAgentsGetIamPolicy(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Get Data Agent IAM Policy');
  server.registerTool(
    gdaToolNames.dataAgents.getIamPolicy,
    {
      title: ann.title,
      description: 'Get IAM policy for a Gemini Data Agent (who can use the agent).',
      inputSchema: {
        resource: mcpInputSchemas.resourceName.describe('Full Data Agent resource name.'),
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.dataAgents.getIamPolicy,
        args,
        operationKind: 'iam',
        auditExtra: (a) => ({ resource_name: a.resource }),
        run: async ({ clients, version }, a) =>
          clients.dataAgents.getIamPolicy({ resource: a.resource, version }),
      }),
  );
}

function registerAuditDataAgentsUsage(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Data Agent Usage');
  server.registerTool(
    gdaToolNames.dataAgents.usage,
    {
      title: ann.title,
      description:
        'Summarize per-agent conversation activity within a time window (default 30 days).',
      inputSchema: {
        project: mcpInputSchemas.project,
        location: mcpInputSchemas.location,
        window_days: z
          .number()
          .int()
          .positive()
          .optional()
          .default(DEFAULT_USAGE_WINDOW_DAYS)
          .describe('Usage window in days.'),
        name: mcpInputSchemas.resourceName
          .optional()
          .describe('Optional single Data Agent; when omitted, scores full inventory.'),
        conversation_filter: mcpInputSchemas.filter.describe(
          'Optional conversations.list filter (API syntax).',
        ),
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.dataAgents.usage,
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ project: a.project, location: a.location }),
        run: async ({ clients, version }, a) => {
          const windowDays = a.window_days;
          const agents = a.name
            ? [await clients.dataAgents.get({ name: a.name, version })]
            : (
                await clients.dataAgents.listAllResult({
                  project: a.project,
                  location: a.location,
                  version,
                })
              ).agents;

          return buildAgentUsageReport(clients, {
            project: a.project,
            location: a.location,
            version,
            windowDays,
            agents,
            conversationFilter: a.conversation_filter,
            agentName: a.name,
          });
        },
      }),
  );
}

function registerAuditGovernanceReportGenerate(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Generate Governance Report');
  server.registerTool(
    gdaToolNames.governanceReports.generate,
    {
      title: ann.title,
      description:
        'Generate a governance report from Data Agent inventory with per-agent usage in a time window.',
      inputSchema: {
        project: mcpInputSchemas.project,
        location: mcpInputSchemas.location,
        usage_window_days: z
          .number()
          .int()
          .positive()
          .optional()
          .default(DEFAULT_USAGE_WINDOW_DAYS)
          .describe('Usage window in days for agent activity.'),
        conversation_filter: mcpInputSchemas.filter.describe(
          'Optional filter for conversations.list when estimating usage (API filter syntax).',
        ),
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.governanceReports.generate,
        args,
        operationKind: 'report',
        auditExtra: (a) => ({ project: a.project, location: a.location }),
        run: async ({ clients, version }, a) => {
          const usageWindowDays = a.usage_window_days;
          const { agents, truncated } = await clients.dataAgents.listAllResult({
            project: a.project,
            location: a.location,
            version,
          });

          const usage = await buildAgentUsageReport(clients, {
            project: a.project,
            location: a.location,
            version,
            windowDays: usageWindowDays,
            agents,
            conversationFilter: a.conversation_filter,
          });

          return buildGovernanceReport({
            project: a.project,
            location: a.location,
            agents,
            inventoryTruncated: truncated,
            agentUsage: usage.agents,
            usageWindowDays,
            conversationsTruncated: usage.conversationsTruncated,
          });
        },
      }),
  );
}
