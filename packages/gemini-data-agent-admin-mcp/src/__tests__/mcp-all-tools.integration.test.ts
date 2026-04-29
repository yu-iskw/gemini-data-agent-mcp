import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { serializeAnalystRegistryYaml, validateConfig } from 'gemini-data-agent-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMcpServer } from '../server.js';

import type * as GoogleAuthLibrary from 'google-auth-library';

const mockHeaders = { Authorization: 'Bearer mock-token' };
const mockGoogleClient = {
  getRequestHeaders: vi.fn().mockResolvedValue(mockHeaders),
};

vi.mock('google-auth-library', async (importOriginal) => {
  const actual = await importOriginal<typeof GoogleAuthLibrary>();
  return {
    ...actual,
    GoogleAuth: vi.fn().mockImplementation(function () {
      return {
        getClient: vi.fn().mockResolvedValue(mockGoogleClient),
      };
    }),
  };
});

function adminConfig() {
  return validateConfig({
    agents: {
      admin: {
        project: 'my-gcp-project',
        location: 'us-central1',
        api_version: 'v1beta',
        data_agent: 'projects/my-gcp-project/locations/us-central1/dataAgents/admin',
        auth: { mode: 'adc' },
        capabilities: {
          query_data: true,
          chat: false,
          raw_passthrough: false,
        },
      },
    },
  });
}

describe.sequential('Admin MCP — exercise every registered tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function connectAdminClient(config = adminConfig()) {
    const server = createMcpServer(config);
    const client = new Client({ name: 'admin-integration', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return {
      client,
      config,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  it('lists admin tools including YAML and lifecycle stubs', async () => {
    const { client, close } = await connectAdminClient();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('generate_analyst_registry_yaml');
      expect(names).toContain('validate_analyst_registry_yaml');
      expect(names).toContain('diff_analyst_registry_yaml');
      expect(names).toContain('inspect_admin_auth');
      expect(names).toContain('dry_run_data_agent_change');
      expect(names).toContain('list_remote_data_agents');
      expect(names).toContain('delete_remote_data_agent');
    } finally {
      await close();
    }
  });

  it('generate_analyst_registry_yaml returns YAML text', async () => {
    const { client, config, close } = await connectAdminClient();
    try {
      const r = await client.callTool({
        name: 'generate_analyst_registry_yaml',
        arguments: { use_loaded_config: true },
      });
      expect(r.isError).toBeFalsy();
      const text = (r.content as [{ text?: string }])[0]?.text ?? '';
      expect(text).toContain('agents:');
      expect(text).toContain('admin');
      expect(text.trimEnd()).toBe(serializeAnalystRegistryYaml(config).trimEnd());
    } finally {
      await close();
    }
  });

  it('validate_analyst_registry_yaml accepts generated YAML', async () => {
    const cfg = adminConfig();
    const yaml = serializeAnalystRegistryYaml(cfg);
    const { client, close } = await connectAdminClient(cfg);
    try {
      const r = await client.callTool({
        name: 'validate_analyst_registry_yaml',
        arguments: { yaml },
      });
      expect(r.isError).toBeFalsy();
      const payload = JSON.parse((r.content as [{ text?: string }])[0]?.text ?? '{}') as {
        valid?: boolean;
      };
      expect(payload.valid).toBe(true);
    } finally {
      await close();
    }
  });

  it('diff_analyst_registry_yaml returns a diff string', async () => {
    const { client, close } = await connectAdminClient();
    try {
      const r = await client.callTool({
        name: 'diff_analyst_registry_yaml',
        arguments: { baseline: 'a: 1\n', proposed: 'a: 2\n' },
      });
      expect(r.isError).toBeFalsy();
      expect(JSON.stringify(r.content)).toContain('-');
    } finally {
      await close();
    }
  });

  it('inspect_admin_auth resolves mocked credentials', async () => {
    const { client, close } = await connectAdminClient();
    try {
      const r = await client.callTool({
        name: 'inspect_admin_auth',
        arguments: { agent: 'admin' },
      });
      expect(r.isError).toBeFalsy();
      const payload = JSON.parse((r.content as [{ text?: string }])[0]?.text ?? '{}') as {
        auth_mode?: string;
        request_header_keys?: string[];
      };
      expect(payload.auth_mode).toBe('adc');
      expect(payload.request_header_keys?.some((k) => k.toLowerCase() === 'authorization')).toBe(
        true,
      );
    } finally {
      await close();
    }
  });

  it('dry_run_data_agent_change validates merged agent', async () => {
    const { client, close } = await connectAdminClient();
    try {
      const r = await client.callTool({
        name: 'dry_run_data_agent_change',
        arguments: {
          agent_name: 'new-agent',
          proposed_agent: {
            project: 'my-gcp-project',
            location: 'us-central1',
            api_version: 'v1beta',
            data_agent: 'new-agent',
            auth: { mode: 'adc' },
          },
        },
      });
      expect(r.isError).toBeFalsy();
      expect(JSON.stringify(r.content)).toContain('valid');
    } finally {
      await close();
    }
  });

  it('remote lifecycle stubs return NOT_IMPLEMENTED', async () => {
    const { client, close } = await connectAdminClient();
    try {
      for (const name of [
        'list_remote_data_agents',
        'get_remote_data_agent',
        'create_remote_data_agent',
        'update_remote_data_agent',
        'delete_remote_data_agent',
      ] as const) {
        const args: Record<string, unknown> =
          name === 'list_remote_data_agents'
            ? {}
            : name === 'get_remote_data_agent'
              ? { name: 'projects/p/locations/l/dataAgents/x' }
              : name === 'create_remote_data_agent'
                ? { body: {} }
                : name === 'update_remote_data_agent'
                  ? { name: 'projects/p/locations/l/dataAgents/x', body: {} }
                  : { name: 'projects/p/locations/l/dataAgents/x' };

        const r = await client.callTool({ name, arguments: args });
        expect(r.isError).toBe(true);
        const text = JSON.stringify(r.content);
        expect(text).toContain('NOT_IMPLEMENTED');
      }
    } finally {
      await close();
    }
  });

  it('admin server does not implement resources or prompts (client calls fail with method not found)', async () => {
    const { client, close } = await connectAdminClient();
    try {
      await expect(client.listResources()).rejects.toMatchObject({ code: -32601 });
      await expect(client.listPrompts()).rejects.toMatchObject({ code: -32601 });
    } finally {
      await close();
    }
  });
});
