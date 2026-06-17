import { logInfo } from '../observability/logging.js';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export interface SessionRecord {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  principalId?: string;
  lastAccessAt: number;
}

interface SessionManagerOptions {
  maxSessions: number;
  idleTtlMs: number;
  maxSessionsPerPrincipal: number;
  sweepIntervalMs?: number;
}

export type SessionCreateResult =
  | { ok: true }
  | { ok: false; reason: 'global_limit' | 'principal_limit' };

export interface SessionManager {
  canAcceptSession(principalId?: string): SessionCreateResult;
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

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const sessions = new Map<string, SessionRecord>();
  const principalCounts = new Map<string, number>();
  let sweeper: ReturnType<typeof setInterval> | undefined;

  function decrementPrincipal(principalId: string | undefined): void {
    if (!principalId) {
      return;
    }
    const count = principalCounts.get(principalId) ?? 0;
    if (count <= 1) {
      principalCounts.delete(principalId);
    } else {
      principalCounts.set(principalId, count - 1);
    }
  }

  async function closeRecord(sessionId: string, record: SessionRecord): Promise<void> {
    sessions.delete(sessionId);
    decrementPrincipal(record.principalId);
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

  return {
    canAcceptSession(principalId): SessionCreateResult {
      if (sessions.size >= options.maxSessions) {
        return { ok: false, reason: 'global_limit' };
      }
      if (principalId) {
        const principalCount = principalCounts.get(principalId) ?? 0;
        if (principalCount >= options.maxSessionsPerPrincipal) {
          return { ok: false, reason: 'principal_limit' };
        }
      }
      return { ok: true };
    },

    register(sessionId, record): void {
      if (record.principalId) {
        const principalCount = principalCounts.get(record.principalId) ?? 0;
        principalCounts.set(record.principalId, principalCount + 1);
      }

      sessions.set(sessionId, { ...record, lastAccessAt: Date.now() });
      logInfo('transport', 'session_created', {
        session_id: sessionId,
        principal_id: record.principalId,
        sessions_active: sessions.size,
      });
    },

    get(sessionId) {
      return sessions.get(sessionId);
    },

    touch(sessionId) {
      const record = sessions.get(sessionId);
      if (record) {
        record.lastAccessAt = Date.now();
      }
    },

    async remove(sessionId) {
      const record = sessions.get(sessionId);
      if (!record) {
        return;
      }
      await closeRecord(sessionId, record);
    },

    async closeAll() {
      const ids = [...sessions.keys()];
      const errors: unknown[] = [];
      for (const sessionId of ids) {
        const record = sessions.get(sessionId);
        if (!record) {
          continue;
        }
        try {
          await closeRecord(sessionId, record);
        } catch (err) {
          errors.push(err);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Failed to close one or more MCP sessions');
      }
    },

    activeCount() {
      return sessions.size;
    },

    evictIdle() {
      const now = Date.now();
      let evicted = 0;
      for (const [sessionId, record] of sessions) {
        if (now - record.lastAccessAt > options.idleTtlMs) {
          void closeRecord(sessionId, record).then(() => {
            logInfo('transport', 'session_expired', {
              session_id: sessionId,
              sessions_active: sessions.size,
            });
          });
          evicted += 1;
        }
      }
      if (evicted > 0) {
        logInfo('transport', 'sessions_evicted', {
          count: evicted,
          sessions_active: sessions.size,
        });
      }
      return evicted;
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
