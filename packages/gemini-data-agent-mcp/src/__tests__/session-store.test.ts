import { describe, expect, it } from 'vitest';

import { InMemorySessionStore, SessionConflictError } from '../session/store.js';

describe('InMemorySessionStore', () => {
  it('supports cross-client session continuity and intent transitions', () => {
    const store = new InMemorySessionStore();

    const created = store.createSession({
      session_id: 'sess-a',
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        client_name: 'claude-code',
      },
      agent: 'jaffle-shop',
      conversation_name: 'projects/p/locations/global/conversations/conv-1',
      intent: 'explore',
      request_id: 'req-1',
    });
    expect(created.revision).toBe(1);

    const afterChat = store.appendChatTurn({
      session_id: created.session_id,
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        client_name: 'codex',
      },
      expected_revision: 1,
      prompt: 'How many customers are there?',
      response_summary: 'There are 100 customers.',
    });
    expect(afterChat.revision).toBe(2);

    const afterIntent = store.switchIntent({
      session_id: created.session_id,
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        client_name: 'cursor',
      },
      expected_revision: 2,
      target_intent: 'report',
      reason: 'Prepare executive summary',
    });
    expect(afterIntent.intent).toBe('report');
    expect(afterIntent.revision).toBe(3);
  });

  it('raises conflict when expected_revision is stale', () => {
    const store = new InMemorySessionStore();
    store.createSession({
      session_id: 'sess-b',
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        client_name: 'claude-code',
      },
      agent: 'jaffle-shop',
      conversation_name: 'projects/p/locations/global/conversations/conv-2',
      intent: 'explore',
    });
    store.appendChatTurn({
      session_id: 'sess-b',
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        client_name: 'codex',
      },
      expected_revision: 1,
      prompt: 'turn',
      response_summary: 'ok',
    });

    expect(() =>
      store.switchIntent({
        session_id: 'sess-b',
        actor: {
          tenant_id: 'tenant-1',
          user_id: 'user-1',
          client_name: 'cursor',
        },
        expected_revision: 1,
        target_intent: 'debug',
      }),
    ).toThrow(SessionConflictError);
  });

  it('creates idempotent session and supports handoff/fork/reset', () => {
    const store = new InMemorySessionStore();

    const first = store.createSession({
      session_id: 'sess-c',
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        client_name: 'claude-code',
      },
      agent: 'jaffle-shop',
      conversation_name: 'projects/p/locations/global/conversations/conv-3',
      intent: 'ad-hoc',
      request_id: 'req-create-c',
    });
    const second = store.createSession({
      session_id: 'sess-c-different',
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        client_name: 'claude-code',
      },
      agent: 'jaffle-shop',
      conversation_name: 'projects/p/locations/global/conversations/conv-3',
      intent: 'ad-hoc',
      request_id: 'req-create-c',
    });
    expect(second.session_id).toBe(first.session_id);

    const forked = store.forkSession({
      parent_session_id: 'sess-c',
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        client_name: 'cursor',
      },
      new_session_id: 'sess-c-fork',
      request_id: 'req-fork-c',
    });
    expect(forked.parent_session_id).toBe('sess-c');

    store.resetSession({
      session_id: 'sess-c',
      actor: {
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        client_name: 'codex',
      },
      expected_revision: 1,
      target_revision: 1,
    });

    const handoff = store.createHandoff('sess-c');
    expect(handoff.session.session_id).toBe('sess-c');
    expect(handoff.handoff_summary).toContain('sess-c');
  });
});
