#!/usr/bin/env node

import {
  DataAgentMcpError,
  loadConfig,
  validateConfig,
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
const configPathOptionFlags = '-c, --config <path>';
const defaultConfigPath = 'config.yaml';
const configPathOptionDescription = 'Path to YAML configuration file';
const logLevelOptionDescription = `Log level (${LOG_LEVELS.join(', ')})`;
const SUPPORTED_TRANSPORTS: ServerConfig['transport'][] = ['stdio', 'http'];
const transportOptionDescription = `Transport type (${SUPPORTED_TRANSPORTS.join(', ')})`;

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
  if (!handle) {
    return;
  }

  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`\nReceived ${signal}, shutting down HTTP server...\n`);
    try {
      await handle.close();
      process.exit(0);
    } catch (err) {
      process.stderr.write(`\nShutdown error: ${String(err)}\n`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

program
  .name('gemini-data-analyst-mcp')
  .description(
    'MCP server for data analysts: Gemini Data Agents with read-only registry and session tools.',
  )
  .version('0.1.0');

program
  .command('start', { isDefault: true })
  .description('Start the MCP server (default command).')
  .option(configPathOptionFlags, configPathOptionDescription, defaultConfigPath)
  .option('-l, --log-level <level>', logLevelOptionDescription)
  .option('-t, --transport <type>', transportOptionDescription)
  .option('--host <host>', 'HTTP bind host (overrides MCP_HOST and YAML)')
  .option('--port <port>', 'HTTP port (overrides PORT env and YAML)')
  .option('--http-path <path>', 'MCP HTTP endpoint path (overrides MCP_HTTP_PATH and YAML)')
  .action(
    async (
      options: {
        config: string;
        logLevel?: string;
        transport?: string;
        host?: string;
        port?: string;
        httpPath?: string;
      },
      command: Command,
    ) => {
      try {
        const config = applyRuntimeOverrides(
          loadConfig(options.config),
          buildCliOverrides(command, options),
        );
        const handle = await startServer(config);
        registerHttpShutdown(handle);
      } catch (err) {
        if (err instanceof DataAgentMcpError) {
          process.stderr.write(`\nFatal error [${err.code}]: ${err.message}\n`);
        } else {
          process.stderr.write(`\nFatal error: ${String(err)}\n`);
        }
        process.exit(1);
      }
    },
  );

program
  .command('validate-config')
  .description('Validate a YAML configuration file without starting the server.')
  .option(configPathOptionFlags, configPathOptionDescription, defaultConfigPath)
  .action((options: { config: string }) => {
    try {
      const config = loadConfig(options.config);
      const agentCount = Object.keys(config.agents).length;
      process.stdout.write(`\nConfiguration valid. ${agentCount} agent(s) configured:\n`);
      for (const [name, agent] of Object.entries(config.agents)) {
        process.stdout.write(`  - ${name}: ${agent.display_name ?? name} [${agent.api_version}]\n`);
      }
      process.stdout.write('\n');
    } catch (err) {
      if (err instanceof DataAgentMcpError) {
        process.stderr.write(`\nConfiguration invalid [${err.code}]:\n${err.message}\n`);
      } else {
        process.stderr.write(`\nConfiguration invalid: ${String(err)}\n`);
      }
      process.exit(1);
    }
  });

program
  .command('inspect-config')
  .description('Display the resolved (parsed) configuration with redacted secrets.')
  .option(configPathOptionFlags, configPathOptionDescription, defaultConfigPath)
  .action((options: { config: string }) => {
    try {
      const config = applyRuntimeOverrides(loadConfig(options.config));

      const redactedConfig = {
        api_version: config.api_version,
        server: config.server,
        agents: Object.fromEntries(
          Object.entries(config.agents).map(([name, agent]) => [
            name,
            {
              data_agent: agent.data_agent,
              tools: agent.tools,
              api_version: agent.api_version,
              ...(agent.auth.impersonate_service_account
                ? { impersonate_service_account: '[REDACTED]' }
                : {}),
              ...(agent.display_name ? { display_name: agent.display_name } : {}),
              ...(agent.description ? { description: agent.description } : {}),
            },
          ]),
        ),
      };

      process.stdout.write(JSON.stringify(redactedConfig, null, 2) + '\n');
    } catch (err) {
      if (err instanceof DataAgentMcpError) {
        process.stderr.write(`\nError [${err.code}]: ${err.message}\n`);
      } else {
        process.stderr.write(`\nError: ${String(err)}\n`);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);

export { validateConfig };
