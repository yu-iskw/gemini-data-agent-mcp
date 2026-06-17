import { createHash } from 'node:crypto';

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { DEFAULT_GOOGLE_JWKS_URI } from '../types.js';

import { type GooglePrincipalIdentity, isGoogleIdentityExpired } from './google-identity.js';
import {
  GoogleTokenValidationError,
  type GoogleTokenRejectionReason,
} from './google-token-errors.js';

export interface VerifyGoogleIdTokenOptions {
  idToken: string;
  expectedIssuer: string;
  audiences: readonly string[];
  jwksUri?: string;
  hostedDomain?: string;
  accessToken?: string;
  verifyAtHash?: boolean;
}

export interface GoogleIdTokenVerifier {
  verify(idToken: string, accessToken?: string): Promise<GooglePrincipalIdentity>;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function resolveJwksUri(jwksUri?: string): string {
  return jwksUri ?? DEFAULT_GOOGLE_JWKS_URI;
}

function getRemoteJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksCache.get(jwksUri);
  if (cached) {
    return cached;
  }
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  jwksCache.set(jwksUri, jwks);
  return jwks;
}

export function resetGoogleJwksCacheForTests(): void {
  jwksCache.clear();
}

function audienceAllowed(aud: unknown, audiences: readonly string[]): boolean {
  if (typeof aud === 'string') {
    return audiences.includes(aud);
  }
  if (Array.isArray(aud)) {
    return aud.some((entry) => typeof entry === 'string' && audiences.includes(entry));
  }
  return false;
}

function computeAtHash(accessToken: string, alg: string): string {
  const hashAlg = alg.startsWith('HS') ? 'sha256' : 'sha256';
  const digest = createHash(hashAlg).update(accessToken, 'ascii').digest();
  return digest.subarray(0, digest.length / 2).toString('base64url');
}

export function computeAtHashForTest(accessToken: string, alg: string): string {
  return computeAtHash(accessToken, alg);
}

export function verifyAtHashClaim(payload: JWTPayload, accessToken: string, alg: string): void {
  const atHash = payload.at_hash;
  if (typeof atHash !== 'string' || !atHash) {
    throw new GoogleTokenValidationError('at_hash_mismatch', 'ID token is missing at_hash claim');
  }
  const expected = computeAtHash(accessToken, alg);
  if (atHash !== expected) {
    throw new GoogleTokenValidationError(
      'at_hash_mismatch',
      'ID token at_hash does not match access token',
    );
  }
}

function identityFromPayload(payload: JWTPayload, issuer: string): GooglePrincipalIdentity {
  const sub = typeof payload.sub === 'string' && payload.sub ? payload.sub : undefined;
  if (!sub) {
    throw new GoogleTokenValidationError('invalid_id_token', 'ID token lacks subject');
  }

  const aud = payload.aud;
  let clientId: string | undefined;
  if (typeof aud === 'string') {
    clientId = aud;
  } else if (Array.isArray(aud)) {
    const first = aud.find((entry) => typeof entry === 'string' && entry);
    clientId = typeof first === 'string' ? first : undefined;
  }

  const expiresAt =
    typeof payload.exp === 'number' ? payload.exp : Math.floor(Date.now() / 1000) + 300;
  const hd = typeof payload.hd === 'string' && payload.hd ? payload.hd : undefined;

  return {
    issuer,
    subject: sub,
    expiresAt,
    ...(clientId ? { clientId } : {}),
    ...(hd ? { hd } : {}),
  };
}

function mapJwtVerifyError(err: unknown): GoogleTokenRejectionReason {
  if (!(err instanceof Error)) {
    return 'invalid_id_token';
  }
  const message = err.message.toLowerCase();
  if (message.includes('audience') || message.includes('"aud"')) {
    return 'audience_mismatch';
  }
  if (message.includes('issuer')) {
    return 'issuer_mismatch';
  }
  return 'invalid_id_token';
}

function assertHostedDomain(payload: JWTPayload, hostedDomain: string): void {
  const hd = typeof payload.hd === 'string' ? payload.hd : undefined;
  if (hd !== hostedDomain) {
    throw new GoogleTokenValidationError(
      'hosted_domain_mismatch',
      'ID token hosted domain does not match policy',
    );
  }
}

function assertAtHashWhenRequired(
  options: VerifyGoogleIdTokenOptions,
  payload: JWTPayload,
  protectedHeaderAlg: string,
): void {
  const verifyAtHash = options.verifyAtHash ?? true;
  if (!verifyAtHash) {
    return;
  }
  if (!options.accessToken) {
    throw new GoogleTokenValidationError(
      'at_hash_mismatch',
      'Access token is required for at_hash verification',
    );
  }
  verifyAtHashClaim(payload, options.accessToken, protectedHeaderAlg);
}

async function verifyJwtPayload(
  options: VerifyGoogleIdTokenOptions,
  jwks: ReturnType<typeof createRemoteJWKSet>,
): Promise<{ payload: JWTPayload; protectedHeaderAlg: string }> {
  try {
    const verified = await jwtVerify(options.idToken, jwks, {
      issuer: options.expectedIssuer,
      audience: [...options.audiences],
    });
    return {
      payload: verified.payload,
      protectedHeaderAlg: verified.protectedHeader.alg ?? 'RS256',
    };
  } catch (err) {
    throw new GoogleTokenValidationError(
      mapJwtVerifyError(err),
      err instanceof Error ? err.message : 'ID token verification failed',
    );
  }
}

export async function verifyGoogleIdToken(
  options: VerifyGoogleIdTokenOptions,
): Promise<GooglePrincipalIdentity> {
  const jwksUri = resolveJwksUri(options.jwksUri);
  const jwks = getRemoteJwks(jwksUri);
  const { payload, protectedHeaderAlg } = await verifyJwtPayload(options, jwks);

  if (!audienceAllowed(payload.aud, options.audiences)) {
    throw new GoogleTokenValidationError('audience_mismatch', 'ID token audience is not allowed');
  }

  if (options.hostedDomain) {
    assertHostedDomain(payload, options.hostedDomain);
  }

  assertAtHashWhenRequired(options, payload, protectedHeaderAlg);

  const identity = identityFromPayload(payload, options.expectedIssuer);
  if (isGoogleIdentityExpired(identity)) {
    throw new GoogleTokenValidationError('expired_id_token', 'ID token has expired');
  }

  return identity;
}

export function createGoogleIdTokenVerifier(
  options: Omit<VerifyGoogleIdTokenOptions, 'idToken' | 'accessToken'>,
): GoogleIdTokenVerifier {
  return {
    verify: (idToken, accessToken) =>
      verifyGoogleIdToken({
        ...options,
        idToken,
        accessToken,
      }),
  };
}

export function createStubIdTokenVerifier(
  tokens: Map<string, GooglePrincipalIdentity>,
): GoogleIdTokenVerifier {
  return {
    verify: async (idToken: string) => {
      const identity = tokens.get(idToken);
      if (!identity) {
        throw new GoogleTokenValidationError('invalid_id_token', 'Invalid Google ID token');
      }
      if (isGoogleIdentityExpired(identity)) {
        throw new GoogleTokenValidationError('expired_id_token', 'ID token has expired');
      }
      return identity;
    },
  };
}
