import type { ApiVersion } from '../types.js';

export const API_HOST = 'https://geminidataanalytics.googleapis.com';

export const SUPPORTED_VERSIONS: ApiVersion[] = ['v1', 'v1beta', 'v1alpha'];

export function isValidApiVersion(version: string): version is ApiVersion {
  return SUPPORTED_VERSIONS.includes(version as ApiVersion);
}
