import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createJwtTokenVerifier } from '../oauth.js';

import type { OAuthServerConfig } from '../../types.js';

const issuer = 'https://auth.example.com/realms/test';
const resourceUrl = 'http://127.0.0.1:3000/mcp';

const oauthConfig: OAuthServerConfig = {
  enabled: true,
  resource_url: resourceUrl,
  issuer,
  scopes_supported: ['mcp:tools'],
};

describe('JWT token verifier', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts tokens with a matching audience', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith('/.well-known/openid-configuration')) {
          return new Response(
            JSON.stringify({
              issuer,
              authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
              token_endpoint: `${issuer}/protocol/openid-connect/token`,
              jwks_uri: `${issuer}/protocol/openid-connect/certs`,
            }),
            { status: 200 },
          );
        }
        if (url.endsWith('/protocol/openid-connect/certs')) {
          return new Response(
            JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' }] }),
            {
              status: 200,
            },
          );
        }
        return new Response('not found', { status: 404 });
      }),
    );

    const token = await new SignJWT({
      scope: 'mcp:tools',
      azp: 'test-client',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience(resourceUrl)
      .setExpirationTime('2h')
      .sign(privateKey);

    const verifier = createJwtTokenVerifier(oauthConfig);
    const authInfo = await verifier.verifyAccessToken(token);

    expect(authInfo.clientId).toBe('test-client');
    expect(authInfo.scopes).toContain('mcp:tools');
  });

  it('rejects tokens with a mismatched audience', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith('/.well-known/openid-configuration')) {
          return new Response(
            JSON.stringify({
              issuer,
              authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
              token_endpoint: `${issuer}/protocol/openid-connect/token`,
              jwks_uri: `${issuer}/protocol/openid-connect/certs`,
            }),
            { status: 200 },
          );
        }
        if (url.endsWith('/protocol/openid-connect/certs')) {
          return new Response(
            JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' }] }),
            {
              status: 200,
            },
          );
        }
        return new Response('not found', { status: 404 });
      }),
    );

    const token = await new SignJWT({
      scope: 'mcp:tools',
      azp: 'test-client',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('https://other.example.com/mcp')
      .setExpirationTime('2h')
      .sign(privateKey);

    const verifier = createJwtTokenVerifier(oauthConfig);
    await expect(verifier.verifyAccessToken(token)).rejects.toThrow(/audience/i);
  });

  it('rejects tokens without a scope claim', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith('/.well-known/openid-configuration')) {
          return new Response(
            JSON.stringify({
              issuer,
              authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
              token_endpoint: `${issuer}/protocol/openid-connect/token`,
              jwks_uri: `${issuer}/protocol/openid-connect/certs`,
            }),
            { status: 200 },
          );
        }
        if (url.endsWith('/protocol/openid-connect/certs')) {
          return new Response(
            JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' }] }),
            {
              status: 200,
            },
          );
        }
        return new Response('not found', { status: 404 });
      }),
    );

    const token = await new SignJWT({
      azp: 'test-client',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience(resourceUrl)
      .setExpirationTime('2h')
      .sign(privateKey);

    const verifier = createJwtTokenVerifier(oauthConfig);
    await expect(verifier.verifyAccessToken(token)).rejects.toThrow(/required OAuth scopes/i);
  });

  it('rejects tokens with insufficient scopes', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith('/.well-known/openid-configuration')) {
          return new Response(
            JSON.stringify({
              issuer,
              authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
              token_endpoint: `${issuer}/protocol/openid-connect/token`,
              jwks_uri: `${issuer}/protocol/openid-connect/certs`,
            }),
            { status: 200 },
          );
        }
        if (url.endsWith('/protocol/openid-connect/certs')) {
          return new Response(
            JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' }] }),
            {
              status: 200,
            },
          );
        }
        return new Response('not found', { status: 404 });
      }),
    );

    const token = await new SignJWT({
      scope: 'openid',
      azp: 'test-client',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience(resourceUrl)
      .setExpirationTime('2h')
      .sign(privateKey);

    const verifier = createJwtTokenVerifier(oauthConfig);
    await expect(verifier.verifyAccessToken(token)).rejects.toThrow(/required OAuth scopes/i);
  });
});
