import { Impersonated } from 'google-auth-library';

import { getHeaderValue } from './headers.js';

import type { GoogleAuth, OAuth2Client, BaseExternalAccountClient } from 'google-auth-library';

type SourceClient =
  InstanceType<typeof GoogleAuth> extends { getClient(): Promise<infer T> } ? T : never;

const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

export async function createImpersonatedCredentials(
  sourceAuth: GoogleAuth,
  targetServiceAccount: string,
  scopes: string[] = DEFAULT_SCOPES,
): Promise<Impersonated> {
  const sourceClient = (await sourceAuth.getClient()) as
    | OAuth2Client
    | BaseExternalAccountClient
    | SourceClient;

  return new Impersonated({
    sourceClient: sourceClient as OAuth2Client,
    targetPrincipal: targetServiceAccount,
    lifetime: 3600,
    delegates: [],
    targetScopes: scopes,
  });
}

export async function getImpersonatedAccessToken(client: Impersonated): Promise<string> {
  const headers = await client.getRequestHeaders();
  const authHeader = getHeaderValue(headers, 'Authorization');
  if (!authHeader) {
    throw new Error('Failed to obtain Authorization header from impersonated credentials');
  }
  return authHeader.replace(/^Bearer\s+/i, '');
}
