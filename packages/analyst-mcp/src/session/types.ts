export type SessionIntent = 'explore' | 'debug' | 'report' | 'ad-hoc';

export type SessionRole = 'owner' | 'collaborator';

export interface SessionActor {
  tenant_id: string;
  user_id: string;
  client_name: string;
  workspace_id?: string;
}

export interface SessionParticipant {
  tenant_id: string;
  user_id: string;
  role: SessionRole;
  added_at: string;
}

export interface SessionTimelineEvent {
  event_id: string;
  session_id: string;
  revision: number;
  type: 'chat_turn' | 'intent_switch' | 'fork' | 'reset' | 'handoff';
  actor: SessionActor;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface SharedSession {
  session_id: string;
  tenant_id: string;
  user_id: string;
  workspace_id?: string;
  agent: string;
  conversation_name: string;
  intent: SessionIntent;
  revision: number;
  head_revision: number;
  parent_session_id?: string;
  participants: SessionParticipant[];
  created_at: string;
  updated_at: string;
}

export interface CreateSessionInput {
  session_id: string;
  actor: SessionActor;
  agent: string;
  conversation_name: string;
  intent: SessionIntent;
  request_id?: string;
}

export interface SessionHandoff {
  session: SharedSession;
  recent_events: SessionTimelineEvent[];
  handoff_summary: string;
}
