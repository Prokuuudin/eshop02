import { Client } from 'pg'
import { readLocalEnvDatabaseHosts, resolveE2eDatabaseUrl, verifyE2eDatabaseIdentity } from '../scripts/e2e-database-guard'

/**
 * The only way E2E code opens a database connection: the guarded E2E URL (never DATABASE_URL
 * or .env.local), and the connected database must carry this run's disposable marker before
 * the caller gets the client.
 */
export async function connectE2eDatabase(): Promise<Client> {
  const client = new Client({ connectionString: resolveE2eDatabaseUrl(process.env, readLocalEnvDatabaseHosts()) })
  await client.connect()
  try {
    await verifyE2eDatabaseIdentity((sql) => client.query(sql), process.env.E2E_DATABASE_MARKER)
  } catch (error) {
    await client.end().catch(() => undefined)
    throw error
  }
  return client
}
