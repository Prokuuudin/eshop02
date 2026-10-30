import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Stage-5 integration tests use a transaction that is deliberately rolled back.
// Keep a separate config from the taxonomy suite: that suite truncates the real
// snapshot and therefore must not be used for discount verification.
const PRODUCTION_ENDPOINTS = ['ep-long-glitter-aq88pk3t']
const REQUIRED_TEST_ENDPOINT = 'ep-empty-feather-aqiutjd0'
const candidate = process.env.TAXONOMY_TEST_DATABASE_URL
if (!candidate || process.env.TAXONOMY_TEST_WRITE_ACK !== 'isolated-branch') {
  throw new Error('TAXONOMY_TEST_DATABASE_URL and TAXONOMY_TEST_WRITE_ACK=isolated-branch are required')
}
let target: URL
try { target = new URL(candidate) } catch { throw new Error('Invalid stage-5 test target; its value is not logged') }
if (!['postgres:', 'postgresql:'].includes(target.protocol)
  || !target.hostname.startsWith(REQUIRED_TEST_ENDPOINT)
  || PRODUCTION_ENDPOINTS.some(endpoint => target.hostname.startsWith(endpoint))) {
  throw new Error('Stage-5 tests refuse every database except the approved isolated branch')
}
process.env.DATABASE_URL = candidate

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './') } },
  test: {
    include: ['tests/integration/brand-line-discounts.postgres.test.ts'],
    env: { DATABASE_URL: candidate },
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 600_000,
    hookTimeout: 60_000,
  },
})
