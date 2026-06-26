import type { OAuthServerConfig, UserTokenConfig } from '../../types.js';

export const testIssuer = 'https://auth.example.com/realms/test';

export const defaultGoogleIdToken = 'google-id-token';
export const defaultGoogleAccessToken = 'google-access-token';

export function defaultTestOAuth(overrides: Partial<OAuthServerConfig> = {}): OAuthServerConfig {
  const resourceUrl = overrides.resource_url ?? 'http://127.0.0.1:8080/mcp';
  return {
    enabled: true,
    resource_url: resourceUrl,
    issuer: testIssuer,
    scopes_supported: ['mcp:tools'],
    required_scopes: ['mcp:tools'],
    allowed_audiences: [resourceUrl],
    scope_claims: ['scope'],
    token_profile: 'jwt_jwks',
    ...overrides,
  };
}

export function defaultUserTokenConfig(overrides: Partial<UserTokenConfig> = {}): UserTokenConfig {
  return {
    trusted_ingress_client_ids: ['bff-client'],
    google_identity: {
      issuer: 'https://accounts.google.com',
      audiences: ['google-client'],
      verify_at_hash: false,
      ...overrides.google_identity,
    },
    binding: {
      mode: 'google_sub_matches_mcp_sub',
      ...overrides.binding,
    },
    ...overrides,
  };
}

export function defaultHttpOauthFields(oauth?: Partial<OAuthServerConfig>) {
  const config = defaultTestOAuth(oauth);
  return {
    enabled: config.enabled,
    resource_url: config.resource_url,
    issuer: config.issuer,
    scopes_supported: config.scopes_supported,
    required_scopes: config.required_scopes,
    allowed_audiences: config.allowed_audiences,
    scope_claims: config.scope_claims,
    token_profile: config.token_profile,
  };
}

export function defaultGoogleIdentityHeaders(): Record<string, string> {
  return {
    'X-Google-Access-Token': defaultGoogleAccessToken,
    'X-Google-Id-Token': defaultGoogleIdToken,
  };
}
