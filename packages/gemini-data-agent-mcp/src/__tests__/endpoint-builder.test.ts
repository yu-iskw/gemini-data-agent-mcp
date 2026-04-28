import { describe, it, expect } from 'vitest';

import {
  buildQueryDataUrl,
  buildChatUrl,
  buildCreateConversationUrl,
  buildConversationMessagesUrl,
  buildOperationUrl,
  extractDataAgentId,
  normalizeDataAgentName,
  normalizeConversationName,
  extractProjectAndLocation,
} from '../google-api/endpoints.js';
import { API_HOST } from '../google-api/versions.js';

describe('buildQueryDataUrl', () => {
  it('builds correct URL for v1beta', () => {
    const url = buildQueryDataUrl('v1beta', 'my-project', 'us-central1');
    expect(url).toBe(`${API_HOST}/v1beta/projects/my-project/locations/us-central1:queryData`);
  });

  it('builds correct URL for v1alpha', () => {
    const url = buildQueryDataUrl('v1alpha', 'my-project', 'europe-west1');
    expect(url).toBe(`${API_HOST}/v1alpha/projects/my-project/locations/europe-west1:queryData`);
  });

  it('builds correct URL for v1', () => {
    const url = buildQueryDataUrl('v1', 'proj', 'us-east1');
    expect(url).toBe(`${API_HOST}/v1/projects/proj/locations/us-east1:queryData`);
  });
});

describe('buildChatUrl', () => {
  it('builds correct URL for v1beta', () => {
    const url = buildChatUrl('v1beta', 'my-project', 'us-central1');
    expect(url).toBe(`${API_HOST}/v1beta/projects/my-project/locations/us-central1:chat`);
  });
});

describe('buildCreateConversationUrl', () => {
  it('builds URL without optional query params', () => {
    const url = buildCreateConversationUrl('v1beta', 'my-project', 'global');
    expect(url).toBe(`${API_HOST}/v1beta/projects/my-project/locations/global/conversations`);
  });

  it('adds optional query params', () => {
    const url = buildCreateConversationUrl('v1beta', 'my-project', 'global', 'conv-1', 'request-1');
    expect(url).toContain('conversationId=conv-1');
    expect(url).toContain('requestId=request-1');
  });
});

describe('buildConversationMessagesUrl', () => {
  it('builds conversation messages URL', () => {
    const url = buildConversationMessagesUrl(
      'v1beta',
      'projects/my-project/locations/global/conversations/conv-1',
      20,
      'next-token',
      'createTime>\"2026-01-01T00:00:00Z\"',
    );
    expect(url).toContain(
      `${API_HOST}/v1beta/projects/my-project/locations/global/conversations/conv-1/messages`,
    );
    expect(url).toContain('pageSize=20');
    expect(url).toContain('pageToken=next-token');
    expect(url).toContain('filter=');
  });
});

describe('buildOperationUrl', () => {
  it('builds URL for operation name', () => {
    const url = buildOperationUrl(
      'v1beta',
      'projects/my-project/locations/us-central1/operations/op123',
    );
    expect(url).toBe(
      `${API_HOST}/v1beta/projects/my-project/locations/us-central1/operations/op123`,
    );
  });
});

describe('extractDataAgentId', () => {
  it('extracts agent ID from full resource name', () => {
    const id = extractDataAgentId('projects/my-project/locations/us-central1/dataAgents/my-agent');
    expect(id).toBe('my-agent');
  });

  it('returns unchanged string for bare ID', () => {
    expect(extractDataAgentId('my-agent')).toBe('my-agent');
  });
});

describe('extractProjectAndLocation', () => {
  it('extracts project and location from full resource name', () => {
    const result = extractProjectAndLocation(
      'projects/my-project/locations/us-central1/dataAgents/my-agent',
    );
    expect(result).toEqual({ project: 'my-project', location: 'us-central1' });
  });

  it('returns null for bare names', () => {
    expect(extractProjectAndLocation('my-agent')).toBeNull();
  });
});

describe('normalizeDataAgentName', () => {
  it('returns full data agent name unchanged', () => {
    expect(
      normalizeDataAgentName(
        'projects/my-project/locations/us-central1/dataAgents/my-agent',
        'my-project',
        'us-central1',
      ),
    ).toBe('projects/my-project/locations/us-central1/dataAgents/my-agent');
  });

  it('expands bare agent ID into full data agent name', () => {
    expect(normalizeDataAgentName('my-agent', 'my-project', 'us-central1')).toBe(
      'projects/my-project/locations/us-central1/dataAgents/my-agent',
    );
  });
});

describe('normalizeConversationName', () => {
  it('returns full conversation name unchanged', () => {
    expect(
      normalizeConversationName(
        'projects/my-project/locations/global/conversations/conv-1',
        'my-project',
        'global',
      ),
    ).toBe('projects/my-project/locations/global/conversations/conv-1');
  });

  it('expands bare conversation ID into full name', () => {
    expect(normalizeConversationName('conv-1', 'my-project', 'global')).toBe(
      'projects/my-project/locations/global/conversations/conv-1',
    );
  });
});
