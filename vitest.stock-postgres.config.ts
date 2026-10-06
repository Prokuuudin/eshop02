import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Never fall back to the application's database. This suite intentionally writes
// fixtures, and is restricted to an explicitly acknowledged isolated local DB.
const candidate = process.env.STOCK_TEST_DATABASE_URL
if (!candidate || process.env.STOCK_TEST_WRITE_ACK !== 'isolated-local') {
  throw new Error('STOCK_TEST_DATABASE_URL and STOCK_TEST_WRITE_ACK=isolated-local are required')
}
let target: URL
try { target = new URL(candidate) } catch { throw new Error('Invalid stock test target; its value is not logged') }
if (!['postgres:', 'postgresql:'].includes(target.protocol)
  || !['127.0.0.1', 'localhost'].includes(target.hostname)
  || !/^\/hairshop_stock_race_[a-z0-9_]+$/.test(target.pathname)) {
  throw new Error('Stock tests require a dedicated loopback hairshop_stock_race_* database')
}
process.env.DATABASE_URL = candidate

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './') } },
  test: {
    include: ['tests/integration/stock-release-race.postgres.test.ts'],
    env: { DATABASE_URL: candidate },
    environment: 'node', pool: 'forks', fileParallelism: false, maxWorkers: 1,
    testTimeout: 120_000, hookTimeout: 30_000,
  },
})
