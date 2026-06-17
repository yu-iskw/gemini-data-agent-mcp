import { DataAgentMcpError } from '../types.js';

import type { ServerConfig } from '../types.js';

export const DEFAULT_HTTP_PORT = 8080;
export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_HTTP_PATH = '/mcp';
export const DEFAULT_MAX_SESSIONS = 1_000;
export const DEFAULT_IDLE_TTL_MS = 15 * 60_000;
export const DEFAULT_MAX_SESSIONS_PER_PRINCIPAL = 50;
export const DEFAULT_MAX_BODY_BYTES = 1_048_576;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

export function resolveBindHost(server: ServerConfig): string {
  return server.bind?.host ?? server.host ?? DEFAULT_HTTP_HOST;
}

export function resolveBindPort(server: ServerConfig): number {
  return server.bind?.port ?? server.port ?? DEFAULT_HTTP_PORT;
}

export function resolveHttpPath(server: ServerConfig): string {
  return server.http?.path ?? DEFAULT_HTTP_PATH;
}

export function validateHttpUrlConsistency(server: ServerConfig): void {
  if (server.transport !== 'http' || !server.public_url) {
    return;
  }

  const publicPath = new URL(server.public_url).pathname;
  const routePath = server.http?.path;
  if (routePath && routePath !== publicPath) {
    throw new DataAgentMcpError(
      'CONFIG_INVALID',
      `server.http.path (${routePath}) must match server.public_url pathname (${publicPath})`,
      false,
    );
  }

  const resourceUrl = server.oauth?.resource_url;
  if (resourceUrl) {
    const resourcePath = new URL(resourceUrl).pathname;
    if (resourcePath !== publicPath) {
      throw new DataAgentMcpError(
        'CONFIG_INVALID',
        `server.oauth.resource_url pathname (${resourcePath}) must match server.public_url pathname (${publicPath})`,
        false,
      );
    }
  }
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

  if (!server.public_url) {
    throw new DataAgentMcpError(
      'CONFIG_INVALID',
      'server.public_url is required when server.transport is http',
      false,
    );
  }

  validateHttpUrlConsistency(server);

  if (process.env.NODE_ENV === 'production') {
    const scheme = new URL(server.public_url).protocol;
    if (scheme !== 'https:') {
      throw new DataAgentMcpError(
        'CONFIG_INVALID',
        'server.public_url must use https when NODE_ENV=production',
        false,
      );
    }
  }

  if (server.oauth.enabled === false) {
    const bindHost = resolveBindHost(server);
    const allowInsecure = process.env.MCP_ALLOW_INSECURE_HTTP === 'true';
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      throw new DataAgentMcpError(
        'CONFIG_INSECURE_HTTP',
        'server.oauth.enabled: false is not allowed when NODE_ENV=production',
        false,
      );
    }

    if (!allowInsecure) {
      throw new DataAgentMcpError(
        'CONFIG_INSECURE_HTTP',
        'server.oauth.enabled: false requires MCP_ALLOW_INSECURE_HTTP=true for local CI smoke tests only',
        false,
      );
    }

    if (!isLoopbackHost(bindHost)) {
      throw new DataAgentMcpError(
        'CONFIG_INSECURE_HTTP',
        `server.oauth.enabled: false requires a loopback bind host (got ${bindHost})`,
        false,
      );
    }
  }
}
