import {
  annotations,
  createServerAuditEmitter,
  executeRoleGoogleTool,
  extractProjectAndLocation,
  mapDataAgentSummary,
  mcpInputSchemas,
} from '@gemini-data-agents/core';

import type { AppConfig } from '@gemini-data-agents/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAdminRfcTools(server: McpServer, config: AppConfig): void {
  const emitAudit = createServerAuditEmitter('admin', config.security);

  registerDataAgentsList(server, config, emitAudit);
  registerDataAgentsGet(server, config, emitAudit);
  registerDataAgentsGetIamPolicy(server, config, emitAudit);
  registerOperationsGet(server, config, emitAudit);
}

function registerDataAgentsList(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('List Data Agents');
  server.registerTool(
    'data_agents.list',
    {
      title: ann.title,
      description: 'List Gemini Data Agents in a project and location.',
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
        toolName: 'data_agents.list',
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

function registerDataAgentsGet(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Get Data Agent');
  server.registerTool(
    'data_agents.get',
    {
      title: ann.title,
      description: 'Get a Gemini Data Agent by full resource name.',
      inputSchema: {
        name: mcpInputSchemas.resourceName,
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: 'data_agents.get',
        args,
        operationKind: 'read',
        auditExtra: (a) => {
          const scope = extractProjectAndLocation(a.name);
          return {
            resource_name: a.name,
            project: scope?.project,
            location: scope?.location,
          };
        },
        failureAuditExtra: (a) => ({ resource_name: a.name }),
        run: async ({ clients, version }, a) => clients.dataAgents.get({ name: a.name, version }),
      }),
  );
}

function registerDataAgentsGetIamPolicy(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Get Data Agent IAM Policy');
  server.registerTool(
    'data_agents.get_iam_policy',
    {
      title: ann.title,
      description: 'Get IAM policy for a Gemini Data Agent resource.',
      inputSchema: {
        resource: mcpInputSchemas.resourceName.describe('Full Data Agent resource name.'),
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: 'data_agents.get_iam_policy',
        args,
        operationKind: 'iam',
        auditExtra: (a) => ({ resource_name: a.resource }),
        failureAuditExtra: (a) => ({ resource_name: a.resource }),
        run: async ({ clients, version }, a) =>
          clients.dataAgents.getIamPolicy({ resource: a.resource, version }),
      }),
  );
}

function registerOperationsGet(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Get Operation');
  server.registerTool(
    'operations.get',
    {
      title: ann.title,
      description: 'Get a long-running operation by full resource name.',
      inputSchema: {
        name: mcpInputSchemas.resourceName.describe('Full operation resource name.'),
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: 'operations.get',
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ resource_name: a.name, operation_name: a.name }),
        failureAuditExtra: (a) => ({ resource_name: a.name }),
        run: async ({ clients, version }, a) => clients.operations.get({ name: a.name, version }),
      }),
  );
}
