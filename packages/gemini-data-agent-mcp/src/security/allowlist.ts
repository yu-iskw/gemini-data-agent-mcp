import { API_HOST } from '../google-api/versions.js';
import { DataAgentMcpError } from '../types.js';

import type { AppConfig, AgentConfig } from '../types.js';

const ALLOWED_HOST = 'geminidataanalytics.googleapis.com';

export function enforceRawPassthroughPolicy(
  config: AppConfig,
  agent: AgentConfig,
  agentName: string,
  method: string,
  path: string,
): void {
  const globalPolicy = config.security.raw_passthrough;
  const agentPassthrough = agent.capabilities.raw_passthrough;

  if (!globalPolicy.enabled) {
    throw new DataAgentMcpError(
      'RAW_PASSTHROUGH_DISABLED',
      'Raw passthrough is disabled globally. Set security.raw_passthrough.enabled=true to allow.',
      false,
      { agent: agentName },
    );
  }

  if (!agentPassthrough) {
    throw new DataAgentMcpError(
      'RAW_PASSTHROUGH_DISABLED',
      `Raw passthrough is not enabled for agent "${agentName}". Set capabilities.raw_passthrough=true in the agent config.`,
      false,
      { agent: agentName },
    );
  }

  const normalizedMethod = method.toUpperCase();
  const allowedMethods = globalPolicy.allowed_methods.map((m) => m.toUpperCase());

  if (!allowedMethods.includes(normalizedMethod)) {
    throw new DataAgentMcpError(
      'RAW_PASSTHROUGH_METHOD_DENIED',
      `HTTP method "${normalizedMethod}" is not in the allowlist: ${allowedMethods.join(', ')}`,
      false,
      { agent: agentName, method: normalizedMethod },
    );
  }

  if (!isPathAllowed(path, globalPolicy.allowed_path_patterns)) {
    throw new DataAgentMcpError(
      'RAW_PASSTHROUGH_PATH_DENIED',
      `Path "${path}" does not match any allowed_path_patterns`,
      false,
      { agent: agentName, path },
    );
  }
}

export function enforceHostRestriction(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    throw new DataAgentMcpError('RAW_PASSTHROUGH_INVALID_URL', `Invalid URL: ${url}`, false);
  }

  if (parsed.hostname !== ALLOWED_HOST) {
    throw new DataAgentMcpError(
      'RAW_PASSTHROUGH_HOST_DENIED',
      `Host "${parsed.hostname}" is not allowed. Only "${ALLOWED_HOST}" is permitted.`,
      false,
    );
  }
}

export function isPathAllowed(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    try {
      // Patterns are explicitly configured allowlist entries.
      // eslint-disable-next-line security/detect-non-literal-regexp
      return new RegExp(pattern).test(path);
    } catch {
      return false;
    }
  });
}

export function buildAllowedRawUrl(version: string, path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_HOST}/${version}/${cleanPath}`;
}
