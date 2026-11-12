import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  assertE2eBaseUrlIsSafe,
  assertNotProductionDatabaseUrl,
  databaseHostIdentity,
  E2E_DATABASE_MARKER_SQL,
  E2E_ISOLATION_ACK,
  e2eDatabaseMarkerValue,
  readLocalEnvDatabaseHosts,
  resolveE2eDatabaseUrl,
  verifyE2eDatabaseIdentity,
} from './e2e-database-guard'

const ack = { E2E_DATABASE_ISOLATED_ACK: E2E_ISOLATION_ACK }
const prod = 'postgresql://owner:top-secret@ep-long-glitter-aq88pk3t-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

describe('resolveE2eDatabaseUrl', () => {
  it('requires an explicit test database and never falls back to DATABASE_URL', () => {
    expect(() => resolveE2eDatabaseUrl({ ...ack })).toThrow(/E2E_DATABASE_URL/)
    expect(() => resolveE2eDatabaseUrl({ ...ack, DATABASE_URL: 'postgresql://u:p@127.0.0.1/db' })).toThrow(/E2E_DATABASE_URL/)
  })

  it('requires the isolation acknowledgement', () => {
    expect(() => resolveE2eDatabaseUrl({ E2E_DATABASE_URL: 'postgresql://u:p@127.0.0.1/db' })).toThrow(/ISOLATED_ACK/)
    expect(() => resolveE2eDatabaseUrl({ E2E_DATABASE_URL: 'postgresql://u:p@127.0.0.1/db', E2E_DATABASE_ISOLATED_ACK: 'yes' })).toThrow(/ISOLATED_ACK/)
  })

  it('blocks production Neon, including the pooled host and an allow-list that names it', () => {
    expect(() => resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: prod })).toThrow(/production/)
    expect(() => resolveE2eDatabaseUrl({
      ...ack, E2E_DATABASE_URL: prod, E2E_DATABASE_ALLOWED_HOST: 'ep-long-glitter-aq88pk3t-pooler.c-8.us-east-1.aws.neon.tech',
    })).toThrow(/production/)
    expect(() => resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: prod.replace('ep-long-glitter', 'EP-LONG-GLITTER') })).toThrow(/production/)
  })

  it('never includes the connection string in an error', () => {
    for (const env of [{ ...ack, E2E_DATABASE_URL: prod }, { ...ack, E2E_DATABASE_URL: 'postgresql://u:top-secret@other.neon.tech/db' }, { ...ack, E2E_DATABASE_URL: 'top-secret' }]) {
      expect(() => resolveE2eDatabaseUrl(env)).toThrow()
      try { resolveE2eDatabaseUrl(env) } catch (error) { expect(String(error)).not.toContain('top-secret') }
    }
  })

  it('rejects a remote host unless it is explicitly allowed', () => {
    const remote = 'postgresql://u:p@ep-test-branch.neon.tech/db'
    expect(() => resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: remote })).toThrow(/ALLOWED_HOST/)
    expect(() => resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: remote, E2E_DATABASE_ALLOWED_HOST: 'other.neon.tech' })).toThrow(/ALLOWED_HOST/)
    expect(resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: remote, E2E_DATABASE_ALLOWED_HOST: 'ep-test-branch.neon.tech' })).toBe(remote)
  })

  it('accepts an acknowledged loopback database and rejects other protocols', () => {
    expect(resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/e2e' })).toContain('127.0.0.1')
    expect(resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: 'postgres://u:p@localhost/e2e' })).toContain('localhost')
    expect(() => resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: 'mysql://u:p@127.0.0.1/e2e' })).toThrow(/PostgreSQL/)
    expect(() => resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: 'not a url' })).toThrow(/valid URL/)
  })
})

describe('assertE2eBaseUrlIsSafe', () => {
  it('blocks the production site and allows others', () => {
    expect(() => assertE2eBaseUrlIsSafe('https://hairshoppro.lv')).toThrow(/production/)
    expect(() => assertE2eBaseUrlIsSafe('https://www.hairshoppro.lv/lv')).toThrow(/production/)
    expect(() => assertE2eBaseUrlIsSafe('nonsense')).toThrow(/valid URL/)
    expect(() => assertE2eBaseUrlIsSafe('http://localhost:3005')).not.toThrow()
  })
})

