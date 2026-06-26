#!/usr/bin/env node

import {
  DataAgentMcpError,
  loadConfig,
  applyRuntimeOverrides,
  parsePort,
  LOG_LEVELS,
  type McpHttpServerHandle,
  type ServerCliOverrides,
  type ServerConfig,
} from '@gemini-data-agents/core';
import { Command } from 'commander';

import { startServer } from './server.js';

const program = new Command();
const SUPPORTED_TRANSPORTS: ServerConfig['transport'][] = ['stdio', 'http'];

function parseTransport(value: string): ServerConfig['transport'] {
  const normalized = value.toLowerCase();
  if (SUPPORTED_TRANSPORTS.includes(normalized as ServerConfig['transport'])) {
    return normalized as ServerConfig['transport'];
  }
  throw new Error(
    `Invalid transport "${value}". Allowed values: ${SUPPORTED_TRANSPORTS.join(', ')}`,
  );
}

function buildCliOverrides(
  command: Command,
  options: {
    logLevel?: string;
    transport?: string;
    host?: string;
    port?: string;
    httpPath?: string;
  },
): ServerCliOverrides | undefined {
  const overrides: ServerCliOverrides = {};
  if (command.getOptionValueSource('logLevel') === 'cli' && options.logLevel) {
    overrides.logLevel = options.logLevel;
  }
  if (command.getOptionValueSource('transport') === 'cli' && options.transport) {
    overrides.transport = parseTransport(options.transport);
  }
  if (command.getOptionValueSource('host') === 'cli' && options.host) {
    overrides.host = options.host;
  }
  if (command.getOptionValueSource('port') === 'cli' && options.port) {
    overrides.port = parsePort('--port', options.port);
  }
  if (command.getOptionValueSource('httpPath') === 'cli' && options.httpPath) {
    overrides.httpPath = options.httpPath;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function registerHttpShutdown(handle: McpHttpServerHandle | undefined): void {
  if (!handle) return;
  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`\nReceived ${signal}, shutting down HTTP server...\n`);
    await handle.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

program
  .name('gemini-data-agent-agentops-mcp')
  .description('MCP server for AgentOps offline and simulated evaluation workflows.')
  .version('0.1.0');

program
  .command('start', { isDefault: true })
  .option('-c, --config <path>', 'Path to YAML configuration file', 'config.yaml')
  .option('-l, --log-level <level>', `Log level (${LOG_LEVELS.join(', ')})`)
  .option('-t, --transport <type>', `Transport (${SUPPORTED_TRANSPORTS.join(', ')})`)
  .option('--host <host>', 'HTTP bind host')
  .option('--port <port>', 'HTTP port')
  .option('--http-path <path>', 'MCP HTTP endpoint path')
  .action(async (options, command: Command) => {
    try {
      const config = applyRuntimeOverrides(
        loadConfig(options.config),
        buildCliOverrides(command, options),
      );
      const handle = await startServer(config);
      registerHttpShutdown(handle);
    } catch (err) {
      process.stderr.write(
        `\nFatal error: ${err instanceof DataAgentMcpError ? `[${err.code}] ${err.message}` : String(err)}\n`,
      );
      process.exit(1);
    }
  });

program.parse(process.argv);
