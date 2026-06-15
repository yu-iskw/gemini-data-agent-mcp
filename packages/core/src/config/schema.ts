import { z } from 'zod';

import { ALLOWED_AGENT_TOOLS } from './defaults.js';

const ApiVersionSchema = z.enum(['v1', 'v1beta', 'v1alpha']);

const AgentGenerationOptionsSchema = z.object({
  generate_query: z.boolean().optional(),
  generate_query_result: z.boolean().optional(),
  generate_natural_language_answer: z.boolean().optional(),
  generate_explanation: z.boolean().optional(),
  generate_disambiguation_question: z.boolean().optional(),
});

const ClientOverrideSchema = z.object({
  project: z.string().min(1, 'client.project is required'),
  location: z.string().min(1, 'client.location is required'),
});

const AgentInputSchema = z.object({
  data_agent: z.string().min(1, 'data_agent is required'),
  tools: z
    .array(z.enum(ALLOWED_AGENT_TOOLS))
    .min(1, 'tools must contain at least one allowed tool name'),
  impersonate_service_account: z.string().optional(),
  api_version: ApiVersionSchema.optional(),
  client: ClientOverrideSchema.optional(),
  display_name: z.string().optional(),
  description: z.string().optional(),
  generation_options: AgentGenerationOptionsSchema.optional(),
});

const ServerConfigSchema = z.object({
  name: z.string().default('gemini-data-agent'),
  log_level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
  transport: z.enum(['stdio', 'http']).default('stdio'),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
});

/** v2 YAML input schema (user-facing configuration). */
export const AppConfigInputSchema = z.object({
  api_version: ApiVersionSchema,
  server: ServerConfigSchema.optional(),
  agents: z.record(z.string(), AgentInputSchema),
});

export type AppConfigInput = z.infer<typeof AppConfigInputSchema>;
