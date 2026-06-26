import { GoogleTokenValidationError } from './google-token-errors.js';

import type { UserTokenConfig } from '../types.js';
import type { VerifyGoogleIdTokenOptions } from './google-id-token-verifier.js';
import type { GooglePrincipalIdentity } from './google-identity.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

function extractMcpJwtSub(auth: AuthInfo | undefined): string | undefined {
  const extra = auth?.extra;
  if (!extra || typeof extra !== 'object') {
    return undefined;
  }
  const sub = (extra as { sub?: unknown }).sub;
  return typeof sub === 'string' && sub ? sub : undefined;
}

export function assertUserTokenBinding(
  bindingMode: UserTokenConfig['binding']['mode'],
  mcpAuth: AuthInfo | undefined,
  googleIdentity: GooglePrincipalIdentity,
): void {
  if (bindingMode !== 'google_sub_matches_mcp_sub') {
    return;
  }

  const mcpSub = extractMcpJwtSub(mcpAuth);
  if (!mcpSub) {
    throw new GoogleTokenValidationError(
      'binding_mismatch',
      'MCP access token lacks sub claim required for google_sub_matches_mcp_sub binding',
    );
  }

  if (mcpSub !== googleIdentity.subject) {
    throw new GoogleTokenValidationError(
      'binding_mismatch',
      'Google ID token subject does not match MCP token sub',
    );
  }
}

export function buildIdTokenVerifyOptions(
  userTokenConfig: UserTokenConfig,
): Omit<VerifyGoogleIdTokenOptions, 'idToken' | 'accessToken'> {
  const identity = userTokenConfig.google_identity;
  return {
    expectedIssuer: identity.issuer,
    audiences: identity.audiences,
    ...(identity.jwks_uri ? { jwksUri: identity.jwks_uri } : {}),
    ...(identity.hosted_domain ? { hostedDomain: identity.hosted_domain } : {}),
    verifyAtHash: identity.verify_at_hash ?? true,
  };
}
