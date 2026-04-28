import { readFileSync, existsSync } from 'fs';

import * as yaml from 'js-yaml';

import { DataAgentMcpError } from '../types.js';

import { AppConfigSchema } from './schema.js';

import type { AppConfig } from '../types.js';
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
  const result = AppConfigSchema.safeParse(raw);

  if (!result.success) {
    const messages = formatZodErrors(result.error);
    throw new DataAgentMcpError(
      'CONFIG_VALIDATION_ERROR',
      `Configuration validation failed:\n${messages}`,
      false,
      { errors: result.error.errors },
    );
  }

  const config = result.data as AppConfig;
  runSemanticValidation(config);
  return config;
}

function runSemanticValidation(config: AppConfig): void {
  if (!config.agents || Object.keys(config.agents).length === 0) {
    throw new DataAgentMcpError(
      'CONFIG_NO_AGENTS',
      'Configuration must define at least one agent',
      false,
    );
  }

  const { allowed_versions } = config.version_policy;

  for (const [name, agent] of Object.entries(config.agents)) {
    if (!allowed_versions.includes(agent.api_version)) {
      throw new DataAgentMcpError(
        'CONFIG_INVALID_API_VERSION',
        `Agent "${name}" uses api_version "${agent.api_version}" which is not in allowed_versions: ${allowed_versions.join(', ')}`,
        false,
        { agent: name },
      );
    }
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
