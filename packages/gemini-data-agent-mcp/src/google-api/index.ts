export { GeminiDataAgentClient, createClient, wrapNetworkError } from './client.js';
export {
  buildQueryDataUrl,
  buildA2ASendUrl,
  buildA2AStreamUrl,
  buildOperationUrl,
  buildRawUrl,
  extractDataAgentId,
  extractProjectAndLocation,
} from './endpoints.js';
export { parseGoogleApiError } from './errors.js';
export { API_HOST, SUPPORTED_VERSIONS, isValidApiVersion } from './versions.js';

export type {
  QueryDataOptions,
  A2AMessageOptions,
  GetOperationOptions,
  RawRequestOptions,
} from './client.js';
