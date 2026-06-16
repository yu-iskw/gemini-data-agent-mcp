#!/usr/bin/env node

import {
  DataAgentMcpError,
  loadConfig,
  validateConfig,
  DEFAULT_LOG_LEVEL,
  LOG_LEVELS,
  parseLogLevel,
} from '@gemini-data-agents/core';
import { Command } from 'commander';

import { startServer } from './server.js';

import type { ServerConfig } from '@gemini-data-agents/core';

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
  .option('-l, --log-level <level>', logLevelOptionDescription, DEFAULT_LOG_LEVEL)
  .option('-t, --transport <type>', transportOptionDescription, 'stdio')
  .action(async (options: { config: string; logLevel: string; transport: string }) => {
    try {
      const config = loadConfig(options.config);

      if (options.logLevel) {
        config.server.log_level = parseLogLevel(options.logLevel);
      }
      if (options.transport) {
        config.server.transport = parseTransport(options.transport);
      }

      await startServer(config);
    } catch (err) {
      if (err instanceof DataAgentMcpError) {
        process.stderr.write(`\nFatal error [${err.code}]: ${err.message}\n`);
      } else {
        process.stderr.write(`\nFatal error: ${String(err)}\n`);
      }
      process.exit(1);
    }
  });

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
