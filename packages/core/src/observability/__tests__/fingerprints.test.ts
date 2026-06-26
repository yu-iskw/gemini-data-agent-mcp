import { describe, expect, it } from 'vitest';

import { logFingerprint } from '../fingerprints.js';

describe('logFingerprint', () => {
  it('returns a stable 16-character hex prefix', () => {
    expect(logFingerprint('session-abc')).toBe(logFingerprint('session-abc'));
    expect(logFingerprint('session-abc')).toHaveLength(16);
    expect(logFingerprint('session-abc')).not.toBe(logFingerprint('session-xyz'));
  });
});
