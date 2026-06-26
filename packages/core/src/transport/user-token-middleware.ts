import {
  createGoogleIdTokenVerifier,
  type GoogleIdTokenVerifier,
} from '../auth/google-id-token-verifier.js';
import {
  googleIdentityKey,
  isGoogleIdentityExpired,
  type GooglePrincipalIdentity,
} from '../auth/google-identity.js';
import {
  classifyGoogleTokenError,
  GOOGLE_CREDENTIAL_CLIENT_MESSAGE,
  GoogleTokenValidationError,
  type GoogleTokenRejectionReason,
} from '../auth/google-token-errors.js';
import { parseGoogleAccessTokenHeader } from '../auth/request-context.js';
import { assertUserTokenBinding, buildIdTokenVerifyOptions } from '../auth/user-token-binding.js';
import { logFingerprint } from '../observability/fingerprints.js';
import { logInfo } from '../observability/logging.js';

import { sendJsonRpcError, sendSessionError } from './http-errors.js';

import type { UserTokenBindingMode, UserTokenConfig } from '../types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Request, Response } from 'express';

export const GOOGLE_CREDENTIAL_ERROR_CODE = -32_001;

export interface UserTokenIngressContext {
  userTokenConfig: UserTokenConfig;
  googleAccessTokenHeader: string;
  googleIdTokenHeader: string;
  testIdTokenVerifier?: GoogleIdTokenVerifier;
}

export interface ValidatedGoogleRequest {
  googleAccessToken: string;
  googleIdentity: GooglePrincipalIdentity;
}

function sendRedactedGoogleCredentialError(
  res: Response,
  status: number,
  useSessionError: boolean,
): void {
  if (useSessionError) {
    sendSessionError(res, status, GOOGLE_CREDENTIAL_CLIENT_MESSAGE);
    return;
  }
  sendJsonRpcError(res, status, GOOGLE_CREDENTIAL_CLIENT_MESSAGE, GOOGLE_CREDENTIAL_ERROR_CODE);
}

function logGoogleTokenRejection(reason: GoogleTokenRejectionReason, err: unknown): void {
  logInfo('auth', 'google_token_rejected', {
    reason_code: reason,
    ...(err instanceof GoogleTokenValidationError && err.message.includes('sub') ? {} : {}),
  });
}

function rejectGoogleCredential(
  res: Response,
  status: number,
  reason: GoogleTokenRejectionReason,
  err: unknown,
  useSessionError: boolean,
): undefined {
  logGoogleTokenRejection(reason, err);
  sendRedactedGoogleCredentialError(res, status, useSessionError);
  return undefined;
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
  const useSessionError = Boolean(options.useSessionError);
  const accessHeader = req.get(ctx.googleAccessTokenHeader);
  const googleAccessToken = parseGoogleAccessTokenHeader(accessHeader ?? undefined);
  if (!googleAccessToken) {
    return rejectGoogleCredential(res, 401, 'missing_access_token', null, useSessionError);
  }

  const idHeader = req.get(ctx.googleIdTokenHeader);
  const googleIdToken = parseGoogleAccessTokenHeader(idHeader ?? undefined);
  if (!googleIdToken) {
    return rejectGoogleCredential(res, 401, 'missing_id_token', null, useSessionError);
  }

  let googleIdentity: GooglePrincipalIdentity;
  try {
    if (ctx.testIdTokenVerifier) {
      googleIdentity = await ctx.testIdTokenVerifier.verify(googleIdToken, googleAccessToken);
    } else {
      const verifier = createGoogleIdTokenVerifier(buildIdTokenVerifyOptions(ctx.userTokenConfig));
      googleIdentity = await verifier.verify(googleIdToken, googleAccessToken);
    }
    assertUserTokenBinding(options.bindingMode, options.mcpAuth, googleIdentity);
  } catch (err) {
    const reason = classifyGoogleTokenError(err);
    return rejectGoogleCredential(res, 403, reason, err, useSessionError);
  }

  if (isGoogleIdentityExpired(googleIdentity)) {
    return rejectGoogleCredential(res, 401, 'expired_id_token', null, useSessionError);
  }

  if (options.sessionGoogleIdentity) {
    const expected = googleIdentityKey(options.sessionGoogleIdentity);
    const actual = googleIdentityKey(googleIdentity);
    if (expected !== actual) {
      return rejectGoogleCredential(
        res,
        403,
        'session_identity_mismatch',
        new GoogleTokenValidationError(
          'session_identity_mismatch',
          'Google identity does not match session-bound principal',
        ),
        useSessionError,
      );
    }
  }

  return { googleAccessToken, googleIdentity };
}

export function logGooglePrincipalFingerprint(googleIdentity: GooglePrincipalIdentity): {
  google_principal_fingerprint: string;
} {
  return { google_principal_fingerprint: logFingerprint(googleIdentityKey(googleIdentity)) };
}
