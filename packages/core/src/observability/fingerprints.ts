import { createHash } from 'node:crypto';

/** One-way truncated SHA-256 fingerprint for log correlation without exposing raw IDs. */
export function logFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
