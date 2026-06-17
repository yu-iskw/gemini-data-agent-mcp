import { setLogLevel, logInfo, logError, startMcpHttpServer } from '@gemini-data-agents/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerPrompts } from './mcp/prompts.js';
import { registerResources } from './mcp/resources.js';
import { InMemorySessionStore } from './session/store.js';
import { registerTools } from './tools.js';

import type { AppConfig, McpHttpServerHandle } from '@gemini-data-agents/core';
import type { SessionStore } from './session/store.js';

export async function startServer(config: AppConfig): Promise<McpHttpServerHandle | undefined> {
  setLogLevel(config.server.log_level);

  const sessionStore = new InMemorySessionStore();
  const agentCount = Object.keys(config.agents).length;
  logInfo('server', `Starting ${config.server.name}`, {
    transport: config.server.transport,
    agents: agentCount,
    api_version: config.api_version,
  });

  if (config.server.transport === 'stdio' || config.server.transport === undefined) {
    const server = createMcpServer(config, sessionStore);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logInfo('server', 'MCP server connected via stdio');
    return undefined;
  } else if (config.server.transport === 'http') {
    return await startMcpHttpServer({
      config,
      createMcpServer: () => createMcpServer(config, sessionStore),
    });
  } else {
    throw new Error(
      `Transport "${config.server.transport}" is not supported. Use "stdio" or "http".`,
    );
  }
}

export function createMcpServer(
  config: AppConfig,
  sessionStore: SessionStore = new InMemorySessionStore(),
): McpServer {
  const server = new McpServer({
    name: config.server.name,
    version: '0.1.0',
  });

  registerTools(server, config, sessionStore);
  registerResources(server, config);
  registerPrompts(server);

  return server;
}

process.on('uncaughtException', (err) => {
  logError('server', 'Uncaught exception', { error: String(err) });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError('server', 'Unhandled promise rejection', { reason: String(reason) });
  process.exit(1);
});
