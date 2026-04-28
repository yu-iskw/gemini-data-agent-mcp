import { describe, it, expect } from 'vitest';

import {
  buildQueryDataUrl,
  buildA2ASendUrl,
  buildA2AStreamUrl,
  buildOperationUrl,
  extractDataAgentId,
  normalizeDataAgentName,
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

describe('buildA2ASendUrl', () => {
  it('builds correct A2A send URL', () => {
    const url = buildA2ASendUrl('v1beta', 'my-project', 'us-central1', 'my-agent');
    expect(url).toBe(
      `${API_HOST}/v1beta/a2a/projects/my-project/locations/us-central1/dataAgents/my-agent/v1/message:send`,
    );
  });
});

describe('buildA2AStreamUrl', () => {
  it('builds correct A2A stream URL', () => {
    const url = buildA2AStreamUrl('v1beta', 'my-project', 'us-central1', 'my-agent');
    expect(url).toBe(
      `${API_HOST}/v1beta/a2a/projects/my-project/locations/us-central1/dataAgents/my-agent/v1/message:stream`,
    );
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
