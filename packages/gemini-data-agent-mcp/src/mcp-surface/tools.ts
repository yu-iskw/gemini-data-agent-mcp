import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { resolveCredentials } from '../auth/index.js';
import { resolveAgentConfig, resolveApiVersion, resolveTimeout } from '../config/index.js';
import { createClient, wrapNetworkError } from '../google-api/client.js';
import { buildRawUrl } from '../google-api/endpoints.js';
import { logWarn } from '../observability/logging.js';
import { enforceRawPassthroughPolicy, enforceHostRestriction } from '../security/allowlist.js';
import { emitAuditEvent, createAuditStartTime, calculateLatency } from '../security/audit.js';
import { redact } from '../security/redaction.js';
import {
  SessionAccessDeniedError,
  SessionConflictError,
  SessionNotFoundError,
} from '../session/store.js';
import { DataAgentMcpError } from '../types.js';

import {
  formatQueryDataResponse,
  formatOperationResponse,
  formatAgentList,
  formatConfigResponse,
  formatConversationCreated,
  formatConversationMessages,
} from './content.js';

import type { SessionStore } from '../session/store.js';
import type { SessionActor, SessionIntent } from '../session/types.js';
import type { AppConfig } from '../types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const configuredAgentNameDescription = 'Configured data agent name.';
const sessionActorDescription = 'Identity envelope for session ACL and audit.';
const unknownValue = 'unknown';
const sessionLocalValue = 'session-local';

function makeErrorText(err: unknown): string {
  if (err instanceof DataAgentMcpError) {
    return `Error [${err.code}]: ${err.message}`;
  }
  return `Error: ${String(err)}`;
}

function toSessionActor(args: {
  tenant_id: string;
  user_id: string;
  client_name: string;
  workspace_id?: string;
}): SessionActor {
  return {
    tenant_id: args.tenant_id,
    user_id: args.user_id,
    client_name: args.client_name,
    workspace_id: args.workspace_id,
  };
}

function wrapSessionError(err: unknown, agent: string): DataAgentMcpError {
  if (err instanceof DataAgentMcpError) {
    return err;
  }
  if (err instanceof SessionNotFoundError) {
    return new DataAgentMcpError('SESSION_NOT_FOUND', err.message, false, { agent });
  }
  if (err instanceof SessionConflictError) {
    return new DataAgentMcpError('CONFLICT', err.message, true, {
      agent,
      latest_revision: err.latest_revision,
    });
  }
  if (err instanceof SessionAccessDeniedError) {
    return new DataAgentMcpError('ACCESS_DENIED', err.message, false, { agent });
  }
  return wrapNetworkError(err, agent);
}

function summarizeSessionResponse(response: unknown): string {
  if (Array.isArray(response)) {
    const finalResponses = response
      .map((entry) => {
        const record = entry as Record<string, unknown>;
        const systemMessage = record['systemMessage'] as Record<string, unknown> | undefined;
        const text = systemMessage?.['text'] as Record<string, unknown> | undefined;
        const textType = text?.['textType'];
        const parts = text?.['parts'] as unknown[] | undefined;
        if (textType !== 'FINAL_RESPONSE' || !Array.isArray(parts)) {
          return null;
        }
        return parts.filter((part): part is string => typeof part === 'string').join('\n');
      })
      .filter((value): value is string => value !== null && value.length > 0);

    if (finalResponses.length > 0) {
      return finalResponses.join('\n').slice(0, 2000);
    }
  }

  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    const answer = record['naturalLanguageAnswer'];
    if (typeof answer === 'string' && answer.length > 0) {
      return answer.slice(0, 2000);
    }
    const generatedQuery = record['generatedQuery'];
    if (typeof generatedQuery === 'string' && generatedQuery.length > 0) {
      return generatedQuery.slice(0, 2000);
    }
  }

  return 'No compact summary available.';
}

