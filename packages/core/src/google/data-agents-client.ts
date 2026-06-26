import type { ApiVersion } from '../types.js';
import type { GoogleRestTransport } from './transport.js';
import type { DataAgent, IamPolicy, ListDataAgentsResponse } from './types.js';

/** REST body for create/patch; may include fields not modeled on {@link DataAgent}. */
export type DataAgentMutationBody = Partial<DataAgent> & Record<string, unknown>;

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

export interface CreateDataAgentInput {
  project: string;
  location: string;
  dataAgent: DataAgentMutationBody;
  version?: ApiVersion;
  timeoutMs?: number;
}

export interface PatchDataAgentInput {
  name: string;
  dataAgent: DataAgentMutationBody;
  updateMask?: string;
  version?: ApiVersion;
  timeoutMs?: number;
}

export interface DeleteDataAgentInput {
  name: string;
  version?: ApiVersion;
  timeoutMs?: number;
}

export interface SetIamPolicyInput {
  resource: string;
  policy: IamPolicy;
  version?: ApiVersion;
  timeoutMs?: number;
}

export interface ListAllAgentsResult {
  agents: DataAgent[];
  truncated: boolean;
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
    const result = await this.listAllResult(input);
    return result.agents;
  }

  async listAllResult(
    input: ListDataAgentsInput & { maxPages?: number },
  ): Promise<ListAllAgentsResult> {
    const pageSize = input.pageSize ?? 100;
    const maxPages = input.maxPages ?? 50;
    const agents: DataAgent[] = [];
    let pageToken = input.pageToken;
    let truncated = false;
    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.list({ ...input, pageSize, pageToken });
      agents.push(...(response.dataAgents ?? []));
      pageToken = response.nextPageToken;
      if (!pageToken) {
        break;
      }
      if (page + 1 >= maxPages) {
        truncated = true;
      }
    }
    return { agents, truncated };
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

  create(input: CreateDataAgentInput): Promise<DataAgent> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<DataAgent>({
      method: 'POST',
      path: `${version}/projects/${input.project}/locations/${input.location}/dataAgents`,
      body: input.dataAgent,
      version,
      timeoutMs: input.timeoutMs,
      agent: `${input.project}/${input.location}`,
    });
  }

  patch(input: PatchDataAgentInput): Promise<DataAgent> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<DataAgent>({
      method: 'PATCH',
      path: `${version}/${input.name}`,
      body: input.dataAgent,
      query: input.updateMask ? { updateMask: input.updateMask } : undefined,
      version,
      timeoutMs: input.timeoutMs,
      agent: input.name,
    });
  }

  delete(input: DeleteDataAgentInput): Promise<Record<string, never>> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<Record<string, never>>({
      method: 'DELETE',
      path: `${version}/${input.name}`,
      version,
      timeoutMs: input.timeoutMs,
      agent: input.name,
    });
  }

  setIamPolicy(input: SetIamPolicyInput): Promise<IamPolicy> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<IamPolicy>({
      method: 'POST',
      path: `${version}/${input.resource}:setIamPolicy`,
      body: { policy: input.policy },
      version,
      timeoutMs: input.timeoutMs,
      agent: input.resource,
    });
  }
}

export function createDataAgentsClient(transport: GoogleRestTransport): DataAgentsClient {
  return new DataAgentsClient(transport);
}
