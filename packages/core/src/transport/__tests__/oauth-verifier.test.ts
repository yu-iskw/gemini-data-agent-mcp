import { describe, expect, it } from 'vitest';

import { parseScopeClaims } from '../oauth.js';

describe('parseScopeClaims', () => {
  it('parses space-delimited scope claim', () => {
    expect(parseScopeClaims({ scope: 'read write' }, ['scope'])).toEqual(['read', 'write']);
  });

  it('parses scp array claim when configured', () => {
    expect(parseScopeClaims({ scp: ['read', 'admin'] }, ['scp'])).toEqual(['read', 'admin']);
  });

  it('merges configured scope claim sources', () => {
    expect(parseScopeClaims({ scope: 'read', scp: ['admin'] }, ['scope', 'scp'])).toEqual([
      'read',
      'admin',
    ]);
  });
});