export function registerTools(
  server: McpServer,
  config: AppConfig,
  sessionStore: SessionStore,
): void {
  registerSessionCreate(server, config, sessionStore);
  registerSessionChat(server, config, sessionStore);
  registerSessionSwitchIntent(server, config, sessionStore);
  registerSessionFork(server, config, sessionStore);
  registerSessionReset(server, config, sessionStore);
  registerSessionHandoff(server, config, sessionStore);
  registerQueryDataAgent(server, config);
  registerChatDataAgent(server, config);
  registerCreateConversation(server, config);
  registerListConversationMessages(server, config);
  registerListDataAgents(server, config);
  registerGetDataAgentConfig(server, config);
  registerGetOperation(server, config);
  registerRawDataAgentRequest(server, config);
}

function registerSessionCreate(
  server: McpServer,
  config: AppConfig,
  sessionStore: SessionStore,
): void {
  server.tool(
    'session_create',
    'Create a shared session that binds local session state to a managed Data Agent conversation.',
    {
      session_id: z.string().optional().describe('Optional custom session identifier.'),
      agent: z.string().describe(configuredAgentNameDescription),
      initial_intent: z.enum(['explore', 'debug', 'report', 'ad-hoc']).optional(),
      request_id: z.string().optional().describe('Idempotency key for safe retries.'),
      tenant_id: z.string().describe(sessionActorDescription),
      user_id: z.string().describe(sessionActorDescription),
      client_name: z.string().describe(sessionActorDescription),
      workspace_id: z.string().optional().describe(sessionActorDescription),
      api_version: z.enum(['v1', 'v1beta', 'v1alpha']).optional(),
      timeout_seconds: z.number().int().min(1).max(600).optional(),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const actor = toSessionActor(args);
      const agentName = args.agent;

      try {
        const agentConfig = resolveAgentConfig(config, agentName);
        const apiVersion = resolveApiVersion(config, agentConfig, args.api_version);
        const timeoutMs = resolveTimeout(config, args.timeout_seconds) * 1000;
        const credentials = await resolveCredentials(agentConfig.auth);
        const client = createClient(credentials);
        const createdConversation = await client.createConversation({
          project: agentConfig.project,
          location: agentConfig.location,
          version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
          dataAgent: agentConfig.data_agent,
          requestId: args.request_id,
          timeoutMs,
        });

        const conversationName = createdConversation['name'];
        if (typeof conversationName !== 'string') {
          throw new DataAgentMcpError(
            'GOOGLE_API_ERROR',
            'Conversation creation response did not include a conversation name.',
            true,
            { agent: agentName },
          );
        }

        const session = sessionStore.createSession({
          session_id: args.session_id ?? `sess_${randomUUID()}`,
          actor,
          agent: agentName,
          conversation_name: conversationName,
          intent: (args.initial_intent ?? 'ad-hoc') as SessionIntent,
          request_id: args.request_id,
        });

        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_create',
            agent: agentName,
            api_version: apiVersion,
            auth_mode: agentConfig.auth.mode,
            latency_ms: latency,
            success: true,
            session_id: session.session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
            revision: session.revision,
          },
          config.security,
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  session,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const wrapped = wrapSessionError(err, agentName);
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_create',
            agent: agentName,
            api_version: args.api_version ?? unknownValue,
            auth_mode: unknownValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
            error_category: wrapped.code,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerSessionChat(
  server: McpServer,
  config: AppConfig,
  sessionStore: SessionStore,
): void {
  server.tool(
    'session_chat',
    'Run one chat turn against an existing shared session.',
    {
      session_id: z.string(),
      prompt: z.string(),
      expected_revision: z.number().int().min(1),
      context_version: z.enum(['CONTEXT_VERSION_UNSPECIFIED', 'STAGING', 'PUBLISHED']).optional(),
      thinking_mode: z.enum(['THINKING_MODE_UNSPECIFIED', 'FAST', 'THINKING']).optional(),
      tenant_id: z.string().describe(sessionActorDescription),
      user_id: z.string().describe(sessionActorDescription),
      client_name: z.string().describe(sessionActorDescription),
      workspace_id: z.string().optional().describe(sessionActorDescription),
      api_version: z.enum(['v1', 'v1beta', 'v1alpha']).optional(),
      timeout_seconds: z.number().int().min(1).max(600).optional(),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const actor = toSessionActor(args);

      try {
        const session = sessionStore.getSessionForActor(args.session_id, actor);
        const agentConfig = resolveAgentConfig(config, session.agent);
        const apiVersion = resolveApiVersion(config, agentConfig, args.api_version);
        const timeoutMs = resolveTimeout(config, args.timeout_seconds) * 1000;
        const credentials = await resolveCredentials(agentConfig.auth);
        const client = createClient(credentials);

        const response = await client.chatWithDataAgent({
          project: agentConfig.project,
          location: agentConfig.location,
          version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
          prompt: args.prompt,
          dataAgent: agentConfig.data_agent,
          conversation: session.conversation_name,
          contextVersion: args.context_version,
          thinkingMode: args.thinking_mode,
          timeoutMs,
        });

        const responseSummary = summarizeSessionResponse(response);

        const updated = sessionStore.appendChatTurn({
          session_id: session.session_id,
          actor,
          expected_revision: args.expected_revision,
          prompt: args.prompt,
          response_summary: responseSummary,
        });

        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_chat',
            agent: session.agent,
            api_version: apiVersion,
            auth_mode: agentConfig.auth.mode,
            latency_ms: latency,
            success: true,
            session_id: session.session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
            revision: updated.revision,
          },
          config.security,
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  session: updated,
                  response,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const wrapped = wrapSessionError(err, unknownValue);
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_chat',
            agent: unknownValue,
            api_version: args.api_version ?? unknownValue,
            auth_mode: unknownValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
            error_category: wrapped.code,
            session_id: args.session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerSessionSwitchIntent(
  server: McpServer,
  config: AppConfig,
  sessionStore: SessionStore,
): void {
  server.tool(
    'session_switch_intent',
    'Switch session intent with optimistic concurrency protection.',
    {
      session_id: z.string(),
      target_intent: z.enum(['explore', 'debug', 'report', 'ad-hoc']),
      reason: z.string().optional(),
      expected_revision: z.number().int().min(1),
      tenant_id: z.string().describe(sessionActorDescription),
      user_id: z.string().describe(sessionActorDescription),
      client_name: z.string().describe(sessionActorDescription),
      workspace_id: z.string().optional().describe(sessionActorDescription),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const actor = toSessionActor(args);
      try {
        const before = sessionStore.getSession(args.session_id);
        const updated = sessionStore.switchIntent({
          session_id: args.session_id,
          actor,
          expected_revision: args.expected_revision,
          target_intent: args.target_intent as SessionIntent,
          reason: args.reason,
        });
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_switch_intent',
            agent: updated.agent,
            api_version: sessionLocalValue,
            auth_mode: sessionLocalValue,
            latency_ms: latency,
            success: true,
            session_id: updated.session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
            intent_from: before.intent,
            intent_to: updated.intent,
            revision: updated.revision,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: JSON.stringify({ session: updated }, null, 2) }] };
      } catch (err) {
        const wrapped = wrapSessionError(err, unknownValue);
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_switch_intent',
            agent: unknownValue,
            api_version: sessionLocalValue,
            auth_mode: sessionLocalValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
            error_category: wrapped.code,
            session_id: args.session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerSessionFork(
  server: McpServer,
  config: AppConfig,
  sessionStore: SessionStore,
): void {
  server.tool(
    'session_fork',
    'Fork a new session from an existing shared session.',
    {
      parent_session_id: z.string(),
      new_session_id: z.string().optional(),
      request_id: z.string().optional(),
      tenant_id: z.string().describe(sessionActorDescription),
      user_id: z.string().describe(sessionActorDescription),
      client_name: z.string().describe(sessionActorDescription),
      workspace_id: z.string().optional().describe(sessionActorDescription),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const actor = toSessionActor(args);
      try {
        const child = sessionStore.forkSession({
          parent_session_id: args.parent_session_id,
          actor,
          request_id: args.request_id,
          new_session_id: args.new_session_id,
        });
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_fork',
            agent: child.agent,
            api_version: sessionLocalValue,
            auth_mode: sessionLocalValue,
            latency_ms: latency,
            success: true,
            session_id: child.session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
            revision: child.revision,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: JSON.stringify({ session: child }, null, 2) }] };
      } catch (err) {
        const wrapped = wrapSessionError(err, unknownValue);
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_fork',
            agent: unknownValue,
            api_version: sessionLocalValue,
            auth_mode: sessionLocalValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
            error_category: wrapped.code,
            session_id: args.parent_session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerSessionReset(
  server: McpServer,
  config: AppConfig,
  sessionStore: SessionStore,
): void {
  server.tool(
    'session_reset',
    'Move a session head pointer to a prior revision.',
    {
      session_id: z.string(),
      target_revision: z.number().int().min(1),
      expected_revision: z.number().int().min(1),
      tenant_id: z.string().describe(sessionActorDescription),
      user_id: z.string().describe(sessionActorDescription),
      client_name: z.string().describe(sessionActorDescription),
      workspace_id: z.string().optional().describe(sessionActorDescription),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const actor = toSessionActor(args);
      try {
        const updated = sessionStore.resetSession({
          session_id: args.session_id,
          actor,
          expected_revision: args.expected_revision,
          target_revision: args.target_revision,
        });
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_reset',
            agent: updated.agent,
            api_version: sessionLocalValue,
            auth_mode: sessionLocalValue,
            latency_ms: latency,
            success: true,
            session_id: updated.session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
            revision: updated.revision,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: JSON.stringify({ session: updated }, null, 2) }] };
      } catch (err) {
        const wrapped = wrapSessionError(err, unknownValue);
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_reset',
            agent: unknownValue,
            api_version: sessionLocalValue,
            auth_mode: sessionLocalValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
            error_category: wrapped.code,
            session_id: args.session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerSessionHandoff(
  server: McpServer,
  config: AppConfig,
  sessionStore: SessionStore,
): void {
  server.tool(
    'session_handoff',
    'Generate a portable handoff payload for a session.',
    {
      session_id: z.string(),
      tenant_id: z.string().describe(sessionActorDescription),
      user_id: z.string().describe(sessionActorDescription),
      client_name: z.string().describe(sessionActorDescription),
      workspace_id: z.string().optional().describe(sessionActorDescription),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const actor = toSessionActor(args);
      try {
        const handoff = sessionStore.createHandoff({ session_id: args.session_id, actor });
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_handoff',
            agent: handoff.session.agent,
            api_version: sessionLocalValue,
            auth_mode: sessionLocalValue,
            latency_ms: latency,
            success: true,
            session_id: handoff.session.session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
            revision: handoff.session.revision,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: JSON.stringify(handoff, null, 2) }] };
      } catch (err) {
        const wrapped = wrapSessionError(err, unknownValue);
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'session_handoff',
            agent: unknownValue,
            api_version: sessionLocalValue,
            auth_mode: sessionLocalValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
            error_category: wrapped.code,
            session_id: args.session_id,
            tenant_id: actor.tenant_id,
            user_id: actor.user_id,
            workspace_id: actor.workspace_id,
            client_name: actor.client_name,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerQueryDataAgent(server: McpServer, config: AppConfig): void {
  server.tool(
    'query_data_agent',
    'Ask a natural-language analytical question to a configured Gemini Data Agent.',
    {
      agent: z.string().describe('Configured data agent name from the YAML registry.'),
      prompt: z.string().describe('Natural-language analytical question.'),
      api_version: z
        .enum(['v1', 'v1beta', 'v1alpha'])
        .optional()
        .describe('Optional API version override.'),
      generation_options: z
        .record(z.unknown())
        .optional()
        .describe('Optional Gemini Data Agents generation options.'),
      context: z.record(z.unknown()).optional().describe('Optional queryData context object.'),
      timeout_seconds: z
        .number()
        .int()
        .min(1)
        .max(600)
        .optional()
        .describe('Optional request timeout in seconds.'),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      let agentName = args.agent;

      try {
        const agentConfig = resolveAgentConfig(config, agentName);
        agentName = args.agent;

        if (!agentConfig.capabilities.query_data) {
          throw new DataAgentMcpError(
            'CAPABILITY_DISABLED',
            `Agent "${agentName}" does not have query_data capability enabled.`,
            false,
            { agent: agentName },
          );
        }

        const apiVersion = resolveApiVersion(config, agentConfig, args.api_version);

        if (apiVersion === 'v1alpha' && config.version_policy.warn_on_v1alpha) {
          logWarn(
            'tools',
            `Using v1alpha API version for agent "${agentName}" — this is an early-access version.`,
          );
        }

        const timeoutMs = resolveTimeout(config, args.timeout_seconds) * 1000;
        const credentials = await resolveCredentials(agentConfig.auth);
        const client = createClient(credentials);

        const genOptions = {
          ...(agentConfig.generation_options ?? {}),
          ...(args.generation_options ?? {}),
        };

        const hasContext = args.context !== undefined;
        const hasGenerationOptions = Object.keys(genOptions).length > 0;

        const response =
          hasContext || hasGenerationOptions
            ? await client.queryData({
                project: agentConfig.project,
                location: agentConfig.location,
                version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
                prompt: args.prompt,
                generationOptions: hasGenerationOptions ? genOptions : undefined,
                context: args.context as Record<string, unknown> | undefined,
                timeoutMs,
              })
            : await client.chatWithDataAgent({
                project: agentConfig.project,
                location: agentConfig.location,
                version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
                prompt: args.prompt,
                dataAgent: agentConfig.data_agent,
                timeoutMs,
              });

        const latency = calculateLatency(startTime);

        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'query_data_agent',
            agent: agentName,
            api_version: apiVersion,
            auth_mode: agentConfig.auth.mode,
            impersonate_service_account: agentConfig.auth.impersonate_service_account,
            latency_ms: latency,
            success: true,
            operation_name: null,
          },
          config.security,
        );

        const text = formatQueryDataResponse(response, {
          agent: agentName,
          api_version: apiVersion,
          latency_ms: latency,
        });

        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const wrapped = err instanceof DataAgentMcpError ? err : wrapNetworkError(err, agentName);
        const latency = calculateLatency(startTime);

        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'query_data_agent',
            agent: agentName,
            api_version: args.api_version ?? unknownValue,
            auth_mode: unknownValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
            error_category: wrapped.code,
          },
          config.security,
        );

        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerChatDataAgent(server: McpServer, config: AppConfig): void {
  server.tool(
    'chat_data_agent',
    'Chat with a configured Gemini Data Agent, optionally continuing a persisted conversation.',
    {
      agent: z.string().describe('Configured data agent name from the YAML registry.'),
      prompt: z.string().describe('User prompt for this chat turn.'),
      conversation: z
        .string()
        .optional()
        .describe('Optional conversation resource name or ID for multi-turn chat.'),
      context_version: z
        .enum(['CONTEXT_VERSION_UNSPECIFIED', 'STAGING', 'PUBLISHED'])
        .optional()
        .describe('Optional data agent context version.'),
      thinking_mode: z
        .enum(['THINKING_MODE_UNSPECIFIED', 'FAST', 'THINKING'])
        .optional()
        .describe('Optional chat thinking mode.'),
      api_version: z.enum(['v1', 'v1beta', 'v1alpha']).optional(),
      timeout_seconds: z.number().int().min(1).max(600).optional(),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const agentName = args.agent;

      try {
        const agentConfig = resolveAgentConfig(config, agentName);
        if (!agentConfig.capabilities.chat) {
          throw new DataAgentMcpError(
            'CAPABILITY_DISABLED',
            `Agent "${agentName}" does not have chat capability enabled.`,
            false,
            { agent: agentName },
          );
        }

        const apiVersion = resolveApiVersion(config, agentConfig, args.api_version);
        const timeoutMs = resolveTimeout(config, args.timeout_seconds) * 1000;
        const credentials = await resolveCredentials(agentConfig.auth);
        const client = createClient(credentials);

        const response = await client.chatWithDataAgent({
          project: agentConfig.project,
          location: agentConfig.location,
          version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
          prompt: args.prompt,
          dataAgent: agentConfig.data_agent,
          conversation: args.conversation,
          contextVersion: args.context_version,
          thinkingMode: args.thinking_mode,
          timeoutMs,
        });

        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'chat_data_agent',
            agent: agentName,
            api_version: apiVersion,
            auth_mode: agentConfig.auth.mode,
            impersonate_service_account: agentConfig.auth.impersonate_service_account,
            latency_ms: latency,
            success: true,
          },
          config.security,
        );

        const text = formatQueryDataResponse(response, {
          agent: agentName,
          api_version: apiVersion,
          latency_ms: latency,
        });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const wrapped = err instanceof DataAgentMcpError ? err : wrapNetworkError(err, agentName);
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'chat_data_agent',
            agent: agentName,
            api_version: args.api_version ?? unknownValue,
            auth_mode: unknownValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
            error_category: wrapped.code,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerCreateConversation(server: McpServer, config: AppConfig): void {
  server.tool(
    'create_data_agent_conversation',
    'Create a managed conversation for multi-turn chat with a configured data agent.',
    {
      agent: z.string().describe(configuredAgentNameDescription),
      conversation_id: z
        .string()
        .optional()
        .describe('Optional custom conversation ID (server auto-generates if omitted).'),
      request_id: z
        .string()
        .optional()
        .describe('Optional idempotency request ID for safe retries.'),
      api_version: z.enum(['v1', 'v1beta', 'v1alpha']).optional(),
      timeout_seconds: z.number().int().min(1).max(600).optional(),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const agentName = args.agent;

      try {
        const agentConfig = resolveAgentConfig(config, agentName);
        if (!agentConfig.capabilities.chat) {
          throw new DataAgentMcpError(
            'CAPABILITY_DISABLED',
            `Agent "${agentName}" does not have chat capability enabled.`,
            false,
            { agent: agentName },
          );
        }

        const apiVersion = resolveApiVersion(config, agentConfig, args.api_version);
        const timeoutMs = resolveTimeout(config, args.timeout_seconds) * 1000;
        const credentials = await resolveCredentials(agentConfig.auth);
        const client = createClient(credentials);

        const response = await client.createConversation({
          project: agentConfig.project,
          location: agentConfig.location,
          version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
          dataAgent: agentConfig.data_agent,
          conversationId: args.conversation_id,
          requestId: args.request_id,
          timeoutMs,
        });

        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'create_data_agent_conversation',
            agent: agentName,
            api_version: apiVersion,
            auth_mode: agentConfig.auth.mode,
            impersonate_service_account: agentConfig.auth.impersonate_service_account,
            latency_ms: latency,
            success: true,
          },
          config.security,
        );

        const text = formatConversationCreated(response, {
          agent: agentName,
          api_version: apiVersion,
          latency_ms: latency,
        });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const wrapped = err instanceof DataAgentMcpError ? err : wrapNetworkError(err, agentName);
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'create_data_agent_conversation',
            agent: agentName,
            api_version: args.api_version ?? unknownValue,
            auth_mode: unknownValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
            error_category: wrapped.code,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerListConversationMessages(server: McpServer, config: AppConfig): void {
  server.tool(
    'list_conversation_messages',
    'List stored messages for a managed conversation.',
    {
      agent: z.string().describe(configuredAgentNameDescription),
      conversation: z.string().describe('Conversation resource name or ID to list messages from.'),
      page_size: z.number().int().min(1).max(100).optional(),
      page_token: z.string().optional(),
      filter: z.string().optional(),
      api_version: z.enum(['v1', 'v1beta', 'v1alpha']).optional(),
      timeout_seconds: z.number().int().min(1).max(600).optional(),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const agentName = args.agent;

      try {
        const agentConfig = resolveAgentConfig(config, agentName);
        if (!agentConfig.capabilities.chat) {
          throw new DataAgentMcpError(
            'CAPABILITY_DISABLED',
            `Agent "${agentName}" does not have chat capability enabled.`,
            false,
            { agent: agentName },
          );
        }

        const apiVersion = resolveApiVersion(config, agentConfig, args.api_version);
        const timeoutMs = resolveTimeout(config, args.timeout_seconds) * 1000;
        const credentials = await resolveCredentials(agentConfig.auth);
        const client = createClient(credentials);

        const response = await client.listConversationMessages({
          project: agentConfig.project,
          location: agentConfig.location,
          conversation: args.conversation,
          version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
          pageSize: args.page_size,
          pageToken: args.page_token,
          filter: args.filter,
          timeoutMs,
        });

        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'list_conversation_messages',
            agent: agentName,
            api_version: apiVersion,
            auth_mode: agentConfig.auth.mode,
            impersonate_service_account: agentConfig.auth.impersonate_service_account,
            latency_ms: latency,
            success: true,
          },
          config.security,
        );

        const text = formatConversationMessages(response, {
          agent: agentName,
          api_version: apiVersion,
          latency_ms: latency,
        });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const wrapped = err instanceof DataAgentMcpError ? err : wrapNetworkError(err, agentName);
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'list_conversation_messages',
            agent: agentName,
            api_version: args.api_version ?? unknownValue,
            auth_mode: unknownValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
            error_category: wrapped.code,
          },
          config.security,
        );
        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerListDataAgents(server: McpServer, config: AppConfig): void {
  server.tool(
    'list_data_agents',
    'List locally configured Gemini Data Agents from the YAML registry.',
    {
      include_redacted_auth: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include redacted auth configuration in the response.'),
    },
    async (args) => {
      const agentSummaries = Object.entries(config.agents).map(([name, agent]) => ({
        name,
        display_name: agent.display_name,
        description: agent.description,
        api_version: agent.api_version,
        project: agent.project,
        location: agent.location,
        capabilities: agent.capabilities,
        ...(args.include_redacted_auth
          ? {
              auth: redact(
                {
                  mode: agent.auth.mode,
                  impersonate_service_account: agent.auth.impersonate_service_account,
                },
                config.security.redaction.enabled,
              ),
            }
          : {}),
      }));

      const text = formatAgentList(agentSummaries);
      return { content: [{ type: 'text', text }] };
    },
  );
}

function registerGetDataAgentConfig(server: McpServer, config: AppConfig): void {
  server.tool(
    'get_data_agent_config',
    'Return redacted configuration for a named Gemini Data Agent.',
    {
      agent: z.string().describe(configuredAgentNameDescription),
    },
    async (args) => {
      try {
        const agentConfig = resolveAgentConfig(config, args.agent);
        const redacted = redact(
          {
            display_name: agentConfig.display_name,
            description: agentConfig.description,
            project: agentConfig.project,
            location: agentConfig.location,
            api_version: agentConfig.api_version,
            data_agent: agentConfig.data_agent,
            auth: {
              mode: agentConfig.auth.mode,
              source: agentConfig.auth.source,
              impersonate_service_account: agentConfig.auth.impersonate_service_account,
            },
            capabilities: agentConfig.capabilities,
            generation_options: agentConfig.generation_options,
          },
          config.security.redaction.enabled,
        );

        const text = formatConfigResponse(args.agent, redacted as Record<string, unknown>);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: makeErrorText(err) }], isError: true };
      }
    },
  );
}

function registerGetOperation(server: McpServer, config: AppConfig): void {
  server.tool(
    'get_operation',
    'Retrieve a long-running operation for a Gemini Data Agent.',
    {
      agent: z.string().describe(configuredAgentNameDescription),
      operation_name: z.string().describe('Full operation resource name.'),
      api_version: z.enum(['v1', 'v1beta', 'v1alpha']).optional(),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const agentName = args.agent;

      try {
        const agentConfig = resolveAgentConfig(config, agentName);
        const apiVersion = resolveApiVersion(config, agentConfig, args.api_version);
        const timeoutMs = resolveTimeout(config) * 1000;
        const credentials = await resolveCredentials(agentConfig.auth);
        const client = createClient(credentials);

        const response = await client.getOperation({
          version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
          operationName: args.operation_name,
          agent: agentName,
          timeoutMs,
        });

        const latency = calculateLatency(startTime);

        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'get_operation',
            agent: agentName,
            api_version: apiVersion,
            auth_mode: agentConfig.auth.mode,
            impersonate_service_account: agentConfig.auth.impersonate_service_account,
            latency_ms: latency,
            success: true,
            operation_name: args.operation_name,
          },
          config.security,
        );

        const text = formatOperationResponse(response, {
          agent: agentName,
          api_version: apiVersion,
          latency_ms: latency,
          operation_name: args.operation_name,
        });

        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const wrapped = err instanceof DataAgentMcpError ? err : wrapNetworkError(err, agentName);
        const latency = calculateLatency(startTime);

        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'get_operation',
            agent: agentName,
            api_version: args.api_version ?? unknownValue,
            auth_mode: unknownValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
          },
          config.security,
        );

        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}

function registerRawDataAgentRequest(server: McpServer, config: AppConfig): void {
  server.tool(
    'raw_data_agent_request',
    'Controlled escape hatch for advanced Gemini Data Agent API calls. Disabled by default; requires explicit allowlist configuration.',
    {
      agent: z.string().describe(configuredAgentNameDescription),
      api_version: z.enum(['v1', 'v1beta', 'v1alpha']).optional(),
      method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']).describe('HTTP method.'),
      path: z.string().describe('Path below the Gemini Data Agents API host.'),
      query: z.record(z.string()).optional().describe('Query parameters.'),
      body: z.record(z.unknown()).optional().describe('Request body (for POST/PATCH/DELETE).'),
      timeout_seconds: z.number().int().min(1).max(600).optional(),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const agentName = args.agent;

      try {
        const agentConfig = resolveAgentConfig(config, agentName);

        enforceRawPassthroughPolicy(config, agentConfig, agentName, args.method, args.path);

        const apiVersion = resolveApiVersion(config, agentConfig, args.api_version);
        const url = buildRawUrl(apiVersion as 'v1' | 'v1beta' | 'v1alpha', args.path);

        enforceHostRestriction(url);

        const timeoutMs = resolveTimeout(config, args.timeout_seconds) * 1000;
        const credentials = await resolveCredentials(agentConfig.auth);
        const client = createClient(credentials);

        const response = await client.rawRequest({
          version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
          method: args.method,
          url,
          query: args.query as Record<string, string> | undefined,
          body: args.body as Record<string, unknown> | undefined,
          agent: agentName,
          timeoutMs,
        });

        const latency = calculateLatency(startTime);

        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'raw_data_agent_request',
            agent: agentName,
            api_version: apiVersion,
            auth_mode: agentConfig.auth.mode,
            impersonate_service_account: agentConfig.auth.impersonate_service_account,
            latency_ms: latency,
            success: true,
          },
          config.security,
        );

        const redacted = redact(response, config.security.redaction.enabled);
        const text = JSON.stringify(redacted, null, 2);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const wrapped = err instanceof DataAgentMcpError ? err : wrapNetworkError(err, agentName);
        const latency = calculateLatency(startTime);

        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'raw_data_agent_request',
            agent: agentName,
            api_version: args.api_version ?? unknownValue,
            auth_mode: unknownValue,
            latency_ms: latency,
            success: false,
            error_code: wrapped.code,
          },
          config.security,
        );

        return { content: [{ type: 'text', text: makeErrorText(wrapped) }], isError: true };
      }
    },
  );
}
