/* eslint-disable security/detect-object-injection -- intentional dynamic keys for YAML document shaping */
import * as yaml from 'js-yaml';

import { validateConfig } from '../config/loader.js';

import type { AgentConfig, AppConfig } from '../types.js';

/** Parsed YAML must satisfy full {@link AppConfig} schema (same as analyst server registry file). */
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
 * Serializes a validated {@link AppConfig} as YAML suitable for analyst consumption:
 * stable key ordering, analyst-safe capabilities (`raw_passthrough` forced false), no credential secrets beyond configured auth fields.
 */
export function serializeAnalystRegistryYaml(
  config: AppConfig,
  options: SerializeAnalystRegistryOptions = {},
): string {
  const { minimal = true } = options;
  const root = buildAnalystRegistryDocument(config, minimal);
  return yaml.dump(root, {
    sortKeys: true,
    lineWidth: 120,
    noRefs: true,
    flowLevel: -1,
    skipInvalid: true,
  });
}

function buildAnalystRegistryDocument(
  config: AppConfig,
  minimal: boolean,
): Record<string, unknown> {
  const agents = sanitizeAgentsForAnalystExport(config.agents);
  const doc: Record<string, unknown> = {
    agents,
  };

  if (!minimal || Object.keys(config.defaults).length > 0) {
    doc.defaults = stripEmptyDeep(config.defaults as Record<string, unknown>);
  }

  doc.version_policy = config.version_policy;
  doc.security = sanitizeSecurityForExport(config);
  doc.server = config.server;

  if (minimal) {
    return stripUndefinedDeep(doc) as Record<string, unknown>;
  }

  return doc;
}

function sanitizeAgentsForAnalystExport(
  agents: Record<string, AgentConfig>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, agent] of Object.entries(agents)) {
    out[name] = {
      ...(agent.display_name ? { display_name: agent.display_name } : {}),
      ...(agent.description ? { description: agent.description } : {}),
      project: agent.project,
      location: agent.location,
      api_version: agent.api_version,
      data_agent: agent.data_agent,
      auth: {
        mode: agent.auth.mode,
        ...(agent.auth.source ? { source: agent.auth.source } : {}),
        ...(agent.auth.impersonate_service_account
          ? { impersonate_service_account: agent.auth.impersonate_service_account }
          : {}),
        ...(agent.auth.scopes?.length ? { scopes: agent.auth.scopes } : {}),
      },
      capabilities: {
        query_data: agent.capabilities.query_data,
        chat: agent.capabilities.chat,
        raw_passthrough: false,
      },
      ...(agent.generation_options && Object.keys(agent.generation_options).length > 0
        ? { generation_options: agent.generation_options }
        : {}),
    };
  }
  return out;
}

function sanitizeSecurityForExport(config: AppConfig): Record<string, unknown> {
  return {
    redaction: config.security.redaction,
    audit: config.security.audit,
    persistence: config.security.persistence,
    raw_passthrough: {
      enabled: false,
      allowed_methods: config.security.raw_passthrough.allowed_methods,
      allowed_path_patterns: config.security.raw_passthrough.allowed_path_patterns,
    },
  };
}

function stripEmptyDeep(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (
      v !== undefined &&
      v !== null &&
      !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
    ) {
      result[k] = v;
    }
  }
  return result;
}

function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      const inner = stripUndefinedDeep(v);
      if (
        inner !== null &&
        typeof inner === 'object' &&
        !Array.isArray(inner) &&
        Object.keys(inner as Record<string, unknown>).length === 0
      ) {
        continue;
      }
      out[k] = inner;
    }
    return out;
  }
  return value;
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
