export type GoogleTokenRejectionReason =
  | 'missing_access_token'
  | 'missing_id_token'
  | 'invalid_id_token'
  | 'expired_id_token'
  | 'audience_mismatch'
  | 'issuer_mismatch'
  | 'hosted_domain_mismatch'
  | 'at_hash_mismatch'
  | 'binding_mismatch'
  | 'session_identity_mismatch'
  | 'unknown';

export class GoogleTokenValidationError extends Error {
  readonly reason: GoogleTokenRejectionReason;

  constructor(reason: GoogleTokenRejectionReason, message: string) {
    super(message);
    this.name = 'GoogleTokenValidationError';
    this.reason = reason;
  }
}

export const GOOGLE_CREDENTIAL_CLIENT_MESSAGE = 'Invalid or unauthorized Google credential';

export function classifyGoogleTokenError(err: unknown): GoogleTokenRejectionReason {
  if (err instanceof GoogleTokenValidationError) {
    return err.reason;
  }
  if (!(err instanceof Error)) {
    return 'unknown';
  }
  const message = err.message.toLowerCase();
  if (message.includes('at_hash')) {
    return 'at_hash_mismatch';
  }
  if (message.includes('issuer')) {
    return 'issuer_mismatch';
  }
  if (message.includes('audience') || message.includes('aud')) {
    return 'audience_mismatch';
  }
  if (message.includes('hosted domain') || message.includes(' hd ')) {
    return 'hosted_domain_mismatch';
  }
  if (message.includes('subject') && message.includes('match')) {
    return 'binding_mismatch';
  }
  if (message.includes('expired') || message.includes('exp')) {
    return 'expired_id_token';
  }
  if (message.includes('identity does not match session')) {
    return 'session_identity_mismatch';
  }
  return 'invalid_id_token';
}
