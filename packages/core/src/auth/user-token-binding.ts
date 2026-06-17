import type { UserTokenBindingMode, UserTokenConfig } from '../types.js';
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
  bindingMode: UserTokenBindingMode,
  mcpAuth: AuthInfo | undefined,
  googleIdentity: GooglePrincipalIdentity,
): void {
  if (bindingMode !== 'google_sub_matches_mcp_sub') {
    return;
  }

  const mcpSub = extractMcpJwtSub(mcpAuth);
  if (!mcpSub) {
    throw new Error(
      'MCP access token lacks sub claim required for google_sub_matches_mcp_sub binding',
    );
  }

  if (mcpSub !== googleIdentity.subject) {
    throw new Error('Google token subject does not match MCP token sub');
  }
}

function resolveIntrospectionClientAuth(): { clientId?: string; clientSecret?: string } {
  const clientId = process.env.MCP_GOOGLE_INTROSPECTION_CLIENT_ID;
  const clientSecret = process.env.MCP_GOOGLE_INTROSPECTION_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  return {};
}

export function buildIntrospectionOptions(
  userTokenConfig: UserTokenConfig,
  introspectionUrl: string,
): {
  introspectionUrl: string;
  expectedIssuer: string;
  allowedAudiences: readonly string[];
  clientId?: string;
  clientSecret?: string;
} {
  const clientAuth = resolveIntrospectionClientAuth();
  return {
    introspectionUrl,
    expectedIssuer: userTokenConfig.google_token.issuer,
    allowedAudiences: userTokenConfig.google_token.audiences,
    ...clientAuth,
  };
}
