import { describe, it, expect } from 'vitest';
import { redact, isSensitiveKey, redactServiceAccount, redactHeaders } from '../security/redaction.js';

describe('isSensitiveKey', () => {
  it('detects authorization key', () => {
    expect(isSensitiveKey('authorization')).toBe(true);
    expect(isSensitiveKey('Authorization')).toBe(true);
  });

  it('detects token keys', () => {
    expect(isSensitiveKey('token')).toBe(true);
    expect(isSensitiveKey('access_token')).toBe(true);
    expect(isSensitiveKey('refresh_token')).toBe(true);
    expect(isSensitiveKey('id_token')).toBe(true);
  });

  it('detects secret/password keys', () => {
    expect(isSensitiveKey('secret')).toBe(true);
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('client_secret')).toBe(true);
    expect(isSensitiveKey('private_key')).toBe(true);
    expect(isSensitiveKey('api_key')).toBe(true);
  });

  it('does not flag safe keys', () => {
    expect(isSensitiveKey('project')).toBe(false);
    expect(isSensitiveKey('location')).toBe(false);
    expect(isSensitiveKey('agent')).toBe(false);
    expect(isSensitiveKey('name')).toBe(false);
  });
});

describe('redact', () => {
  it('redacts sensitive keys in flat objects', () => {
    const result = redact({ project: 'my-project', token: 'secret-token' }) as Record<string, unknown>;
    expect(result['project']).toBe('my-project');
    expect(result['token']).toBe('[REDACTED]');
  });

  it('redacts sensitive keys recursively', () => {
    const result = redact({
      outer: {
        inner: {
          access_token: 'abc123',
          name: 'test',
        },
      },
    }) as { outer: { inner: Record<string, unknown> } };
    expect(result.outer.inner['access_token']).toBe('[REDACTED]');
    expect(result.outer.inner['name']).toBe('test');
  });

  it('redacts in arrays', () => {
    const result = redact([{ token: 'abc' }, { name: 'safe' }]) as Array<Record<string, unknown>>;
    expect(result[0]?.['token']).toBe('[REDACTED]');
    expect(result[1]?.['name']).toBe('safe');
  });

  it('returns value unchanged when redaction disabled', () => {
    const obj = { token: 'secret' };
    const result = redact(obj, false) as Record<string, unknown>;
    expect(result['token']).toBe('secret');
  });

  it('handles null and undefined', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});

describe('redactServiceAccount', () => {
  it('returns full email when mode is full', () => {
    const email = 'my-sa@my-project.iam.gserviceaccount.com';
    expect(redactServiceAccount(email, 'full')).toBe(email);
  });

  it('returns REDACTED when mode is hidden', () => {
    expect(redactServiceAccount('my-sa@domain.com', 'hidden')).toBe('[REDACTED]');
  });

  it('partially redacts when mode is partial', () => {
    const result = redactServiceAccount('my-sa@my-project.iam.gserviceaccount.com', 'partial');
    expect(result).toMatch(/^my-\*\*\*/);
    expect(result).toContain('@my-project.iam.gserviceaccount.com');
  });
});

describe('redactHeaders', () => {
  it('redacts authorization header', () => {
    const headers = { Authorization: 'Bearer token123', 'Content-Type': 'application/json' };
    const result = redactHeaders(headers);
    expect(result['Authorization']).toBe('[REDACTED]');
    expect(result['Content-Type']).toBe('application/json');
  });
});
