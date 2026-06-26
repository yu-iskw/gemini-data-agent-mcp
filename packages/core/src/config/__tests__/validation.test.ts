import { describe, expect, it } from 'vitest';

import { DEFAULT_TIMEOUT_SECONDS } from '../defaults.js';
import {
  agentHasTool,
  resolveAgentConfig,
  resolveApiVersion,
  resolveTimeout,
  shouldWarnOnV1Alpha,
} from '../validation.js';

import type { AgentConfig, AppConfig } from '../../types.js';

const agent: AgentConfig = {
  project: 'p',
  location: 'global',
  api_version: 'v1beta',
  data_agent: 'projects/p/locations/global/dataAgents/a',
  auth: { mode: 'adc' },
  tools: ['query_data_agent', 'chat_data_agent'],
};

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
  agents: { a: agent },
};

describe('resolveAgentConfig', () => {
  it('returns the configured agent', () => {
    expect(resolveAgentConfig(config, 'a')).toBe(agent);
  });

  it('throws for unknown agent names', () => {
    expect(() => resolveAgentConfig(config, 'missing')).toThrow(
      'Unknown agent "missing". Available agents: a',
    );
  });
});

describe('resolveApiVersion', () => {
  it('returns the agent api_version when no override is provided', () => {
    expect(resolveApiVersion(config, agent)).toBe('v1beta');
  });

  it('returns an allowed requested version', () => {
    expect(resolveApiVersion(config, agent, 'v1')).toBe('v1');
  });

  it('rejects disallowed requested versions', () => {
    expect(() => resolveApiVersion(config, agent, 'v9')).toThrow('API version "v9" is not allowed');
  });
});

describe('resolveTimeout', () => {
  it('returns the default timeout when omitted', () => {
    expect(resolveTimeout()).toBe(DEFAULT_TIMEOUT_SECONDS);
  });

  it('returns the requested timeout when provided', () => {
    expect(resolveTimeout(30)).toBe(30);
  });
});

describe('agentHasTool', () => {
  it('returns true when the tool is configured', () => {
    expect(agentHasTool(agent, 'query_data_agent')).toBe(true);
  });

  it('returns false when the tool is not configured', () => {
    expect(agentHasTool(agent, 'create_data_agent_conversation')).toBe(false);
  });
});

describe('shouldWarnOnV1Alpha', () => {
  it('reflects the configured warning flag', () => {
    expect(shouldWarnOnV1Alpha()).toBe(true);
  });
});
