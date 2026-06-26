export interface DataAgent {
  name: string;
  displayName?: string;
  description?: string;
  labels?: Record<string, string>;
  createTime?: string;
  updateTime?: string;
  deleteTime?: string;
  purgeTime?: string;
  dataAnalyticsAgent?: Record<string, unknown>;
  kmsKey?: string;
}

export interface ListDataAgentsResponse {
  dataAgents?: DataAgent[];
  nextPageToken?: string;
}

export interface Conversation {
  name: string;
  displayName?: string;
  createTime?: string;
  updateTime?: string;
}

export interface ListConversationsResponse {
  conversations?: Conversation[];
  nextPageToken?: string;
}

export interface ConversationMessage {
  name: string;
  createTime?: string;
  [key: string]: unknown;
}

export interface ListConversationMessagesResponse {
  conversationMessages?: ConversationMessage[];
  nextPageToken?: string;
}

export interface Operation {
  name: string;
  done?: boolean;
  metadata?: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

export interface IamPolicy {
  bindings?: Array<{
    role: string;
    members: string[];
    condition?: Record<string, unknown>;
  }>;
  etag?: string;
  version?: number;
}
