import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerTools } from './mcp-surface/tools.js';
import { registerResources } from './mcp-surface/resources.js';
import { registerPrompts } from './mcp-surface/prompts.js';
import { setLogLevel, logInfo, logError } from './observability/logging.js';

import type { AppConfig } from './types.js';

export async function startServer(config: AppConfig): Promise<void> {
  setLogLevel(config.server.log_level);

  const server = new McpServer({
    name: config.server.name,
    version: '0.1.0',
  });

  registerTools(server, config);
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
  const server = new McpServer({
    name: config.server.name,
    version: '0.1.0',
  });

  registerTools(server, config);
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
