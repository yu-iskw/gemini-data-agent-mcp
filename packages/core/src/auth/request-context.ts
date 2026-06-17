import { AsyncLocalStorage } from 'node:async_hooks';

export const DEFAULT_GOOGLE_ACCESS_TOKEN_HEADER = 'x-google-access-token';

interface AuthRequestContext {
  googleAccessToken?: string;
}

const storage = new AsyncLocalStorage<AuthRequestContext>();

export function getGoogleAccessTokenFromContext(): string | undefined {
  return storage.getStore()?.googleAccessToken;
}

export function runWithAuthRequestContextAsync<T>(
  context: AuthRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn);
}

/** Parse the per-request Google access token header (optional `Bearer ` prefix). */
export function parseGoogleAccessTokenHeader(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const bearerMatch = /^Bearer\s+(.+)$/i.exec(trimmed);
  return bearerMatch?.[1] ?? trimmed;
}
