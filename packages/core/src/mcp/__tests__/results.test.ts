import { describe, expect, it } from 'vitest';

import { DataAgentMcpError } from '../../types.js';
import { buildToolErrorResult, normalizeToolError, toolErrorFromMcpError } from '../results.js';

describe('buildToolErrorResult', () => {
  it('returns an error envelope with isError set', () => {
    const result = buildToolErrorResult('data_agents.list', {
      code: 'PERMISSION_DENIED',
      message: 'denied',
      retryable: false,
      googleStatus: 403,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.ok).toBe(false);
    expect(result.structuredContent.error).toMatchObject({
      code: 'PERMISSION_DENIED',
      message: 'denied',
      googleStatus: 403,
    });
    expect(result.content[0]?.text).toBe('Error [PERMISSION_DENIED]: denied');
    expect(result.structuredContent.metadata.toolName).toBe('data_agents.list');
  });
});

describe('normalizeToolError', () => {
  it('returns DataAgentMcpError instances unchanged', () => {
    const err = new DataAgentMcpError('AGENT_NOT_FOUND', 'missing', false);
    expect(normalizeToolError(err)).toBe(err);
  });

  it('wraps generic errors as retryable network errors', () => {
    const wrapped = normalizeToolError(new Error('socket reset'), 'agent-a');
    expect(wrapped).toBeInstanceOf(DataAgentMcpError);
    expect(wrapped.code).toBe('NETWORK_ERROR');
    expect(wrapped.retryable).toBe(true);
    expect(wrapped.details.agent).toBe('agent-a');
  });

  it('wraps AbortError as a timeout', () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    const wrapped = normalizeToolError(err);
    expect(wrapped.code).toBe('TIMEOUT');
    expect(wrapped.retryable).toBe(true);
  });

  it('wraps timeout messages as TIMEOUT', () => {
    const wrapped = normalizeToolError(new Error('request timeout exceeded'));
    expect(wrapped.code).toBe('TIMEOUT');
  });
});

describe('toolErrorFromMcpError', () => {
  it('maps unknown errors to UNKNOWN', () => {
    expect(toolErrorFromMcpError('boom')).toEqual({
      code: 'UNKNOWN',
      message: 'boom',
    });
  });

  it('maps DataAgentMcpError fields including googleStatus', () => {
    const err = new DataAgentMcpError('PERMISSION_DENIED', 'denied', false, {
      googleStatus: 403,
    });
    expect(toolErrorFromMcpError(err)).toEqual({
      code: 'PERMISSION_DENIED',
      message: 'denied',
      retryable: false,
      googleStatus: 403,
    });
  });

  it('falls back to http_status when googleStatus is absent', () => {
    const err = new DataAgentMcpError('PERMISSION_DENIED', 'denied', false, {
      http_status: 403,
    });
    expect(toolErrorFromMcpError(err).googleStatus).toBe(403);
  });

  it('prefers googleStatus over http_status', () => {
    const err = new DataAgentMcpError('PERMISSION_DENIED', 'denied', false, {
      googleStatus: 401,
      http_status: 403,
    });
    expect(toolErrorFromMcpError(err).googleStatus).toBe(401);
  });

  it('omits googleStatus when neither detail field is numeric', () => {
    const err = new DataAgentMcpError('NETWORK_ERROR', 'failed', true);
    expect(toolErrorFromMcpError(err).googleStatus).toBeUndefined();
  });
});
