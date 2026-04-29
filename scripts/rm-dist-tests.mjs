#!/usr/bin/env node
/** Remove compiled test output so package `dist/` mirrors publishable surface (tests stay in tsconfig for ESLint). */
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'dist', '__tests__');
rmSync(dir, { recursive: true, force: true });
