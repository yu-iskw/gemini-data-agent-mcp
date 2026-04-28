import path from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect } from 'vitest';

import { loadConfig, validateConfig } from '../config/loader.js';
import { DataAgentMcpError } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

describe('loadConfig', () => {
  it('loads a valid YAML config file', () => {
    const config = loadConfig(path.join(fixturesDir, 'config-valid.yaml'));
    expect(config.server.name).toBe('gemini-data-agent-mcp');
    expect(Object.keys(config.agents)).toHaveLength(2);
    expect(config.agents['sales-prod']).toBeDefined();
    expect(config.agents['finance-staging']).toBeDefined();
  });

  it('loads a minimal YAML config and applies defaults', () => {
    const config = loadConfig(path.join(fixturesDir, 'config-minimal.yaml'));
    expect(config.server.log_level).toBe('INFO');
    expect(config.version_policy.default).toBe('v1beta');
    expect(config.security.raw_passthrough.enabled).toBe(false);
    expect(config.agents['my-agent'].capabilities.query_data).toBe(true);
  });

  it('throws CONFIG_NOT_FOUND for missing file', () => {
    expect(() => loadConfig('/nonexistent/path/config.yaml')).toThrow(DataAgentMcpError);
    try {
      loadConfig('/nonexistent/path/config.yaml');
    } catch (err) {
      expect(err).toBeInstanceOf(DataAgentMcpError);
      expect((err as DataAgentMcpError).code).toBe('CONFIG_NOT_FOUND');
    }
  });

  it('throws CONFIG_NO_AGENTS for empty agents map', () => {
    expect(() => loadConfig(path.join(fixturesDir, 'config-invalid-no-agents.yaml'))).toThrow(
      DataAgentMcpError,
    );
    try {
      loadConfig(path.join(fixturesDir, 'config-invalid-no-agents.yaml'));
    } catch (err) {
      expect(err).toBeInstanceOf(DataAgentMcpError);
      expect((err as DataAgentMcpError).code).toBe('CONFIG_NO_AGENTS');
    }
  });

  it('throws CONFIG_VALIDATION_ERROR for impersonation without impersonate_service_account', () => {
    expect(() => loadConfig(path.join(fixturesDir, 'config-invalid-impersonation.yaml'))).toThrow(
      DataAgentMcpError,
    );
    try {
      loadConfig(path.join(fixturesDir, 'config-invalid-impersonation.yaml'));
    } catch (err) {
      expect(err).toBeInstanceOf(DataAgentMcpError);
      expect((err as DataAgentMcpError).code).toBe('CONFIG_VALIDATION_ERROR');
    }
  });

  it('loads config with raw passthrough enabled and patterns', () => {
    const config = loadConfig(path.join(fixturesDir, 'config-with-raw-passthrough.yaml'));
    expect(config.security.raw_passthrough.enabled).toBe(true);
    expect(config.security.raw_passthrough.allowed_path_patterns).toHaveLength(1);
    expect(config.agents['dev-agent'].capabilities.raw_passthrough).toBe(true);
  });
});

describe('validateConfig', () => {
  it('applies defaults for optional fields', () => {
    const config = validateConfig({
      agents: {
        test: {
          project: 'my-project',
          location: 'us-central1',
          api_version: 'v1beta',
          data_agent: 'projects/my-project/locations/us-central1/dataAgents/test',
          auth: { mode: 'adc' },
        },
      },
    });
    expect(config.server.name).toBe('gemini-data-agent');
    expect(config.server.log_level).toBe('INFO');
    expect(config.version_policy.default).toBe('v1beta');
    expect(config.security.redaction.enabled).toBe(true);
    expect(config.agents['test'].capabilities.query_data).toBe(true);
  });

  it('resolves agent api_version against allowed_versions', () => {
    expect(() =>
      validateConfig({
        version_policy: {
          allowed_versions: ['v1', 'v1beta'],
        },
        agents: {
          test: {
            project: 'p',
            location: 'l',
            api_version: 'v1alpha',
            data_agent: 'd',
            auth: { mode: 'adc' },
          },
        },
      }),
    ).toThrow(DataAgentMcpError);
  });

  it('throws for raw_passthrough enabled without patterns', () => {
    expect(() =>
      validateConfig({
        security: {
          raw_passthrough: {
            enabled: true,
            allowed_methods: ['GET'],
            allowed_path_patterns: [],
          },
        },
        agents: {
          test: {
            project: 'p',
            location: 'l',
            api_version: 'v1beta',
            data_agent: 'd',
            auth: { mode: 'adc' },
          },
        },
      }),
    ).toThrow(DataAgentMcpError);
  });
});
