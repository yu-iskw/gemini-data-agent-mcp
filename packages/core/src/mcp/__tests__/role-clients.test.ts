import { describe, expect, it } from 'vitest';

import { DataAgentMcpError } from '../../types.js';
import { resolveDefaultAgentName } from '../role-clients.js';

import type { AppConfig } from '../../types.js';

const config: AppConfig = {
  api_version: 'v1beta',
  server: { name: 'test', log_level: 'INFO', transport: 'stdio' },
  security: {
    redaction: {
      enabled: true,
      show_service_account: 'hidden',
      redact_headers: true,
      redact_tokens: true,
      redact_raw_request_body: false,
      redact_raw_response_body: false,
    },
    audit: { enabled: false, include_prompt: false, include_response: false },
    persistence: { enabled: false },
    raw_passthrough: { enabled: false, allowed_methods: [], allowed_path_patterns: [] },
  },
  agents: {
    a: {
      project: 'p',
      location: 'global',
      api_version: 'v1beta',
      data_agent: 'projects/p/locations/global/dataAgents/a',
      auth: { mode: 'adc' },
      tools: ['query_data_agent'],
    },
  },
};

describe('resolveDefaultAgentName', () => {
  it('returns first agent when preferred is omitted', () => {
    expect(resolveDefaultAgentName(config)).toBe('a');
  });

  it('returns configured agent when name exists', () => {
    expect(resolveDefaultAgentName(config, 'a')).toBe('a');
  });

  it('throws AGENT_NOT_FOUND for unknown agent names', () => {
    expect(() => resolveDefaultAgentName(config, 'missing')).toThrow(DataAgentMcpError);
    try {
      resolveDefaultAgentName(config, 'missing');
    } catch (err) {
      expect(err).toBeInstanceOf(DataAgentMcpError);
      expect((err as DataAgentMcpError).code).toBe('AGENT_NOT_FOUND');
    }
  });
});
