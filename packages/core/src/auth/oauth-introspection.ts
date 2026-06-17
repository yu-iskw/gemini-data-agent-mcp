import { z } from 'zod';

import { isGoogleIdentityExpired, type GooglePrincipalIdentity } from './google-identity.js';

const IntrospectionResponseSchema = z.object({
  active: z.boolean(),
  iss: z.string().optional(),
  sub: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  client_id: z.string().optional(),
  azp: z.string().optional(),
  exp: z.number().optional(),
  hd: z.string().optional(),
  scope: z.string().optional(),
});

interface IntrospectAccessTokenOptions {
  introspectionUrl: string;
  token: string;
  expectedIssuer: string;
  allowedAudiences: readonly string[];
  clientId?: string;
  clientSecret?: string;
}

export interface TokenIntrospector {
  introspect(token: string): Promise<GooglePrincipalIdentity>;
}

function resolveClientId(data: z.infer<typeof IntrospectionResponseSchema>): string | undefined {
  if (typeof data.azp === 'string' && data.azp) {
    return data.azp;
  }
  if (typeof data.client_id === 'string' && data.client_id) {
    return data.client_id;
  }
  return undefined;
}

function audienceMatches(
  aud: string | string[] | undefined,
  allowedAudiences: readonly string[],
): boolean {
  if (!aud) {
    return false;
  }
  const audiences = Array.isArray(aud) ? aud : [aud];
  return audiences.some((entry) => allowedAudiences.includes(entry));
}

function validateIntrospectionAudience(
  data: z.infer<typeof IntrospectionResponseSchema>,
  options: IntrospectAccessTokenOptions,
): void {
  if (audienceMatches(data.aud, options.allowedAudiences)) {
    return;
  }
  const clientId = resolveClientId(data);
  if (!clientId || !options.allowedAudiences.includes(clientId)) {
    throw new Error('Introspected token audience is not allowed');
  }
}

function buildIdentityFromIntrospection(
  data: z.infer<typeof IntrospectionResponseSchema>,
  issuer: string,
): GooglePrincipalIdentity {
  const expiresAt = typeof data.exp === 'number' ? data.exp : Math.floor(Date.now() / 1000) + 300;
  const clientId = resolveClientId(data);

  return {
    issuer,
    subject: data.sub!,
    expiresAt,
    ...(clientId ? { clientId } : {}),
    ...(typeof data.hd === 'string' && data.hd ? { hd: data.hd } : {}),
  };
}

export async function introspectAccessToken(
  options: IntrospectAccessTokenOptions,
): Promise<GooglePrincipalIdentity> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  if (options.clientId && options.clientSecret) {
    const credentials = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString(
      'base64',
    );
    headers.Authorization = `Basic ${credentials}`;
  }

  const body = new URLSearchParams({
    token: options.token,
    token_type_hint: 'access_token',
  });

  const response = await fetch(options.introspectionUrl, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Token introspection failed: HTTP ${response.status}`);
  }

  const parsed = IntrospectionResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('Invalid token introspection response');
  }

  const data = parsed.data;
  if (!data.active) {
    throw new Error('Access token is not active');
  }

  if (!data.sub) {
    throw new Error('Introspected token lacks subject');
  }

  const issuer = data.iss ?? options.expectedIssuer;
  if (issuer !== options.expectedIssuer) {
    throw new Error(`Introspected token issuer mismatch: expected ${options.expectedIssuer}`);
  }

  validateIntrospectionAudience(data, options);

  return buildIdentityFromIntrospection(data, issuer);
}

export function createStubTokenIntrospector(
  tokens: Map<string, GooglePrincipalIdentity>,
): TokenIntrospector {
  return {
    introspect: async (token: string) => {
      const identity = tokens.get(token);
      if (!identity) {
        throw new Error('Invalid Google access token');
      }
      if (isGoogleIdentityExpired(identity)) {
        throw new Error('Access token is not active');
      }
      return identity;
    },
  };
}
