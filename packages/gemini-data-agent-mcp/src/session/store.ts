import { randomUUID } from 'node:crypto';

import type {
  CreateSessionInput,
  SessionActor,
  SessionHandoff,
  SessionIntent,
  SessionTimelineEvent,
  SharedSession,
} from './types.js';

interface ForkSessionInput {
  parent_session_id: string;
  actor: SessionActor;
  request_id?: string;
  new_session_id?: string;
}

interface ResetSessionInput {
  session_id: string;
  actor: SessionActor;
  expected_revision: number;
  target_revision: number;
}

interface SwitchIntentInput {
  session_id: string;
  actor: SessionActor;
  expected_revision: number;
  target_intent: SessionIntent;
  reason?: string;
}

interface AppendChatTurnInput {
  session_id: string;
  actor: SessionActor;
  expected_revision: number;
  prompt: string;
  response_summary: string;
}

export class SessionConflictError extends Error {
  readonly latest_revision: number;

  constructor(message: string, latestRevision: number) {
    super(message);
    this.latest_revision = latestRevision;
  }
}

export class SessionNotFoundError extends Error {}

export class SessionAccessDeniedError extends Error {}

export interface SessionStore {
  createSession(input: CreateSessionInput): SharedSession;
  getSession(sessionId: string): SharedSession;
  listSessions(): SharedSession[];
  switchIntent(input: SwitchIntentInput): SharedSession;
  appendChatTurn(input: AppendChatTurnInput): SharedSession;
  forkSession(input: ForkSessionInput): SharedSession;
  resetSession(input: ResetSessionInput): SharedSession;
  createHandoff(sessionId: string): SessionHandoff;
  listTimeline(sessionId: string): SessionTimelineEvent[];
  listTimelineSince(sessionId: string, revision: number): SessionTimelineEvent[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function cloneSession(session: SharedSession): SharedSession {
  return {
    ...session,
    participants: session.participants.map((participant) => ({ ...participant })),
  };
}

function cloneEvent(event: SessionTimelineEvent): SessionTimelineEvent {
  return {
    ...event,
    actor: { ...event.actor },
    payload: { ...event.payload },
  };
}

function createTimelineEvent(
  sessionId: string,
  revision: number,
  type: SessionTimelineEvent['type'],
  actor: SessionActor,
  payload: Record<string, unknown>,
): SessionTimelineEvent {
  return {
    event_id: randomUUID(),
    session_id: sessionId,
    revision,
    type,
    actor: { ...actor },
    created_at: nowIso(),
    payload,
  };
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SharedSession>();
  private readonly timeline = new Map<string, SessionTimelineEvent[]>();
  private readonly idempotencyCreate = new Map<string, string>();
  private readonly idempotencyFork = new Map<string, string>();

  createSession(input: CreateSessionInput): SharedSession {
    const idempotencyKey = this.makeIdempotencyKey(input.actor, input.request_id);
    if (idempotencyKey) {
      const existingSessionId = this.idempotencyCreate.get(idempotencyKey);
      if (existingSessionId) {
        return this.getSession(existingSessionId);
      }
    }

    const existing = this.sessions.get(input.session_id);
    if (existing) {
      return cloneSession(existing);
    }

    const timestamp = nowIso();
    const session: SharedSession = {
      session_id: input.session_id,
      tenant_id: input.actor.tenant_id,
      user_id: input.actor.user_id,
      workspace_id: input.actor.workspace_id,
      agent: input.agent,
      conversation_name: input.conversation_name,
      intent: input.intent,
      revision: 1,
      head_revision: 1,
      participants: [
        {
          tenant_id: input.actor.tenant_id,
          user_id: input.actor.user_id,
          role: 'owner',
          added_at: timestamp,
        },
      ],
      created_at: timestamp,
      updated_at: timestamp,
    };

    this.sessions.set(session.session_id, session);
    this.timeline.set(session.session_id, []);

    if (idempotencyKey) {
      this.idempotencyCreate.set(idempotencyKey, session.session_id);
    }

    return cloneSession(session);
  }

  getSession(sessionId: string): SharedSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(`Session "${sessionId}" not found.`);
    }
    return cloneSession(session);
  }

  listSessions(): SharedSession[] {
    return [...this.sessions.values()].map(cloneSession);
  }

  switchIntent(input: SwitchIntentInput): SharedSession {
    return this.updateSessionWithRevision(
      input.session_id,
      input.actor,
      input.expected_revision,
      'intent_switch',
      {
        target_intent: input.target_intent,
        reason: input.reason ?? null,
      },
      (session) => {
        session.intent = input.target_intent;
      },
    );
  }

