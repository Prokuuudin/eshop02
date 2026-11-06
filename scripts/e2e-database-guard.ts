/**
 * E2E fixtures write to the database (including a platform admin whose password and TOTP
 * secret are committed), and the app under test writes orders and accounts. So E2E never
 * uses DATABASE_URL or .env.local: it needs an explicitly named, acknowledged test database.
 *
 * .env.e2e (git-ignored):
 *   E2E_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/hairshop_e2e
 *   E2E_DATABASE_ISOLATED_ACK=isolated-test-db
 *   E2E_DATABASE_ALLOWED_HOST=ep-example-test.neon.tech   (only for a non-loopback test database)
 *   MFA_ENCRYPTION_KEY=<32 bytes, base64>                 (test-only key)
 *
 * Neon branches share one password with production, so only the endpoint host tells them
 * apart. Messages never include the URL: it carries the password.
 */
export const E2E_ISOLATION_ACK = 'isolated-test-db'

const PRODUCTION_DATABASE_ENDPOINTS = ['ep-long-glitter-aq88pk3t']
const PRODUCTION_SITE_HOSTS = new Set(['hairshoppro.lv', 'www.hairshoppro.lv'])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function resolveE2eDatabaseUrl(env: Record<string, string | undefined>): string {
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
  if (PRODUCTION_DATABASE_ENDPOINTS.some((endpoint) => host.includes(endpoint))) {
    throw new Error('E2E refused: E2E_DATABASE_URL points at the production database')
  }
  const allowedHost = env.E2E_DATABASE_ALLOWED_HOST?.trim().toLowerCase()
  if (!LOOPBACK_HOSTS.has(host) && host !== allowedHost) {
    throw new Error('E2E refused: a non-loopback test database must match E2E_DATABASE_ALLOWED_HOST exactly')
  }
  return candidate
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
