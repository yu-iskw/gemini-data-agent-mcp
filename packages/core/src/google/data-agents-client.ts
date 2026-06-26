import type { ApiVersion } from '../types.js';
import type { GoogleRestTransport } from './transport.js';
import type { DataAgent, IamPolicy, ListDataAgentsResponse } from './types.js';

export interface ListDataAgentsInput {
  project: string;
  location: string;
  pageSize?: number;
  pageToken?: string;
  filter?: string;
  version?: ApiVersion;
  timeoutMs?: number;
}

type ListAccessibleDataAgentsInput = ListDataAgentsInput;

export interface GetDataAgentInput {
  name: string;
  version?: ApiVersion;
  timeoutMs?: number;
}

export interface GetIamPolicyInput {
  resource: string;
  version?: ApiVersion;
  timeoutMs?: number;
}

export class DataAgentsClient {
  constructor(private readonly transport: GoogleRestTransport) {}

  list(input: ListDataAgentsInput): Promise<ListDataAgentsResponse> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<ListDataAgentsResponse>({
      method: 'GET',
      path: `${version}/projects/${input.project}/locations/${input.location}/dataAgents`,
      query: {
        pageSize: input.pageSize,
        pageToken: input.pageToken,
        filter: input.filter,
      },
      version,
      timeoutMs: input.timeoutMs,
      agent: `${input.project}/${input.location}`,
    });
  }

  /** Paginate through all list pages (bounded by maxPages). */
  async listAll(input: ListDataAgentsInput & { maxPages?: number }): Promise<DataAgent[]> {
    const pageSize = input.pageSize ?? 100;
    const maxPages = input.maxPages ?? 50;
    const agents: DataAgent[] = [];
    let pageToken = input.pageToken;
    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.list({ ...input, pageSize, pageToken });
      agents.push(...(response.dataAgents ?? []));
      pageToken = response.nextPageToken;
      if (!pageToken) {
        break;
      }
    }
    return agents;
  }

  listAccessible(input: ListAccessibleDataAgentsInput): Promise<ListDataAgentsResponse> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<ListDataAgentsResponse>({
      method: 'GET',
      path: `${version}/projects/${input.project}/locations/${input.location}/dataAgents:listAccessible`,
      query: {
        pageSize: input.pageSize,
        pageToken: input.pageToken,
        filter: input.filter,
      },
      version,
      timeoutMs: input.timeoutMs,
      agent: `${input.project}/${input.location}`,
    });
  }

  get(input: GetDataAgentInput): Promise<DataAgent> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<DataAgent>({
      method: 'GET',
      path: `${version}/${input.name}`,
      version,
      timeoutMs: input.timeoutMs,
      agent: input.name,
    });
  }

  getIamPolicy(input: GetIamPolicyInput): Promise<IamPolicy> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<IamPolicy>({
      method: 'POST',
      path: `${version}/${input.resource}:getIamPolicy`,
      body: {},
      version,
      timeoutMs: input.timeoutMs,
      agent: input.resource,
    });
  }
}

export function createDataAgentsClient(transport: GoogleRestTransport): DataAgentsClient {
  return new DataAgentsClient(transport);
}
