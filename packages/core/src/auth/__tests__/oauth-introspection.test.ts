import { afterEach, describe, expect, it, vi } from 'vitest';

import { introspectAccessToken, createStubTokenIntrospector } from '../oauth-introspection.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('introspectAccessToken', () => {
  it('accepts active tokens with matching issuer and audience', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            active: true,
            iss: 'https://accounts.google.com',
            sub: 'user-1',
            aud: 'google-client',
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200 },
        );
      }),
    );

    const identity = await introspectAccessToken({
      introspectionUrl: 'https://auth.example.com/introspect',
      token: 'token-1',
      expectedIssuer: 'https://accounts.google.com',
      allowedAudiences: ['google-client'],
    });

    expect(identity.subject).toBe('user-1');
    expect(identity.issuer).toBe('https://accounts.google.com');
  });

  it('rejects inactive tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ active: false }), { status: 200 });
      }),
    );

    await expect(
      introspectAccessToken({
        introspectionUrl: 'https://auth.example.com/introspect',
        token: 'token-1',
        expectedIssuer: 'https://accounts.google.com',
        allowedAudiences: ['google-client'],
      }),
    ).rejects.toThrow(/not active/);
  });
});

describe('createStubTokenIntrospector', () => {
  it('returns configured identities', async () => {
    const introspector = createStubTokenIntrospector(
      new Map([
        [
          'google-token',
          {
            issuer: 'https://accounts.google.com',
            subject: 'user-1',
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          },
        ],
      ]),
    );

    const identity = await introspector.introspect('google-token');
    expect(identity.subject).toBe('user-1');
  });
});
