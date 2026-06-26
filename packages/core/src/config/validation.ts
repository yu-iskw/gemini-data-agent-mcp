import { ALLOWED_API_VERSIONS, DEFAULT_TIMEOUT_SECONDS, WARN_ON_V1ALPHA } from './defaults.js';

import type { AppConfig, AgentConfig, ApiVersion } from '../types.js';

export function resolveAgentConfig(config: AppConfig, agentName: string): AgentConfig {
  // Agent name is validated by callers against configured registry keys.
  // eslint-disable-next-line security/detect-object-injection
  const agent = config.agents[agentName];
  if (!agent) {
    const available = Object.keys(config.agents).join(', ');
    throw new Error(
      `Unknown agent "${agentName}". Available agents: ${available || '(none configured)'}`,
    );
  }
  return agent;
}

export function agentHasTool(agent: AgentConfig, toolName: string): boolean {
  return agent.tools.includes(toolName);
}

export function resolveApiVersion(
  config: AppConfig,
  agent: AgentConfig,
  requestedVersion?: string,
): ApiVersion {
  if (requestedVersion) {
    if (!ALLOWED_API_VERSIONS.includes(requestedVersion as AppConfig['api_version'])) {
      throw new Error(
        `API version "${requestedVersion}" is not allowed. Allowed versions: ${ALLOWED_API_VERSIONS.join(', ')}`,
      );
    }
    return requestedVersion as ApiVersion;
  }

  return agent.api_version;
}

export function resolveTimeout(requestedTimeout?: number): number {
  return requestedTimeout ?? DEFAULT_TIMEOUT_SECONDS;
}

export function shouldWarnOnV1Alpha(): boolean {
  return WARN_ON_V1ALPHA;
}
