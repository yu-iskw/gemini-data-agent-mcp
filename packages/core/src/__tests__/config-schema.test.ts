import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { exportAppConfigJsonSchema, loadConfig } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

const exampleConfigs = [
  'examples/analyst.config.minimal.yaml',
  'examples/analyst.config.full.yaml',
  'examples/admin.config.minimal.yaml',
  'examples/admin.config.full.yaml',
  'examples/generated.registry.yaml',
];

describe('config JSON schema', () => {
  it('matches committed schemas/app-config.v2.schema.json', () => {
    const committedPath = path.join(repoRoot, 'schemas', 'app-config.v2.schema.json');
    const committed = JSON.parse(readFileSync(committedPath, 'utf-8')) as Record<string, unknown>;
    const generated = exportAppConfigJsonSchema();
    expect(generated).toEqual(committed);
  });

  it.each(exampleConfigs)('loads example config %s', (relativePath) => {
    const configPath = path.join(repoRoot, relativePath);
    const config = loadConfig(configPath);
    expect(Object.keys(config.agents).length).toBeGreaterThan(0);
  });
});
