import {
  annotations,
  assertAgentOpsContextVersion,
  assertAgentOpsPatchMask,
  createClient,
  createEvaluationClientStub,
  createServerAuditEmitter,
  DataAgentBodySchema,
  DataAgentMcpError,
  DEFAULT_AGENTOPS_STAGING_UPDATE_MASK,
  executeLocalRfcTool,
  executeRoleGoogleTool,
  extractProjectAndLocation,
  gdaToolNames,
  mcpInputSchemas,
  OfflineEvalCaseSchema,
  OfflineEvalSummarySchema,
  resolveCredentials,
  resolveTimeout,
  validateOfflineEvalCases,
} from '@gemini-data-agents/core';
import { z } from 'zod';

import type { AppConfig } from '@gemini-data-agents/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const agentOpsContextVersion = z
  .enum(['CONTEXT_VERSION_UNSPECIFIED', 'STAGING'])
  .optional()
  .default('STAGING')
  .describe('Data agent context for behavior testing (staging only).');

export function registerAgentOpsTools(server: McpServer, config: AppConfig): void {
  const emitAudit = createServerAuditEmitter('agentops', config.security);

  registerAgentOpsDataAgentsCreate(server, config, emitAudit);
  registerAgentOpsDataAgentsGet(server, config, emitAudit);
  registerAgentOpsDataAgentsPatch(server, config, emitAudit);
  registerAgentOpsBehaviorChat(server, config, emitAudit);
  registerOfflineEvalValidateCases(server, config, emitAudit);
  registerOfflineEvalSummarizeResult(server, config, emitAudit);
  registerOfflineEvalRun(server, config, emitAudit);
}

function registerAgentOpsDataAgentsCreate(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.mutatingExternal('Create Data Agent');
  server.registerTool(
    gdaToolNames.dataAgents.create,
    {
      title: ann.title,
      description: 'Create a Gemini Data Agent in a project and location (develop workflow).',
      inputSchema: {
        project: mcpInputSchemas.project,
        location: mcpInputSchemas.location,
        data_agent: DataAgentBodySchema.describe('DataAgent resource body per REST API.'),
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.dataAgents.create,
        args,
        operationKind: 'create',
        auditExtra: (a) => ({ project: a.project, location: a.location }),
        run: async ({ clients, version }, a) =>
          clients.dataAgents.create({
            project: a.project,
            location: a.location,
            dataAgent: a.data_agent,
            version,
          }),
      }),
  );
}

function registerAgentOpsDataAgentsGet(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Get Data Agent');
  server.registerTool(
    gdaToolNames.dataAgents.get,
    {
      title: ann.title,
      description: 'Get a Gemini Data Agent (inspect staging vs published context).',
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
        auditExtra: (a) => ({ resource_name: a.name }),
        run: async ({ clients, version }, a) => clients.dataAgents.get({ name: a.name, version }),
      }),
  );
}

function registerAgentOpsDataAgentsPatch(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.mutatingExternal('Patch Data Agent Staging');
  server.registerTool(
    gdaToolNames.dataAgents.patchStaging,
    {
      title: ann.title,
      description:
        'Update a Gemini Data Agent (intended for stagingContext edits during development).',
      inputSchema: {
        name: mcpInputSchemas.resourceName,
        data_agent: DataAgentBodySchema.describe('Partial DataAgent body per REST API.'),
        update_mask: z
          .string()
          .optional()
          .describe('Field mask (e.g. dataAnalyticsAgent.stagingContext).'),
        agent: mcpInputSchemas.configuredAgent,
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.dataAgents.patchStaging,
        args,
        operationKind: 'update',
        auditExtra: (a) => ({ resource_name: a.name }),
        run: async ({ clients, version }, a) => {
          const updateMask = a.update_mask ?? DEFAULT_AGENTOPS_STAGING_UPDATE_MASK;
          assertAgentOpsPatchMask(updateMask);
          return clients.dataAgents.patch({
            name: a.name,
            dataAgent: { ...a.data_agent, name: a.name },
            updateMask,
            version,
          });
        },
      }),
  );
}

