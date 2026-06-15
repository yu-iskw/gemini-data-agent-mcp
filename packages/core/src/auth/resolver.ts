import { GoogleAuth } from 'google-auth-library';

import { DataAgentMcpError } from '../types.js';

import { normalizeHeaders } from './headers.js';
import { createImpersonatedCredentials } from './impersonation.js';

import type { AuthConfig } from '../types.js';
import type { Impersonated } from 'google-auth-library';

const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

export interface ResolvedCredentials {
  getRequestHeaders(): Promise<Record<string, string>>;
}

const credentialCache = new Map<string, ResolvedCredentials>();

function cacheKey(auth: AuthConfig): string {
  return JSON.stringify({
    mode: auth.mode,
    source: auth.source,
    target: auth.impersonate_service_account,
    scopes: auth.scopes,
  });
}

export async function resolveCredentials(auth: AuthConfig): Promise<ResolvedCredentials> {
  const key = cacheKey(auth);
  const cached = credentialCache.get(key);
  if (cached) return cached;

  const credentials = await buildCredentials(auth);
  credentialCache.set(key, credentials);
  return credentials;
}

async function buildCredentials(auth: AuthConfig): Promise<ResolvedCredentials> {
  const scopes = auth.scopes ?? DEFAULT_SCOPES;

  switch (auth.mode) {
    case 'adc': {
      const googleAuth = new GoogleAuth({ scopes });
      return wrapGoogleAuth(googleAuth);
    }

    case 'impersonation': {
      if (!auth.impersonate_service_account) {
        throw new DataAgentMcpError(
          'AUTH_MISSING_TARGET',
          'impersonate_service_account is required for impersonation auth mode',
          false,
          { auth_mode: 'impersonation' },
        );
      }

      const sourceScopes = auth.scopes ?? DEFAULT_SCOPES;
      const sourceAuth = new GoogleAuth({ scopes: sourceScopes });
      const impersonated = await createImpersonatedCredentials(
        sourceAuth,
        auth.impersonate_service_account,
        scopes,
      );
      return wrapImpersonated(impersonated);
    }

    default: {
      throw new DataAgentMcpError(
        'AUTH_UNKNOWN_MODE',
        `Unknown auth mode: ${String((auth as AuthConfig).mode)}`,
        false,
      );
    }
  }
}

function wrapGoogleAuth(googleAuth: GoogleAuth): ResolvedCredentials {
  return {
    async getRequestHeaders(): Promise<Record<string, string>> {
      try {
        const client = await googleAuth.getClient();
        const headers = await client.getRequestHeaders();
        return normalizeHeaders(headers);
      } catch (err) {
        throw new DataAgentMcpError(
          'AUTH_FAILED',
          `Failed to obtain Google credentials: ${String(err)}`,
          true,
          { auth_mode: 'adc' },
        );
      }
    },
  };
}

function wrapImpersonated(impersonated: Impersonated): ResolvedCredentials {
  return {
    async getRequestHeaders(): Promise<Record<string, string>> {
      try {
        const headers = await impersonated.getRequestHeaders();
        return normalizeHeaders(headers);
      } catch (err) {
        throw new DataAgentMcpError(
          'AUTH_FAILED',
          `Failed to obtain impersonated credentials: ${String(err)}`,
          true,
          { auth_mode: 'impersonation' },
        );
      }
    },
  };
}

export function clearCredentialCache(): void {
  credentialCache.clear();
}
