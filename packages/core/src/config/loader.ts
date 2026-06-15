import { readFileSync, existsSync } from 'node:fs';

import * as yaml from 'js-yaml';

import { extractProjectAndLocation } from '../google-api/endpoints.js';
import { DataAgentMcpError } from '../types.js';

import { DEFAULT_SECURITY, DEFAULT_SERVER } from './defaults.js';
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

function normalizeConfig(input: AppConfigInput): AppConfig {
  const agents = Object.fromEntries(
    Object.entries(input.agents).map(([name, agentInput]) => [
      name,
      normalizeAgent(name, agentInput, input.api_version),
    ]),
  ) as Record<string, AgentConfig>;

  return {
    api_version: input.api_version,
    server: { ...DEFAULT_SERVER, ...input.server },
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
