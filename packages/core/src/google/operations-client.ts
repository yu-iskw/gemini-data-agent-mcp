import type { ApiVersion } from '../types.js';
import type { GoogleRestTransport } from './transport.js';
import type { Operation } from './types.js';

export interface GetOperationInput {
  name: string;
  version?: ApiVersion;
  timeoutMs?: number;
}

export class OperationsClient {
  constructor(private readonly transport: GoogleRestTransport) {}

  get(input: GetOperationInput): Promise<Operation> {
    const version = input.version ?? 'v1beta';
    return this.transport.request<Operation>({
      method: 'GET',
      path: `${version}/${input.name}`,
      version,
      timeoutMs: input.timeoutMs,
      agent: input.name,
    });
  }
}

export function createOperationsClient(transport: GoogleRestTransport): OperationsClient {
  return new OperationsClient(transport);
}
