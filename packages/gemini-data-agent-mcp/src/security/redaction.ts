const REDACTED_PLACEHOLDER = '[REDACTED]';

const SENSITIVE_KEY_PATTERNS = [
  /^authorization$/i,
  /^token$/i,
  /^refresh_token$/i,
  /^access_token$/i,
  /^id_token$/i,
  /^api_key$/i,
  /^secret$/i,
  /^password$/i,
  /^credential$/i,
  /^private_key$/i,
  /^client_secret$/i,
  /token$/i,
  /secret$/i,
  /password$/i,
  /credential$/i,
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function redact(value: unknown, redactEnabled = true): unknown {
  if (!redactEnabled) return value;
  return redactValue(value);
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (typeof value === 'object') return redactObject(value as Record<string, unknown>);
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED_PLACEHOLDER;
    } else {
      result[key] = redactValue(val);
    }
  }
  return result;
}

export function redactServiceAccount(
  email: string,
  showMode: 'full' | 'partial' | 'hidden',
): string {
  if (showMode === 'full') return email;
  if (showMode === 'hidden') return REDACTED_PLACEHOLDER;

  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return REDACTED_PLACEHOLDER;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visibleChars = Math.min(3, localPart.length);
  return `${localPart.slice(0, visibleChars)}***${domain}`;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED_PLACEHOLDER;
    } else {
      result[key] = val;
    }
  }
  return result;
}
