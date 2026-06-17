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

const AgentInputSchema = z
  .object({
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
    auth_mode: z
      .enum(['adc', 'user_token'])
      .optional()
      .describe(
        'Egress auth mode: adc (default) or user_token (HTTP only; requires X-Google-Access-Token header).',
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
  })
  .superRefine((agent, ctx) => {
    if (agent.auth_mode === 'user_token' && agent.impersonate_service_account) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['auth_mode'],
        message: 'auth_mode user_token cannot be combined with impersonate_service_account',
      });
    }
  });

const HttpCorsConfigSchema = z.object({
  allowed_origins: z
    .array(z.string().url())
    .optional()
    .describe('Browser origins allowed for CORS. Omit to disable CORS (native clients only).'),
});

const HttpSessionConfigSchema = z.object({
  max_sessions: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum concurrent MCP HTTP sessions (default 1000).'),
  idle_ttl_ms: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Idle session TTL in milliseconds (default 900000).'),
  max_sessions_per_principal: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum sessions per authenticated principal (default 50).'),
});

const HttpBindConfigSchema = z.object({
  host: z
    .string()
    .optional()
    .describe('HTTP bind host. Defaults to 127.0.0.1 locally; use 0.0.0.0 in containers.'),
  port: z
    .number()
    .int()
    .min(1)
    .max(65_535)
    .optional()
    .describe('HTTP bind port (1-65535). Defaults to 8080 when transport is http.'),
});

const HttpServerConfigSchema = z.object({
  path: z
    .string()
    .optional()
    .describe('HTTP path for MCP. Must match public_url pathname when both are set.'),
  cors: HttpCorsConfigSchema.optional().describe('CORS settings for browser MCP clients.'),
  sessions: HttpSessionConfigSchema.optional().describe('HTTP session lifecycle limits.'),
  max_body_bytes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum JSON request body size in bytes (default 1048576).'),
  google_access_token_header: z
    .string()
    .min(1)
    .optional()
    .describe(
      'HTTP header for end-user Google access token when an agent uses auth_mode user_token (default x-google-access-token).',
    ),
});

const OAuthServerConfigSchema = z
  .object({
    enabled: z
      .boolean()
      .default(true)
      .describe('Require OAuth Bearer tokens on HTTP MCP requests.'),
    resource_url: z
      .string()
      .url()
      .optional()
      .describe('Canonical MCP resource URL. Defaults to server.public_url when omitted.'),
    issuer: z.string().url().describe('OAuth/OIDC issuer URL (Identity Platform, Keycloak, etc.).'),
    scopes_supported: z
      .array(z.string().min(1))
      .default(['mcp:tools'])
      .describe('Scopes advertised in Protected Resource Metadata.'),
    required_scopes: z
      .array(z.string().min(1))
      .optional()
      .describe('OAuth scopes required on MCP access tokens (enforced at ingress).'),
  })
  .transform((oauth) => ({
    ...oauth,
    required_scopes: oauth.required_scopes ?? oauth.scopes_supported,
  }));

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
  public_url: z
    .string()
    .url()
    .optional()
    .describe('Public MCP endpoint URL (canonical OAuth resource and client discovery).'),
  bind: HttpBindConfigSchema.optional().describe('HTTP bind address for the listening socket.'),
  host: z.string().optional().describe('Deprecated: use bind.host. HTTP bind host.'),
  port: z
    .number()
    .int()
    .min(1)
    .max(65_535)
    .optional()
    .describe('Deprecated: use bind.port. HTTP bind port (1-65535).'),
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
