import { checkResourceAllowed } from '@modelcontextprotocol/sdk/shared/auth-utils.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

import type { OAuthScopeClaim, OAuthServerConfig } from '../types.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { JWTPayload } from 'jose';

const DISCOVERY_TTL_MS = 5 * 60_000;
const DISCOVERY_FETCH_TIMEOUT_MS = 10_000;
const MAX_DISCOVERY_CACHE_ENTRIES = 32;

const OidcDiscoveryDocumentSchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
  registration_endpoint: z.string().url().optional(),
  revocation_endpoint: z.string().url().optional(),
  introspection_endpoint: z.string().url().optional(),
  scopes_supported: z.array(z.string().min(1)).optional(),
  response_types_supported: z.array(z.string().min(1)).optional(),
  code_challenge_methods_supported: z.array(z.string().min(1)).optional(),
  grant_types_supported: z.array(z.string().min(1)).optional(),
});

type OidcDiscoveryDocument = z.infer<typeof OidcDiscoveryDocumentSchema>;

const DISCOVERY_MIN_TTL_MS = 60_000;
const DISCOVERY_MAX_TTL_MS = 60 * 60_000;
const DISCOVERY_STALE_MS = 60_000;

interface CachedDiscovery {
  document: OidcDiscoveryDocument;
  expiresAt: number;
  staleUntil: number;
}

const oidcCache = new Map<string, CachedDiscovery>();
const oidcInFlight = new Map<string, Promise<OidcDiscoveryDocument>>();

export function resetOidcDiscoveryCacheForTests(): void {
  oidcCache.clear();
  oidcInFlight.clear();
}

function parseCacheControlMaxAge(cacheControl: string | null): number | undefined {
  if (!cacheControl) {
    return undefined;
  }
  const match = /max-age=(\d+)/i.exec(cacheControl);
  if (!match?.[1]) {
    return undefined;
  }
  const seconds = Number.parseInt(match[1], 10);
  if (!Number.isFinite(seconds)) {
    return undefined;
  }
  return Math.min(DISCOVERY_MAX_TTL_MS, Math.max(DISCOVERY_MIN_TTL_MS, seconds * 1000));
}

function normalizeIssuer(issuer: string): string {
  return issuer.endsWith('/') ? issuer : `${issuer}/`;
}

function assertIssuerMatches(configuredIssuer: string, discoveredIssuer: string): void {
  const normalizedConfigured = normalizeIssuer(configuredIssuer);
  const normalizedDiscovered = normalizeIssuer(discoveredIssuer);
  if (normalizedConfigured !== normalizedDiscovered) {
    throw new Error(
      `OIDC discovery issuer mismatch: expected ${configuredIssuer}, got ${discoveredIssuer}`,
    );
  }
}

