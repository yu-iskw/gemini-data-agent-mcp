import { describe, expect, it } from 'vitest';

import { parseGoogleApiError } from '../errors.js';

const agent = 'test-agent';
const apiVersion = 'v1beta';

describe('parseGoogleApiError', () => {
  it('uses the API error message when present', () => {
    const err = parseGoogleApiError(
      403,
      { error: { message: 'Access denied', status: 'PERMISSION_DENIED' } },
      agent,
      apiVersion,
    );
    expect(err.message).toBe('Access denied');
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.retryable).toBe(false);
    expect(err.details).toMatchObject({
      agent,
      api_version: apiVersion,
      http_status: 403,
      api_status: 'PERMISSION_DENIED',
    });
  });

  it('falls back to a generic HTTP message when the body has no error message', () => {
    const err = parseGoogleApiError(418, {}, agent, apiVersion);
    expect(err.message).toBe('Google API request failed with HTTP 418');
    expect(err.code).toBe('GOOGLE_API_ERROR');
    expect(err.retryable).toBe(false);
  });

  it.each([
    { status: 401, apiStatus: undefined, code: 'AUTH_FAILED', retryable: false },
    { status: 403, apiStatus: undefined, code: 'PERMISSION_DENIED', retryable: false },
    { status: 400, apiStatus: undefined, code: 'INVALID_REQUEST', retryable: false },
    { status: 404, apiStatus: undefined, code: 'NOT_FOUND', retryable: false },
    { status: 429, apiStatus: undefined, code: 'RATE_LIMITED', retryable: true },
    { status: 500, apiStatus: undefined, code: 'GOOGLE_API_ERROR', retryable: true },
    { status: 503, apiStatus: undefined, code: 'GOOGLE_API_ERROR', retryable: true },
    { status: 418, apiStatus: undefined, code: 'GOOGLE_API_ERROR', retryable: false },
  ])(
    'maps HTTP $status to $code (retryable=$retryable)',
    ({ status, apiStatus, code, retryable }) => {
      const err = parseGoogleApiError(
        status,
        apiStatus ? { error: { status: apiStatus, message: 'api failure' } } : {},
        agent,
        apiVersion,
      );
      expect(err.code).toBe(code);
      expect(err.retryable).toBe(retryable);
    },
  );

  it.each([
    { status: 200, apiStatus: 'UNAUTHENTICATED', code: 'AUTH_FAILED' },
    { status: 200, apiStatus: 'PERMISSION_DENIED', code: 'PERMISSION_DENIED' },
    { status: 200, apiStatus: 'INVALID_ARGUMENT', code: 'INVALID_REQUEST' },
    { status: 200, apiStatus: 'NOT_FOUND', code: 'NOT_FOUND' },
    { status: 200, apiStatus: 'RESOURCE_EXHAUSTED', code: 'RATE_LIMITED' },
  ])('maps api status $apiStatus to $code', ({ status, apiStatus, code }) => {
    const err = parseGoogleApiError(
      status,
      { error: { status: apiStatus, message: 'status-driven failure' } },
      agent,
      apiVersion,
    );
    expect(err.code).toBe(code);
  });
});
