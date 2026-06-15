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
    expect(config.api_version).toBe('v1beta');
    expect(config.security.raw_passthrough.enabled).toBe(false);
    expect(config.agents['my-agent'].tools).toContain('query_data_agent');
    expect(config.agents['my-agent'].auth.mode).toBe('adc');
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

  it('throws CONFIG_VALIDATION_ERROR for bare data_agent id', () => {
    expect(() => loadConfig(path.join(fixturesDir, 'config-invalid-data-agent.yaml'))).toThrow(
      DataAgentMcpError,
    );
    try {
      loadConfig(path.join(fixturesDir, 'config-invalid-data-agent.yaml'));
    } catch (err) {
      expect(err).toBeInstanceOf(DataAgentMcpError);
      expect((err as DataAgentMcpError).code).toBe('CONFIG_VALIDATION_ERROR');
    }
  });
});

describe('validateConfig', () => {
  it('applies defaults for optional fields', () => {
    const config = validateConfig({
      api_version: 'v1beta',
      agents: {
        test: {
          data_agent: 'projects/my-project/locations/us-central1/dataAgents/test',
          tools: ['query_data_agent'],
        },
      },
    });
    expect(config.server.name).toBe('gemini-data-agent');
    expect(config.server.log_level).toBe('INFO');
    expect(config.api_version).toBe('v1beta');
    expect(config.security.redaction.enabled).toBe(true);
    expect(config.agents['test'].tools).toContain('query_data_agent');
    expect(config.agents['test'].project).toBe('my-project');
    expect(config.agents['test'].location).toBe('us-central1');
  });

  it('builds impersonation auth when impersonate_service_account is set', () => {
    const config = validateConfig({
      api_version: 'v1beta',
      agents: {
        test: {
          data_agent: 'projects/p/locations/l/dataAgents/d',
          tools: ['query_data_agent'],
          impersonate_service_account: 'sa@p.iam.gserviceaccount.com',
        },
      },
    });
    expect(config.agents['test'].auth.mode).toBe('impersonation');
    expect(config.agents['test'].auth.impersonate_service_account).toBe(
      'sa@p.iam.gserviceaccount.com',
    );
  });

  it('applies client override when provided', () => {
    const config = validateConfig({
      api_version: 'v1beta',
      agents: {
        test: {
          data_agent: 'projects/data-proj/locations/us-central1/dataAgents/agent',
          client: { project: 'api-proj', location: 'europe-west1' },
          tools: ['query_data_agent'],
        },
      },
    });
    expect(config.agents['test'].project).toBe('api-proj');
    expect(config.agents['test'].location).toBe('europe-west1');
  });

  it('throws for unknown tool name', () => {
    expect(() =>
      validateConfig({
        api_version: 'v1beta',
        agents: {
          test: {
            data_agent: 'projects/p/locations/l/dataAgents/d',
            tools: ['unknown_tool'],
          },
        },
      }),
    ).toThrow(DataAgentMcpError);
  });
});
