import { serializeAnalystRegistryYaml, validateConfig } from '@gemini-data-agents/core';
import { connectMcpTestClient } from '@gemini-data-agents/core/testing';
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
    api_version: 'v1beta',
    agents: {
      admin: {
        data_agent: 'projects/my-gcp-project/locations/us-central1/dataAgents/admin',
        tools: ['query_data_agent'],
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
    const { client, close } = await connectMcpTestClient(
      createMcpServer,
      config,
      'admin-integration',
    );
    return { client, config, close };
  }

  it('lists admin tools including YAML and RFC read tools', async () => {
    const { client, close } = await connectAdminClient();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('generate_analyst_registry_yaml');
      expect(names).toContain('validate_analyst_registry_yaml');
      expect(names).toContain('diff_analyst_registry_yaml');
      expect(names).toContain('inspect_admin_auth');
      expect(names).toContain('dry_run_data_agent_change');
      expect(names).toContain('data_agents.list');
      expect(names).toContain('operations.get');
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
            data_agent: 'projects/my-gcp-project/locations/us-central1/dataAgents/new-agent',
            tools: ['query_data_agent'],
          },
        },
      });
      expect(r.isError).toBeFalsy();
      expect(JSON.stringify(r.content)).toContain('valid');
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
