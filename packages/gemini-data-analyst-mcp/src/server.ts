import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setLogLevel, logInfo, logError } from 'gemini-data-agent-core';

import { registerPrompts } from './mcp/prompts.js';
import { registerResources } from './mcp/resources.js';
import { InMemorySessionStore } from './session/store.js';
import { registerTools } from './tools.js';

import type { AppConfig } from 'gemini-data-agent-core';

export async function startServer(config: AppConfig): Promise<void> {
  setLogLevel(config.server.log_level);

  const sessionStore = new InMemorySessionStore();
  const server = new McpServer({
    name: config.server.name,
    version: '0.1.0',
  });

  registerTools(server, config, sessionStore);
  registerResources(server, config);
  registerPrompts(server);

  const agentCount = Object.keys(config.agents).length;
  logInfo('server', `Starting ${config.server.name}`, {
    transport: config.server.transport,
    agents: agentCount,
    version_policy: config.version_policy.default,
  });

  if (config.server.transport === 'stdio' || config.server.transport === undefined) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logInfo('server', 'MCP server connected via stdio');
  } else {
    throw new Error(`Transport "${config.server.transport}" is not yet supported. Use "stdio".`);
  }
}

export function createMcpServer(config: AppConfig): McpServer {
  const sessionStore = new InMemorySessionStore();
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
