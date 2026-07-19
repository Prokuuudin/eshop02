import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    include: ['tests/integration/**/*.integration.test.ts'],
    environment: 'node',
    globals: true,
    pool: 'forks',
    fileParallelism: false,
  },
})
