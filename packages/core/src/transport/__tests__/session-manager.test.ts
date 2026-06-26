import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSessionManager } from '../session-manager.js';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

function createMockRecord(principalId?: string): {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  principalId?: string;
} {
  return {
    transport: {
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as StreamableHTTPServerTransport,
    server: { close: vi.fn().mockResolvedValue(undefined) } as unknown as McpServer,
    principalId,
  };
}

describe('createSessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects sessions when global cap is exceeded', () => {
    const manager = createSessionManager({
      maxSessions: 1,
      idleTtlMs: 60_000,
      maxSessionsPerPrincipal: 10,
    });

    manager.register('session-1', createMockRecord('user-a'));
    const result = manager.reserve('user-b');

    expect(result).toEqual({ ok: false, reason: 'global_limit' });
    expect(manager.activeCount()).toBe(1);
  });

  it('rejects sessions when per-principal cap is exceeded', () => {
    const manager = createSessionManager({
      maxSessions: 10,
      idleTtlMs: 60_000,
      maxSessionsPerPrincipal: 1,
    });

    manager.register('session-1', createMockRecord('user-a'));
    const result = manager.reserve('user-a');

    expect(result).toEqual({ ok: false, reason: 'principal_limit' });
  });

  it('allows only one concurrent reservation when global cap is 1', () => {
    const manager = createSessionManager({
      maxSessions: 1,
      idleTtlMs: 60_000,
      maxSessionsPerPrincipal: 10,
    });

    const first = manager.reserve('user-a');
    const second = manager.reserve('user-b');

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: 'global_limit' });

    if (first.ok) {
      manager.release(first.token);
    }
  });

  it('commits a reservation into an active session', () => {
    const manager = createSessionManager({
      maxSessions: 10,
      idleTtlMs: 60_000,
      maxSessionsPerPrincipal: 10,
    });

    const reservation = manager.reserve('user-a');
    expect(reservation.ok).toBe(true);
    if (!reservation.ok) {
      return;
    }

    manager.commit(reservation.token, 'session-1', createMockRecord('user-a'));
    expect(manager.activeCount()).toBe(1);
    expect(manager.get('session-1')).toBeDefined();
  });

  it('evicts idle sessions after TTL', async () => {
    const manager = createSessionManager({
      maxSessions: 10,
      idleTtlMs: 1_000,
      maxSessionsPerPrincipal: 10,
    });

    const record = createMockRecord();
    manager.register('session-1', record);
    expect(manager.activeCount()).toBe(1);

    vi.advanceTimersByTime(1_500);
    manager.evictIdle();

    await vi.runAllTimersAsync();
    expect(manager.activeCount()).toBe(0);
  });

  it('closeAll removes every active session', async () => {
    const manager = createSessionManager({
      maxSessions: 10,
      idleTtlMs: 60_000,
      maxSessionsPerPrincipal: 10,
    });

    manager.register('session-1', createMockRecord('user-a'));
    manager.register('session-2', createMockRecord('user-b'));
    expect(manager.activeCount()).toBe(2);

    await manager.closeAll();
    expect(manager.activeCount()).toBe(0);
  });
});
