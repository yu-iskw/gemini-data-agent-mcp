import { parseLogLevel } from '../observability/log-level.js';
import { DataAgentMcpError } from '../types.js';

import type { AppConfig, ServerConfig } from '../types.js';

export const DEFAULT_HTTP_PORT = 8080;
export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_HTTP_PATH = '/mcp';

export interface ServerCliOverrides {
  transport?: ServerConfig['transport'];
  logLevel?: string;
  host?: string;
  port?: number;
  httpPath?: string;
}

export function validateHttpServerConfig(server: ServerConfig): void {
  if (server.transport !== 'http') {
    return;
  }

  if (!server.oauth) {
    throw new DataAgentMcpError(
      'CONFIG_OAUTH_REQUIRED',
      'server.oauth is required when server.transport is http (set oauth.enabled: false for local CI smoke tests only)',
      false,
    );
  }
}

function parseEnvBoolean(name: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }

  throw new DataAgentMcpError(
    'CONFIG_INVALID_ENV',
    `Invalid boolean value for ${name}: "${value}" (use true/false, 1/0, or yes/no)`,
    false,
    { env: name, value },
  );
}

function parseEnvPort(name: string, value: string): number {
  const port = Number.parseInt(value, 10);
  if (Number.isNaN(port) || port <= 0) {
    throw new DataAgentMcpError(
      'CONFIG_INVALID_ENV',
      `Invalid port value for ${name}: "${value}"`,
      false,
      { env: name, value },
    );
  }
  return port;
}

function parseEnvTransport(name: string, value: string): ServerConfig['transport'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'stdio' || normalized === 'http') {
    return normalized;
  }

  throw new DataAgentMcpError(
    'CONFIG_INVALID_ENV',
    `Invalid transport value for ${name}: "${value}" (use stdio or http)`,
    false,
    { env: name, value },
  );
}

function readEnvOverrides(): Partial<ServerCliOverrides> & {
  oauthEnabled?: boolean;
  oauthIssuer?: string;
  oauthResourceUrl?: string;
} {
  const overrides: Partial<ServerCliOverrides> & {
    oauthEnabled?: boolean;
    oauthIssuer?: string;
    oauthResourceUrl?: string;
  } = {};

  assignPortOverride(overrides);
  assignTransportOverride(overrides);
  assignHostOverride(overrides);
  assignHttpPathOverride(overrides);
  assignLogLevelOverride(overrides);
  assignOauthOverrides(overrides);

  return overrides;
}

function assignPortOverride(overrides: Partial<ServerCliOverrides>): void {
  const port = process.env.PORT;
  if (port !== undefined && port !== '') {
    overrides.port = parseEnvPort('PORT', port);
  }
}

function assignTransportOverride(overrides: Partial<ServerCliOverrides>): void {
  const transport = process.env.MCP_TRANSPORT;
  if (transport !== undefined && transport !== '') {
    overrides.transport = parseEnvTransport('MCP_TRANSPORT', transport);
  }
}

function assignHostOverride(overrides: Partial<ServerCliOverrides>): void {
  const host = process.env.MCP_HOST;
  if (host !== undefined && host !== '') {
    overrides.host = host;
  }
}

function assignHttpPathOverride(overrides: Partial<ServerCliOverrides>): void {
  const httpPath = process.env.MCP_HTTP_PATH;
  if (httpPath !== undefined && httpPath !== '') {
    overrides.httpPath = httpPath;
  }
}

function assignLogLevelOverride(overrides: Partial<ServerCliOverrides>): void {
  const logLevel = process.env.MCP_LOG_LEVEL;
  if (logLevel !== undefined && logLevel !== '') {
    overrides.logLevel = logLevel;
  }
}

function assignOauthOverrides(overrides: {
  oauthEnabled?: boolean;
  oauthIssuer?: string;
  oauthResourceUrl?: string;
}): void {
  const oauthEnabled = process.env.MCP_OAUTH_ENABLED;
  if (oauthEnabled !== undefined && oauthEnabled !== '') {
    overrides.oauthEnabled = parseEnvBoolean('MCP_OAUTH_ENABLED', oauthEnabled);
  }

  const oauthIssuer = process.env.MCP_OAUTH_ISSUER;
  if (oauthIssuer !== undefined && oauthIssuer !== '') {
    overrides.oauthIssuer = oauthIssuer;
  }

  const oauthResourceUrl = process.env.MCP_OAUTH_RESOURCE_URL;
  if (oauthResourceUrl !== undefined && oauthResourceUrl !== '') {
    overrides.oauthResourceUrl = oauthResourceUrl;
  }
}

function ensureHttpDefaults(server: ServerConfig): void {
  if (server.transport !== 'http') {
    return;
  }

  server.host = server.host ?? DEFAULT_HTTP_HOST;
  server.port = server.port ?? DEFAULT_HTTP_PORT;
  server.http = {
    path: server.http?.path ?? DEFAULT_HTTP_PATH,
  };
}

function applyServerOverrides(
  server: ServerConfig,
  overrides: Partial<ServerCliOverrides> & {
    oauthEnabled?: boolean;
    oauthIssuer?: string;
    oauthResourceUrl?: string;
  },
): void {
  if (overrides.transport !== undefined) {
    server.transport = overrides.transport;
  }
  if (overrides.logLevel !== undefined) {
    server.log_level = parseLogLevel(overrides.logLevel);
  }
  if (overrides.host !== undefined) {
    server.host = overrides.host;
  }
  if (overrides.port !== undefined) {
    server.port = overrides.port;
  }
  if (overrides.httpPath !== undefined) {
    server.http = { path: overrides.httpPath };
  }

  ensureHttpDefaults(server);

  if (server.transport !== 'http') {
    return;
  }

  const oauthPatch: Partial<NonNullable<ServerConfig['oauth']>> = {};
  if (overrides.oauthEnabled !== undefined) {
    oauthPatch.enabled = overrides.oauthEnabled;
  }
  if (overrides.oauthIssuer !== undefined) {
    oauthPatch.issuer = overrides.oauthIssuer;
  }
  if (overrides.oauthResourceUrl !== undefined) {
    oauthPatch.resource_url = overrides.oauthResourceUrl;
  }

  if (Object.keys(oauthPatch).length > 0) {
    if (!server.oauth) {
      throw new DataAgentMcpError(
        'CONFIG_OAUTH_REQUIRED',
        'server.oauth is required when applying OAuth environment overrides',
        false,
      );
    }
    server.oauth = { ...server.oauth, ...oauthPatch };
  }
}

/**
 * Apply environment and optional CLI overrides to a loaded config.
 * Precedence: CLI > environment variables > existing YAML values > defaults.
 */
export function applyRuntimeOverrides(config: AppConfig, cli?: ServerCliOverrides): void {
  const envOverrides = readEnvOverrides();
  applyServerOverrides(config.server, envOverrides);

  if (cli) {
    applyServerOverrides(config.server, {
      transport: cli.transport,
      logLevel: cli.logLevel,
      host: cli.host,
      port: cli.port,
      httpPath: cli.httpPath,
    });
  }

  validateHttpServerConfig(config.server);
}
