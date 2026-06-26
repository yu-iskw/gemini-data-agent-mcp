import { DataAgentMcpError } from '../types.js';

export function parsePort(name: string, raw: string): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new DataAgentMcpError(
      'CONFIG_INVALID_ENV',
      `Invalid port value for ${name}: "${raw}"`,
      false,
      { env: name, value: raw },
    );
  }

  const port = Number(trimmed);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new DataAgentMcpError(
      'CONFIG_INVALID_ENV',
      `Invalid port value for ${name}: "${raw}" (must be 1-65535)`,
      false,
      { env: name, value: raw },
    );
  }

  return port;
}
