import { structuredLog } from '../observability/logging.js';
import { redactServiceAccount } from './redaction.js';

import type { AuditEvent } from '../types.js';
import type { SecurityConfig } from '../types.js';

export function emitAuditEvent(event: AuditEvent, security: SecurityConfig): void {
  if (!security.audit.enabled) return;

  const redactionConfig = security.redaction;
  const entry: Record<string, unknown> = {
    event: event.event,
    tool: event.tool,
    agent: event.agent,
    api_version: event.api_version,
    auth_mode: event.auth_mode,
    latency_ms: event.latency_ms,
    success: event.success,
  };

  if (event.operation_name !== undefined) {
    entry['operation_name'] = event.operation_name;
  }

  if (event.error_code) {
    entry['error_code'] = event.error_code;
    entry['error_category'] = event.error_category;
  }

  if (event.target_service_account && redactionConfig.enabled) {
    entry['target_service_account'] = redactServiceAccount(
      event.target_service_account,
      redactionConfig.show_service_account,
    );
  } else if (event.target_service_account) {
    entry['target_service_account'] = event.target_service_account;
  }

  structuredLog('INFO', 'audit', entry);
}

export function createAuditStartTime(): number {
  return Date.now();
}

export function calculateLatency(startTime: number): number {
  return Date.now() - startTime;
}
