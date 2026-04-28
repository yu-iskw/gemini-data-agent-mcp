import { describe, it, expect, vi, beforeEach } from 'vitest';

import { validateConfig } from '../config/loader.js';

import type * as GoogleAuthLibrary from 'google-auth-library';

const mockHeaders = { Authorization: 'Bearer mock-token' };
const mockClient = {
  getRequestHeaders: vi.fn().mockResolvedValue(mockHeaders),
};

vi.mock('google-auth-library', async (importOriginal) => {
  const actual = await importOriginal<typeof GoogleAuthLibrary>();
  return {
    ...actual,
    GoogleAuth: vi.fn().mockImplementation(function () {
      return {
        getClient: vi.fn().mockResolvedValue(mockClient),
      };
    }),
    Impersonated: vi.fn().mockImplementation(function () {
      return {
        getRequestHeaders: vi.fn().mockResolvedValue(mockHeaders),
      };
    }),
  };
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const baseConfig = {
  agents: {
    'test-agent': {
      project: 'my-project',
      location: 'us-central1',
      api_version: 'v1beta',
      data_agent: 'projects/my-project/locations/us-central1/dataAgents/test-agent',
      auth: { mode: 'adc' },
      capabilities: {
        query_data: true,
        a2a_send: true,
        a2a_stream: false,
        chat: false,
        raw_passthrough: false,
      },
    },
    'no-query-agent': {
      project: 'my-project',
      location: 'us-central1',
      api_version: 'v1beta',
      data_agent: 'projects/my-project/locations/us-central1/dataAgents/no-query',
      auth: { mode: 'adc' },
      capabilities: {
        query_data: false,
        a2a_send: false,
        a2a_stream: false,
        chat: false,
        raw_passthrough: false,
      },
    },
  },
};

describe('query_data_agent tool behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('config validates correctly for test agents', () => {
    const config = validateConfig(baseConfig);
    expect(config.agents['test-agent']).toBeDefined();
    expect(config.agents['test-agent']?.capabilities.query_data).toBe(true);
  });

  it('returns response with natural language answer on success', async () => {
    const config = validateConfig(baseConfig);

    const mockResponse = {
      naturalLanguageAnswer: 'Revenue declined due to seasonal factors.',
      generatedQuery: 'SELECT * FROM revenue WHERE date > ...',
      intentExplanation: 'This query analyzes revenue trends.',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => mockResponse,
    });

    const { resolveCredentials } = await import('../auth/resolver.js');
    const { createClient } = await import('../google-api/client.js');

    const creds = await resolveCredentials(config.agents['test-agent']!.auth);
    const client = createClient(creds);

    const result = await client.queryData({
      project: 'my-project',
      location: 'us-central1',
      version: 'v1beta',
      query: 'Why did revenue decline?',
    });

    expect(result['naturalLanguageAnswer']).toBe('Revenue declined due to seasonal factors.');
    expect(result['generatedQuery']).toBeDefined();
  });

  it('expands bare data_agent ID to full resource name in queryData request', async () => {
    const config = validateConfig({
      agents: {
        'test-agent': {
          project: 'my-project',
          location: 'us-central1',
          api_version: 'v1beta',
          data_agent: 'test-agent',
          auth: { mode: 'adc' },
          capabilities: {
            query_data: true,
            a2a_send: true,
            a2a_stream: false,
            chat: false,
            raw_passthrough: false,
          },
        },
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ naturalLanguageAnswer: 'ok' }),
    });

    const { resolveCredentials } = await import('../auth/resolver.js');
    const { createClient } = await import('../google-api/client.js');

    const creds = await resolveCredentials(config.agents['test-agent']!.auth);
    const client = createClient(creds);

    await client.queryData({
      project: 'my-project',
      location: 'us-central1',
      version: 'v1beta',
      query: 'Why did revenue decline?',
      dataAgent: config.agents['test-agent']!.data_agent,
    });

    const fetchCall = mockFetch.mock.calls.at(-1);
    const body = JSON.parse(String(fetchCall?.[1]?.body));
    expect(body['dataAgent']).toBe(
      'projects/my-project/locations/us-central1/dataAgents/test-agent',
    );
  });

  it('throws on API 403 error', async () => {
    const config = validateConfig(baseConfig);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => 'application/json' },
      json: async () => ({
        error: { code: 403, message: 'Permission denied', status: 'PERMISSION_DENIED' },
      }),
    });

    const { resolveCredentials } = await import('../auth/resolver.js');
    const { createClient } = await import('../google-api/client.js');
    const { DataAgentMcpError } = await import('../types.js');

    const creds = await resolveCredentials(config.agents['test-agent']!.auth);
    const client = createClient(creds);

    await expect(
      client.queryData({
        project: 'my-project',
        location: 'us-central1',
        version: 'v1beta',
        query: 'Test query',
      }),
    ).rejects.toThrow(DataAgentMcpError);
  });

  it('query_data capability guard rejects disabled agents', () => {
    const config = validateConfig(baseConfig);
    const noQueryAgent = config.agents['no-query-agent']!;
    expect(noQueryAgent.capabilities.query_data).toBe(false);
  });
});
