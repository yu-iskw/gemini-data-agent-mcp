import { describe, expect, it } from 'vitest';

import { createFakeGoogleRestTransport } from '../../testing/fake-transport.js';
import { createConversationMessagesClient } from '../conversation-messages-client.js';
import { createConversationsClient } from '../conversations-client.js';
import { createDataAgentsClient } from '../data-agents-client.js';
import { createLoggingClientStub } from '../logging-client.js';
import { createOperationsClient } from '../operations-client.js';

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

  it('gets a data agent by name', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('GET');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/dataAgents/a1');
        return { name: 'projects/p1/locations/global/dataAgents/a1', displayName: 'Agent One' };
      },
    });

    const client = createDataAgentsClient(transport);
    const agent = await client.get({ name: 'projects/p1/locations/global/dataAgents/a1' });
    expect(agent.displayName).toBe('Agent One');
  });

  it('lists accessible data agents', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('GET');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/dataAgents:listAccessible');
        return { dataAgents: [{ name: 'projects/p1/locations/global/dataAgents/a1' }] };
      },
    });

    const client = createDataAgentsClient(transport);
    const result = await client.listAccessible({ project: 'p1', location: 'global' });
    expect(result.dataAgents).toHaveLength(1);
  });

  it('listAllResult reports truncation when maxPages is reached', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: () => ({
        dataAgents: [{ name: 'projects/p1/locations/global/dataAgents/a1' }],
        nextPageToken: 'more',
      }),
    });

    const client = createDataAgentsClient(transport);
    const result = await client.listAllResult({ project: 'p1', location: 'global', maxPages: 1 });
    expect(result.agents).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it('creates a data agent', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('POST');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/dataAgents');
        return { name: 'projects/p1/locations/global/dataAgents/new' };
      },
    });

    const client = createDataAgentsClient(transport);
    const agent = await client.create({
      project: 'p1',
      location: 'global',
      dataAgent: { name: 'projects/p1/locations/global/dataAgents/new', displayName: 'New' },
    });
    expect(agent.name).toContain('dataAgents/new');
  });

  it('patches a data agent', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('PATCH');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/dataAgents/a1');
        return { name: 'projects/p1/locations/global/dataAgents/a1', displayName: 'Updated' };
      },
    });

    const client = createDataAgentsClient(transport);
    const agent = await client.patch({
      name: 'projects/p1/locations/global/dataAgents/a1',
      dataAgent: {
        name: 'projects/p1/locations/global/dataAgents/a1',
        displayName: 'Updated',
      },
    });
    expect(agent.displayName).toBe('Updated');
  });

  it('deletes a data agent', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('DELETE');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/dataAgents/a1');
        return {};
      },
    });

    const client = createDataAgentsClient(transport);
    await expect(
      client.delete({ name: 'projects/p1/locations/global/dataAgents/a1' }),
    ).resolves.toEqual({});
  });

  it('sets IAM policy via POST', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('POST');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/dataAgents/a1:setIamPolicy');
        return { bindings: [{ role: 'roles/viewer', members: ['user:me@example.com'] }] };
      },
    });

    const client = createDataAgentsClient(transport);
    const policy = await client.setIamPolicy({
      resource: 'projects/p1/locations/global/dataAgents/a1',
      policy: { bindings: [{ role: 'roles/viewer', members: ['user:me@example.com'] }] },
    });
    expect(policy.bindings).toHaveLength(1);
  });
});

describe('ConversationsClient', () => {
  it('lists conversations under a parent', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('GET');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/conversations');
        return { conversations: [{ name: 'projects/p1/locations/global/conversations/c1' }] };
      },
    });

    const client = createConversationsClient(transport);
    const result = await client.list({ project: 'p1', location: 'global' });
    expect(result.conversations).toHaveLength(1);
  });

  it('gets a conversation by name', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('GET');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/conversations/c1');
        return { name: 'projects/p1/locations/global/conversations/c1' };
      },
    });

    const client = createConversationsClient(transport);
    const conversation = await client.get({
      name: 'projects/p1/locations/global/conversations/c1',
    });
    expect(conversation.name).toContain('conversations/c1');
  });

  it('creates a conversation', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('POST');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/conversations');
        expect(request.body).toEqual({
          dataAgent: 'projects/p1/locations/global/dataAgents/a1',
        });
        return { name: 'projects/p1/locations/global/conversations/c2' };
      },
    });

    const client = createConversationsClient(transport);
    const conversation = await client.create({
      project: 'p1',
      location: 'global',
      dataAgent: 'projects/p1/locations/global/dataAgents/a1',
      conversationId: 'c2',
    });
    expect(conversation.name).toContain('conversations/c2');
  });
});

describe('ConversationMessagesClient', () => {
  it('lists messages for a conversation', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('GET');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/conversations/c1/messages');
        return {
          conversationMessages: [
            { name: 'projects/p1/locations/global/conversations/c1/messages/m1' },
          ],
        };
      },
    });

    const client = createConversationMessagesClient(transport);
    const result = await client.list({
      conversation: 'projects/p1/locations/global/conversations/c1',
    });
    expect(result.conversationMessages).toHaveLength(1);
  });
});

describe('OperationsClient', () => {
  it('gets a long-running operation', async () => {
    const transport = createFakeGoogleRestTransport({
      handler: (request: GoogleRestRequest) => {
        expect(request.method).toBe('GET');
        expect(request.path).toBe('v1beta/projects/p1/locations/global/operations/op1');
        return { name: 'projects/p1/locations/global/operations/op1', done: true };
      },
    });

    const client = createOperationsClient(transport);
    const operation = await client.get({
      name: 'projects/p1/locations/global/operations/op1',
    });
    expect(operation.done).toBe(true);
  });
});

describe('LoggingClient stub', () => {
  it('returns an empty entry list', async () => {
    const client = createLoggingClientStub();
    const result = await client.search({
      project: 'p1',
      filter: 'severity>=ERROR',
    });
    expect(result.entries).toEqual([]);
  });
});
