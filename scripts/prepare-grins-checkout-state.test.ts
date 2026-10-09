import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('checkout preparation CLI refuses unconfirmed actions before DB import', () => {
  const run = (args: string[], database?: string) => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' }
    for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key]
    if (database) env.DATABASE_URL = database
    return spawnSync(process.execPath, ['--import', 'tsx', path.resolve('scripts/prepare-grins-checkout-state.ts'), ...args], { env, encoding: 'utf8', windowsHide: true })
  }
  it('does not attempt to initialize or import Prisma with no explicit target', () => {
    const result = run([])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('explicit_target_database_and_state_required')
    expect(result.stderr).not.toContain('No DATABASE_URL set')
  })
  it('rejects initialization when the intended state is closed', () => {
    const result = run(['--target', 'staging', '--expected-host', '127.0.0.1', '--expected-database', 'postgres', '--expect-state', 'closed', '--initialize', '--confirm-initial-state', 'open'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('initial_open_state_confirmation_required')
  })
  it('rejects mismatched database identity before connecting', () => {
    const result = run(['--target', 'staging', '--expected-host', '127.0.0.1', '--expected-database', 'other', '--expect-state', 'open'], 'postgresql://synthetic:synthetic@127.0.0.1:9/postgres')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('database_identity_not_confirmed')
    expect(result.stderr).not.toContain('synthetic:synthetic')
  })
})
