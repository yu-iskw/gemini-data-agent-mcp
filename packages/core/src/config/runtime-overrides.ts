import { parseLogLevel } from '../observability/log-level.js';
import { DataAgentMcpError } from '../types.js';

import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PATH,
  DEFAULT_HTTP_PORT,
  validateHttpServerConfig,
  validateHttpUrlConsistency,
} from './http-config-validation.js';
import { parsePort } from './parse-port.js';

import type { AppConfig, ServerConfig } from '../types.js';

export interface ServerCliOverrides {
  transport?: ServerConfig['transport'];
  logLevel?: string;
  host?: string;
  port?: number;
  httpPath?: string;
  publicUrl?: string;
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
    `Invalid boolean value for ${name}: "${value}"`,
    false,
    { env: name, value },
  );
}

function readOptionalEnv(name: string): string | undefined {
  // Env key is always one of the fixed literals passed from readEnvOverrides.
  // eslint-disable-next-line security/detect-object-injection
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : undefined;
}

function readEnvOverrides(): Partial<ServerCliOverrides> & {
  oauthEnabled?: boolean;
  oauthIssuer?: string;
  oauthResourceUrl?: string;
  corsAllowedOrigins?: string[];
} {
  const overrides: Partial<ServerCliOverrides> & {
    oauthEnabled?: boolean;
    oauthIssuer?: string;
    oauthResourceUrl?: string;
    corsAllowedOrigins?: string[];
  } = {};

  const port = readOptionalEnv('PORT');
  if (port) {
    overrides.port = parsePort('PORT', port);
  }

  const transport = readOptionalEnv('MCP_TRANSPORT');
  if (transport) {
    const normalized = transport.trim().toLowerCase();
    if (normalized === 'stdio' || normalized === 'http') {
      overrides.transport = normalized;
    } else {
      throw new Error(`Invalid transport value for MCP_TRANSPORT: "${transport}"`);
    }
  }

  const host = readOptionalEnv('MCP_HOST');
  if (host) {
    overrides.host = host;
  }

  const httpPath = readOptionalEnv('MCP_HTTP_PATH');
  if (httpPath) {
    overrides.httpPath = httpPath;
  }

  const publicUrl = readOptionalEnv('MCP_PUBLIC_URL');
  if (publicUrl) {
    overrides.publicUrl = publicUrl;
  }

  const logLevel = readOptionalEnv('MCP_LOG_LEVEL');
  if (logLevel) {
    overrides.logLevel = logLevel;
  }

  const oauthEnabled = readOptionalEnv('MCP_OAUTH_ENABLED');
  if (oauthEnabled) {
    overrides.oauthEnabled = parseEnvBoolean('MCP_OAUTH_ENABLED', oauthEnabled);
  }

  const oauthIssuer = readOptionalEnv('MCP_OAUTH_ISSUER');
  if (oauthIssuer) {
    overrides.oauthIssuer = oauthIssuer;
  }

  const oauthResourceUrl = readOptionalEnv('MCP_OAUTH_RESOURCE_URL');
  if (oauthResourceUrl) {
    overrides.oauthResourceUrl = oauthResourceUrl;
  }

  const corsOrigins = readOptionalEnv('MCP_CORS_ALLOWED_ORIGINS');
  if (corsOrigins) {
    overrides.corsAllowedOrigins = corsOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return overrides;
}

function ensureHttpDefaults(server: ServerConfig): void {
  if (server.transport !== 'http') {
    return;
  }

  const bindHost = server.bind?.host ?? server.host ?? DEFAULT_HTTP_HOST;
  const bindPort = server.bind?.port ?? server.port ?? DEFAULT_HTTP_PORT;
  server.bind = { host: bindHost, port: bindPort };
  server.host = bindHost;
  server.port = bindPort;

  if (!server.public_url && server.oauth?.resource_url) {
    server.public_url = server.oauth.resource_url;
  }

  const pathFromPublic = server.public_url
    ? new URL(server.public_url).pathname
    : DEFAULT_HTTP_PATH;

  server.http = {
    ...server.http,
    path: server.http?.path ?? pathFromPublic,
  };

  if (server.oauth && !server.oauth.resource_url && server.public_url) {
    server.oauth.resource_url = server.public_url;
  }
}

function applyBasicServerOverrides(
  server: ServerConfig,
  overrides: Partial<ServerCliOverrides> & { corsAllowedOrigins?: string[] },
): void {
  if (overrides.transport !== undefined) {
    server.transport = overrides.transport;
  }
  if (overrides.logLevel !== undefined) {
    server.log_level = parseLogLevel(overrides.logLevel);
  }
  if (overrides.host !== undefined) {
    server.host = overrides.host;
    server.bind = { ...server.bind, host: overrides.host };
  }
  if (overrides.port !== undefined) {
    server.port = overrides.port;
    server.bind = { ...server.bind, port: overrides.port };
  }
  if (overrides.publicUrl !== undefined) {
    server.public_url = overrides.publicUrl;
    if (server.oauth) {
      server.oauth.resource_url = overrides.publicUrl;
    }
    server.http = {
      ...server.http,
      path: new URL(overrides.publicUrl).pathname,
    };
  }
  if (overrides.httpPath !== undefined) {
    server.http = { ...server.http, path: overrides.httpPath };
  }
  if (overrides.corsAllowedOrigins !== undefined) {
    server.http = {
      ...server.http,
      cors: { allowed_origins: overrides.corsAllowedOrigins },
    };
  }
}

function applyOAuthEnvOverrides(
  server: ServerConfig,
  overrides: {
    oauthEnabled?: boolean;
    oauthIssuer?: string;
    oauthResourceUrl?: string;
  },
): void {
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

  if (Object.keys(oauthPatch).length === 0) {
    return;
  }

  if (!server.oauth) {
    throw new Error('server.oauth is required when applying OAuth environment overrides');
  }

  server.oauth = { ...server.oauth, ...oauthPatch };
  if (oauthPatch.resource_url) {
    server.public_url = oauthPatch.resource_url;
    server.http = {
      ...server.http,
      path: new URL(oauthPatch.resource_url).pathname,
    };
  }
}

function applyServerOverrides(
  server: ServerConfig,
  overrides: Partial<ServerCliOverrides> & {
    oauthEnabled?: boolean;
    oauthIssuer?: string;
    oauthResourceUrl?: string;
    corsAllowedOrigins?: string[];
  },
): void {
  applyBasicServerOverrides(server, overrides);
  ensureHttpDefaults(server);
  applyOAuthEnvOverrides(server, overrides);
}

/**
 * Apply environment and optional CLI overrides to a loaded config.
 * Precedence: CLI > environment variables > existing YAML values > defaults.
 * Returns a new config object; the input is not mutated.
 */
export function applyRuntimeOverrides(config: AppConfig, cli?: ServerCliOverrides): AppConfig {
  const next = structuredClone(config);
  const envOverrides = readEnvOverrides();
  applyServerOverrides(next.server, envOverrides);

  if (cli) {
    applyServerOverrides(next.server, {
      transport: cli.transport,
      logLevel: cli.logLevel,
      host: cli.host,
      port: cli.port,
      httpPath: cli.httpPath,
      publicUrl: cli.publicUrl,
    });
  }

  validateHttpUrlConsistency(next.server);
  validateHttpServerConfig(next.server);
  return next;
}
