import { DataAgentMcpError, redact, redactServiceAccount } from '@gemini-data-agents/core';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AppConfig } from '@gemini-data-agents/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

function getAgent(config: AppConfig, agentName: string) {
  return Object.entries(config.agents).find(([name]) => name === agentName)?.[1];
}

export function registerResources(server: McpServer, config: AppConfig): void {
  registerAgentsListResource(server, config);
  registerAgentDetailResource(server, config);
  registerAgentCapabilitiesResource(server, config);
  registerAgentAuthPolicyResource(server, config);
  registerPromptsResource(server, config);
}

function registerAgentsListResource(server: McpServer, config: AppConfig): void {
  server.resource(
    'agents-list',
    'gemini-data-agent://agents',
    { mimeType: 'application/json', description: 'List of all configured Gemini Data Agents.' },
    async () => {
      const agents = Object.entries(config.agents).map(([name, agent]) => ({
        name,
        display_name: agent.display_name,
        description: agent.description,
        project: agent.project,
        location: agent.location,
        api_version: agent.api_version,
        capabilities: agent.capabilities,
      }));

      return {
        contents: [
          {
            uri: 'gemini-data-agent://agents',
            mimeType: 'application/json',
            text: JSON.stringify({ agents }, null, 2),
          },
        ],
      };
    },
  );
}

function registerAgentDetailResource(server: McpServer, config: AppConfig): void {
  const template = new ResourceTemplate('gemini-data-agent://agents/{agent}', {
    list: async () => ({
      resources: Object.keys(config.agents).map((name) => ({
        uri: `gemini-data-agent://agents/${name}`,
        name,
        mimeType: 'application/json',
      })),
    }),
  });

  server.resource(
    'agent-detail',
    template,
    {
      mimeType: 'application/json',
      description: 'Redacted configuration for a named Gemini Data Agent.',
    },
    async (uri, variables) => {
      const agentName = String(variables['agent'] ?? '');
      const agent = getAgent(config, agentName);

      if (!agentName || !agent) {
        const available = Object.keys(config.agents).join(', ');
        throw new DataAgentMcpError(
          'AGENT_NOT_FOUND',
          `Agent "${agentName}" not found. Available: ${available}`,
          false,
        );
      }

      const redacted = redact(
        {
          display_name: agent.display_name,
          description: agent.description,
          project: agent.project,
          location: agent.location,
          api_version: agent.api_version,
          data_agent: agent.data_agent,
          auth: {
            mode: agent.auth.mode,
            source: agent.auth.source,
            impersonate_service_account: agent.auth.impersonate_service_account,
          },
          capabilities: agent.capabilities,
          generation_options: agent.generation_options,
        },
        config.security.redaction.enabled,
      );

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(redacted, null, 2),
          },
        ],
      };
    },
  );
}

function registerAgentCapabilitiesResource(server: McpServer, config: AppConfig): void {
  const template = new ResourceTemplate('gemini-data-agent://agents/{agent}/capabilities', {
    list: async () => ({
      resources: Object.keys(config.agents).map((name) => ({
        uri: `gemini-data-agent://agents/${name}/capabilities`,
        name: `${name} capabilities`,
        mimeType: 'application/json',
      })),
    }),
  });

  server.resource(
    'agent-capabilities',
    template,
    { mimeType: 'application/json', description: 'Capabilities of a named Gemini Data Agent.' },
    async (uri, variables) => {
      const agentName = String(variables['agent'] ?? '');
      const agent = getAgent(config, agentName);

      if (!agentName || !agent) {
        throw new DataAgentMcpError('AGENT_NOT_FOUND', `Agent "${agentName}" not found.`, false);
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(agent.capabilities, null, 2),
          },
        ],
      };
    },
  );
}

function registerAgentAuthPolicyResource(server: McpServer, config: AppConfig): void {
  const template = new ResourceTemplate('gemini-data-agent://agents/{agent}/auth-policy', {
    list: async () => ({
      resources: Object.keys(config.agents).map((name) => ({
        uri: `gemini-data-agent://agents/${name}/auth-policy`,
        name: `${name} auth policy`,
        mimeType: 'application/json',
      })),
    }),
  });

  server.resource(
    'agent-auth-policy',
    template,
    { mimeType: 'application/json', description: 'Non-secret auth posture for a named agent.' },
    async (uri, variables) => {
      const agentName = String(variables['agent'] ?? '');
      const agent = getAgent(config, agentName);

      if (!agentName || !agent) {
        throw new DataAgentMcpError('AGENT_NOT_FOUND', `Agent "${agentName}" not found.`, false);
      }
      const { redaction } = config.security;

      const authPolicy: Record<string, unknown> = {
        mode: agent.auth.mode,
        source: agent.auth.source ?? null,
      };

      if (agent.auth.impersonate_service_account) {
        authPolicy['impersonate_service_account'] = redaction.enabled
          ? redactServiceAccount(
              agent.auth.impersonate_service_account,
              redaction.show_service_account,
            )
          : agent.auth.impersonate_service_account;
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(authPolicy, null, 2),
          },
        ],
      };
    },
  );
}

function registerPromptsResource(server: McpServer, config: AppConfig): void {
  server.resource(
    'prompts-list',
    'gemini-data-agent://prompts',
    { mimeType: 'application/json', description: 'List of available MCP prompts.' },
    async () => {
      void config;

      const prompts = [
        {
          name: 'switch_intent',
          description: 'Prepare an explicit session intent transition.',
          arguments: ['current_intent', 'target_intent', 'constraints'],
        },
        {
          name: 'fork_session',
          description: 'Prepare a session branch with rationale.',
          arguments: ['session_id', 'branch_goal', 'branch_name_hint'],
        },
        {
          name: 'resume_session',
          description: 'Resume a session with recap and next action.',
          arguments: ['session_id', 'latest_intent', 'latest_revision'],
        },
        {
          name: 'handoff_summary',
          description: 'Generate a handoff summary for another client.',
          arguments: ['session_id', 'handoff_payload'],
        },
        {
          name: 'analyze_data_question',
          description: 'Use a configured Gemini Data Agent to answer a direct analytical question.',
          arguments: ['agent', 'question'],
        },
        {
          name: 'investigate_data_issue',
          description: 'Multi-step investigation of a data issue using a Gemini Data Agent.',
          arguments: ['agent', 'issue'],
        },
        {
          name: 'explain_generated_query',
          description: 'Explain a generated query from a Gemini Data Agent response.',
          arguments: ['response'],
        },
        {
          name: 'compare_segments',
          description: 'Compare two segments using a Gemini Data Agent.',
          arguments: ['agent', 'segment_a', 'segment_b', 'metric', 'time_period'],
        },
        {
          name: 'find_anomalies',
          description: 'Identify anomalies in a metric using a Gemini Data Agent.',
          arguments: ['agent', 'metric', 'time_period', 'dimensions'],
        },
        {
          name: 'prepare_data_analysis_report',
          description: 'Prepare a structured data analysis report from Gemini Data Agent outputs.',
          arguments: ['outputs'],
        },
      ];

      return {
        contents: [
          {
            uri: 'gemini-data-agent://prompts',
            mimeType: 'application/json',
            text: JSON.stringify({ prompts }, null, 2),
          },
        ],
      };
    },
  );
}
