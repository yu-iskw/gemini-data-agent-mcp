#!/usr/bin/env node

import { Command } from 'commander';

import { loadConfig, validateConfig } from './config/loader.js';
import { DEFAULT_LOG_LEVEL, LOG_LEVELS, parseLogLevel } from './observability/log-level.js';
import { startServer } from './server.js';
import { DataAgentMcpError } from './types.js';

const program = new Command();
const configPathOptionFlags = '-c, --config <path>';
const defaultConfigPath = 'config.yaml';
const configPathOptionDescription = 'Path to YAML configuration file';
const logLevelOptionDescription = `Log level (${LOG_LEVELS.join(', ')})`;

program
  .name('gemini-data-agent-mcp')
  .description('MCP server that proxies Google Gemini Data Agents for coding agents.')
  .version('0.1.0');

program
  .command('start', { isDefault: true })
  .description('Start the MCP server (default command).')
  .option(configPathOptionFlags, configPathOptionDescription, defaultConfigPath)
  .option('-l, --log-level <level>', logLevelOptionDescription, DEFAULT_LOG_LEVEL)
  .option('-t, --transport <type>', 'Transport type (stdio)', 'stdio')
  .action(async (options: { config: string; logLevel: string; transport: string }) => {
    try {
      const config = loadConfig(options.config);

      if (options.logLevel) {
        config.server.log_level = parseLogLevel(options.logLevel);
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
        server: config.server,
        version_policy: config.version_policy,
        security: config.security,
        defaults: config.defaults,
        agents: Object.fromEntries(
          Object.entries(config.agents).map(([name, agent]) => [
            name,
            {
              ...agent,
              auth: {
                mode: agent.auth.mode,
                source: agent.auth.source,
                target_service_account: agent.auth.target_service_account
                  ? '[REDACTED]'
                  : undefined,
              },
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
