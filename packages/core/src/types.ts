export type ApiVersion = 'v1' | 'v1beta' | 'v1alpha';

export type AuthMode = 'adc' | 'impersonation' | 'user_token';

export type AuthSource = 'adc';

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
  tools: string[];
  generation_options?: AgentGenerationOptions;
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

export interface HttpCorsConfig {
  allowed_origins?: string[];
}

export interface HttpSessionConfig {
  max_sessions?: number;
  idle_ttl_ms?: number;
  max_sessions_per_principal?: number;
}

export interface HttpBindConfig {
  host?: string;
  port?: number;
}

export interface HttpServerConfig {
  path?: string;
  cors?: HttpCorsConfig;
  sessions?: HttpSessionConfig;
  max_body_bytes?: number;
  /** HTTP header carrying the end-user Google access token when auth.mode is user_token. */
  google_access_token_header?: string;
  /** HTTP header carrying the Google ID token for identity binding in user_token mode. */
  google_id_token_header?: string;
  user_token?: UserTokenConfig;
}

export type UserTokenBindingMode = 'ingress_client_only' | 'google_sub_matches_mcp_sub';

export const DEFAULT_GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

export interface UserTokenGoogleIdentityConfig {
  issuer: string;
  audiences: string[];
  jwks_uri?: string;
  hosted_domain?: string;
  verify_at_hash?: boolean;
}

export interface UserTokenBindingConfig {
  mode: UserTokenBindingMode;
}

export interface UserTokenConfig {
  trusted_ingress_client_ids: string[];
  google_identity: UserTokenGoogleIdentityConfig;
  binding: UserTokenBindingConfig;
}

export type OAuthTokenProfile = 'jwt_jwks';

export type OAuthScopeClaim = 'scope' | 'scp';

export interface OAuthServerConfig {
  enabled: boolean;
  resource_url: string;
  issuer: string;
  scopes_supported: string[];
  /** Scopes enforced on MCP access tokens (subset of or equal to scopes_supported). */
  required_scopes: string[];
  allowed_audiences: string[];
  scope_claims: OAuthScopeClaim[];
  token_profile: OAuthTokenProfile;
}

export interface ServerConfig {
  name: string;
  log_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  transport: 'stdio' | 'http';
  /** @deprecated Use bind.host */
  host?: string;
  /** @deprecated Use bind.port */
  port?: number;
  public_url?: string;
  bind?: HttpBindConfig;
  http?: HttpServerConfig;
  oauth?: OAuthServerConfig;
}

export interface AppConfig {
  api_version: ApiVersion;
  server: ServerConfig;
  security: SecurityConfig;
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

/** Format an unknown error for MCP tool `text` responses (analyst and admin servers). */
export function formatMcpToolError(err: unknown): string {
  if (err instanceof DataAgentMcpError) {
    return `Error [${err.code}]: ${err.message}`;
  }
  return `Error: ${String(err)}`;
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
