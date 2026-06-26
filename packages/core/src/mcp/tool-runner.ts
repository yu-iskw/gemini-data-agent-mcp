import { resolveApiVersion } from '../config/validation.js';
import { calculateLatency, createAuditStartTime, emitAuditEvent } from '../security/audit.js';

import {
  buildToolErrorResult,
  buildToolResult,
  normalizeToolError,
  toolErrorFromMcpError,
} from './results.js';
import { type RoleGoogleClients } from './role-clients.js';
import { mcpRuntimeDeps } from './runtime-deps.js';

import type { ApiVersion, AppConfig, AuditEvent, AgentConfig, SecurityConfig } from '../types.js';
import type { McpStructuredToolResult } from './results.js';

type RoleServer = NonNullable<AuditEvent['server']>;

export type ServerAuditEmitter = (event: Omit<AuditEvent, 'server'>) => void;

export function createServerAuditEmitter(
  server: RoleServer,
  security: SecurityConfig,
): ServerAuditEmitter {
  return (event) => emitAuditEvent({ ...event, server }, security);
}

export interface RoleToolContext {
  agentName: string;
  agent: AgentConfig;
  clients: RoleGoogleClients;
  version: ApiVersion;
}

export async function executeRoleGoogleTool<TArgs extends { agent?: string }, TData>(
  config: AppConfig,
  emitAudit: ServerAuditEmitter,
  options: {
    toolName: string;
    args: TArgs;
    operationKind: NonNullable<AuditEvent['operation_kind']>;
    auditExtra?: (args: TArgs) => Partial<AuditEvent>;
    run: (ctx: RoleToolContext, args: TArgs) => Promise<TData>;
    compact?: boolean;
  },
): Promise<McpStructuredToolResult> {
  const startTime = createAuditStartTime();
  const { toolName, args, operationKind, auditExtra, run } = options;
  const agentHint = args.agent ?? '';

  try {
    const ctxBase = await mcpRuntimeDeps.createRoleGoogleClients(config, args.agent);
    const version = resolveApiVersion(config, ctxBase.agent);
    const ctx: RoleToolContext = { ...ctxBase, version };
    const data = await run(ctx, args);

    emitAudit({
      event: 'mcp_tool_invocation',
      tool: toolName,
      agent: ctx.agentName,
      api_version: version,
      auth_mode: ctx.agent.auth.mode,
      latency_ms: calculateLatency(startTime),
      success: true,
      operation_kind: operationKind,
      ...(auditExtra?.(args) ?? {}),
    });

    return buildToolResult(toolName, data, { compact: options.compact });
  } catch (err) {
    const wrapped = normalizeToolError(err, agentHint);
    emitAudit({
      event: 'mcp_tool_invocation',
      tool: toolName,
      agent: agentHint || 'unknown',
      api_version: config.api_version,
      auth_mode: 'unknown',
      latency_ms: calculateLatency(startTime),
      success: false,
      error_code: wrapped.code,
      error_category: wrapped.code,
      operation_kind: operationKind,
      ...(auditExtra?.(args) ?? {}),
    });
    return buildToolErrorResult(toolName, toolErrorFromMcpError(wrapped));
  }
}

export async function executeLocalRfcTool<TData>(
  config: AppConfig,
  emitAudit: ServerAuditEmitter,
  options: {
    toolName: string;
    operationKind: NonNullable<AuditEvent['operation_kind']>;
    agent?: string;
    authMode?: string;
    auditExtra?: Partial<AuditEvent>;
    run: () => Promise<TData> | TData;
  },
): Promise<McpStructuredToolResult> {
  const startTime = createAuditStartTime();
  const { toolName, operationKind, run } = options;

  try {
    const data = await run();

    emitAudit({
      event: 'mcp_tool_invocation',
      tool: toolName,
      agent: options.agent ?? 'local',
      api_version: config.api_version,
      auth_mode: options.authMode ?? 'n/a',
      latency_ms: calculateLatency(startTime),
      success: true,
      operation_kind: operationKind,
      ...(options.auditExtra ?? {}),
    });

    return buildToolResult(toolName, data);
  } catch (err) {
    const wrapped = normalizeToolError(err, options.agent ?? 'local');
    emitAudit({
      event: 'mcp_tool_invocation',
      tool: toolName,
      agent: options.agent ?? 'local',
      api_version: config.api_version,
      auth_mode: options.authMode ?? 'n/a',
      latency_ms: calculateLatency(startTime),
      success: false,
      error_code: wrapped.code,
      error_category: wrapped.code,
      operation_kind: operationKind,
      ...(options.auditExtra ?? {}),
    });
    return buildToolErrorResult(toolName, toolErrorFromMcpError(wrapped));
  }
}
