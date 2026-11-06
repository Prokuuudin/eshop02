import { describe, expect, it } from 'vitest'
import { assertE2eBaseUrlIsSafe, E2E_ISOLATION_ACK, resolveE2eDatabaseUrl } from './e2e-database-guard'

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
