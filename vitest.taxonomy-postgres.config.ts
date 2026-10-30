import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Never fall back to the application's database. This suite truncates the
// taxonomy staging/mirror tables, so it only runs against an explicitly
// acknowledged isolated database (a throwaway Neon branch or a loopback DB).
const PRODUCTION_ENDPOINTS = ['ep-long-glitter-aq88pk3t']
const candidate = process.env.TAXONOMY_TEST_DATABASE_URL
if (!candidate || process.env.TAXONOMY_TEST_WRITE_ACK !== 'isolated-branch') {
  throw new Error('TAXONOMY_TEST_DATABASE_URL and TAXONOMY_TEST_WRITE_ACK=isolated-branch are required')
}
let target: URL
try { target = new URL(candidate) } catch { throw new Error('Invalid taxonomy test target; its value is not logged') }
if (!['postgres:', 'postgresql:'].includes(target.protocol)
  || PRODUCTION_ENDPOINTS.some(endpoint => target.hostname.startsWith(endpoint))) {
  throw new Error('Taxonomy tests refuse the production database')
}
process.env.DATABASE_URL = candidate

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './') } },
  test: {
    include: [
      'tests/integration/hairshop-taxonomy-staging.postgres.test.ts',
      'tests/integration/hairshop-catalog-sync-v1-lock.postgres.test.ts',
      'tests/integration/brand-line-bootstrap.postgres.test.ts',
      'tests/integration/brand-line-admin.postgres.test.ts',
    ],
    env: { DATABASE_URL: candidate },
    environment: 'node', pool: 'forks', fileParallelism: false, maxWorkers: 1,
    testTimeout: 600_000, hookTimeout: 60_000,
  },
})
