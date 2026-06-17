#!/usr/bin/env node

import {
  DataAgentMcpError,
  loadConfig,
  validateConfig,
  applyRuntimeOverrides,
  LOG_LEVELS,
} from '@gemini-data-agents/core';
import { Command } from 'commander';

import { startServer } from './server.js';

import type { ServerCliOverrides, ServerConfig } from '@gemini-data-agents/core';

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
    const port = Number.parseInt(options.port, 10);
    if (Number.isNaN(port) || port <= 0) {
      throw new Error(`Invalid port "${options.port}"`);
    }
    overrides.port = port;
  }
  if (command.getOptionValueSource('httpPath') === 'cli' && options.httpPath) {
    overrides.httpPath = options.httpPath;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

program
  .name('gemini-data-agent-admin-mcp')
  .description('MCP server for data-agent administrators: registry YAML and control-plane tools.')
  .version('0.1.0');

program
  .command('start', { isDefault: true })
  .description('Start the admin MCP server (default command).')
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
        const config = loadConfig(options.config);
        applyRuntimeOverrides(config, buildCliOverrides(command, options));
        await startServer(config);
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
      const config = loadConfig(options.config);
      applyRuntimeOverrides(config);

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
