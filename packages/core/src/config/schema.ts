import { z } from 'zod';

import { ALLOWED_AGENT_TOOLS, DATA_AGENT_RESOURCE_PATTERN } from './defaults.js';

const ApiVersionSchema = z
  .enum(['v1', 'v1beta', 'v1alpha'])
  .describe('Gemini Data Agents REST API version.');

const AgentGenerationOptionsSchema = z.object({
  generate_query: z.boolean().optional(),
  generate_query_result: z.boolean().optional(),
  generate_natural_language_answer: z.boolean().optional(),
  generate_explanation: z.boolean().optional(),
  generate_disambiguation_question: z.boolean().optional(),
});

const ClientOverrideSchema = z.object({
  project: z
    .string()
    .min(1, 'client.project is required')
    .describe(
      'GCP project used for API client routing when it differs from the data_agent resource.',
    ),
  location: z
    .string()
    .min(1, 'client.location is required')
    .describe(
      'GCP location used for API client routing when it differs from the data_agent resource.',
    ),
});

const AgentInputSchema = z.object({
  data_agent: z
    .string()
    .min(1, 'data_agent is required')
    .regex(
      DATA_AGENT_RESOURCE_PATTERN,
      'data_agent must be a full resource name: projects/{project}/locations/{location}/dataAgents/{id}',
    )
    .describe('Full Gemini Data Agent resource name.'),
  tools: z
    .array(z.enum(ALLOWED_AGENT_TOOLS))
    .min(1, 'tools must contain at least one allowed tool name')
    .describe(
      'MCP tool names enabled for this agent: query_data_agent, chat_data_agent, create_data_agent_conversation, list_conversation_messages.',
    ),
  impersonate_service_account: z
    .string()
    .optional()
    .describe(
      'Optional service account email to impersonate. Omit to use Application Default Credentials (ADC).',
    ),
  api_version: ApiVersionSchema.optional().describe(
    'Optional per-agent API version override. Defaults to root api_version.',
  ),
  client: ClientOverrideSchema.optional().describe(
    'Optional API client project/location when routing differs from the data_agent resource.',
  ),
  display_name: z.string().optional().describe('Human-readable agent label for MCP resources.'),
  description: z.string().optional().describe('Short description of the agent purpose.'),
  generation_options: AgentGenerationOptionsSchema.optional().describe(
    'Default Gemini Data Agents generation options for query_data_agent.',
  ),
});

const HttpServerConfigSchema = z.object({
  path: z.string().default('/mcp').describe('HTTP path for the MCP Streamable HTTP endpoint.'),
});

const OAuthServerConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Require OAuth Bearer tokens on HTTP MCP requests.'),
  resource_url: z
    .string()
    .url()
    .describe('Canonical MCP resource URL (OAuth audience / RFC 8707 resource).'),
  issuer: z.string().url().describe('OAuth/OIDC issuer URL (Identity Platform, Keycloak, etc.).'),
  scopes_supported: z
    .array(z.string().min(1))
    .default(['mcp:tools'])
    .describe('Scopes advertised in Protected Resource Metadata.'),
});

const ServerConfigSchema = z.object({
  name: z.string().default('gemini-data-agent').describe('MCP server name reported to clients.'),
  log_level: z
    .enum(['DEBUG', 'INFO', 'WARN', 'ERROR'])
    .default('INFO')
    .describe('Log level for stderr operational logs.'),
  transport: z
    .enum(['stdio', 'http'])
    .default('stdio')
    .describe('MCP transport: stdio (local subprocess) or http (Streamable HTTP).'),
  host: z
    .string()
    .optional()
    .describe('HTTP bind host. Defaults to 127.0.0.1 locally; use 0.0.0.0 to bind all interfaces.'),
  port: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('HTTP port. Defaults to process.env.PORT or 8080 when transport is http.'),
  http: HttpServerConfigSchema.optional().describe('HTTP transport settings.'),
  oauth: OAuthServerConfigSchema.optional().describe(
    'OAuth resource-server settings for HTTP transport.',
  ),
});

/** v2 YAML input schema (user-facing configuration). */
export const AppConfigInputSchema = z.object({
  api_version: ApiVersionSchema.describe(
    'Default Gemini Data Agents API version for all agents unless overridden per agent.',
  ),
  server: ServerConfigSchema.optional().describe(
    'Optional MCP server identity and logging settings.',
  ),
  agents: z
    .record(z.string(), AgentInputSchema)
    .describe(
      'Registry of named data agents keyed by local alias (used in MCP tool agent parameter).',
    ),
});

export type AppConfigInput = z.infer<typeof AppConfigInputSchema>;
