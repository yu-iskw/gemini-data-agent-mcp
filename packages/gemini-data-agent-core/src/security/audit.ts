import { structuredLog } from '../observability/logging.js';

import { redactServiceAccount } from './redaction.js';

import type { AuditEvent, SecurityConfig } from '../types.js';

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

  if (event.session_id !== undefined) {
    entry['session_id'] = event.session_id;
  }
  if (event.tenant_id !== undefined) {
    entry['tenant_id'] = event.tenant_id;
  }
  if (event.user_id !== undefined) {
    entry['user_id'] = event.user_id;
  }
  if (event.workspace_id !== undefined) {
    entry['workspace_id'] = event.workspace_id;
  }
  if (event.client_name !== undefined) {
    entry['client_name'] = event.client_name;
  }
  if (event.intent_from !== undefined) {
    entry['intent_from'] = event.intent_from;
  }
  if (event.intent_to !== undefined) {
    entry['intent_to'] = event.intent_to;
  }
  if (event.revision !== undefined) {
    entry['revision'] = event.revision;
  }

  if (event.error_code) {
    entry['error_code'] = event.error_code;
    entry['error_category'] = event.error_category;
  }

  if (event.impersonate_service_account && redactionConfig.enabled) {
    entry['impersonate_service_account'] = redactServiceAccount(
      event.impersonate_service_account,
      redactionConfig.show_service_account,
    );
  } else if (event.impersonate_service_account) {
    entry['impersonate_service_account'] = event.impersonate_service_account;
  }

  structuredLog('INFO', 'audit', entry);
}

export function createAuditStartTime(): number {
  return Date.now();
}

export function calculateLatency(startTime: number): number {
  return Date.now() - startTime;
}
