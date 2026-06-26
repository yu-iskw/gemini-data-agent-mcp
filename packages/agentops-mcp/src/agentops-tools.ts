import {
  annotations,
  createEvaluationClientStub,
  createServerAuditEmitter,
  executeLocalRfcTool,
  OfflineEvalCaseSchema,
  OfflineEvalSummarySchema,
  validateOfflineEvalCases,
} from '@gemini-data-agents/core';
import { z } from 'zod';

import type { AppConfig } from '@gemini-data-agents/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAgentOpsTools(server: McpServer, config: AppConfig): void {
  const emitAudit = createServerAuditEmitter('agentops', config.security);

  registerOfflineEvalValidateCases(server, config, emitAudit);
  registerOfflineEvalSummarizeResult(server, config, emitAudit);
  registerOfflineEvalRun(server, config, emitAudit);
}

function registerOfflineEvalValidateCases(
  server: McpServer,
  config: AppConfig,
  emitAudit: ReturnType<typeof createServerAuditEmitter>,
): void {
  const ann = annotations.localValidation('Validate Offline Eval Cases');
  server.registerTool(
    'agentops.offline_eval.validate_cases',
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
        toolName: 'agentops.offline_eval.validate_cases',
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
    'agentops.offline_eval.summarize_result',
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
        toolName: 'agentops.offline_eval.summarize_result',
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
    'agentops.offline_eval.run',
    {
      title: ann.title,
      description: 'Start an offline evaluation run via the evaluation client adapter.',
      inputSchema: {
        data_agent: z.string().min(1).describe('Full Data Agent resource name.'),
        cases: z.array(OfflineEvalCaseSchema).min(1),
      },
      annotations: ann,
    },
    async (args) =>
      executeLocalRfcTool(config, emitAudit, {
        toolName: 'agentops.offline_eval.run',
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
