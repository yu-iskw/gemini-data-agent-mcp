import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildOAuthMetadata,
  derivePrincipalId,
  resetOidcDiscoveryCacheForTests,
} from '../oauth.js';

const testIssuer = 'https://auth.example.com/realms/test';

function stubOidcDiscovery(body: Record<string, unknown>): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/.well-known/openid-configuration')) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return realFetch(input, init);
    }),
  );
}

afterEach(() => {
  resetOidcDiscoveryCacheForTests();
  vi.unstubAllGlobals();
});

describe('OIDC discovery hardening', () => {
  it('rejects malformed discovery documents', async () => {
    stubOidcDiscovery({ issuer: testIssuer });

    await expect(
      buildOAuthMetadata({
        enabled: true,
        resource_url: 'https://mcp.example.com/mcp',
        issuer: testIssuer,
        scopes_supported: ['mcp:tools'],
      }),
    ).rejects.toThrow(/Invalid OIDC discovery document/);
  });

  it('rejects issuer mismatch', async () => {
    stubOidcDiscovery({
      issuer: 'https://other.example.com/',
      authorization_endpoint: 'https://other.example.com/auth',
      token_endpoint: 'https://other.example.com/token',
      jwks_uri: 'https://other.example.com/jwks',
    });

    await expect(
      buildOAuthMetadata({
        enabled: true,
        resource_url: 'https://mcp.example.com/mcp',
        issuer: testIssuer,
        scopes_supported: ['mcp:tools'],
      }),
    ).rejects.toThrow(/issuer mismatch/);
  });

  it('caches discovery between calls until reset', async () => {
    const discovery = {
      issuer: testIssuer,
      authorization_endpoint: `${testIssuer}/auth`,
      token_endpoint: `${testIssuer}/token`,
      jwks_uri: `${testIssuer}/jwks`,
    };
    stubOidcDiscovery(discovery);

    const oauth = {
      enabled: true,
      resource_url: 'https://mcp.example.com/mcp',
      issuer: testIssuer,
      scopes_supported: ['mcp:tools'],
    };

    await buildOAuthMetadata(oauth);
    await buildOAuthMetadata(oauth);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

describe('derivePrincipalId', () => {
  it('returns unknown when no identifiers are present', () => {
    expect(derivePrincipalId({})).toBe('unknown');
  });
});
