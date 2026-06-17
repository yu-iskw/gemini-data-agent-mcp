import {
  googleIdentityKey,
  isGoogleIdentityExpired,
  type GooglePrincipalIdentity,
} from '../auth/google-identity.js';
import { introspectAccessToken, type TokenIntrospector } from '../auth/oauth-introspection.js';
import { parseGoogleAccessTokenHeader } from '../auth/request-context.js';
import { assertUserTokenBinding, buildIntrospectionOptions } from '../auth/user-token-binding.js';
import { logFingerprint } from '../observability/fingerprints.js';

import { sendJsonRpcError, sendSessionError } from './http-errors.js';

import type { UserTokenBindingMode, UserTokenConfig } from '../types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Request, Response } from 'express';

export interface UserTokenIngressContext {
  userTokenConfig: UserTokenConfig;
  introspectionUrl: string;
  googleAccessTokenHeader: string;
  testIntrospector?: TokenIntrospector;
}

export interface ValidatedGoogleRequest {
  googleAccessToken: string;
  googleIdentity: GooglePrincipalIdentity;
}

function sendUserTokenError(
  res: Response,
  status: number,
  message: string,
  useSessionError: boolean,
): void {
  if (useSessionError) {
    sendSessionError(res, status, message);
    return;
  }
  sendJsonRpcError(res, status, message);
}

export async function validateGoogleTokenForRequest(
  req: Request,
  res: Response,
  ctx: UserTokenIngressContext,
  options: {
    mcpAuth?: AuthInfo;
    bindingMode: UserTokenBindingMode;
    sessionGoogleIdentity?: GooglePrincipalIdentity;
    useSessionError?: boolean;
  },
): Promise<ValidatedGoogleRequest | undefined> {
  const headerValue = req.get(ctx.googleAccessTokenHeader);
  const googleAccessToken = parseGoogleAccessTokenHeader(headerValue ?? undefined);
  if (!googleAccessToken) {
    sendUserTokenError(
      res,
      401,
      'Unauthorized: Google access token header is required for user_token mode',
      Boolean(options.useSessionError),
    );
    return undefined;
  }

  let googleIdentity: GooglePrincipalIdentity;
  try {
    if (ctx.testIntrospector) {
      googleIdentity = await ctx.testIntrospector.introspect(googleAccessToken);
    } else {
      googleIdentity = await introspectAccessToken({
        ...buildIntrospectionOptions(ctx.userTokenConfig, ctx.introspectionUrl),
        token: googleAccessToken,
      });
    }
    assertUserTokenBinding(options.bindingMode, options.mcpAuth, googleIdentity);
  } catch (err) {
    sendUserTokenError(
      res,
      403,
      `Forbidden: ${err instanceof Error ? err.message : String(err)}`,
      Boolean(options.useSessionError),
    );
    return undefined;
  }

  if (isGoogleIdentityExpired(googleIdentity)) {
    sendUserTokenError(
      res,
      401,
      'Unauthorized: Google access token has expired',
      Boolean(options.useSessionError),
    );
    return undefined;
  }

  if (options.sessionGoogleIdentity) {
    const expected = googleIdentityKey(options.sessionGoogleIdentity);
    const actual = googleIdentityKey(googleIdentity);
    if (expected !== actual) {
      sendUserTokenError(
        res,
        403,
        'Forbidden: Google identity does not match session-bound principal',
        Boolean(options.useSessionError),
      );
      return undefined;
    }
  }

  return { googleAccessToken, googleIdentity };
}

export function logGooglePrincipalFingerprint(googleIdentity: GooglePrincipalIdentity): {
  google_principal_fingerprint: string;
} {
  return { google_principal_fingerprint: logFingerprint(googleIdentityKey(googleIdentity)) };
}
