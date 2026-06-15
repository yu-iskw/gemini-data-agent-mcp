import type { ApiVersion, SecurityConfig, ServerConfig } from '../types.js';

export const ALLOWED_API_VERSIONS: ApiVersion[] = ['v1', 'v1beta', 'v1alpha'];

export const ALLOWED_AGENT_TOOLS = [
  'query_data_agent',
  'chat_data_agent',
  'create_data_agent_conversation',
  'list_conversation_messages',
] as const;

export const DATA_AGENT_RESOURCE_PATTERN = /^projects\/[^/]+\/locations\/[^/]+\/dataAgents\/[^/]+$/;

export const WARN_ON_V1ALPHA = true;

export const DEFAULT_TIMEOUT_SECONDS = 120;

export const DEFAULT_SERVER: ServerConfig = {
  name: 'gemini-data-agent',
  log_level: 'INFO',
  transport: 'stdio',
};

export const DEFAULT_SECURITY: SecurityConfig = {
  redaction: {
    enabled: true,
    show_service_account: 'full',
    redact_headers: true,
    redact_tokens: true,
    redact_raw_request_body: false,
    redact_raw_response_body: false,
  },
  audit: {
    enabled: true,
    include_prompt: false,
    include_response: false,
  },
  persistence: {
    enabled: false,
  },
  raw_passthrough: {
    enabled: false,
    allowed_methods: ['GET', 'POST'],
    allowed_path_patterns: [],
  },
};
