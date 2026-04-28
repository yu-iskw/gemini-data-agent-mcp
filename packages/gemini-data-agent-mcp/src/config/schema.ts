import { z } from 'zod';

const ApiVersionSchema = z.enum(['v1', 'v1beta', 'v1alpha']);

const AuthModeSchema = z.enum(['adc', 'impersonation']);

const AuthSourceSchema = z.enum(['adc']);

const AgentCapabilitiesSchema = z
  .object({
    query_data: z.boolean().default(true),
    chat: z.boolean().default(false),
    raw_passthrough: z.boolean().default(false),
  })
  .strict();

const AgentGenerationOptionsSchema = z.object({
  generate_query: z.boolean().optional(),
  generate_query_result: z.boolean().optional(),
  generate_natural_language_answer: z.boolean().optional(),
  generate_explanation: z.boolean().optional(),
  generate_disambiguation_question: z.boolean().optional(),
});

const AuthConfigSchema = z
  .object({
    mode: AuthModeSchema,
    source: AuthSourceSchema.optional(),
    impersonate_service_account: z.string().optional(),
    scopes: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'impersonation' && !data.impersonate_service_account) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'impersonate_service_account is required when auth mode is impersonation',
        path: ['impersonate_service_account'],
      });
    }
  });

const AgentConfigSchema = z.object({
  display_name: z.string().optional(),
  description: z.string().optional(),
  project: z.string().min(1, 'project is required'),
  location: z.string().min(1, 'location is required'),
  api_version: ApiVersionSchema,
  // Accept either full resource name or bare data agent ID.
  data_agent: z.string().min(1, 'data_agent is required'),
  auth: AuthConfigSchema,
  // Agent capabilities are optional in user YAML and default to safe values.
  capabilities: AgentCapabilitiesSchema.default({
    query_data: true,
    chat: false,
    raw_passthrough: false,
  }),
  generation_options: AgentGenerationOptionsSchema.optional(),
});

const DefaultsConfigSchema = z.object({
  api_version: ApiVersionSchema.optional(),
  location: z.string().optional(),
  timeout_seconds: z.number().int().positive().optional(),
  auth: z
    .object({
      mode: AuthModeSchema.optional(),
      scopes: z.array(z.string()).optional(),
    })
    .optional(),
});

const VersionPolicySchema = z.object({
  default: ApiVersionSchema.default('v1beta'),
  allowed_versions: z.array(ApiVersionSchema).default(['v1', 'v1beta', 'v1alpha']),
  allow_tool_override: z.boolean().default(true),
  warn_on_v1alpha: z.boolean().default(true),
});

const RedactionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  show_service_account: z.enum(['full', 'partial', 'hidden']).default('full'),
  redact_headers: z.boolean().default(true),
  redact_tokens: z.boolean().default(true),
  redact_raw_request_body: z.boolean().default(false),
  redact_raw_response_body: z.boolean().default(false),
});

const AuditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  include_prompt: z.boolean().default(false),
  include_response: z.boolean().default(false),
});

const PersistenceConfigSchema = z.object({
  enabled: z.boolean().default(false),
});

const RawPassthroughSecurityConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    allowed_methods: z.array(z.string()).default(['GET', 'POST']),
    allowed_path_patterns: z.array(z.string()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.enabled && data.allowed_path_patterns.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'allowed_path_patterns must be non-empty when raw_passthrough is enabled. ' +
          'Configure explicit path regex patterns to allow.',
        path: ['allowed_path_patterns'],
      });
    }
  });

const SecurityConfigSchema = z.object({
  // Security defaults are intentionally safe-by-default when omitted.
  redaction: RedactionConfigSchema.default({}),
  audit: AuditConfigSchema.default({}),
  persistence: PersistenceConfigSchema.default({}),
  raw_passthrough: RawPassthroughSecurityConfigSchema.default({}),
});

const ServerConfigSchema = z.object({
  name: z.string().default('gemini-data-agent-mcp'),
  log_level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
  transport: z.enum(['stdio', 'http']).default('stdio'),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
});

export const AppConfigSchema = z.object({
  // Root sections are optional from user input and resolved from defaults.
  server: ServerConfigSchema.default({}),
  version_policy: VersionPolicySchema.default({}),
  security: SecurityConfigSchema.default({}),
  defaults: DefaultsConfigSchema.default({}),
  agents: z.record(z.string(), AgentConfigSchema),
});
