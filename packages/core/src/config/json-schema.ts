import { zodToJsonSchema } from 'zod-to-json-schema';

import { AppConfigInputSchema } from './schema.js';

const SCHEMA_ID =
  'https://github.com/yu-iskw/gemini-data-agent-mcp/schemas/app-config.v2.schema.json';

/** JSON Schema for v2 user-facing MCP config YAML (generated from Zod). */
export function exportAppConfigJsonSchema(): Record<string, unknown> {
  const generated = zodToJsonSchema(AppConfigInputSchema, {
    name: 'AppConfig',
    $refStrategy: 'none',
  }) as Record<string, unknown>;

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: SCHEMA_ID,
    title: 'Gemini Data Agent MCP Config (v2)',
    description:
      'User-facing YAML configuration for gemini-data-analyst-mcp and gemini-data-agent-admin-mcp.',
    ...generated,
  };
}

export const APP_CONFIG_JSON_SCHEMA_ID = SCHEMA_ID;
