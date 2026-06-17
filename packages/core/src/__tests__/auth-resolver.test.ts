import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  parseGoogleAccessTokenHeader,
  runWithAuthRequestContextAsync,
} from '../auth/request-context.js';
import { clearCredentialCache, resolveCredentials } from '../auth/resolver.js';
import { DataAgentMcpError } from '../types.js';

import type * as GoogleAuthLibrary from 'google-auth-library';

vi.mock('google-auth-library', async (importOriginal) => {
  const actual = await importOriginal<typeof GoogleAuthLibrary>();
  const mockHeaders = { Authorization: 'Bearer mock-token' };
  const mockClient = {
    getRequestHeaders: vi.fn().mockResolvedValue(mockHeaders),
  };
  const mockImpersonatedHeaders = { Authorization: 'Bearer impersonated-token' };
  return {
    ...actual,
    // Use function() so it can be used as a constructor
    GoogleAuth: vi.fn().mockImplementation(function () {
      return {
        getClient: vi.fn().mockResolvedValue(mockClient),
      };
    }),
    Impersonated: vi.fn().mockImplementation(function () {
      return {
        getRequestHeaders: vi.fn().mockResolvedValue(mockImpersonatedHeaders),
      };
    }),
  };
});

describe('resolveCredentials', () => {
  beforeEach(() => {
    clearCredentialCache();
    vi.clearAllMocks();
  });

  it('resolves ADC credentials', async () => {
    const creds = await resolveCredentials({ mode: 'adc' });
    const headers = await creds.getRequestHeaders();
    expect(headers['Authorization']).toBe('Bearer mock-token');
  });

  it('resolves impersonation credentials', async () => {
    const creds = await resolveCredentials({
      mode: 'impersonation',
      impersonate_service_account: 'sa@project.iam.gserviceaccount.com',
    });
    const headers = await creds.getRequestHeaders();
    expect(headers['Authorization']).toBe('Bearer impersonated-token');
  });

  it('throws for impersonation without impersonate_service_account', async () => {
    await expect(resolveCredentials({ mode: 'impersonation' })).rejects.toThrow(DataAgentMcpError);
  });

  it('throws for unknown auth mode', async () => {
    await expect(resolveCredentials({ mode: 'unknown' as never })).rejects.toThrow(
      DataAgentMcpError,
    );
  });

  it('rejects removed workload_identity auth mode', async () => {
    await expect(resolveCredentials({ mode: 'workload_identity' as never })).rejects.toThrow(
      DataAgentMcpError,
    );
  });

  it('resolves user_token from AsyncLocalStorage context', async () => {
    const creds = await runWithAuthRequestContextAsync(
      { googleAccessToken: 'user-google-token' },
      () => resolveCredentials({ mode: 'user_token' }),
    );
    const headers = await creds.getRequestHeaders();
    expect(headers.Authorization).toBe('Bearer user-google-token');
  });

  it('throws AUTH_MISSING_USER_TOKEN when context has no token', async () => {
    await expect(resolveCredentials({ mode: 'user_token' })).rejects.toMatchObject({
      code: 'AUTH_MISSING_USER_TOKEN',
    });
  });
});

describe('parseGoogleAccessTokenHeader', () => {
  it('strips Bearer prefix', () => {
    expect(parseGoogleAccessTokenHeader('Bearer abc.def')).toBe('abc.def');
  });

  it('returns undefined for empty values', () => {
    expect(parseGoogleAccessTokenHeader(undefined)).toBeUndefined();
    expect(parseGoogleAccessTokenHeader('')).toBeUndefined();
    expect(parseGoogleAccessTokenHeader('   ')).toBeUndefined();
  });
});
