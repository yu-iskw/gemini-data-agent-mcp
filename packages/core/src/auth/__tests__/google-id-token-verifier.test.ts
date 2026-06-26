import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  computeAtHashForTest,
  resetGoogleJwksCacheForTests,
  verifyAtHashClaim,
  verifyGoogleIdToken,
} from '../google-id-token-verifier.js';

const testIssuer = 'https://accounts.google.com';
const testAudience = 'google-oauth-client-id';

type TestPrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

async function signTestIdToken(
  privateKey: TestPrivateKey,
  claims: Record<string, unknown>,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(testIssuer)
    .setAudience(testAudience)
    .setSubject(String(claims.sub ?? 'user-123'))
    .setExpirationTime('2h')
    .sign(privateKey);
}

function stubJwksFetch(publicJwk: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/certs') || url.includes('/jwks')) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

afterEach(() => {
  resetGoogleJwksCacheForTests();
  vi.unstubAllGlobals();
});

describe('verifyGoogleIdToken', () => {
  it('accepts a Google-shaped ID token verified via JWKS', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key';
    publicJwk.alg = 'RS256';
    stubJwksFetch(publicJwk as Record<string, unknown>);

    const accessToken = 'ya29.example-access-token';
    const atHash = computeAtHashForTest(accessToken, 'RS256');
    const idToken = await signTestIdToken(privateKey, {
      sub: 'user-123',
      aud: testAudience,
      at_hash: atHash,
      hd: 'example.com',
    });

    const identity = await verifyGoogleIdToken({
      idToken,
      accessToken,
      expectedIssuer: testIssuer,
      audiences: [testAudience],
      jwksUri: 'https://example.test/jwks',
      verifyAtHash: true,
    });

    expect(identity.subject).toBe('user-123');
    expect(identity.issuer).toBe(testIssuer);
    expect(identity.clientId).toBe(testAudience);
    expect(identity.hd).toBe('example.com');
  });

  it('rejects wrong audience', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key';
    publicJwk.alg = 'RS256';
    stubJwksFetch(publicJwk as Record<string, unknown>);

    const idToken = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(testIssuer)
      .setAudience('other-client')
      .setExpirationTime('2h')
      .sign(privateKey);

    await expect(
      verifyGoogleIdToken({
        idToken,
        expectedIssuer: testIssuer,
        audiences: [testAudience],
        jwksUri: 'https://example.test/jwks',
        verifyAtHash: false,
      }),
    ).rejects.toThrow(/aud/i);
  });

  it('rejects at_hash mismatch', () => {
    expect(() => verifyAtHashClaim({ at_hash: 'wrong' }, 'access-token-value', 'RS256')).toThrow(
      /at_hash/i,
    );
  });
});
