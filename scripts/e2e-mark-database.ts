/**
 * Marks the E2E database from .env.e2e as disposable so the E2E guard accepts it:
 *   npm run e2e:mark-db -- --confirm-disposable
 * The same static guard as the test run refuses production and any .env.local database first.
 * Only the database comment is written; an existing non-E2E comment is never replaced.
 */
import { config } from 'dotenv'
import { Client } from 'pg'
import {
  E2E_DATABASE_MARKER_PREFIX,
  E2E_DATABASE_MARKER_SQL,
  e2eDatabaseMarkerValue,
  readLocalEnvDatabaseHosts,
  resolveE2eDatabaseUrl,
} from './e2e-database-guard'

const POSTGRES_DEFAULT_COMMENT = 'default administrative connection database'

async function main(): Promise<void> {
  config({ path: '.env.e2e', quiet: true })
  const url = resolveE2eDatabaseUrl(process.env, readLocalEnvDatabaseHosts())
  const marker = e2eDatabaseMarkerValue(process.env.E2E_DATABASE_MARKER)
  const host = new URL(url).hostname
  if (!process.argv.includes('--confirm-disposable')) {
    throw new Error(`Refusing without --confirm-disposable: would mark the database on ${host} as a disposable E2E database`)
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const existing = (await client.query<{ marker: string | null }>(E2E_DATABASE_MARKER_SQL)).rows[0]?.marker ?? null
    if (existing === marker) {
      console.log(`Already marked (${host})`)
      return
    }
    // PostgreSQL ships the "postgres" database with this comment; anything else is someone's.
    if (existing && existing !== POSTGRES_DEFAULT_COMMENT && !existing.startsWith(E2E_DATABASE_MARKER_PREFIX)) {
      throw new Error('Refusing: the database already has a comment that is not an E2E marker')
    }
    const { rows } = await client.query<{ name: string }>('SELECT current_database() AS name')
    await client.query(`COMMENT ON DATABASE ${client.escapeIdentifier(rows[0].name)} IS ${client.escapeLiteral(marker)}`)
    console.log(`Marked as disposable E2E database (${host})`)
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'e2e:mark-db failed')
  process.exit(1)
})
