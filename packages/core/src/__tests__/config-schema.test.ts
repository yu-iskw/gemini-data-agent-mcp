import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportAppConfigJsonSchema } from '../config/json-schema.js';

describe('config JSON schema', () => {
  it('matches committed schemas/app-config.v2.schema.json', () => {
    const committedPath = path.join(process.cwd(), 'schemas', 'app-config.v2.schema.json');
    // Drift test reads a repo-relative path derived from process.cwd().
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const committed = JSON.parse(readFileSync(committedPath, 'utf-8')) as Record<string, unknown>;
    const generated = exportAppConfigJsonSchema();
    expect(generated).toEqual(committed);
  });
});
