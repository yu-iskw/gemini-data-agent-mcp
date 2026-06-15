/* eslint-disable security/detect-object-injection -- intentional dynamic keys for YAML document shaping */
import * as yaml from 'js-yaml';

import { validateConfig } from '../config/loader.js';
import { extractProjectAndLocation } from '../google-api/endpoints.js';

import type { AgentConfig, AppConfig } from '../types.js';

/** Parsed YAML must satisfy the v2 {@link AppConfig} schema (same as analyst server registry file). */
export function parseAndValidateAnalystRegistryYaml(yamlText: string): AppConfig {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlText);
  } catch (err) {
    throw new Error(`Failed to parse YAML: ${String(err)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('YAML root must be a non-null object');
  }

  return validateConfig(parsed);
}

export interface SerializeAnalystRegistryOptions {
  /** When true, omit sections that are empty objects after sanitization. */
  minimal?: boolean;
}

/**
 * Serializes a validated {@link AppConfig} as minimal v2 YAML for analyst consumption.
 */
export function serializeAnalystRegistryYaml(
  config: AppConfig,
  options: SerializeAnalystRegistryOptions = {},
): string {
  void options;
  const root = buildAnalystRegistryDocument(config);
  return yaml.dump(root, {
    sortKeys: true,
    lineWidth: 120,
    noRefs: true,
    flowLevel: -1,
    skipInvalid: true,
  });
}

function buildAnalystRegistryDocument(config: AppConfig): Record<string, unknown> {
  return {
    api_version: config.api_version,
    agents: sanitizeAgentsForAnalystExport(config),
  };
}

function sanitizeAgentsForAnalystExport(config: AppConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, agent] of Object.entries(config.agents)) {
    out[name] = serializeAgentForExport(config, agent);
  }
  return out;
}

function serializeAgentForExport(config: AppConfig, agent: AgentConfig): Record<string, unknown> {
  const derived = extractProjectAndLocation(agent.data_agent);
  const clientDiffers =
    derived !== null && (agent.project !== derived.project || agent.location !== derived.location);

  const entry: Record<string, unknown> = {
    data_agent: agent.data_agent,
    tools: agent.tools,
  };

  if (agent.api_version !== config.api_version) {
    entry.api_version = agent.api_version;
  }

  if (agent.auth.impersonate_service_account) {
    entry.impersonate_service_account = agent.auth.impersonate_service_account;
  }

  if (clientDiffers) {
    entry.client = { project: agent.project, location: agent.location };
  }

  if (agent.display_name) {
    entry.display_name = agent.display_name;
  }
  if (agent.description) {
    entry.description = agent.description;
  }
  if (agent.generation_options && Object.keys(agent.generation_options).length > 0) {
    entry.generation_options = agent.generation_options;
  }

  return entry;
}

/** Convert resolved config back to v2 YAML input shape (for dry-run merges). */
export function buildConfigInput(config: AppConfig): Record<string, unknown> {
  const agents: Record<string, unknown> = {};
  for (const [name, agent] of Object.entries(config.agents)) {
    agents[name] = serializeAgentForExport(config, agent);
  }

  return {
    api_version: config.api_version,
    ...(config.server.name !== 'gemini-data-agent' ||
    config.server.log_level !== 'INFO' ||
    config.server.transport !== 'stdio'
      ? { server: config.server }
      : {}),
    agents,
  };
}

/**
 * Line-oriented diff suitable for human review (not a minimal patch format).
 */
export function diffAnalystRegistryYaml(baseline: string, proposed: string): string {
  if (baseline === proposed) {
    return '(no differences)';
  }

  const a = baseline.split('\n');
  const b = proposed.split('\n');
  const maxLen = Math.max(a.length, b.length);
  const lines: string[] = ['--- baseline', '+++ proposed', '@@'];

  for (let i = 0; i < maxLen; i++) {
    const la = a[i];
    const lb = b[i];
    if (la === lb) {
      lines.push(` ${la ?? ''}`);
    } else {
      if (la !== undefined) lines.push(`-${la}`);
      if (lb !== undefined) lines.push(`+${lb}`);
    }
  }

  return lines.join('\n');
}
