import { API_HOST } from './versions.js';

import type { ApiVersion } from '../types.js';

export function buildQueryDataUrl(version: ApiVersion, project: string, location: string): string {
  return `${API_HOST}/${version}/projects/${project}/locations/${location}:queryData`;
}

export function buildChatUrl(version: ApiVersion, project: string, location: string): string {
  return `${API_HOST}/${version}/projects/${project}/locations/${location}:chat`;
}

export function buildCreateConversationUrl(
  version: ApiVersion,
  project: string,
  location: string,
  conversationId?: string,
  requestId?: string,
): string {
  const url = new URL(
    `${API_HOST}/${version}/projects/${project}/locations/${location}/conversations`,
  );
  if (conversationId) {
    url.searchParams.set('conversationId', conversationId);
  }
  if (requestId) {
    url.searchParams.set('requestId', requestId);
  }
  return url.toString();
}

export function buildConversationMessagesUrl(
  version: ApiVersion,
  conversationName: string,
  pageSize?: number,
  pageToken?: string,
  filter?: string,
): string {
  const url = new URL(`${API_HOST}/${version}/${conversationName}/messages`);
  if (pageSize !== undefined) {
    url.searchParams.set('pageSize', String(pageSize));
  }
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }
  if (filter) {
    url.searchParams.set('filter', filter);
  }
  return url.toString();
}

export function buildOperationUrl(version: ApiVersion, operationName: string): string {
  return `${API_HOST}/${version}/${operationName}`;
}

export function buildRawUrl(version: ApiVersion, path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_HOST}/${cleanPath.startsWith(version) ? cleanPath : `${version}/${cleanPath}`}`;
}

export function extractDataAgentId(dataAgent: string): string {
  const parts = dataAgent.split('/');
  return parts.at(-1) ?? dataAgent;
}

export function normalizeDataAgentName(
  dataAgent: string,
  project: string,
  location: string,
): string {
  if (dataAgent.startsWith('projects/')) {
    return dataAgent;
  }

  const dataAgentId = extractDataAgentId(dataAgent);
  return `projects/${project}/locations/${location}/dataAgents/${dataAgentId}`;
}

export function normalizeConversationName(
  conversation: string,
  project: string,
  location: string,
): string {
  if (conversation.startsWith('projects/')) {
    return conversation;
  }
  return `projects/${project}/locations/${location}/conversations/${conversation}`;
}

export function extractProjectAndLocation(
  dataAgent: string,
): { project: string; location: string } | null {
  const match = /^projects\/([^/]+)\/locations\/([^/]+)/.exec(dataAgent);
  if (!match) return null;
  return { project: match[1], location: match[2] };
}
