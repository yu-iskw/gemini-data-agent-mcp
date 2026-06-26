import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGoogleRestTransport } from '../transport.js';

import type { ResolvedCredentials } from '../../auth/index.js';
import type { DataAgentMcpError } from '../../types.js';

const credentials: ResolvedCredentials = {
  getRequestHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
};

describe('createGoogleRestTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ dataAgents: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const transport = createGoogleRestTransport({
      credentials,
      defaultAgent: 'agent-a',
      defaultVersion: 'v1beta',
    });

    const result = await transport.request<{ dataAgents: unknown[] }>({
      method: 'GET',
      path: 'v1beta/projects/p1/locations/global/dataAgents',
      query: { pageSize: 10 },
    });

    expect(result).toEqual({ dataAgents: [] });
    expect(fetch).toHaveBeenCalledWith(
      'https://geminidataanalytics.googleapis.com/v1beta/projects/p1/locations/global/dataAgents?pageSize=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('serializes POST bodies and sets content-type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ bindings: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const transport = createGoogleRestTransport({ credentials, defaultAgent: 'agent-a' });
    await transport.request({
      method: 'POST',
      path: 'v1beta/projects/p1/locations/global/dataAgents/a1:getIamPolicy',
      body: { options: { requestedPolicyVersion: 1 } },
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ options: { requestedPolicyVersion: 1 } }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('throws parseGoogleApiError output for non-OK HTTP responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: 'denied', status: 'PERMISSION_DENIED' } }),
          {
            status: 403,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );

    const transport = createGoogleRestTransport({ credentials, defaultAgent: 'agent-a' });

    await expect(
      transport.request({ method: 'GET', path: 'v1beta/projects/p1/locations/global/dataAgents' }),
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      message: 'denied',
    } satisfies Partial<DataAgentMcpError>);
  });

  it('maps AbortError to TIMEOUT', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const transport = createGoogleRestTransport({
      credentials,
      defaultAgent: 'agent-a',
      defaultTimeoutMs: 50,
    });

    await expect(
      transport.request({ method: 'GET', path: 'v1beta/projects/p1/locations/global/dataAgents' }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    } satisfies Partial<DataAgentMcpError>);
  });

  it('maps generic network failures to NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    const transport = createGoogleRestTransport({ credentials, defaultAgent: 'agent-a' });

    await expect(
      transport.request({ method: 'GET', path: 'v1beta/projects/p1/locations/global/dataAgents' }),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
    } satisfies Partial<DataAgentMcpError>);
  });

  it('wraps invalid JSON bodies as raw text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
        text: async () => 'not-json',
      }),
    );

    const transport = createGoogleRestTransport({ credentials, defaultAgent: 'agent-a' });
    const result = await transport.request<{ raw: string }>({
      method: 'GET',
      path: 'v1beta/projects/p1/locations/global/dataAgents',
    });

    expect(result).toEqual({ raw: 'not-json' });
  });

  it('returns plain text responses under raw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('plain response', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );

    const transport = createGoogleRestTransport({ credentials, defaultAgent: 'agent-a' });
    const result = await transport.request<{ raw: string }>({
      method: 'GET',
      path: 'v1beta/projects/p1/locations/global/dataAgents',
    });

    expect(result).toEqual({ raw: 'plain response' });
  });
});
