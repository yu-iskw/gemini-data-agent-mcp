import { randomUUID } from 'node:crypto';

import { type GooglePrincipalIdentity } from '../auth/google-identity.js';
import { logFingerprint } from '../observability/fingerprints.js';
import { logInfo } from '../observability/logging.js';

import { logGooglePrincipalFingerprint } from './user-token-middleware.js';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export interface SessionRecord {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  principalId?: string;
  googleIdentity?: GooglePrincipalIdentity;
  lastAccessAt: number;
}

interface SessionManagerOptions {
  maxSessions: number;
  idleTtlMs: number;
  maxSessionsPerPrincipal: number;
  sweepIntervalMs?: number;
}

export type SessionReservationResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'global_limit' | 'principal_limit' };

export interface SessionManager {
  reserve(principalId?: string): SessionReservationResult;
  commit(token: string, sessionId: string, record: Omit<SessionRecord, 'lastAccessAt'>): void;
  release(token: string): void;
  register(sessionId: string, record: Omit<SessionRecord, 'lastAccessAt'>): void;
  get(sessionId: string): SessionRecord | undefined;
  touch(sessionId: string): void;
  remove(sessionId: string): Promise<void>;
  closeAll(): Promise<void>;
  activeCount(): number;
  evictIdle(): number;
  startSweeper(): void;
  stopSweeper(): void;
}

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

interface SessionManagerState {
  sessions: Map<string, SessionRecord>;
  principalCounts: Map<string, number>;
  reservations: Map<string, string | undefined>;
  pendingGlobal: number;
  pendingPerPrincipal: Map<string, number>;
}

async function closeSessionRecord(
  state: SessionManagerState,
  sessionId: string,
  record: SessionRecord,
): Promise<void> {
  state.sessions.delete(sessionId);
  decrementMapCount(state.principalCounts, record.principalId);
  try {
    await record.transport.close?.();
  } catch {
    // Transport may already be closed.
  }
  try {
    await record.server.close();
  } catch {
    // Server close is best-effort during eviction.
  }
}

function decrementMapCount(map: Map<string, number>, key: string | undefined): void {
  if (!key) {
    return;
  }
  const count = map.get(key) ?? 0;
  if (count <= 1) {
    map.delete(key);
  } else {
    map.set(key, count - 1);
  }
}

function evictIdleSessions(state: SessionManagerState, idleTtlMs: number): number {
  const now = Date.now();
  let evicted = 0;
  for (const [sessionId, record] of state.sessions) {
    if (now - record.lastAccessAt > idleTtlMs) {
      void closeSessionRecord(state, sessionId, record).then(() => {
        logInfo('transport', 'session_expired', {
          session_fingerprint: logFingerprint(sessionId),
          sessions_active: state.sessions.size,
        });
      });
      evicted += 1;
    }
  }
  if (evicted > 0) {
    logInfo('transport', 'sessions_evicted', {
      count: evicted,
      sessions_active: state.sessions.size,
    });
  }
  return evicted;
}

function registerSessionRecord(
  state: SessionManagerState,
  sessionId: string,
  record: Omit<SessionRecord, 'lastAccessAt'>,
): void {
  if (record.principalId) {
    const principalCount = state.principalCounts.get(record.principalId) ?? 0;
    state.principalCounts.set(record.principalId, principalCount + 1);
  }

  state.sessions.set(sessionId, { ...record, lastAccessAt: Date.now() });
  logInfo('transport', 'session_created', {
    session_fingerprint: logFingerprint(sessionId),
    ...(record.principalId ? { principal_fingerprint: logFingerprint(record.principalId) } : {}),
    ...(record.googleIdentity ? logGooglePrincipalFingerprint(record.googleIdentity) : {}),
    sessions_active: state.sessions.size,
  });
}

async function closeAllSessionRecords(state: SessionManagerState): Promise<void> {
  const ids = [...state.sessions.keys()];
  const errors: unknown[] = [];
  for (const sessionId of ids) {
    const record = state.sessions.get(sessionId);
    if (!record) {
      continue;
    }
    try {
      await closeSessionRecord(state, sessionId, record);
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to close one or more MCP sessions');
  }
}

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const state: SessionManagerState = {
    sessions: new Map(),
    principalCounts: new Map(),
    reservations: new Map(),
    pendingGlobal: 0,
    pendingPerPrincipal: new Map(),
  };
  let sweeper: ReturnType<typeof setInterval> | undefined;

  function effectiveGlobalCount(): number {
    return state.sessions.size + state.pendingGlobal;
  }

  function effectivePrincipalCount(principalId: string): number {
    const active = state.principalCounts.get(principalId) ?? 0;
    const pending = state.pendingPerPrincipal.get(principalId) ?? 0;
    return active + pending;
  }

  function incrementPending(principalId?: string): string {
    const token = randomUUID();
    state.pendingGlobal += 1;
    if (principalId) {
      state.pendingPerPrincipal.set(
        principalId,
        (state.pendingPerPrincipal.get(principalId) ?? 0) + 1,
      );
    }
    state.reservations.set(token, principalId);
    return token;
  }

  function decrementPending(principalId?: string): void {
    state.pendingGlobal = Math.max(0, state.pendingGlobal - 1);
    decrementMapCount(state.pendingPerPrincipal, principalId);
  }

  function isAtCapacity(principalId?: string): SessionReservationResult | undefined {
    if (effectiveGlobalCount() >= options.maxSessions) {
      return { ok: false, reason: 'global_limit' };
    }
    if (principalId && effectivePrincipalCount(principalId) >= options.maxSessionsPerPrincipal) {
      return { ok: false, reason: 'principal_limit' };
    }
    return undefined;
  }

  return {
    reserve(principalId): SessionReservationResult {
      const rejection = isAtCapacity(principalId);
      if (rejection) {
        return rejection;
      }
      return { ok: true, token: incrementPending(principalId) };
    },

    commit(token, sessionId, record): void {
      const principalId = state.reservations.get(token);
      if (principalId === undefined && !state.reservations.has(token)) {
        throw new Error('Invalid or expired session reservation token');
      }
      state.reservations.delete(token);
      decrementPending(principalId);
      registerSessionRecord(state, sessionId, record);
    },

    release(token): void {
      const principalId = state.reservations.get(token);
      if (principalId === undefined && !state.reservations.has(token)) {
        return;
      }
      state.reservations.delete(token);
      decrementPending(principalId);
    },

    register(sessionId, record): void {
      registerSessionRecord(state, sessionId, record);
    },

    get(sessionId) {
      return state.sessions.get(sessionId);
    },

    touch(sessionId) {
      const record = state.sessions.get(sessionId);
      if (record) {
        record.lastAccessAt = Date.now();
      }
    },

    async remove(sessionId) {
      const record = state.sessions.get(sessionId);
      if (!record) {
        return;
      }
      await closeSessionRecord(state, sessionId, record);
    },

    async closeAll() {
      await closeAllSessionRecords(state);
    },

    activeCount() {
      return state.sessions.size;
    },

    evictIdle() {
      return evictIdleSessions(state, options.idleTtlMs);
    },

    startSweeper() {
      if (sweeper) {
        return;
      }
      sweeper = setInterval(() => {
        this.evictIdle();
      }, options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);
    },

    stopSweeper() {
      if (sweeper) {
        clearInterval(sweeper);
        sweeper = undefined;
      }
    },
  };
}
