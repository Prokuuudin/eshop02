import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  },
  test: {
    include: ['lib/**/*.test.ts', 'data/**/*.test.ts', 'app/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        // Measured whole-project baseline. Raise these values as uncovered UI/routes gain tests.
        lines: 22,
        functions: 59,
        statements: 22,
        branches: 68,
      },
    },
  }
})
