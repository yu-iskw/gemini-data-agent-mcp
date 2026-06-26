export {
  startMcpHttpServer,
  type McpHttpServerHandle,
  type StartMcpHttpServerOptions,
} from './transport/index.js';
export { buildOAuthMetadata, createJwtTokenVerifier } from './transport/index.js';

export { loadConfig, validateConfig, validateHttpServerConfig } from './config/loader.js';
export { applyRuntimeOverrides, type ServerCliOverrides } from './config/runtime-overrides.js';
export { parsePort } from './config/parse-port.js';
export {
  resolveAgentConfig,
  resolveApiVersion,
  resolveTimeout,
  agentHasTool,
  shouldWarnOnV1Alpha,
} from './config/validation.js';
export { AppConfigInputSchema } from './config/schema.js';
export { exportAppConfigJsonSchema, APP_CONFIG_JSON_SCHEMA_ID } from './config/json-schema.js';
export {
  ALLOWED_AGENT_TOOLS,
  ALLOWED_API_VERSIONS,
  DEFAULT_SECURITY,
  DEFAULT_SERVER,
} from './config/defaults.js';

export { resolveCredentials } from './auth/index.js';
export type { ResolvedCredentials } from './auth/index.js';

export { createClient, wrapNetworkError } from './google-api/client.js';
export {
  buildQueryDataUrl,
  buildChatUrl,
  buildCreateConversationUrl,
  buildConversationMessagesUrl,
  buildOperationUrl,
  buildRawUrl,
  normalizeDataAgentName,
  normalizeConversationName,
  extractProjectAndLocation,
} from './google-api/endpoints.js';
export { parseGoogleApiError } from './google-api/errors.js';

export {
  createGoogleRestTransport,
  type GoogleRestTransport,
  type GoogleRestRequest,
} from './google/transport.js';
export {
  createDataAgentsClient,
  DataAgentsClient,
  type ListDataAgentsInput,
  type GetDataAgentInput,
  type GetIamPolicyInput,
  type DataAgentMutationBody,
  type CreateDataAgentInput,
  type PatchDataAgentInput,
  type DeleteDataAgentInput,
  type SetIamPolicyInput,
  type ListAllAgentsResult,
} from './google/data-agents-client.js';
export {
  createConversationsClient,
  ConversationsClient,
  type ListConversationsInput,
  type GetConversationInput,
  type CreateConversationInput,
} from './google/conversations-client.js';
export {
  createConversationMessagesClient,
  ConversationMessagesClient,
  type ListConversationMessagesInput,
} from './google/conversation-messages-client.js';
export {
  createOperationsClient,
  OperationsClient,
  type GetOperationInput,
} from './google/operations-client.js';
export {
  createLoggingClientStub,
  type LoggingClient,
  type LogQueryInput,
  type LogQueryResult,
} from './google/logging-client.js';
export {
  createEvaluationClientStub,
  validateOfflineEvalCases,
  type EvaluationClient,
  type OfflineEvalCase,
  type OfflineEvalRunInput,
  type OfflineEvalRunResult,
} from './google/evaluation-client.js';
export type {
  DataAgent,
  ListDataAgentsResponse,
  Conversation,
  ListConversationsResponse,
  ConversationMessage,
  ListConversationMessagesResponse,
  Operation,
  IamPolicy,
} from './google/types.js';

export { annotations, type OfficialToolAnnotations } from './mcp/annotations.js';
export {
  buildToolResult,
  buildToolErrorResult,
  normalizeToolError,
  toolErrorFromMcpError,
  type ToolResultEnvelope,
  type McpStructuredToolResult,
} from './mcp/results.js';
export {
  ListDataAgentsResultSchema,
  GovernanceReportSchema,
  OfflineEvalCaseSchema,
  OfflineEvalSummarySchema,
  DataAgentBodySchema,
  IamPolicySchema,
  AgentUsageSummarySchema,
  mcpInputSchemas,
  type ListDataAgentsResult,
  type GovernanceReport,
  type IamPolicyInput,
} from './mcp/schemas.js';
export { buildGovernanceReport, MAX_POSSIBLY_UNUSED_ENTRIES } from './mcp/governance-report.js';
export {
  summarizeAgentUsage,
  listConversationsForUsage,
  buildAgentUsageReport,
  DEFAULT_USAGE_WINDOW_DAYS,
  type AgentUsageSummary,
} from './mcp/agent-usage.js';
export {
  assertAgentOpsPatchMask,
  assertAgentOpsContextVersion,
  assertAdminPatchMask,
  DEFAULT_AGENTOPS_STAGING_UPDATE_MASK,
} from './mcp/staging-guard.js';
export { gdaToolNames, gdaPromptNames } from './mcp/gda-tool-names.js';
export {
  createRoleGoogleClients,
  resolveDefaultAgentName,
  type RoleGoogleClients,
} from './mcp/role-clients.js';
export {
  createServerAuditEmitter,
  executeRoleGoogleTool,
  executeLocalRfcTool,
  type RoleToolContext,
  type ServerAuditEmitter,
} from './mcp/tool-runner.js';
export { mapDataAgentSummary, mapInventoryAgent, buildInventoryFindings } from './mcp/inventory.js';
export {
  extractDatasourceReferences,
  type AgentDatasourceSummary,
  type BigQueryTableRef,
  type LookerExploreRef,
  type DatabaseTableRef,
  type DatasourceContextSummary,
} from './mcp/datasources.js';

export { redact, redactServiceAccount } from './security/redaction.js';
export {
  enforceRawPassthroughPolicy,
  enforceHostRestriction,
  isPathAllowed,
} from './security/allowlist.js';
export { emitAuditEvent, createAuditStartTime, calculateLatency } from './security/audit.js';

export { logError, logInfo, logWarn, setLogLevel, structuredLog } from './observability/logging.js';
export { DEFAULT_LOG_LEVEL, LOG_LEVELS, parseLogLevel } from './observability/log-level.js';

export {
  formatAgentList,
  formatConfigResponse,
  formatConversationCreated,
  formatConversationMessages,
  formatOperationResponse,
  formatQueryDataResponse,
} from './formatting/content.js';

export {
  diffAnalystRegistryYaml,
  parseAndValidateAnalystRegistryYaml,
  serializeAnalystRegistryYaml,
  buildConfigInput,
} from './registry/analyst-registry-yaml.js';

export {
  DataAgentMcpError,
  formatMcpToolError,
  type AgentConfig,
  type ApiVersion,
  type AppConfig,
  type AuditEvent,
  type AuthConfig,
  type AuthMode,
  type GoogleApiResponse,
  type HttpServerConfig,
  type OAuthServerConfig,
  type ServerConfig,
} from './types.js';
