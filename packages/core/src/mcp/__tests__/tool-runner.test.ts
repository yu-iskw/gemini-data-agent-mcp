import { afterEach, describe, expect, it, vi } from 'vitest';

import * as auditModule from '../../security/audit.js';
import { mockRoleGoogleClients } from '../../testing/mcp-test-helpers.js';
import { DataAgentMcpError } from '../../types.js';
import {
  createServerAuditEmitter,
  executeLocalRfcTool,
  executeRoleGoogleTool,
} from '../tool-runner.js';

import type { GoogleRestRequest } from '../../google/transport.js';
import type { AppConfig } from '../../types.js';

const config: AppConfig = {
  api_version: 'v1beta',
  server: { name: 'test', log_level: 'INFO', transport: 'stdio' },
  security: {
    redaction: {
      enabled: true,
      show_service_account: 'hidden',
      redact_headers: true,
      redact_tokens: true,
      redact_raw_request_body: false,
      redact_raw_response_body: false,
    },
    audit: { enabled: true, include_prompt: false, include_response: false },
    persistence: { enabled: false },
    raw_passthrough: { enabled: false, allowed_methods: [], allowed_path_patterns: [] },
  },
  agents: {
    a: {
      project: 'p1',
      location: 'global',
      api_version: 'v1beta',
      data_agent: 'projects/p1/locations/global/dataAgents/a1',
      auth: { mode: 'adc' },
      tools: ['query_data_agent'],
    },
  },
};

describe('createServerAuditEmitter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates to emitAuditEvent with the server field', () => {
    const emitSpy = vi.spyOn(auditModule, 'emitAuditEvent').mockImplementation(() => undefined);
    const emit = createServerAuditEmitter('admin', config.security);

    emit({
      event: 'mcp_tool_invocation',
      tool: 'data_agents.list',
      agent: 'a',
      api_version: 'v1beta',
      auth_mode: 'adc',
      latency_ms: 1,
      success: true,
      operation_kind: 'read',
    });

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ server: 'admin', tool: 'data_agents.list' }),
      config.security,
    );
  });
});

describe('executeLocalRfcTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a success envelope and emits audit on success', async () => {
    const emitSpy = vi.spyOn(auditModule, 'emitAuditEvent').mockImplementation(() => undefined);
    const emit = createServerAuditEmitter('admin', config.security);

    const result = await executeLocalRfcTool(config, emit, {
      toolName: 'inspect_admin_auth',
      operationKind: 'read',
      agent: 'a',
      authMode: 'adc',
      run: async () => ({ ok: true }),
    });

    expect(result.structuredContent.ok).toBe(true);
    expect(result.structuredContent.data).toEqual({ ok: true });
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, tool: 'inspect_admin_auth' }),
      config.security,
    );
  });

  it('returns an error envelope and emits failure audit on throw', async () => {
    const emitSpy = vi.spyOn(auditModule, 'emitAuditEvent').mockImplementation(() => undefined);
    const emit = createServerAuditEmitter('admin', config.security);

    const result = await executeLocalRfcTool(config, emit, {
      toolName: 'inspect_admin_auth',
      operationKind: 'read',
      run: async () => {
        throw new DataAgentMcpError('VALIDATION_ERROR', 'bad input', false);
      },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.error?.code).toBe('VALIDATION_ERROR');
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error_code: 'VALIDATION_ERROR' }),
      config.security,
    );
  });
});

describe('executeRoleGoogleTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs with injected fake transport clients on success', async () => {
    mockRoleGoogleClients((request: GoogleRestRequest) => {
      expect(request.method).toBe('GET');
      expect(request.path).toBe('v1beta/projects/p1/locations/global/dataAgents/a1');
      return { name: 'projects/p1/locations/global/dataAgents/a1' };
    });

    const emitSpy = vi.spyOn(auditModule, 'emitAuditEvent').mockImplementation(() => undefined);
    const emit = createServerAuditEmitter('admin', config.security);

    const result = await executeRoleGoogleTool(config, emit, {
      toolName: 'data_agents.get',
      args: { agent: 'a' },
      operationKind: 'read',
      run: async (ctx) => ctx.clients.dataAgents.get({ name: config.agents.a.data_agent }),
    });

    expect(result.structuredContent.ok).toBe(true);
    expect(result.structuredContent.data).toMatchObject({
      name: 'projects/p1/locations/global/dataAgents/a1',
    });
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, agent: 'a', auth_mode: 'adc' }),
      config.security,
    );
  });

  it('returns an error envelope when the Google client throws', async () => {
    mockRoleGoogleClients(() => {
      throw new DataAgentMcpError('NOT_FOUND', 'agent missing', false, { googleStatus: 404 });
    });

    const emitSpy = vi.spyOn(auditModule, 'emitAuditEvent').mockImplementation(() => undefined);
    const emit = createServerAuditEmitter('admin', config.security);

    const result = await executeRoleGoogleTool(config, emit, {
      toolName: 'data_agents.get',
      args: { agent: 'a' },
      operationKind: 'read',
      run: async (ctx) => ctx.clients.dataAgents.get({ name: config.agents.a.data_agent }),
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.error).toMatchObject({
      code: 'NOT_FOUND',
      googleStatus: 404,
    });
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error_code: 'NOT_FOUND' }),
      config.security,
    );
  });
});
