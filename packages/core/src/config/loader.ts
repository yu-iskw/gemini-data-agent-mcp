import { readFileSync, existsSync } from 'node:fs';

import * as yaml from 'js-yaml';

import { extractProjectAndLocation } from '../google-api/endpoints.js';
import { DataAgentMcpError } from '../types.js';

import { DEFAULT_SECURITY, DEFAULT_SERVER } from './defaults.js';
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PATH,
  DEFAULT_HTTP_PORT,
  DEFAULT_MAX_BODY_BYTES,
  validateHttpServerConfig,
} from './http-config-validation.js';
import { AppConfigInputSchema } from './schema.js';

import type { AgentConfig, AppConfig, AuthConfig } from '../types.js';
import type { AppConfigInput } from './schema.js';
import type { ZodError } from 'zod';

export function loadConfig(configPath: string): AppConfig {
  // Config path is user-provided CLI input and intentionally dynamic.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!existsSync(configPath)) {
    throw new DataAgentMcpError(
      'CONFIG_NOT_FOUND',
      `Configuration file not found: ${configPath}`,
      false,
      { path: configPath },
    );
  }

  let raw: string;
  try {
    // Config path is user-provided CLI input and intentionally dynamic.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    raw = readFileSync(configPath, 'utf-8');
  } catch (err) {
    throw new DataAgentMcpError(
      'CONFIG_READ_ERROR',
      `Failed to read configuration file: ${String(err)}`,
      false,
      { path: configPath },
    );
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new DataAgentMcpError(
      'CONFIG_PARSE_ERROR',
      `Failed to parse YAML configuration: ${String(err)}`,
      false,
      { path: configPath },
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new DataAgentMcpError(
      'CONFIG_INVALID',
      'Configuration file is empty or not a valid YAML object',
      false,
      { path: configPath },
    );
  }

  return validateConfig(parsed);
}

export function validateConfig(raw: unknown): AppConfig {
  const result = AppConfigInputSchema.safeParse(raw);

  if (!result.success) {
    const messages = formatZodErrors(result.error);
    throw new DataAgentMcpError(
      'CONFIG_VALIDATION_ERROR',
      `Configuration validation failed:\n${messages}`,
      false,
      { errors: result.error.errors },
    );
  }

  const config = normalizeConfig(result.data);
  runSemanticValidation(config);
  return config;
}

export { validateHttpServerConfig } from './http-config-validation.js';

function buildOAuthConfig(
  oauthInput: NonNullable<AppConfigInput['server']>['oauth'],
  publicUrl: string,
): AppConfig['server']['oauth'] {
  return {
    enabled: oauthInput?.enabled ?? true,
    resource_url: oauthInput?.resource_url ?? publicUrl,
    issuer: oauthInput!.issuer,
    scopes_supported: oauthInput?.scopes_supported ?? ['mcp:tools'],
  };
}

function applyHttpTransportConfig(
  server: AppConfig['server'],
  serverInput: AppConfigInput['server'],
): void {
  const bindHost = serverInput?.bind?.host ?? serverInput?.host ?? DEFAULT_HTTP_HOST;
  const bindPort = serverInput?.bind?.port ?? serverInput?.port ?? DEFAULT_HTTP_PORT;
  const publicUrl = serverInput?.public_url ?? serverInput?.oauth?.resource_url;

  if (!publicUrl) {
    throw new DataAgentMcpError(
      'CONFIG_INVALID',
      'server.public_url is required when server.transport is http',
      false,
    );
  }

  const publicPath = new URL(publicUrl).pathname;
  const httpPath = (serverInput?.http?.path ?? publicPath) || DEFAULT_HTTP_PATH;

  if (serverInput?.http?.path && serverInput.http.path !== publicPath) {
    throw new DataAgentMcpError(
      'CONFIG_INVALID',
      `server.http.path (${serverInput.http.path}) must match server.public_url pathname (${publicPath})`,
      false,
    );
  }

  server.bind = { host: bindHost, port: bindPort };
  server.host = bindHost;
  server.port = bindPort;
  server.public_url = publicUrl;
  server.http = {
    path: httpPath,
    ...(serverInput?.http?.cors ? { cors: serverInput.http.cors } : {}),
    ...(serverInput?.http?.sessions ? { sessions: serverInput.http.sessions } : {}),
    max_body_bytes: serverInput?.http?.max_body_bytes ?? DEFAULT_MAX_BODY_BYTES,
  };

  if (serverInput?.oauth) {
    server.oauth = buildOAuthConfig(serverInput.oauth, publicUrl);
  }
}

