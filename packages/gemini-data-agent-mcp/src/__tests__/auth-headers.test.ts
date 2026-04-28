import { describe, it, expect } from 'vitest';

import { getHeaderValue, normalizeHeaders } from '../auth/headers.js';

describe('normalizeHeaders', () => {
  it('returns plain header objects unchanged', () => {
    const headers = { Authorization: 'Bearer token' };
    expect(normalizeHeaders(headers)).toEqual(headers);
  });

  it('converts Headers to plain objects', () => {
    const headers = new Headers({
      Authorization: 'Bearer token',
      'content-type': 'application/json',
    });

    expect(normalizeHeaders(headers)).toEqual({
      authorization: 'Bearer token',
      'content-type': 'application/json',
    });
  });
});

describe('getHeaderValue', () => {
  it('returns values from Headers instances', () => {
    const headers = new Headers({ Authorization: 'Bearer token' });
    expect(getHeaderValue(headers, 'Authorization')).toBe('Bearer token');
  });

  it('returns values from lowercase plain objects', () => {
    const headers = { authorization: 'Bearer token' };
    expect(getHeaderValue(headers, 'Authorization')).toBe('Bearer token');
  });
});
