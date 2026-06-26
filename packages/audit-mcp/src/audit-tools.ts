import { randomUUID } from 'node:crypto';

import {
  annotations,
  buildInventoryFindings,
  createServerAuditEmitter,
  executeRoleGoogleTool,
  GovernanceReportSchema,
  mapInventoryAgent,
  mcpInputSchemas,
} from '@gemini-data-agents/core';
import { z } from 'zod';

import type { AppConfig, GovernanceReport } from '@gemini-data-agents/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAuditTools(server: McpServer, config: AppConfig): void {
  const emitAudit = createServerAuditEmitter('audit', config.security);

  registerAuditConversationsList(server, config, emitAudit);
  registerAuditMessagesList(server, config, emitAudit);
  registerAuditDataAgentsInventory(server, config, emitAudit);
  registerAuditGovernanceReportGenerate(server, config, emitAudit);
}

function registerAuditConversationsList(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('List Conversations');
  server.registerTool(
    'audit.conversations.list',
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
        toolName: 'audit.conversations.list',
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ project: a.project, location: a.location }),
        failureAuditExtra: (a) => ({ project: a.project, location: a.location }),
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
    'audit.messages.list',
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
        toolName: 'audit.messages.list',
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ resource_name: a.conversation }),
        failureAuditExtra: (a) => ({ resource_name: a.conversation }),
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
    'audit.data_agents.inventory',
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
        toolName: 'audit.data_agents.inventory',
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ project: a.project, location: a.location }),
        failureAuditExtra: (a) => ({ project: a.project, location: a.location }),
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

function registerAuditGovernanceReportGenerate(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Generate Governance Report');
  server.registerTool(
    'audit.governance_report.generate',
    {
      title: ann.title,
      description: 'Generate a minimal governance report from Data Agent inventory.',
      inputSchema: {
        project: mcpInputSchemas.project,
        location: mcpInputSchemas.location,
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: 'audit.governance_report.generate',
        args,
        operationKind: 'report',
        auditExtra: (a) => ({ project: a.project, location: a.location }),
        failureAuditExtra: (a) => ({ project: a.project, location: a.location }),
        run: async ({ clients, version }, a) => {
          const agents = await clients.dataAgents.listAll({
            project: a.project,
            location: a.location,
            version,
          });
          const findings = buildInventoryFindings(agents);
          const report: GovernanceReport = {
            reportId: randomUUID(),
            generatedAt: new Date().toISOString(),
            scope: {
              projects: [a.project],
              locations: [a.location],
              dataAgents: agents.map((item) => item.name),
            },
            summary: {
              dataAgentCount: agents.length,
              findingCount: findings.length,
            },
            findings,
            evidence: agents.map((item) => ({
              source: 'dataAgent' as const,
              resourceName: item.name,
              redacted: false,
            })),
          };
          GovernanceReportSchema.parse(report);
          return report;
        },
      }),
  );
}
