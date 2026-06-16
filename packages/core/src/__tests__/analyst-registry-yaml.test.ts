import { describe, expect, it } from 'vitest';

import {
  diffAnalystRegistryYaml,
  parseAndValidateAnalystRegistryYaml,
  serializeAnalystRegistryYaml,
  validateConfig,
} from '../index.js';

describe('analyst registry YAML', () => {
  it('round-trips through serialize and parse/validate', () => {
    const config = validateConfig({
      api_version: 'v1beta',
      agents: {
        a1: {
          data_agent: 'projects/p1/locations/us-central1/dataAgents/a1',
          tools: ['query_data_agent', 'chat_data_agent'],
        },
      },
    });

    const yaml = serializeAnalystRegistryYaml(config);
    expect(yaml).not.toMatch(/BEGIN PRIVATE KEY|refresh_token|client_secret/i);
    const reparsed = parseAndValidateAnalystRegistryYaml(yaml);
    expect(reparsed.agents['a1']?.tools).toContain('query_data_agent');
  });

  it('omits admin server identity from generated analyst registry YAML', () => {
    const config = validateConfig({
      api_version: 'v1beta',
      server: {
        name: 'gemini-data-agent-admin-mcp',
        log_level: 'DEBUG',
        transport: 'stdio',
      },
      agents: {
        a1: {
          data_agent: 'projects/p1/locations/us-central1/dataAgents/a1',
          tools: ['query_data_agent'],
        },
      },
    });

    const yaml = serializeAnalystRegistryYaml(config);

    expect(yaml).not.toContain('gemini-data-agent-admin-mcp');
    expect(yaml).not.toMatch(/^server:/m);
    expect(yaml).toContain('api_version: v1beta');

    const reparsed = parseAndValidateAnalystRegistryYaml(yaml);
    expect(reparsed.server.name).toBe('gemini-data-agent');
  });

  it('diffAnalystRegistryYaml reports no differences for identical input', () => {
    const d = diffAnalystRegistryYaml('a:\n  b: 1', 'a:\n  b: 1');
    expect(d).toContain('no differences');
  });
});
