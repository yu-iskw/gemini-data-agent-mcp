export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export const DEFAULT_LOG_LEVEL: LogLevel = 'INFO';

export function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.some((level) => level === value);
}

export function parseLogLevel(value: string): LogLevel {
  const normalized = value.toUpperCase();
  if (isLogLevel(normalized)) {
    return normalized;
  }

  throw new Error(`Invalid log level "${value}". Allowed values: ${LOG_LEVELS.join(', ')}`);
}
