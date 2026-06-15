#!/usr/bin/env node

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const cliPath = join(packageRoot, '../node_modules/gemini-data-analyst-mcp/dist/cli.js');
await import(pathToFileURL(cliPath).href);