  appendChatTurn(input: AppendChatTurnInput): SharedSession {
    return this.updateSessionWithRevision(
      input.session_id,
      input.actor,
      input.expected_revision,
      'chat_turn',
      {
        prompt: input.prompt,
        response_summary: input.response_summary,
      },
      () => {
        // No extra mutation besides revision/updated_at and timeline append.
      },
    );
  }

  forkSession(input: ForkSessionInput): SharedSession {
    const parent = this.sessions.get(input.parent_session_id);
    if (!parent) {
      throw new SessionNotFoundError(`Session "${input.parent_session_id}" not found.`);
    }
    this.assertAccess(parent, input.actor);

    const idempotencyKey = this.makeIdempotencyKey(input.actor, input.request_id);
    if (idempotencyKey) {
      const existingSessionId = this.idempotencyFork.get(idempotencyKey);
      if (existingSessionId) {
        return this.getSession(existingSessionId);
      }
    }

    const newSessionId = input.new_session_id ?? `sess_${randomUUID()}`;
    const timestamp = nowIso();
    const child: SharedSession = {
      ...cloneSession(parent),
      session_id: newSessionId,
      parent_session_id: parent.session_id,
      revision: 1,
      head_revision: 1,
      created_at: timestamp,
      updated_at: timestamp,
    };

    this.sessions.set(child.session_id, child);
    this.timeline.set(child.session_id, [
      createTimelineEvent(child.session_id, 1, 'fork', input.actor, {
        parent_session_id: parent.session_id,
        parent_revision: parent.revision,
      }),
    ]);

    if (idempotencyKey) {
      this.idempotencyFork.set(idempotencyKey, child.session_id);
    }

    return cloneSession(child);
  }

  resetSession(input: ResetSessionInput): SharedSession {
    return this.updateSessionWithRevision(
      input.session_id,
      input.actor,
      input.expected_revision,
      'reset',
      {
        target_revision: input.target_revision,
      },
      (session) => {
        const latestKnown = session.revision;
        const boundedTarget = Math.max(1, Math.min(input.target_revision, latestKnown));
        session.head_revision = boundedTarget;
      },
    );
  }

  createHandoff(sessionId: string): SessionHandoff {
    const session = this.getSession(sessionId);
    const recent = this.listTimelineSince(sessionId, Math.max(1, session.revision - 4));
    const summary = `Handoff for ${session.session_id}: intent=${session.intent}, revision=${session.revision}, conversation=${session.conversation_name}.`;
    return {
      session,
      recent_events: recent,
      handoff_summary: summary,
    };
  }

  listTimeline(sessionId: string): SessionTimelineEvent[] {
    const events = this.timeline.get(sessionId);
    if (!events) {
      throw new SessionNotFoundError(`Session "${sessionId}" not found.`);
    }
    return events.map(cloneEvent);
  }

  listTimelineSince(sessionId: string, revision: number): SessionTimelineEvent[] {
    const events = this.timeline.get(sessionId);
    if (!events) {
      throw new SessionNotFoundError(`Session "${sessionId}" not found.`);
    }
    return events.filter((event) => event.revision >= revision).map(cloneEvent);
  }

  private updateSessionWithRevision(
    sessionId: string,
    actor: SessionActor,
    expectedRevision: number,
    eventType: SessionTimelineEvent['type'],
    payload: Record<string, unknown>,
    mutator: (session: SharedSession) => void,
  ): SharedSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(`Session "${sessionId}" not found.`);
    }
    this.assertAccess(session, actor);

    if (session.revision !== expectedRevision) {
      throw new SessionConflictError(
        `Revision conflict for session "${sessionId}": expected ${expectedRevision}, actual ${session.revision}.`,
        session.revision,
      );
    }

    session.revision += 1;
    mutator(session);
    session.updated_at = nowIso();

    const event = createTimelineEvent(
      session.session_id,
      session.revision,
      eventType,
      actor,
      payload,
    );
    const events = this.timeline.get(session.session_id);
    if (!events) {
      this.timeline.set(session.session_id, [event]);
    } else {
      events.push(event);
    }

    return cloneSession(session);
  }

  private assertAccess(session: SharedSession, actor: SessionActor): void {
    if (session.tenant_id !== actor.tenant_id) {
      throw new SessionAccessDeniedError(
        `Tenant "${actor.tenant_id}" cannot access session "${session.session_id}".`,
      );
    }
    const participant = session.participants.find(
      (entry) => entry.tenant_id === actor.tenant_id && entry.user_id === actor.user_id,
    );
    if (!participant) {
      throw new SessionAccessDeniedError(
        `User "${actor.user_id}" is not a participant of session "${session.session_id}".`,
      );
    }
  }

  private makeIdempotencyKey(actor: SessionActor, requestId?: string): string | null {
    if (!requestId) return null;
    return `${actor.tenant_id}:${actor.user_id}:${requestId}`;
  }
}
