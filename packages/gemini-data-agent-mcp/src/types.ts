export type ApiVersion = 'v1' | 'v1beta' | 'v1alpha';

export type AuthMode = 'adc' | 'impersonation';

export type AuthSource = 'adc';

export interface AgentCapabilities {
  query_data: boolean;
  chat: boolean;
  raw_passthrough: boolean;
}

export interface AgentGenerationOptions {
  generate_query?: boolean;
  generate_query_result?: boolean;
  generate_natural_language_answer?: boolean;
  generate_explanation?: boolean;
  generate_disambiguation_question?: boolean;
}

export interface AuthConfig {
  mode: AuthMode;
  source?: AuthSource;
  impersonate_service_account?: string;
  scopes?: string[];
}

export interface AgentConfig {
  display_name?: string;
  description?: string;
  project: string;
  location: string;
  api_version: ApiVersion;
  data_agent: string;
  auth: AuthConfig;
  capabilities: AgentCapabilities;
  generation_options?: AgentGenerationOptions;
}

export interface DefaultsConfig {
  api_version?: ApiVersion;
  location?: string;
  timeout_seconds?: number;
  auth?: Partial<AuthConfig>;
}

export interface VersionPolicyConfig {
  default: ApiVersion;
  allowed_versions: ApiVersion[];
  allow_tool_override: boolean;
  warn_on_v1alpha: boolean;
}

export interface RedactionConfig {
  enabled: boolean;
  show_service_account: 'full' | 'partial' | 'hidden';
  redact_headers: boolean;
  redact_tokens: boolean;
  redact_raw_request_body: boolean;
  redact_raw_response_body: boolean;
}

export interface AuditConfig {
  enabled: boolean;
  include_prompt: boolean;
  include_response: boolean;
}

export interface PersistenceConfig {
  enabled: boolean;
}

export interface RawPassthroughSecurityConfig {
  enabled: boolean;
  allowed_methods: string[];
  allowed_path_patterns: string[];
}

export interface SecurityConfig {
  redaction: RedactionConfig;
  audit: AuditConfig;
  persistence: PersistenceConfig;
  raw_passthrough: RawPassthroughSecurityConfig;
}

export interface ServerConfig {
  name: string;
  log_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  transport: 'stdio' | 'http';
  host?: string;
  port?: number;
}

export interface AppConfig {
  server: ServerConfig;
  version_policy: VersionPolicyConfig;
  security: SecurityConfig;
  defaults: DefaultsConfig;
  agents: Record<string, AgentConfig>;
}

interface DataAgentMcpErrorDetails {
  agent?: string;
  api_version?: string;
  auth_mode?: string;
  operation_name?: string;
  [key: string]: unknown;
}

export class DataAgentMcpError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details: DataAgentMcpErrorDetails;

  constructor(
    code: string,
    message: string,
    retryable = false,
    details: DataAgentMcpErrorDetails = {},
  ) {
    super(message);
    this.name = 'DataAgentMcpError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export interface AuditEvent {
  event: string;
  tool: string;
  agent: string;
  api_version: string;
  auth_mode: string;
  impersonate_service_account?: string;
  session_id?: string;
  tenant_id?: string;
  user_id?: string;
  workspace_id?: string;
  client_name?: string;
  intent_from?: string;
  intent_to?: string;
  revision?: number;
  latency_ms: number;
  success: boolean;
  error_code?: string;
  error_category?: string;
  operation_name?: string | null;
}

export interface GoogleApiResponse {
  [key: string]: unknown;
}
