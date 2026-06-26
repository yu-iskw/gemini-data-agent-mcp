import type { ApiVersion } from '../types.js';
import type { GoogleRestTransport } from './transport.js';
import type { Conversation, ListConversationsResponse } from './types.js';

export interface ListConversationsInput {
  project: string;
  location: string;
  pageSize?: number;
  pageToken?: string;
  filter?: string;
  version?: ApiVersion;
  timeoutMs?: number;
}

export interface GetConversationInput {
  name: string;
  version?: ApiVersion;
  timeoutMs?: number;
}

export interface CreateConversationInput {
  project: string;
  location: string;
  dataAgent: string;
  conversationId?: string;
  requestId?: string;
  version?: ApiVersion;
  timeoutMs?: number;
}

export class ConversationsClient {
  constructor(private readonly transport: GoogleRestTransport) {}

  list(input: ListConversationsInput): Promise<ListConversationsResponse> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<ListConversationsResponse>({
      method: 'GET',
      path: `${version}/projects/${input.project}/locations/${input.location}/conversations`,
      query: {
        pageSize: input.pageSize,
        pageToken: input.pageToken,
        filter: input.filter,
      },
      version,
      timeoutMs: input.timeoutMs,
      agent: input.project,
    });
  }

  get(input: GetConversationInput): Promise<Conversation> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<Conversation>({
      method: 'GET',
      path: `${version}/${input.name}`,
      version,
      timeoutMs: input.timeoutMs,
      agent: input.name,
    });
  }

  create(input: CreateConversationInput): Promise<Conversation> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<Conversation>({
      method: 'POST',
      path: `${version}/projects/${input.project}/locations/${input.location}/conversations`,
      query: {
        conversationId: input.conversationId,
        requestId: input.requestId,
      },
      body: { dataAgent: input.dataAgent },
      version,
      timeoutMs: input.timeoutMs,
      agent: input.dataAgent,
    });
  }
}

export function createConversationsClient(transport: GoogleRestTransport): ConversationsClient {
  return new ConversationsClient(transport);
}
