import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logError, logInfo, setLogLevel } from 'gemini-data-agent-core';

import { registerAdminTools } from './admin-tools.js';

import type { AppConfig } from 'gemini-data-agent-core';

export async function startServer(config: AppConfig): Promise<void> {
  setLogLevel(config.server.log_level);

  const server = new McpServer({
    name: config.server.name,
    version: '0.1.0',
  });

  registerAdminTools(server, config);

  const agentCount = Object.keys(config.agents).length;
  logInfo('server', `Starting ${config.server.name} (admin)`, {
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
  registerAdminTools(server, config);
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
