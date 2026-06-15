import { describe, it, expect } from 'vitest';

import { validateConfig } from '../config/loader.js';
import {
  enforceRawPassthroughPolicy,
  enforceHostRestriction,
  isPathAllowed,
} from '../security/allowlist.js';
import { DataAgentMcpError } from '../types.js';

function makeConfig(rawPassthroughEnabled: boolean, agentRawPassthrough: boolean) {
  return validateConfig({
    security: rawPassthroughEnabled
      ? {
          raw_passthrough: {
            enabled: true,
            allowed_methods: ['GET', 'POST'],
            allowed_path_patterns: ['^v1beta/'],
          },
        }
      : undefined,
    agents: {
      'test-agent': {
        project: 'p',
        location: 'l',
        api_version: 'v1beta',
        data_agent: 'd',
        auth: { mode: 'adc' },
        capabilities: {
          query_data: true,
          chat: false,
          raw_passthrough: agentRawPassthrough,
        },
      },
    },
  });
}

describe('enforceRawPassthroughPolicy', () => {
  it('throws when raw passthrough is disabled globally', () => {
    const config = makeConfig(false, false);
    const agent = config.agents['test-agent']!;
    expect(() =>
      enforceRawPassthroughPolicy(config, agent, 'test-agent', 'GET', '/v1beta/foo'),
    ).toThrow(DataAgentMcpError);
    try {
      enforceRawPassthroughPolicy(config, agent, 'test-agent', 'GET', '/v1beta/foo');
    } catch (err) {
      expect((err as DataAgentMcpError).code).toBe('RAW_PASSTHROUGH_DISABLED');
    }
  });

  it('throws when agent capability is disabled', () => {
    const config = makeConfig(true, false);
    const agent = config.agents['test-agent']!;
    expect(() =>
      enforceRawPassthroughPolicy(config, agent, 'test-agent', 'GET', 'v1beta/foo'),
    ).toThrow(DataAgentMcpError);
    try {
      enforceRawPassthroughPolicy(config, agent, 'test-agent', 'GET', 'v1beta/foo');
    } catch (err) {
      expect((err as DataAgentMcpError).code).toBe('RAW_PASSTHROUGH_DISABLED');
    }
  });

  it('throws for disallowed method', () => {
    const config = makeConfig(true, true);
    const agent = config.agents['test-agent']!;
    expect(() =>
      enforceRawPassthroughPolicy(config, agent, 'test-agent', 'DELETE', 'v1beta/foo'),
    ).toThrow(DataAgentMcpError);
    try {
      enforceRawPassthroughPolicy(config, agent, 'test-agent', 'DELETE', 'v1beta/foo');
    } catch (err) {
      expect((err as DataAgentMcpError).code).toBe('RAW_PASSTHROUGH_METHOD_DENIED');
    }
  });

  it('throws for path not matching allowlist', () => {
    const config = makeConfig(true, true);
    const agent = config.agents['test-agent']!;
    expect(() =>
      enforceRawPassthroughPolicy(config, agent, 'test-agent', 'GET', 'v1alpha/secret/path'),
    ).toThrow(DataAgentMcpError);
    try {
      enforceRawPassthroughPolicy(config, agent, 'test-agent', 'GET', 'v1alpha/secret/path');
    } catch (err) {
      expect((err as DataAgentMcpError).code).toBe('RAW_PASSTHROUGH_PATH_DENIED');
    }
  });

  it('passes for allowed method and path', () => {
    const config = makeConfig(true, true);
    const agent = config.agents['test-agent']!;
    expect(() =>
      enforceRawPassthroughPolicy(config, agent, 'test-agent', 'GET', 'v1beta/projects/foo'),
    ).not.toThrow();
  });
});

describe('enforceHostRestriction', () => {
  it('allows geminidataanalytics.googleapis.com', () => {
    expect(() =>
      enforceHostRestriction('https://geminidataanalytics.googleapis.com/v1beta/foo'),
    ).not.toThrow();
  });

  it('throws for other hosts', () => {
    expect(() => enforceHostRestriction('https://evil.com/v1beta/foo')).toThrow(DataAgentMcpError);
  });
});

describe('isPathAllowed', () => {
  const patterns = [
    '^v1beta/projects/[^/]+/locations/[^/]+:queryData$',
    '^v1beta/projects/[^/]+/locations/[^/]+:chat$',
  ];

  it('allows matching paths', () => {
    expect(isPathAllowed('v1beta/projects/my-proj/locations/us-central1:queryData', patterns)).toBe(
      true,
    );
    expect(isPathAllowed('v1beta/projects/my-proj/locations/us-central1:chat', patterns)).toBe(
      true,
    );
  });

  it('rejects non-matching paths', () => {
    expect(isPathAllowed('v1alpha/secret', patterns)).toBe(false);
    expect(isPathAllowed('v1beta/admin', patterns)).toBe(false);
  });
});