describe('.env.local is never an E2E database', () => {
  const local = 'ep-dev-app-a1b2c3-pooler.c-2.eu-central-1.aws.neon.tech'
  const remote = (host: string) => `postgresql://u:p@${host}/db`

  it('treats the pooled and direct hosts of one Neon endpoint as the same database', () => {
    expect(databaseHostIdentity(local)).toBe('ep-dev-app-a1b2c3')
    expect(databaseHostIdentity('ep-dev-app-a1b2c3.c-2.eu-central-1.aws.neon.tech')).toBe('ep-dev-app-a1b2c3')
    expect(databaseHostIdentity('DB.Example.org')).toBe('db.example.org')
  })

  it('refuses a database named in .env.local even when it is explicitly allowed', () => {
    for (const host of [local, 'ep-dev-app-a1b2c3.c-2.eu-central-1.aws.neon.tech']) {
      expect(() => resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: remote(host), E2E_DATABASE_ALLOWED_HOST: host }, [local])).toThrow(/\.env\.local/)
    }
    const other = 'ep-test-branch-d4e5f6.c-2.eu-central-1.aws.neon.tech'
    expect(resolveE2eDatabaseUrl({ ...ack, E2E_DATABASE_URL: remote(other), E2E_DATABASE_ALLOWED_HOST: other }, [local])).toBe(remote(other))
  })

  it('reads only PostgreSQL hosts from .env.local, without loading it into the environment', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-guard-'))
    try {
      expect(readLocalEnvDatabaseHosts(dir)).toEqual([])
      fs.writeFileSync(path.join(dir, '.env.local'), [
        `DATABASE_URL="postgresql://owner:fake@${local}/neondb?sslmode=require"`,
        'POSTGRES_URL_NON_POOLING=postgres://owner:fake@Direct.Example.org:5432/neondb',
        'NEXT_PUBLIC_SITE_URL=https://example.org',
        'E2E_GUARD_TEST_ONLY=1',
      ].join('\n'))
      expect(readLocalEnvDatabaseHosts(dir).sort()).toEqual(['direct.example.org', local])
      expect(process.env.E2E_GUARD_TEST_ONLY).toBeUndefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('database identity marker', () => {
  const token = 'local-docker-e2e-0001'
  const answer = (marker: string | null) => vi.fn(async (_sql: string) => ({ rows: [{ marker }] }))

  it('requires a long, simple marker token', () => {
    expect(() => e2eDatabaseMarkerValue(undefined)).toThrow(/E2E_DATABASE_MARKER/)
    expect(() => e2eDatabaseMarkerValue('short')).toThrow(/E2E_DATABASE_MARKER/)
    expect(() => e2eDatabaseMarkerValue("x'; DROP TABLE x; --aaaaaaa")).toThrow(/E2E_DATABASE_MARKER/)
    expect(e2eDatabaseMarkerValue(token)).toBe(`eshop02-e2e-disposable:${token}`)
  })

  it('refuses an unmarked database, such as production or a fresh copy of it', async () => {
    await expect(verifyE2eDatabaseIdentity(answer(null), token)).rejects.toThrow(/not marked/)
    await expect(verifyE2eDatabaseIdentity(answer('Production database'), token)).rejects.toThrow(/not marked/)
    await expect(verifyE2eDatabaseIdentity(async () => ({ rows: [] }), token)).rejects.toThrow(/not marked/)
  })

  it('refuses a database marked for another run', async () => {
    await expect(verifyE2eDatabaseIdentity(answer('eshop02-e2e-disposable:some-other-branch-01'), token)).rejects.toThrow(/different/)
  })

  it('accepts the matching marker after one read-only query, and refuses before querying without a token', async () => {
    const query = answer(`eshop02-e2e-disposable:${token}`)
    await expect(verifyE2eDatabaseIdentity(query, token)).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(E2E_DATABASE_MARKER_SQL)
    expect(E2E_DATABASE_MARKER_SQL).toMatch(/^SELECT /)

    const unused = answer(null)
    await expect(verifyE2eDatabaseIdentity(unused, undefined)).rejects.toThrow(/E2E_DATABASE_MARKER/)
    expect(unused).not.toHaveBeenCalled()
  })
})

describe('assertNotProductionDatabaseUrl', () => {
  it('refuses production and a missing URL, allows others', () => {
    expect(() => assertNotProductionDatabaseUrl(prod)).toThrow(/production/)
    expect(() => assertNotProductionDatabaseUrl(prod.replace('-pooler', ''))).toThrow(/production/)
    expect(() => assertNotProductionDatabaseUrl(undefined)).toThrow(/no database URL/)
    expect(() => assertNotProductionDatabaseUrl('postgresql://u:p@127.0.0.1/db')).not.toThrow()
    try { assertNotProductionDatabaseUrl(prod) } catch (error) { expect(String(error)).not.toContain('top-secret') }
  })
})