function registerAgentOpsBehaviorChat(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Behavior Chat');
  server.registerTool(
    gdaToolNames.locations.chatStaging,
    {
      title: ann.title,
      description:
        'Single-turn chat against a Data Agent for behavior testing (defaults to STAGING context).',
      inputSchema: {
        data_agent: z.string().min(1).describe('Full Data Agent resource name.'),
        prompt: z.string().min(1).describe('Test prompt for this chat turn.'),
        context_version: agentOpsContextVersion,
        agent: mcpInputSchemas.configuredAgent,
        timeout_seconds: z.number().int().min(1).max(600).optional(),
      },
      annotations: ann,
    },
    async (args) =>
      executeRoleGoogleTool(config, emitAudit, {
        toolName: gdaToolNames.locations.chatStaging,
        args,
        operationKind: 'read',
        auditExtra: (a) => ({ resource_name: a.data_agent }),
        run: async (ctx, a) => {
          assertAgentOpsContextVersion(a.context_version);
          const scope = extractProjectAndLocation(a.data_agent);
          if (!scope) {
            throw new DataAgentMcpError(
              'INVALID_ARGUMENT',
              `Invalid data agent resource name: ${a.data_agent}`,
            );
          }
          const credentials = await resolveCredentials(ctx.agent.auth);
          const client = createClient(credentials);
          const response = await client.chatWithDataAgent({
            project: scope.project,
            location: scope.location,
            version: ctx.version,
            prompt: a.prompt,
            dataAgent: a.data_agent,
            contextVersion: a.context_version,
            timeoutMs: resolveTimeout(a.timeout_seconds) * 1000,
          });
          return { response };
        },
      }),
  );
}

function registerOfflineEvalValidateCases(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.localValidation('Validate Offline Eval Cases');
  server.registerTool(
    gdaToolNames.offlineEval.validateCases,
    {
      title: ann.title,
      description: 'Validate offline evaluation cases locally without calling remote APIs.',
      inputSchema: {
        cases: z.array(OfflineEvalCaseSchema).min(1),
      },
      annotations: ann,
    },
    async (args) =>
      executeLocalRfcTool(config, emitAudit, {
        toolName: gdaToolNames.offlineEval.validateCases,
        operationKind: 'evaluation',
        run: () => {
          const validation = validateOfflineEvalCases(args.cases);
          if (!validation.valid) {
            throw new Error(validation.errors.join('; '));
          }
          return { valid: true, caseCount: args.cases.length };
        },
      }),
  );
}

function registerOfflineEvalSummarizeResult(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.readOnlyExternal('Summarize Offline Eval Result');
  server.registerTool(
    gdaToolNames.offlineEval.summarizeResult,
    {
      title: ann.title,
      description: 'Summarize an offline evaluation run result.',
      inputSchema: {
        run_id: z.string().min(1),
        cases: z.array(OfflineEvalCaseSchema).optional(),
        pass_count: z.number().int().nonnegative().optional(),
        fail_count: z.number().int().nonnegative().optional(),
      },
      annotations: ann,
    },
    async (args) =>
      executeLocalRfcTool(config, emitAudit, {
        toolName: gdaToolNames.offlineEval.summarizeResult,
        operationKind: 'evaluation',
        run: () => {
          const cases = args.cases ?? [];
          if (cases.length > 0 && args.pass_count === undefined && args.fail_count === undefined) {
            throw new Error('Provide pass_count and/or fail_count when cases are supplied.');
          }
          const passCount = args.pass_count ?? 0;
          const failCount = args.fail_count ?? 0;
          const summary = {
            runId: args.run_id,
            caseCount: cases.length,
            passCount,
            failCount,
            findings:
              failCount > 0
                ? [`${failCount} case(s) failed quality checks.`]
                : ['All cases passed local summary checks.'],
          };
          OfflineEvalSummarySchema.parse(summary);
          return summary;
        },
      }),
  );
}

function registerOfflineEvalRun(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.mutatingExternal('Run Offline Evaluation');
  server.registerTool(
    gdaToolNames.offlineEval.run,
    {
      title: ann.title,
      description:
        'Start an offline evaluation run (stub adapter; Agent Platform integration deferred per ADR-0004).',
      inputSchema: {
        data_agent: z.string().min(1).describe('Full Data Agent resource name.'),
        cases: z.array(OfflineEvalCaseSchema).min(1),
      },
      annotations: ann,
    },
    async (args) =>
      executeLocalRfcTool(config, emitAudit, {
        toolName: gdaToolNames.offlineEval.run,
        operationKind: 'evaluation',
        agent: args.data_agent,
        auditExtra: { resource_name: args.data_agent },
        run: async () => {
          const validation = validateOfflineEvalCases(args.cases);
          if (!validation.valid) {
            throw new Error(validation.errors.join('; '));
          }
          const client = createEvaluationClientStub();
          return client.runOfflineEvaluation({
            dataAgent: args.data_agent,
            cases: args.cases,
          });
        },
      }),
  );
}
