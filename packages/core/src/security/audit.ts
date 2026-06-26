import { structuredLog } from '../observability/logging.js';

import { redactServiceAccount } from './redaction.js';

import type { AuditEvent, RedactionConfig, SecurityConfig } from '../types.js';

function buildRfcAuditFields(event: AuditEvent): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (event.operation_name !== undefined) {
    fields['operation_name'] = event.operation_name;
  }
  if (event.server !== undefined) {
    fields['server'] = event.server;
  }
  if (event.operation_kind !== undefined) {
    fields['operation_kind'] = event.operation_kind;
  }
  if (event.project !== undefined) {
    fields['project'] = event.project;
  }
  if (event.location !== undefined) {
    fields['location'] = event.location;
  }
  if (event.resource_name !== undefined) {
    fields['resource_name'] = event.resource_name;
  }
  if (event.google_request_id !== undefined) {
    fields['google_request_id'] = event.google_request_id;
  }

  return fields;
}

function buildContextAuditFields(event: AuditEvent): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (event.session_id !== undefined) {
    fields['session_id'] = event.session_id;
  }
  if (event.tenant_id !== undefined) {
    fields['tenant_id'] = event.tenant_id;
  }
  if (event.user_id !== undefined) {
    fields['user_id'] = event.user_id;
  }
  if (event.workspace_id !== undefined) {
    fields['workspace_id'] = event.workspace_id;
  }
  if (event.client_name !== undefined) {
    fields['client_name'] = event.client_name;
  }
  if (event.intent_from !== undefined) {
    fields['intent_from'] = event.intent_from;
  }
  if (event.intent_to !== undefined) {
    fields['intent_to'] = event.intent_to;
  }
  if (event.revision !== undefined) {
    fields['revision'] = event.revision;
  }

  return fields;
}

function assignErrorFields(entry: Record<string, unknown>, event: AuditEvent): void {
  if (!event.error_code) return;

  entry['error_code'] = event.error_code;
  entry['error_category'] = event.error_category;
}

function assignImpersonationField(
  entry: Record<string, unknown>,
  event: AuditEvent,
  redactionConfig: RedactionConfig,
): void {
  if (!event.impersonate_service_account) return;

  entry['impersonate_service_account'] = redactionConfig.enabled
    ? redactServiceAccount(event.impersonate_service_account, redactionConfig.show_service_account)
    : event.impersonate_service_account;
}

export function emitAuditEvent(event: AuditEvent, security: SecurityConfig): void {
  if (!security.audit.enabled) return;

  const entry: Record<string, unknown> = {
    event: event.event,
    tool: event.tool,
    agent: event.agent,
    api_version: event.api_version,
    auth_mode: event.auth_mode,
    latency_ms: event.latency_ms,
    success: event.success,
    ...buildRfcAuditFields(event),
    ...buildContextAuditFields(event),
  };

  assignErrorFields(entry, event);
  assignImpersonationField(entry, event, security.redaction);

  structuredLog('INFO', 'audit', entry);
}

export function createAuditStartTime(): number {
  return Date.now();
}

export function calculateLatency(startTime: number): number {
  return Date.now() - startTime;
}
