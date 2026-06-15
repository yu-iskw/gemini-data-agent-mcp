#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { exportAppConfigJsonSchema } from '../packages/core/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.join(repoRoot, 'schemas', 'app-config.v2.schema.json');

mkdirSync(path.dirname(outPath), { recursive: true });

const schema = exportAppConfigJsonSchema();
writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf-8');

process.stdout.write(`Wrote ${outPath}\n`);
