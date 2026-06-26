import type { ApiVersion } from '../types.js';
import type { GoogleRestTransport } from './transport.js';
import type { ListConversationMessagesResponse } from './types.js';

export interface ListConversationMessagesInput {
  conversation: string;
  pageSize?: number;
  pageToken?: string;
  filter?: string;
  version?: ApiVersion;
  timeoutMs?: number;
}

export class ConversationMessagesClient {
  constructor(private readonly transport: GoogleRestTransport) {}

  list(input: ListConversationMessagesInput): Promise<ListConversationMessagesResponse> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<ListConversationMessagesResponse>({
      method: 'GET',
      path: `${version}/${input.conversation}/messages`,
      query: {
        pageSize: input.pageSize,
        pageToken: input.pageToken,
        filter: input.filter,
      },
      version,
      timeoutMs: input.timeoutMs,
      agent: input.conversation,
    });
  }
}

export function createConversationMessagesClient(
  transport: GoogleRestTransport,
): ConversationMessagesClient {
  return new ConversationMessagesClient(transport);
}
