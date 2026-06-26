import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '.trunk/**'],
  },
  coverage: {
    provider: 'v8',
    include: ['packages/**/src/**/*.ts'],
    exclude: [
      'packages/**/src/**/*.test.ts',
      'packages/**/src/**/index.ts',
      'packages/**/src/**/__tests__/**',
    ],
    thresholds: {
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70,
    },
  },
});
