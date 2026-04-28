import { DEFAULT_LOG_LEVEL } from './log-level.js';

import type { LogLevel } from './log-level.js';

let currentLogLevel: LogLevel = DEFAULT_LOG_LEVEL;

const LOG_LEVEL_ORDER = new Map<LogLevel, number>([
  ['DEBUG', 0],
  ['INFO', 1],
  ['WARN', 2],
  ['ERROR', 3],
]);

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

export function structuredLog(
  level: LogLevel,
  component: string,
  data: Record<string, unknown>,
): void {
  if ((LOG_LEVEL_ORDER.get(level) ?? 0) < (LOG_LEVEL_ORDER.get(currentLogLevel) ?? 0)) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    ...data,
  };

  const line = JSON.stringify(entry);

  if (level === 'ERROR' || level === 'WARN') {
    process.stderr.write(line + '\n');
  } else {
    process.stderr.write(line + '\n');
  }
}

export function logInfo(component: string, message: string, extra?: Record<string, unknown>): void {
  structuredLog('INFO', component, { message, ...extra });
}

export function logWarn(component: string, message: string, extra?: Record<string, unknown>): void {
  structuredLog('WARN', component, { message, ...extra });
}

export function logError(
  component: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  structuredLog('ERROR', component, { message, ...extra });
}

export function logDebug(
  component: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  structuredLog('DEBUG', component, { message, ...extra });
}
