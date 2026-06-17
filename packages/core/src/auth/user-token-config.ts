import { DEFAULT_GOOGLE_ACCESS_TOKEN_HEADER } from './request-context.js';

import type { AppConfig, UserTokenConfig } from '../types.js';

export function configUsesUserToken(config: AppConfig): boolean {
  return Object.values(config.agents).some((agent) => agent.auth.mode === 'user_token');
}

export function resolveGoogleAccessTokenHeaderName(config: AppConfig): string {
  return (
    config.server.http?.google_access_token_header?.toLowerCase() ??
    DEFAULT_GOOGLE_ACCESS_TOKEN_HEADER
  );
}

export function resolveUserTokenConfig(config: AppConfig): UserTokenConfig | undefined {
  return config.server.http?.user_token;
}
