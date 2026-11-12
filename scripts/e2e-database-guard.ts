import fs from 'node:fs'
import path from 'node:path'
import { parse as parseDotenv } from 'dotenv'

/**
 * E2E fixtures write to the database (including a platform admin whose password and TOTP
 * secret are committed), and the app under test writes orders and accounts. So E2E never
 * uses DATABASE_URL or .env.local: it needs an explicitly named, acknowledged test database.
 *
 * .env.e2e (git-ignored):
 *   E2E_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/hairshop_e2e
 *   E2E_DATABASE_ISOLATED_ACK=isolated-test-db
 *   E2E_DATABASE_MARKER=<16+ random characters, unique to this test database>
 *   E2E_DATABASE_ALLOWED_HOST=ep-example-test.neon.tech   (only for a non-loopback test database)
 *   MFA_ENCRYPTION_KEY=<32 bytes, base64>                 (test-only key)
 *
 * Fail-closed layers, all checked before anything is written:
 *   1. static: the URL is not a production endpoint, not any database named in .env.local,
 *      and is loopback or the explicitly allowed host;
 *   2. identity: the database itself carries the marker comment
 *      `eshop02-e2e-disposable:<E2E_DATABASE_MARKER>` (set with `npm run e2e:mark-db`).
 *      Neon branches share one password with production and a branch copied from
 *      production starts without the comment, so a connection that reaches production or an
 *      unmarked copy of it is refused whatever its hostname looks like.
 *
 * Messages never include the URL: it carries the password.
 */
export const E2E_ISOLATION_ACK = 'isolated-test-db'
export const E2E_DATABASE_MARKER_PREFIX = 'eshop02-e2e-disposable:'
const MIN_MARKER_TOKEN_LENGTH = 16

const PRODUCTION_DATABASE_ENDPOINTS = ['ep-long-glitter-aq88pk3t']
const PRODUCTION_SITE_HOSTS = new Set(['hairshoppro.lv', 'www.hairshoppro.lv'])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Neon pooled and direct hosts of one endpoint differ only by `-pooler`; compare the endpoint. */
export function databaseHostIdentity(host: string): string {
  const lower = host.toLowerCase()
  const neon = /^(ep-[a-z0-9-]+?)(?:-pooler)?\./.exec(lower)
  return neon ? neon[1] : lower
}

/** True for any URL that reaches the production Neon endpoint (pooled or direct). */
export function isProductionDatabaseUrl(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return PRODUCTION_DATABASE_ENDPOINTS.some((endpoint) => host.includes(endpoint))
}

/** For opt-in suites that take a database URL from the environment. */
export function assertNotProductionDatabaseUrl(url: string | undefined, label = 'test database'): void {
  if (!url) throw new Error(`${label}: no database URL`)
  if (isProductionDatabaseUrl(url)) throw new Error(`${label}: refusing the production database`)
}

/**
 * Hosts of every PostgreSQL URL in .env.local (the developer's application database, which
 * points at production). Parsed without loading it into process.env.
 */
export function readLocalEnvDatabaseHosts(cwd = process.cwd()): string[] {
  let raw: string
  try {
    raw = fs.readFileSync(path.join(cwd, '.env.local'), 'utf8')
  } catch {
    return []
  }
  const hosts = new Set<string>()
  for (const value of Object.values(parseDotenv(raw))) {
    try {
      const url = new URL(value.trim())
      if (url.protocol === 'postgres:' || url.protocol === 'postgresql:') hosts.add(url.hostname.toLowerCase())
    } catch {
      // not a URL
    }
  }
  return [...hosts]
}

export function resolveE2eDatabaseUrl(
  env: Record<string, string | undefined>,
  localEnvDatabaseHosts: readonly string[] = [],
): string {
  const candidate = env.E2E_DATABASE_URL?.trim()
  if (!candidate) throw new Error('E2E refused: set E2E_DATABASE_URL to an isolated test database (DATABASE_URL is never used)')
  if (env.E2E_DATABASE_ISOLATED_ACK !== E2E_ISOLATION_ACK) {
    throw new Error(`E2E refused: set E2E_DATABASE_ISOLATED_ACK=${E2E_ISOLATION_ACK} to confirm the database is disposable`)
  }

  let target: URL
  try {
    target = new URL(candidate)
  } catch {
    throw new Error('E2E refused: E2E_DATABASE_URL is not a valid URL')
  }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('E2E refused: E2E_DATABASE_URL must be a PostgreSQL URL')

  const host = target.hostname.toLowerCase()
  if (isProductionDatabaseUrl(candidate)) {
    throw new Error('E2E refused: E2E_DATABASE_URL points at the production database')
  }
  const identity = databaseHostIdentity(host)
  if (!LOOPBACK_HOSTS.has(host) && localEnvDatabaseHosts.some((local) => databaseHostIdentity(local) === identity)) {
    throw new Error('E2E refused: E2E_DATABASE_URL is the application database from .env.local')
  }
  const allowedHost = env.E2E_DATABASE_ALLOWED_HOST?.trim().toLowerCase()
  if (!LOOPBACK_HOSTS.has(host) && host !== allowedHost) {
    throw new Error('E2E refused: a non-loopback test database must match E2E_DATABASE_ALLOWED_HOST exactly')
  }
  return candidate
}

export function e2eDatabaseMarkerValue(token: string | undefined): string {
  const trimmed = token?.trim() ?? ''
  if (trimmed.length < MIN_MARKER_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new Error(`E2E refused: set E2E_DATABASE_MARKER to at least ${MIN_MARKER_TOKEN_LENGTH} characters of [A-Za-z0-9_-]`)
  }
  return `${E2E_DATABASE_MARKER_PREFIX}${trimmed}`
}

/** Reads the marker comment of the connected database (no writes, no schema dependency). */
export const E2E_DATABASE_MARKER_SQL =
  "SELECT shobj_description(d.oid, 'pg_database') AS marker FROM pg_database d WHERE d.datname = current_database()"

type MarkerQuery = (sql: string) => Promise<{ rows: Array<{ marker?: string | null }> }>

/** Positive identity check: the connected database must carry this run's marker. */
export async function verifyE2eDatabaseIdentity(query: MarkerQuery, token: string | undefined): Promise<void> {
  const expected = e2eDatabaseMarkerValue(token)
  const result = await query(E2E_DATABASE_MARKER_SQL)
  const marker = result.rows[0]?.marker ?? null
  if (marker !== expected) {
    throw new Error(
      marker?.startsWith(E2E_DATABASE_MARKER_PREFIX)
        ? 'E2E refused: the database is marked for a different E2E_DATABASE_MARKER'
        : 'E2E refused: the database is not marked as a disposable E2E database (npm run e2e:mark-db)',
    )
  }
}

export function assertE2eBaseUrlIsSafe(baseUrl: string): void {
  let host: string
  try {
    host = new URL(baseUrl).hostname.toLowerCase()
  } catch {
    throw new Error('E2E refused: PLAYWRIGHT_BASE_URL is not a valid URL')
  }
  if (PRODUCTION_SITE_HOSTS.has(host)) throw new Error('E2E refused: PLAYWRIGHT_BASE_URL points at the production site')
}