function applyStdioOauthConfig(
  server: AppConfig['server'],
  serverInput: AppConfigInput['server'],
): void {
  if (!serverInput?.oauth) {
    return;
  }

  const publicUrl = serverInput.public_url ?? serverInput.oauth.resource_url;
  if (!publicUrl) {
    return;
  }

  server.oauth = buildOAuthConfig(serverInput.oauth, publicUrl);
  if (!server.public_url) {
    server.public_url = publicUrl;
  }
}

function normalizeServerConfig(input: AppConfigInput): AppConfig['server'] {
  const serverInput = input.server;
  const transport = serverInput?.transport ?? DEFAULT_SERVER.transport;

  const server: AppConfig['server'] = {
    ...DEFAULT_SERVER,
    name: serverInput?.name ?? DEFAULT_SERVER.name,
    log_level: serverInput?.log_level ?? DEFAULT_SERVER.log_level,
    transport,
    ...(serverInput?.host !== undefined ? { host: serverInput.host } : {}),
    ...(serverInput?.port !== undefined ? { port: serverInput.port } : {}),
    ...(serverInput?.public_url !== undefined ? { public_url: serverInput.public_url } : {}),
    ...(serverInput?.bind !== undefined ? { bind: serverInput.bind } : {}),
  };

  if (transport === 'http') {
    applyHttpTransportConfig(server, serverInput);
  } else {
    applyStdioOauthConfig(server, serverInput);
  }

  return server;
}

function normalizeConfig(input: AppConfigInput): AppConfig {
  const agents = Object.fromEntries(
    Object.entries(input.agents).map(([name, agentInput]) => [
      name,
      normalizeAgent(name, agentInput, input.api_version),
    ]),
  ) as Record<string, AgentConfig>;

  const server = normalizeServerConfig(input);
  validateHttpServerConfig(server);

  return {
    api_version: input.api_version,
    server,
    security: structuredClone(DEFAULT_SECURITY),
    agents,
  };
}

function normalizeAgent(
  name: string,
  agentInput: AppConfigInput['agents'][string],
  rootApiVersion: AppConfig['api_version'],
): AgentConfig {
  // Zod regex on data_agent guarantees extractProjectAndLocation succeeds.
  const derived = extractProjectAndLocation(agentInput.data_agent)!;

  const project = agentInput.client?.project ?? derived.project;
  const location = agentInput.client?.location ?? derived.location;
  const apiVersion = agentInput.api_version ?? rootApiVersion;

  let auth: AuthConfig;
  if (agentInput.impersonate_service_account) {
    auth = {
      mode: 'impersonation',
      source: 'adc',
      impersonate_service_account: agentInput.impersonate_service_account,
    };
  } else {
    auth = { mode: 'adc' };
  }

  return {
    ...(agentInput.display_name ? { display_name: agentInput.display_name } : {}),
    ...(agentInput.description ? { description: agentInput.description } : {}),
    project,
    location,
    api_version: apiVersion,
    data_agent: agentInput.data_agent,
    auth,
    tools: agentInput.tools,
    ...(agentInput.generation_options ? { generation_options: agentInput.generation_options } : {}),
  };
}

function runSemanticValidation(config: AppConfig): void {
  if (!config.agents || Object.keys(config.agents).length === 0) {
    throw new DataAgentMcpError(
      'CONFIG_NO_AGENTS',
      'Configuration must define at least one agent',
      false,
    );
  }
}

function formatZodErrors(error: ZodError): string {
  return error.errors
    .map((e) => {
      const path = e.path.length > 0 ? e.path.join('.') : 'root';
      return `  [${path}]: ${e.message}`;
    })
    .join('\n');
}
