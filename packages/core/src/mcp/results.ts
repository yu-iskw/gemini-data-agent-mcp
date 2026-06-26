import { wrapNetworkError } from '../google-api/client.js';
import { DataAgentMcpError } from '../types.js';

type ToolResultError = {
  code: string;
  message: string;
  retryable?: boolean;
  googleStatus?: number;
};

type ToolResultMetadata = {
  toolName: string;
  timestamp: string;
  redacted: boolean;
};

export type ToolResultEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: ToolResultError;
  metadata: ToolResultMetadata;
};

export type McpStructuredToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: ToolResultEnvelope<unknown>;
  isError?: boolean;
};

export function buildToolResult<T>(
  toolName: string,
  data: T,
  options?: { redacted?: boolean; compact?: boolean },
): McpStructuredToolResult {
  const envelope: ToolResultEnvelope<T> = {
    ok: true,
    data,
    metadata: {
      toolName,
      timestamp: new Date().toISOString(),
      redacted: options?.redacted ?? false,
    },
  };

  const space = options?.compact === false ? 2 : undefined;
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope, null, space) }],
    structuredContent: envelope as ToolResultEnvelope<unknown>,
  };
}

export function buildToolErrorResult(
  toolName: string,
  error: ToolResultError,
): McpStructuredToolResult {
  const envelope: ToolResultEnvelope<never> = {
    ok: false,
    error,
    metadata: {
      toolName,
      timestamp: new Date().toISOString(),
      redacted: false,
    },
  };

  return {
    content: [{ type: 'text', text: `Error [${error.code}]: ${error.message}` }],
    structuredContent: envelope as ToolResultEnvelope<unknown>,
    isError: true,
  };
}

export function normalizeToolError(err: unknown, agentHint = ''): DataAgentMcpError {
  if (err instanceof DataAgentMcpError) {
    return err;
  }
  return wrapNetworkError(err, agentHint);
}

export function toolErrorFromMcpError(err: unknown): ToolResultError {
  if (!(err instanceof DataAgentMcpError)) {
    return { code: 'UNKNOWN', message: String(err) };
  }
  const normalized = err;
  const details = normalized.details as Record<string, unknown>;
  const googleStatus =
    typeof details.googleStatus === 'number'
      ? details.googleStatus
      : typeof details.http_status === 'number'
        ? details.http_status
        : undefined;
  return {
    code: normalized.code,
    message: normalized.message,
    retryable: normalized.retryable,
    googleStatus,
  };
}
