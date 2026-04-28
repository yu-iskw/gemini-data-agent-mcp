import { z } from 'zod';

import { resolveAgentConfig, resolveApiVersion, resolveTimeout } from '../config/index.js';
import { resolveCredentials } from '../auth/index.js';
import { createClient, wrapNetworkError } from '../google-api/index.js';
import { buildRawUrl } from '../google-api/endpoints.js';
import { redact } from '../security/redaction.js';
import { enforceRawPassthroughPolicy, enforceHostRestriction } from '../security/allowlist.js';
import { emitAuditEvent, createAuditStartTime, calculateLatency } from '../security/audit.js';
import { DataAgentMcpError } from '../types.js';
import {
  formatQueryDataResponse,
  formatA2AResponse,
  formatOperationResponse,
  formatAgentList,
  formatConfigResponse,
} from './content.js';
import { logWarn } from '../observability/logging.js';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../types.js';

function makeErrorText(err: unknown): string {
  if (err instanceof DataAgentMcpError) {
    return `Error [${err.code}]: ${err.message}`;
  }
  return `Error: ${String(err)}`;
}

export function registerTools(server: McpServer, config: AppConfig): void {
  registerQueryDataAgent(server, config);
  registerListDataAgents(server, config);
  registerGetDataAgentConfig(server, config);
  registerSendDataAgentMessage(server, config);
  registerGetOperation(server, config);
  registerRawDataAgentRequest(server, config);
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
          logWarn('tools', `Using v1alpha API version for agent "${agentName}" — this is an early-access version.`);
        }

        const timeoutMs = resolveTimeout(config, args.timeout_seconds) * 1000;
        const credentials = await resolveCredentials(agentConfig.auth);
        const client = createClient(credentials);

        const genOptions = {
          ...(agentConfig.generation_options ?? {}),
          ...(args.generation_options ?? {}),
        };

        const response = await client.queryData({
          project: agentConfig.project,
          location: agentConfig.location,
          version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
          query: args.prompt,
          dataAgent: agentConfig.data_agent,
          generationOptions: Object.keys(genOptions).length > 0 ? genOptions : undefined,
          context: args.context as Record<string, unknown> | undefined,
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
            target_service_account: agentConfig.auth.target_service_account,
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
            api_version: args.api_version ?? 'unknown',
            auth_mode: 'unknown',
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
          ? { auth: redact({ mode: agent.auth.mode, target_service_account: agent.auth.target_service_account }, config.security.redaction.enabled) }
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
      agent: z.string().describe('Configured data agent name.'),
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
              target_service_account: agentConfig.auth.target_service_account,
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

function registerSendDataAgentMessage(server: McpServer, config: AppConfig): void {
  server.tool(
    'send_data_agent_message',
    'Send a message to an A2A-compatible Gemini Data Agent endpoint.',
    {
      agent: z.string().describe('Configured data agent name.'),
      message: z.string().describe('Message text to send to the data agent.'),
      api_version: z.enum(['v1', 'v1beta', 'v1alpha']).optional(),
      blocking: z.boolean().optional().default(true),
      return_lro: z.boolean().optional().default(false),
      timeout_seconds: z.number().int().min(1).max(600).optional(),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      const agentName = args.agent;

      try {
        const agentConfig = resolveAgentConfig(config, agentName);

        if (!agentConfig.capabilities.a2a_send) {
          throw new DataAgentMcpError(
            'CAPABILITY_DISABLED',
            `Agent "${agentName}" does not have a2a_send capability enabled.`,
            false,
            { agent: agentName },
          );
        }

        const apiVersion = resolveApiVersion(config, agentConfig, args.api_version);
        const timeoutMs = resolveTimeout(config, args.timeout_seconds) * 1000;
        const credentials = await resolveCredentials(agentConfig.auth);
        const client = createClient(credentials);

        const response = await client.sendA2AMessage({
          project: agentConfig.project,
          location: agentConfig.location,
          dataAgentId: agentConfig.data_agent,
          version: apiVersion as 'v1' | 'v1beta' | 'v1alpha',
          message: args.message,
          blocking: args.blocking ?? true,
          timeoutMs,
        });

        const latency = calculateLatency(startTime);
        const operationName = response['name'] as string | undefined;

        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'send_data_agent_message',
            agent: agentName,
            api_version: apiVersion,
            auth_mode: agentConfig.auth.mode,
            target_service_account: agentConfig.auth.target_service_account,
            latency_ms: latency,
            success: true,
            operation_name: operationName ?? null,
          },
          config.security,
        );

        const text = formatA2AResponse(response, {
          agent: agentName,
          api_version: apiVersion,
          latency_ms: latency,
          operation_name: operationName,
        });

        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const wrapped = err instanceof DataAgentMcpError ? err : wrapNetworkError(err, agentName);
        const latency = calculateLatency(startTime);

        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'send_data_agent_message',
            agent: agentName,
            api_version: args.api_version ?? 'unknown',
            auth_mode: 'unknown',
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

function registerGetOperation(server: McpServer, config: AppConfig): void {
  server.tool(
    'get_operation',
    'Retrieve a long-running operation for a Gemini Data Agent.',
    {
      agent: z.string().describe('Configured data agent name.'),
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
            target_service_account: agentConfig.auth.target_service_account,
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
            api_version: args.api_version ?? 'unknown',
            auth_mode: 'unknown',
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
      agent: z.string().describe('Configured data agent name.'),
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
            target_service_account: agentConfig.auth.target_service_account,
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
            api_version: args.api_version ?? 'unknown',
            auth_mode: 'unknown',
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
