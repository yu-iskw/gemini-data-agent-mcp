import { afterEach, describe, expect, it } from 'vitest';

import { DataAgentMcpError } from '../../types.js';
import { validateConfig } from '../loader.js';
import { applyRuntimeOverrides } from '../runtime-overrides.js';

const baseInput = {
  api_version: 'v1beta' as const,
  agents: {
    test: {
      data_agent: 'projects/p/locations/l/dataAgents/d',
      tools: ['query_data_agent' as const],
    },
  },
};

const httpOauthInput = {
  ...baseInput,
  server: {
    transport: 'http' as const,
    oauth: {
      resource_url: 'http://127.0.0.1:8080/mcp',
      issuer: 'http://localhost:8080/realms/master',
    },
  },
};

function clearEnv(): void {
  delete process.env.PORT;
  delete process.env.MCP_TRANSPORT;
  delete process.env.MCP_HOST;
  delete process.env.MCP_HTTP_PATH;
  delete process.env.MCP_PUBLIC_URL;
  delete process.env.MCP_LOG_LEVEL;
  delete process.env.MCP_OAUTH_ENABLED;
  delete process.env.MCP_OAUTH_ISSUER;
  delete process.env.MCP_OAUTH_RESOURCE_URL;
  delete process.env.MCP_CORS_ALLOWED_ORIGINS;
  delete process.env.MCP_ALLOW_INSECURE_HTTP;
}

afterEach(() => {
  clearEnv();
});

describe('applyRuntimeOverrides', () => {
  it('applies PORT, MCP_HOST, and MCP_OAUTH_RESOURCE_URL from environment', () => {
    process.env.PORT = '9000';
    process.env.MCP_HOST = '0.0.0.0';
    process.env.MCP_OAUTH_RESOURCE_URL = 'https://example.run.app/mcp';

    const config = validateConfig(httpOauthInput);
    const result = applyRuntimeOverrides(config);

    expect(result.server.port).toBe(9000);
    expect(result.server.host).toBe('0.0.0.0');
    expect(result.server.oauth?.resource_url).toBe('https://example.run.app/mcp');
    expect(result.server.public_url).toBe('https://example.run.app/mcp');
    expect(config.server.port).toBe(8080);
  });

  it('applies MCP_LOG_LEVEL and MCP_OAUTH_ENABLED from environment', () => {
    process.env.MCP_LOG_LEVEL = 'debug';
    process.env.MCP_OAUTH_ENABLED = 'false';
    process.env.MCP_ALLOW_INSECURE_HTTP = 'true';

    const config = validateConfig(httpOauthInput);
    const result = applyRuntimeOverrides(config);

    expect(result.server.log_level).toBe('DEBUG');
    expect(result.server.oauth?.enabled).toBe(false);
  });

  it('env overrides YAML; CLI overrides env (precedence)', () => {
    process.env.PORT = '9000';
    process.env.MCP_HOST = '0.0.0.0';

    const config = validateConfig({
      ...httpOauthInput,
      server: {
        ...httpOauthInput.server,
        port: 3000,
        host: '127.0.0.1',
      },
    });

    const result = applyRuntimeOverrides(config, { port: 4000 });

    expect(result.server.port).toBe(4000);
    expect(result.server.host).toBe('0.0.0.0');
  });

  it('throws CONFIG_OAUTH_REQUIRED when MCP_TRANSPORT=http without oauth in YAML', () => {
    process.env.MCP_TRANSPORT = 'http';

    const config = validateConfig(baseInput);

    expect(() => applyRuntimeOverrides(config)).toThrow(DataAgentMcpError);
    try {
      applyRuntimeOverrides(config);
    } catch (err) {
      expect(err).toBeInstanceOf(DataAgentMcpError);
      expect((err as DataAgentMcpError).code).toBe('CONFIG_OAUTH_REQUIRED');
    }
  });

  it('throws CONFIG_OAUTH_REQUIRED when CLI sets transport http without oauth', () => {
    const config = validateConfig(baseInput);

    expect(() => applyRuntimeOverrides(config, { transport: 'http' })).toThrow(DataAgentMcpError);
    try {
      applyRuntimeOverrides(config, { transport: 'http' });
    } catch (err) {
      expect(err).toBeInstanceOf(DataAgentMcpError);
      expect((err as DataAgentMcpError).code).toBe('CONFIG_OAUTH_REQUIRED');
    }
  });

  it('throws CONFIG_INVALID_ENV for invalid boolean', () => {
    process.env.MCP_OAUTH_ENABLED = 'maybe';

    const config = validateConfig(httpOauthInput);

    expect(() => applyRuntimeOverrides(config)).toThrow(DataAgentMcpError);
    try {
      applyRuntimeOverrides(config);
    } catch (err) {
      expect(err).toBeInstanceOf(DataAgentMcpError);
      expect((err as DataAgentMcpError).code).toBe('CONFIG_INVALID_ENV');
    }
  });

  it('fills HTTP defaults when transport is http', () => {
    process.env.MCP_TRANSPORT = 'http';

    const config = validateConfig({
      ...httpOauthInput,
      server: {
        oauth: httpOauthInput.server.oauth,
        transport: 'stdio',
      },
    });

    const result = applyRuntimeOverrides(config);

    expect(result.server.transport).toBe('http');
    expect(result.server.host).toBe('127.0.0.1');
    expect(result.server.port).toBe(8080);
    expect(result.server.http?.path).toBe('/mcp');
    expect(result.server.public_url).toBe('http://127.0.0.1:8080/mcp');
  });

  it('applies MCP_PUBLIC_URL and MCP_HTTP_PATH from environment when consistent', () => {
    process.env.MCP_PUBLIC_URL = 'http://127.0.0.1:8080/custom-mcp';
    process.env.MCP_HTTP_PATH = '/custom-mcp';

    const config = validateConfig(httpOauthInput);
    const result = applyRuntimeOverrides(config);

    expect(result.server.public_url).toBe('http://127.0.0.1:8080/custom-mcp');
    expect(result.server.http?.path).toBe('/custom-mcp');
  });

  it('rejects oauth disabled without MCP_ALLOW_INSECURE_HTTP', () => {
    process.env.MCP_OAUTH_ENABLED = 'false';

    const config = validateConfig(httpOauthInput);

    expect(() => applyRuntimeOverrides(config)).toThrow(DataAgentMcpError);
    try {
      applyRuntimeOverrides(config);
    } catch (err) {
      expect(err).toBeInstanceOf(DataAgentMcpError);
      expect((err as DataAgentMcpError).code).toBe('CONFIG_INSECURE_HTTP');
    }
  });

  it('applies MCP_CORS_ALLOWED_ORIGINS from environment', () => {
    process.env.MCP_CORS_ALLOWED_ORIGINS = 'https://app.example.com,https://admin.example.com';

    const config = validateConfig(httpOauthInput);
    const result = applyRuntimeOverrides(config);

    expect(result.server.http?.cors?.allowed_origins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });
});
