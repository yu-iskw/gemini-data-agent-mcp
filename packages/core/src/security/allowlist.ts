import { DataAgentMcpError } from '../types.js';

import type { AppConfig, AgentConfig } from '../types.js';

const ALLOWED_HOST = 'geminidataanalytics.googleapis.com';

export function enforceRawPassthroughPolicy(
  config: AppConfig,
  _agent: AgentConfig,
  agentName: string,
  method: string,
  path: string,
): void {
  const globalPolicy = config.security.raw_passthrough;

  if (!globalPolicy.enabled) {
    throw new DataAgentMcpError('RAW_PASSTHROUGH_DISABLED', 'Raw passthrough is disabled.', false, {
      agent: agentName,
    });
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
