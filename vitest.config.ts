import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // 'server-only' throws unconditionally unless resolved under the
      // "react-server" export condition (which webpack applies at build
      // time, but Vite/Vitest doesn't by default). Alias it to the
      // package's own no-op file so server-only modules are importable
      // in tests; the real client/server guard still applies in the
      // actual Next.js build.
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js')
    }
  },
  test: {
    include: ['lib/**/*.test.ts', 'data/**/*.test.ts', 'app/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts'],
    environment: 'node',
    globals: true,
    // bcryptjs is a pure-JS implementation (no native bindings), so
    // cost-12 hashing of multiple backup codes can exceed the 5s default.
    testTimeout: 20000
  }
})
