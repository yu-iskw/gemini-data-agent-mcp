import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildOAuthMetadata,
  derivePrincipalId,
  getMissingRequiredScopes,
  resetOidcDiscoveryCacheForTests,
} from '../oauth.js';

import { defaultTestOAuth } from './http-test-fixtures.js';

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
      buildOAuthMetadata(
        defaultTestOAuth({
          resource_url: 'https://mcp.example.com/mcp',
          issuer: testIssuer,
        }),
      ),
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
      buildOAuthMetadata(
        defaultTestOAuth({
          resource_url: 'https://mcp.example.com/mcp',
          issuer: testIssuer,
        }),
      ),
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

    const oauth = defaultTestOAuth({
      resource_url: 'https://mcp.example.com/mcp',
      issuer: testIssuer,
    });

    await buildOAuthMetadata(oauth);
    await buildOAuthMetadata(oauth);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent discovery fetches for the same issuer', async () => {
    const discovery = {
      issuer: testIssuer,
      authorization_endpoint: `${testIssuer}/auth`,
      token_endpoint: `${testIssuer}/token`,
      jwks_uri: `${testIssuer}/jwks`,
    };
    stubOidcDiscovery(discovery);

    const oauth = defaultTestOAuth({
      resource_url: 'https://mcp.example.com/mcp',
      issuer: testIssuer,
    });

    await Promise.all([buildOAuthMetadata(oauth), buildOAuthMetadata(oauth)]);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

describe('derivePrincipalId', () => {
  it('throws when no identifiers are present', () => {
    expect(() => derivePrincipalId({})).toThrow(/stable principal identifier/);
  });

  it('namespaces sub and client to avoid delimiter collisions', () => {
    expect(derivePrincipalId({ sub: 'a:b', azp: 'client-a' })).toBe('sub:a%3Ab|client:client-a');
    expect(derivePrincipalId({ sub: 'a', azp: 'b:c' })).toBe('sub:a|client:b%3Ac');
    expect(derivePrincipalId({ sub: 'a:b' })).not.toBe(derivePrincipalId({ sub: 'a', azp: 'b' }));
  });
});

describe('getMissingRequiredScopes', () => {
  it('requires only configured scopes, not every advertised scope', () => {
    const missing = getMissingRequiredScopes(
      ['mcp:tools:read'],
      ['mcp:tools:read', 'mcp:tools:admin'],
    );
    expect(missing).toEqual([]);
  });

  it('reports missing required scopes', () => {
    expect(
      getMissingRequiredScopes(['mcp:tools:read', 'mcp:tools:admin'], ['mcp:tools:read']),
    ).toEqual(['mcp:tools:admin']);
  });
});
