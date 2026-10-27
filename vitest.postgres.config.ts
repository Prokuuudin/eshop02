import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Real-database suites (*.postgres.test.ts). Never part of `npm test`: run one file at a time
// against a disposable database, e.g. a schema-only Neon branch, never production.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    include: ['tests/integration/**/*.postgres.test.ts'],
    environment: 'node',
    globals: true,
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
