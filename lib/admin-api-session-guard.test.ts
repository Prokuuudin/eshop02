import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every admin API handler must resolve the caller through the DB-backed session
// (lib/server-auth.ts), which applies the staff session rules — 8 hours from
// sign-in, logout revocation and mandatory MFA. A route that
// read the cookie on its own would stay reachable after the session ended.
const ADMIN_API_DIR = join(process.cwd(), 'app', 'api', 'admin')
const GUARDS = /\b(requireAdminPermission|requireAdmin|requireGrinsImportActor|getServerUser)\s*\(/

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(path)
    return entry.name === 'route.ts' ? [path] : []
  })
}

describe('admin API session guard coverage', () => {
  const files = routeFiles(ADMIN_API_DIR)

  it('finds the admin API routes', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(files.map((file) => [relative(process.cwd(), file)]))('%s resolves the caller through the server session', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    expect(source).toMatch(GUARDS)
    // No route may read the session cookie directly instead of going through server-auth.
    expect(source).not.toMatch(/SESSION_COOKIE|eshop_session/)
  })
})
