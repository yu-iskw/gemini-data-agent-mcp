import { DataAgentMcpError } from '../types.js';

export interface GoogleApiErrorResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
}

export function parseGoogleApiError(
  status: number,
  body: unknown,
  agent: string,
  apiVersion: string,
): DataAgentMcpError {
  const errorBody = body as GoogleApiErrorResponse;
  const apiError = errorBody?.error;
  const message = apiError?.message ?? `Google API request failed with HTTP ${status}`;
  const apiStatus = apiError?.status ?? '';

  const category = categorizeHttpStatus(status, apiStatus);

  return new DataAgentMcpError(category.code, message, category.retryable, {
    agent,
    api_version: apiVersion,
    http_status: status,
    api_status: apiStatus,
  });
}

function categorizeHttpStatus(
  status: number,
  apiStatus: string,
): { code: string; retryable: boolean } {
  if (status === 401 || apiStatus === 'UNAUTHENTICATED') {
    return { code: 'AUTH_FAILED', retryable: false };
  }
  if (status === 403 || apiStatus === 'PERMISSION_DENIED') {
    return { code: 'PERMISSION_DENIED', retryable: false };
  }
  if (status === 400 || apiStatus === 'INVALID_ARGUMENT') {
    return { code: 'INVALID_REQUEST', retryable: false };
  }
  if (status === 404 || apiStatus === 'NOT_FOUND') {
    return { code: 'NOT_FOUND', retryable: false };
  }
  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    return { code: 'RATE_LIMITED', retryable: true };
  }
  if (status >= 500) {
    return { code: 'GOOGLE_API_ERROR', retryable: true };
  }
  return { code: 'GOOGLE_API_ERROR', retryable: false };
}
