import { Impersonated } from 'google-auth-library';

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
