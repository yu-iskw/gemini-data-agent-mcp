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
      agents: {
        a1: {
          project: 'p1',
          location: 'us-central1',
          api_version: 'v1beta',
          data_agent: 'a1',
          auth: { mode: 'adc' },
          capabilities: { query_data: true, chat: true, raw_passthrough: true },
        },
      },
    });

    const yaml = serializeAnalystRegistryYaml(config);
    expect(yaml).not.toMatch(/BEGIN PRIVATE KEY|refresh_token|client_secret/i);
    const reparsed = parseAndValidateAnalystRegistryYaml(yaml);
    expect(reparsed.agents['a1']?.capabilities.raw_passthrough).toBe(false);
  });

  it('omits admin server identity from generated analyst registry YAML', () => {
    const config = validateConfig({
      server: {
        name: 'gemini-data-agent-admin-mcp',
        log_level: 'DEBUG',
        transport: 'stdio',
      },
      agents: {
        a1: {
          project: 'p1',
          location: 'us-central1',
          api_version: 'v1beta',
          data_agent: 'a1',
          auth: { mode: 'adc' },
        },
      },
    });

    const yaml = serializeAnalystRegistryYaml(config);

    expect(yaml).not.toContain('gemini-data-agent-admin-mcp');
    expect(yaml).not.toMatch(/^server:/m);

    const reparsed = parseAndValidateAnalystRegistryYaml(yaml);
    expect(reparsed.server.name).toBe('gemini-data-agent');
  });

  it('diffAnalystRegistryYaml reports no differences for identical input', () => {
    const d = diffAnalystRegistryYaml('a:\n  b: 1', 'a:\n  b: 1');
    expect(d).toContain('no differences');
  });
});
