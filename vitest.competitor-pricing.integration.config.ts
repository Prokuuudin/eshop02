import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    include: ['tests/competitor-pricing-integration/**/*.integration.test.ts'],
    setupFiles: ['tests/competitor-pricing-integration/guard.setup.ts'],
    environment: 'node',
    globals: true,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    bail: 1,
  },
})
