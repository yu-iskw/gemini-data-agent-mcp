import type { AppConfig, AgentConfig } from '../types.js';

export function resolveAgentConfig(
  config: AppConfig,
  agentName: string,
): AgentConfig {
  const agent = config.agents[agentName];
  if (!agent) {
    const available = Object.keys(config.agents).join(', ');
    throw new Error(
      `Unknown agent "${agentName}". Available agents: ${available || '(none configured)'}`,
    );
  }
  return agent;
}

export function resolveApiVersion(
  config: AppConfig,
  agent: AgentConfig,
  requestedVersion?: string,
): string {
  const policy = config.version_policy;

  if (requestedVersion) {
    if (!policy.allow_tool_override) {
      throw new Error('API version override is disabled by version_policy.allow_tool_override');
    }
    if (!policy.allowed_versions.includes(requestedVersion as 'v1' | 'v1beta' | 'v1alpha')) {
      throw new Error(
        `API version "${requestedVersion}" is not allowed. Allowed versions: ${policy.allowed_versions.join(', ')}`,
      );
    }
    return requestedVersion;
  }

  return agent.api_version ?? config.defaults.api_version ?? policy.default;
}

export function resolveTimeout(
  config: AppConfig,
  requestedTimeout?: number,
): number {
  return requestedTimeout ?? config.defaults.timeout_seconds ?? 120;
}
