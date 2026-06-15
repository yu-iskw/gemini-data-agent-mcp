#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { exportAppConfigJsonSchema } from '../packages/core/dist/index.js';

const outPath = path.join(process.cwd(), 'schemas', 'app-config.v2.schema.json');

mkdirSync(path.dirname(outPath), { recursive: true });

const schema = exportAppConfigJsonSchema();
writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf-8');

process.stdout.write(`Wrote ${outPath}\n`);
