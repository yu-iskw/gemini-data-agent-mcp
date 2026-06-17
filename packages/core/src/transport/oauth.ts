import { checkResourceAllowed } from '@modelcontextprotocol/sdk/shared/auth-utils.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { OAuthServerConfig } from '../types.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  introspection_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  grant_types_supported?: string[];
}

const oidcCache = new Map<string, OidcDiscoveryDocument>();

async function fetchOidcDiscovery(issuer: string): Promise<OidcDiscoveryDocument> {
  const cached = oidcCache.get(issuer);
  if (cached) {
    return cached;
  }

  const issuerUrl = issuer.endsWith('/') ? issuer : `${issuer}/`;
  const discoveryUrl = new URL('.well-known/openid-configuration', issuerUrl).href;
  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC discovery from ${discoveryUrl}: ${response.status}`);
  }

  const document = (await response.json()) as OidcDiscoveryDocument;
  oidcCache.set(issuer, document);
  return document;
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

function parseScopeClaim(scopeClaim: unknown): string[] {
  if (typeof scopeClaim === 'string') {
    return scopeClaim.split(/\s+/).filter(Boolean);
  }
  return [];
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

      return {
        token,
        clientId,
        scopes,
        expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
        resource: resourceUrl,
      };
    },
  };
}
