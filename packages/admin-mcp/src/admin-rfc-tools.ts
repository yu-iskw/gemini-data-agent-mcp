import {
  annotations,
  assertAdminPatchMask,
  createServerAuditEmitter,
  DataAgentBodySchema,
  executeRoleGoogleTool,
  extractProjectAndLocation,
  gdaToolNames,
  IamPolicySchema,
  mapDataAgentSummary,
  mcpInputSchemas,
} from '@gemini-data-agents/core';
import { z } from 'zod';

import type { AppConfig } from '@gemini-data-agents/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAdminRfcTools(server: McpServer, config: AppConfig): void {
  const emitAudit = createServerAuditEmitter('admin', config.security);

  registerDataAgentsList(server, config, emitAudit);
  registerDataAgentsGet(server, config, emitAudit);
  registerDataAgentsPatch(server, config, emitAudit);
  registerDataAgentsDelete(server, config, emitAudit);
  registerDataAgentsSetIamPolicy(server, config, emitAudit);
  registerOperationsGet(server, config, emitAudit);
}

function registerDataAgentsList(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('List Data Agents');
  server.registerTool(
    gdaToolNames.dataAgents.list,
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
        toolName: gdaToolNames.dataAgents.list,
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ project: a.project, location: a.location }),
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
    gdaToolNames.dataAgents.get,
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
        toolName: gdaToolNames.dataAgents.get,
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
        run: async ({ clients, version }, a) => clients.dataAgents.get({ name: a.name, version }),
      }),
  );
}

function registerDataAgentsPatch(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.mutatingExternal('Patch Data Agent');
  server.registerTool(
    gdaToolNames.dataAgents.patch,
    {
      title: ann.title,
      description: 'Update a Gemini Data Agent by full resource name.',
      inputSchema: {
        name: mcpInputSchemas.resourceName,
        data_agent: DataAgentBodySchema.describe('Partial DataAgent body per REST API.'),
        update_mask: z.string().min(1).describe('Field mask for the patch (required).'),
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.dataAgents.patch,
        args,
        operationKind: 'update',
        auditExtra: (a) => ({ resource_name: a.name }),
        run: async ({ clients, version }, a) => {
          assertAdminPatchMask(a.update_mask);
          return clients.dataAgents.patch({
            name: a.name,
            dataAgent: { ...a.data_agent, name: a.name },
            updateMask: a.update_mask,
            version,
          });
        },
      }),
  );
}

function registerDataAgentsDelete(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.destructiveExternal('Delete Data Agent');
  server.registerTool(
    gdaToolNames.dataAgents.delete,
    {
      title: ann.title,
      description: 'Delete a Gemini Data Agent by full resource name.',
      inputSchema: {
        name: mcpInputSchemas.resourceName,
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.dataAgents.delete,
        args,
        operationKind: 'delete',
        auditExtra: (a) => ({ resource_name: a.name }),
        run: async ({ clients, version }, a) => {
          await clients.dataAgents.delete({ name: a.name, version });
          return { deleted: true, name: a.name };
        },
      }),
  );
}

function registerDataAgentsSetIamPolicy(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.mutatingExternal('Set Data Agent IAM Policy');
  server.registerTool(
    gdaToolNames.dataAgents.setIamPolicy,
    {
      title: ann.title,
      description: 'Set IAM policy for a Gemini Data Agent resource.',
      inputSchema: {
        resource: mcpInputSchemas.resourceName.describe('Full Data Agent resource name.'),
        policy: IamPolicySchema.describe('IAM policy to set.'),
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.dataAgents.setIamPolicy,
        args,
        operationKind: 'iam',
        auditExtra: (a) => ({ resource_name: a.resource }),
        run: async ({ clients, version }, a) =>
          clients.dataAgents.setIamPolicy({
            resource: a.resource,
            policy: a.policy,
            version,
          }),
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
    gdaToolNames.operations.get,
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
        toolName: gdaToolNames.operations.get,
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ resource_name: a.name }),
        run: async ({ clients, version }, a) => clients.operations.get({ name: a.name, version }),
      }),
  );
}
