#!/usr/bin/env node
/** Remove compiled test output so package `dist/` mirrors publishable surface (tests stay in tsconfig for ESLint). */
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');

function removeTestDirs(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === '__tests__') {
        rmSync(fullPath, { recursive: true, force: true });
      } else {
        removeTestDirs(fullPath);
      }
    }
  }
}

removeTestDirs(distDir);
