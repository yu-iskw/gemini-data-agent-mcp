import { z } from 'zod';

export const mcpInputSchemas = {
  project: z.string().min(1).describe('GCP project ID.'),
  location: z.string().min(1).describe('GCP location (e.g. global, us-central1).'),
  resourceName: z
    .string()
    .min(1)
    .describe('Full resource name (projects/.../dataAgents/... or operations/...).'),
  configuredAgent: z
    .string()
    .optional()
    .describe('Configured agent name for credentials; defaults to first agent.'),
  pageSize: z.number().int().positive().optional(),
  pageToken: z.string().optional(),
  filter: z.string().optional(),
} as const;

const DataAgentSummarySchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  createTime: z.string().optional(),
  updateTime: z.string().optional(),
  labels: z.record(z.string()).optional(),
});

export const ListDataAgentsResultSchema = z.object({
  agents: z.array(DataAgentSummarySchema),
  nextPageToken: z.string().optional(),
});

export type ListDataAgentsResult = z.infer<typeof ListDataAgentsResultSchema>;

const AuditFindingSchema = z.object({
  id: z.string(),
  category: z.enum(['inventory', 'access', 'usage', 'data_governance', 'operations']),
  severity: z.enum(['info', 'low', 'medium', 'high']),
  message: z.string(),
  resourceName: z.string().optional(),
});

export const GovernanceReportSchema = z.object({
  reportId: z.string(),
  generatedAt: z.string(),
  scope: z.object({
    projects: z.array(z.string()),
    locations: z.array(z.string()),
    dataAgents: z.array(z.string()).optional(),
    timeRange: z
      .object({
        start: z.string(),
        end: z.string(),
      })
      .optional(),
  }),
  summary: z.object({
    dataAgentCount: z.number(),
    conversationCount: z.number().optional(),
    messageCount: z.number().optional(),
    findingCount: z.number(),
  }),
  findings: z.array(AuditFindingSchema),
  evidence: z.array(
    z.object({
      source: z.enum(['dataAgent', 'conversation', 'message', 'cloudLogging', 'iamPolicy']),
      resourceName: z.string(),
      redacted: z.boolean(),
    }),
  ),
});

export type GovernanceReport = z.infer<typeof GovernanceReportSchema>;

export const OfflineEvalCaseSchema = z.object({
  id: z.string().min(1),
  input: z.string().min(1),
  expectedOutput: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const OfflineEvalSummarySchema = z.object({
  runId: z.string(),
  caseCount: z.number(),
  passCount: z.number(),
  failCount: z.number(),
  findings: z.array(z.string()),
});
