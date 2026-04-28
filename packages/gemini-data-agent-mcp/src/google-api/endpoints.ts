import { API_HOST } from './versions.js';

import type { ApiVersion } from '../types.js';

export function buildQueryDataUrl(version: ApiVersion, project: string, location: string): string {
  return `${API_HOST}/${version}/projects/${project}/locations/${location}:queryData`;
}

export function buildA2ASendUrl(
  version: ApiVersion,
  project: string,
  location: string,
  dataAgentId: string,
): string {
  return `${API_HOST}/${version}/a2a/projects/${project}/locations/${location}/dataAgents/${dataAgentId}/v1/message:send`;
}

export function buildA2AStreamUrl(
  version: ApiVersion,
  project: string,
  location: string,
  dataAgentId: string,
): string {
  return `${API_HOST}/${version}/a2a/projects/${project}/locations/${location}/dataAgents/${dataAgentId}/v1/message:stream`;
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

export function extractProjectAndLocation(
  dataAgent: string,
): { project: string; location: string } | null {
  const match = /^projects\/([^/]+)\/locations\/([^/]+)/.exec(dataAgent);
  if (!match) return null;
  return { project: match[1], location: match[2] };
}
