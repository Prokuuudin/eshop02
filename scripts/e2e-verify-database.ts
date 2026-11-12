/**
 * Fail-closed E2E database check, run synchronously by playwright.config.ts before the web
 * server or global setup can touch the database (`npm run e2e:verify-db` runs it by hand).
 * Static checks first (no connection to a refused URL), then a read-only identity query.
 */
import { config } from 'dotenv'
import { Client } from 'pg'
import { readLocalEnvDatabaseHosts, resolveE2eDatabaseUrl, verifyE2eDatabaseIdentity } from './e2e-database-guard'

async function main(): Promise<void> {
  config({ path: '.env.e2e', quiet: true })
  const url = resolveE2eDatabaseUrl(process.env, readLocalEnvDatabaseHosts())
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('BEGIN TRANSACTION READ ONLY')
    await verifyE2eDatabaseIdentity((sql) => client.query(sql), process.env.E2E_DATABASE_MARKER)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
}

main().then(
  () => console.log('E2E database identity verified'),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'E2E refused: database check failed')
    process.exit(1)
  },
)
