import { checkResourceAllowed } from '@modelcontextprotocol/sdk/shared/auth-utils.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

import type { OAuthServerConfig } from '../types.js';
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

interface CachedDiscovery {
  document: OidcDiscoveryDocument;
  expiresAt: number;
}

const oidcCache = new Map<string, CachedDiscovery>();

export function resetOidcDiscoveryCacheForTests(): void {
  oidcCache.clear();
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

async function fetchOidcDiscovery(issuer: string): Promise<OidcDiscoveryDocument> {
  const cacheKey = normalizeIssuer(issuer);
  const cached = oidcCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.document;
  }

  const discoveryUrl = new URL('.well-known/openid-configuration', cacheKey).href;
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

  if (oidcCache.size >= MAX_DISCOVERY_CACHE_ENTRIES) {
    const oldestKey = oidcCache.keys().next().value;
    if (oldestKey) {
      oidcCache.delete(oldestKey);
    }
  }

  oidcCache.set(cacheKey, {
    document: parsed.data,
    expiresAt: Date.now() + DISCOVERY_TTL_MS,
  });

  return parsed.data;
}

export function derivePrincipalId(payload: JWTPayload): string {
  const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
  const azp =
    (typeof payload.azp === 'string' && payload.azp) ||
    (typeof payload.client_id === 'string' && payload.client_id) ||
    undefined;

  if (sub && azp) {
    return `${sub}:${azp}`;
  }
  if (sub) {
    return sub;
  }
  if (azp) {
    return azp;
  }
  return 'unknown';
}

function parseScopeClaim(scopeClaim: unknown): string[] {
  if (typeof scopeClaim === 'string') {
    return scopeClaim.split(/\s+/).filter(Boolean);
  }
  return [];
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

      const aud = payload.aud;
      const audiences: string[] =
        aud === undefined ? [] : Array.isArray(aud) ? aud.map(String) : [String(aud)];

      const allowed = audiences.some((audience) =>
        checkResourceAllowed({
          requestedResource: audience,
          configuredResource: resourceUrl,
        }),
      );

      if (!allowed) {
        throw new Error(
          `Token audience does not match resource ${oauth.resource_url}: ${audiences.join(', ')}`,
        );
      }

      const scopes = parseScopeClaim(payload.scope);
      const missing = oauth.scopes_supported.filter((s) => !scopes.includes(s));
      if (missing.length > 0) {
        throw new Error(`Token is missing required OAuth scopes: ${missing.join(', ')}`);
      }

      const clientId =
        (typeof payload.azp === 'string' && payload.azp) ||
        (typeof payload.client_id === 'string' && payload.client_id) ||
        'unknown';

      const principalId = derivePrincipalId(payload);

      return {
        token,
        clientId,
        scopes,
        expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
        resource: resourceUrl,
        extra: { principalId },
      };
    },
  };
}

export function createStubTokenVerifier(
  tokens: Map<string, { principalId: string; scopes?: string[] }>,
): OAuthTokenVerifier {
  return {
    verifyAccessToken: async (token: string): Promise<AuthInfo> => {
      const entry = tokens.get(token);
      if (!entry) {
        throw new Error('Invalid token');
      }
      return {
        token,
        clientId: entry.principalId,
        scopes: entry.scopes ?? ['mcp:tools'],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: { principalId: entry.principalId },
      };
    },
  };
}

export function getPrincipalIdFromAuth(auth: AuthInfo | undefined): string | undefined {
  const principalId = auth?.extra?.principalId;
  return typeof principalId === 'string' ? principalId : undefined;
}
