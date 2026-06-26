import { describe, expect, it } from 'vitest';

import { annotations } from '../../mcp/annotations.js';
import { buildToolResult, toolErrorFromMcpError } from '../../mcp/results.js';
import { createFakeGoogleRestTransport } from '../../testing/fake-transport.js';
import { DataAgentMcpError } from '../../types.js';
import { createDataAgentsClient } from '../data-agents-client.js';

import type { GoogleRestRequest } from '../transport.js';

describe('DataAgentsClient', () => {
  it('lists data agents under a parent', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('GET');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/dataAgents');
        return { dataAgents: [{ name: 'projects/p1/locations/global/dataAgents/a1' }] };
      },
    });

    const client = createDataAgentsClient(transport);
    const result = await client.list({ project: 'p1', location: 'global' });
    expect(result.dataAgents).toHaveLength(1);
  });

  it('listAll paginates until nextPageToken is absent', async () => {
    let call = 0;
    const transport = createFakeGoogleRestTransport({
      handler: () => {
        call += 1;
        if (call === 1) {
          return {
            dataAgents: [{ name: 'projects/p1/locations/global/dataAgents/a1' }],
            nextPageToken: 'page-2',
          };
        }
        return { dataAgents: [{ name: 'projects/p1/locations/global/dataAgents/a2' }] };
      },
    });

    const client = createDataAgentsClient(transport);
    const agents = await client.listAll({ project: 'p1', location: 'global', pageSize: 1 });
    expect(agents).toHaveLength(2);
    expect(call).toBe(2);
  });

  it('gets IAM policy via POST', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('POST');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/dataAgents/a1:getIamPolicy');
        return { bindings: [{ role: 'roles/viewer', members: ['user:me@example.com'] }] };
      },
    });

    const client = createDataAgentsClient(transport);
    const policy = await client.getIamPolicy({
      resource: 'projects/p1/locations/global/dataAgents/a1',
    });
    expect(policy.bindings).toHaveLength(1);
  });
});

describe('mcp annotations and results', () => {
  it('builds read-only annotations', () => {
    const ann = annotations.readOnlyExternal('List Data Agents');
    expect(ann.readOnlyHint).toBe(true);
    expect(ann.destructiveHint).toBe(false);
  });

  it('builds structured tool results', () => {
    const result = buildToolResult('data_agents.list', { agents: [] });
    expect(result.structuredContent.ok).toBe(true);
    expect(result.content[0]?.type).toBe('text');
  });

  it('maps http_status from Google API errors to googleStatus', () => {
    const err = new DataAgentMcpError('PERMISSION_DENIED', 'denied', false, {
      http_status: 403,
    });
    expect(toolErrorFromMcpError(err).googleStatus).toBe(403);
  });
});