async function fetchOidcDiscoveryDocument(
  issuer: string,
  cacheKey: string,
): Promise<OidcDiscoveryDocument> {
  const discoveryUrl = new URL('.well-known/openid-configuration', cacheKey).href;
  try {
    const response = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(DISCOVERY_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch OIDC discovery from ${discoveryUrl}: ${response.status}`);
    }

    const parsed = OidcDiscoveryDocumentSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`Invalid OIDC discovery document from ${discoveryUrl}`);
    }

    assertIssuerMatches(issuer, parsed.data.issuer);

    const ttlMs =
      parseCacheControlMaxAge(response.headers.get('cache-control')) ?? DISCOVERY_TTL_MS;
    const now = Date.now();

    if (oidcCache.size >= MAX_DISCOVERY_CACHE_ENTRIES) {
      const oldestKey = oidcCache.keys().next().value;
      if (oldestKey) {
        oidcCache.delete(oldestKey);
      }
    }

    oidcCache.set(cacheKey, {
      document: parsed.data,
      expiresAt: now + ttlMs,
      staleUntil: now + ttlMs + DISCOVERY_STALE_MS,
    });

    return parsed.data;
  } catch (err) {
    const cached = oidcCache.get(cacheKey);
    if (cached && cached.staleUntil > Date.now()) {
      return cached.document;
    }
    throw err;
  }
}

async function fetchOidcDiscovery(issuer: string): Promise<OidcDiscoveryDocument> {
  const cacheKey = normalizeIssuer(issuer);
  const cached = oidcCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.document;
  }

  const inFlight = oidcInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = fetchOidcDiscoveryDocument(issuer, cacheKey);
  oidcInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    oidcInFlight.delete(cacheKey);
  }
}

class MissingPrincipalIdError extends Error {
  constructor() {
    super('Access token lacks a stable principal identifier: expected sub, azp, or client_id');
    this.name = 'MissingPrincipalIdError';
  }
}

function extractTokenClientId(payload: JWTPayload): string | undefined {
  if (typeof payload.azp === 'string' && payload.azp) {
    return payload.azp;
  }
  if (typeof payload.client_id === 'string' && payload.client_id) {
    return payload.client_id;
  }
  return undefined;
}

export function derivePrincipalId(payload: JWTPayload): string {
  const sub = typeof payload.sub === 'string' && payload.sub ? payload.sub : undefined;
  const clientId = extractTokenClientId(payload);

  if (sub && clientId) {
    return `sub:${encodeURIComponent(sub)}|client:${encodeURIComponent(clientId)}`;
  }
  if (sub) {
    return `sub:${encodeURIComponent(sub)}`;
  }
  if (clientId) {
    return `client:${encodeURIComponent(clientId)}`;
  }
  throw new MissingPrincipalIdError();
}

function parseScopeClaim(scopeClaim: unknown): string[] {
  if (typeof scopeClaim === 'string') {
    return scopeClaim.split(/\s+/).filter(Boolean);
  }
  return [];
}

function collectScopesFromClaim(
  payload: JWTPayload,
  claim: OAuthScopeClaim,
  scopes: Set<string>,
): void {
  if (claim === 'scope') {
    for (const scope of parseScopeClaim(payload.scope)) {
      scopes.add(scope);
    }
    return;
  }

  const scp = payload.scp;
  if (!Array.isArray(scp)) {
    return;
  }
  for (const entry of scp) {
    if (typeof entry === 'string' && entry) {
      scopes.add(entry);
    }
  }
}

export function parseScopeClaims(
  payload: JWTPayload,
  scopeClaims: readonly OAuthScopeClaim[],
): string[] {
  const scopes = new Set<string>();
  for (const claim of scopeClaims) {
    collectScopesFromClaim(payload, claim, scopes);
  }
  return [...scopes];
}

function audienceAllowed(audiences: string[], oauth: OAuthServerConfig): boolean {
  if (audiences.length === 0) {
    return false;
  }
  const resourceUrl = new URL(oauth.resource_url);
  return audiences.some(
    (audience) =>
      oauth.allowed_audiences.includes(audience) ||
      checkResourceAllowed({
        requestedResource: audience,
        configuredResource: resourceUrl,
      }),
  );
}

export function getMissingRequiredScopes(
  requiredScopes: readonly string[],
  tokenScopes: readonly string[],
): string[] {
  return requiredScopes.filter((scope) => !tokenScopes.includes(scope));
}

export async function buildOAuthMetadata(oauth: OAuthServerConfig): Promise<OAuthMetadata> {
  const discovery = await fetchOidcDiscovery(oauth.issuer);

  return {
    issuer: discovery.issuer,
    authorization_endpoint: discovery.authorization_endpoint,
    token_endpoint: discovery.token_endpoint,
    registration_endpoint: discovery.registration_endpoint,
    revocation_endpoint: discovery.revocation_endpoint,
    introspection_endpoint: discovery.introspection_endpoint,
    scopes_supported: discovery.scopes_supported ?? oauth.scopes_supported,
    response_types_supported: discovery.response_types_supported ?? ['code'],
    code_challenge_methods_supported: discovery.code_challenge_methods_supported ?? ['S256'],
    grant_types_supported: discovery.grant_types_supported ?? [
      'authorization_code',
      'refresh_token',
    ],
  };
}

function buildAuthInfoFromPayload(
  token: string,
  payload: JWTPayload,
  oauth: OAuthServerConfig,
  resourceUrl: URL,
): AuthInfo {
  const aud = payload.aud;
  const audiences: string[] =
    aud === undefined ? [] : Array.isArray(aud) ? aud.map(String) : [String(aud)];

  if (!audienceAllowed(audiences, oauth)) {
    throw new Error(
      `Token audience does not match allowed audiences for ${oauth.resource_url}: ${audiences.join(', ')}`,
    );
  }

  const scopes = parseScopeClaims(payload, oauth.scope_claims);
  const missing = getMissingRequiredScopes(oauth.required_scopes, scopes);
  if (missing.length > 0) {
    throw new Error(`Token is missing required OAuth scopes: ${missing.join(', ')}`);
  }

  const clientId = extractTokenClientId(payload) ?? 'unknown';
  const mcpSub = typeof payload.sub === 'string' && payload.sub ? payload.sub : undefined;
  const principalId = derivePrincipalId(payload);

  return {
    token,
    clientId,
    scopes,
    expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
    resource: resourceUrl,
    extra: { principalId, ...(mcpSub ? { sub: mcpSub } : {}) },
  };
}

export function createJwtTokenVerifier(oauth: OAuthServerConfig): OAuthTokenVerifier {
  const resourceUrl = new URL(oauth.resource_url);
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  return {
    verifyAccessToken: async (token: string): Promise<AuthInfo> => {
      const discovery = await fetchOidcDiscovery(oauth.issuer);
      jwks ??= createRemoteJWKSet(new URL(discovery.jwks_uri));

      const { payload } = await jwtVerify(token, jwks, {
        issuer: discovery.issuer,
      });

      return buildAuthInfoFromPayload(token, payload, oauth, resourceUrl);
    },
  };
}

export function createStubTokenVerifier(
  tokens: Map<string, { principalId: string; sub?: string; clientId?: string; scopes?: string[] }>,
): OAuthTokenVerifier {
  return {
    verifyAccessToken: async (token: string): Promise<AuthInfo> => {
      const entry = tokens.get(token);
      if (!entry) {
        throw new Error('Invalid token');
      }
      const clientId = entry.clientId ?? entry.principalId;
      return {
        token,
        clientId,
        scopes: entry.scopes ?? ['mcp:tools'],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: {
          principalId: entry.principalId,
          ...(entry.sub ? { sub: entry.sub } : {}),
        },
      };
    },
  };
}

export function getPrincipalIdFromAuth(auth: AuthInfo | undefined): string | undefined {
  const principalId = auth?.extra?.principalId;
  return typeof principalId === 'string' ? principalId : undefined;
}
