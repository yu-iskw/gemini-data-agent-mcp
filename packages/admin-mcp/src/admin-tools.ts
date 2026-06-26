import {
  calculateLatency,
  createAuditStartTime,
  DataAgentMcpError,
  diffAnalystRegistryYaml,
  formatMcpToolError,
  emitAuditEvent,
  parseAndValidateAnalystRegistryYaml,
  resolveAgentConfig,
  resolveCredentials,
  serializeAnalystRegistryYaml,
  buildConfigInput,
  validateConfig,
  wrapNetworkError,
} from '@gemini-data-agents/core';
import { z } from 'zod';

import { registerAdminRfcTools } from './admin-rfc-tools.js';

import type { AppConfig } from '@gemini-data-agents/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAdminTools(server: McpServer, config: AppConfig): void {
  registerGenerateAnalystRegistryYaml(server, config);
  registerValidateAnalystRegistryYaml(server);
  registerDiffAnalystRegistryYaml(server);
  registerInspectAdminAuth(server, config);
  registerDryRunDataAgentChange(server, config);
  registerAdminRfcTools(server, config);
}

function registerGenerateAnalystRegistryYaml(server: McpServer, config: AppConfig): void {
  server.tool(
    'generate_analyst_registry_yaml',
    'Serialize the current resolved configuration as analyst-safe YAML text for manual commit (no secrets beyond auth fields in policy).',
    {
      use_loaded_config: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'When true, use the admin server loaded config. When false, pass inline agents only if supported.',
        ),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      try {
        if (!args.use_loaded_config) {
          return {
            content: [
              {
                type: 'text',
                text: formatMcpToolError(
                  new DataAgentMcpError(
                    'UNSUPPORTED',
                    'Inline-only generation is not implemented; keep use_loaded_config true.',
                    false,
                  ),
                ),
              },
            ],
            isError: true,
          };
        }

        const yaml = serializeAnalystRegistryYaml(config);
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'generate_analyst_registry_yaml',
            agent: 'registry',
            api_version: config.api_version,
            auth_mode: 'n/a',
            latency_ms: latency,
            success: true,
          },
          config.security,
        );

        return { content: [{ type: 'text', text: yaml }] };
      } catch (err) {
        const latency = calculateLatency(startTime);
        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'generate_analyst_registry_yaml',
            agent: 'registry',
            api_version: config.api_version,
            auth_mode: 'n/a',
            latency_ms: latency,
            success: false,
            error_code: err instanceof DataAgentMcpError ? err.code : 'UNKNOWN',
          },
          config.security,
        );
        return { content: [{ type: 'text', text: formatMcpToolError(err) }], isError: true };
      }
    },
  );
}

function registerValidateAnalystRegistryYaml(server: McpServer): void {
  server.tool(
    'validate_analyst_registry_yaml',
    'Parse and validate YAML text against the shared analyst registry schema.',
    {
      yaml: z.string().describe('Full YAML document string.'),
    },
    async (args) => {
      try {
        const validated = parseAndValidateAnalystRegistryYaml(args.yaml);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { valid: true, agent_count: Object.keys(validated.agents).length },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: formatMcpToolError(err) }],
          isError: true,
        };
      }
    },
  );
}

function registerDiffAnalystRegistryYaml(server: McpServer): void {
  server.tool(
    'diff_analyst_registry_yaml',
    'Unified line-oriented diff between two YAML strings.',
    {
      baseline: z.string().describe('Baseline YAML text.'),
      proposed: z.string().describe('Proposed YAML text.'),
    },
    async (args) => {
      const diff = diffAnalystRegistryYaml(args.baseline, args.proposed);
      return { content: [{ type: 'text', text: diff }] };
    },
  );
}

function registerInspectAdminAuth(server: McpServer, config: AppConfig): void {
  server.tool(
    'inspect_admin_auth',
    'Resolve credentials for a named agent and report auth mode (no secret material).',
    {
      agent: z.string().optional().describe('Agent name; defaults to first configured agent.'),
    },
    async (args) => {
      const startTime = createAuditStartTime();
      try {
        const names = Object.keys(config.agents);
        const agentName = args.agent ?? names[0];
        if (!agentName || !Object.hasOwn(config.agents, agentName)) {
          throw new DataAgentMcpError(
            'AGENT_NOT_FOUND',
            `Agent not found. Available: ${names.join(', ') || '(none)'}`,
            false,
          );
        }

        const agentConfig = resolveAgentConfig(config, agentName);
        const credentials = await resolveCredentials(agentConfig.auth);
        const headers = await credentials.getRequestHeaders();
        const headerKeys = Object.keys(headers as Record<string, unknown>);
        const latency = calculateLatency(startTime);

        emitAuditEvent(
          {
            event: 'mcp_tool_invocation',
            tool: 'inspect_admin_auth',
            agent: agentName,
            api_version: config.api_version,
            auth_mode: agentConfig.auth.mode,
            latency_ms: latency,
            success: true,
          },
          config.security,
        );

        const summary = {
          agent: agentName,
          auth_mode: agentConfig.auth.mode,
          request_header_keys: headerKeys.sort(),
        };

        return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
      } catch (err) {
        const wrapped =
          err instanceof DataAgentMcpError ? err : wrapNetworkError(err, args.agent ?? '');
        return { content: [{ type: 'text', text: formatMcpToolError(wrapped) }], isError: true };
      }
    },
  );
}

function registerDryRunDataAgentChange(server: McpServer, config: AppConfig): void {
  server.tool(
    'dry_run_data_agent_change',
    'Validate a proposed agent definition merged into a copy of the loaded config without calling remote APIs.',
    {
      agent_name: z.string().describe('Registry key for the agent.'),
      proposed_agent: z.record(z.unknown()).describe('YAML-shaped agent object to validate.'),
    },
    async (args) => {
      try {
        const input = buildConfigInput(config) as Record<string, unknown> & {
          agents: Record<string, unknown>;
        };
        input.agents[args.agent_name] = args.proposed_agent;
        validateConfig(input);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { valid: true, message: 'Merged configuration validates.' },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: formatMcpToolError(err) }], isError: true };
      }
    },
  );
}
