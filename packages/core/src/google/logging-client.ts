/** Minimal Cloud Logging adapter boundary for audit-mcp (Phase 4 expansion). */

export interface LogQueryInput {
  project: string;
  filter: string;
  pageSize?: number;
  pageToken?: string;
}

interface NormalizedLogEntry {
  timestamp?: string;
  severity?: string;
  resourceName?: string;
  message?: string;
  redacted: boolean;
}

export interface LogQueryResult {
  entries: NormalizedLogEntry[];
  nextPageToken?: string;
}

export interface LoggingClient {
  search(input: LogQueryInput): Promise<LogQueryResult>;
}

export function createLoggingClientStub(): LoggingClient {
  return {
    async search(): Promise<LogQueryResult> {
      return { entries: [] };
    },
  };
}
