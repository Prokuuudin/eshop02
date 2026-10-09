import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

describe('restore refuses unsafe identity before Prisma connection', () => {
  const stage = '11111111-1111-4111-8111-111111111111', prod = '22222222-2222-4222-8222-222222222222'
  const profile = path.join(mkdtempSync(path.join(tmpdir(), 'grins-restore-')), 'registry.json')
  writeFileSync(profile, JSON.stringify({ version: 1, environments: {
    staging: { instanceId: stage, hosts: ['127.0.0.1'], database: 'postgres', schema: 'public' },
    production: { instanceId: prod, hosts: ['prod.example.invalid'], database: 'production', schema: 'public' },
  } }))
  const run = (args: string[], database?: string) => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' }
    for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key]
    if (database) env.DATABASE_URL = database
    return spawnSync(process.execPath, ['--import', 'tsx', path.resolve('scripts/restore-grins-manual-import.ts'), ...args], { env, encoding: 'utf8', windowsHide: true })
  }
  for (const mode of [['--list'], ['--backup', 'synthetic'], ['--backup', 'synthetic', '--execute']]) {
    it(`rejects production URL labelled staging for ${mode.join(' ')}`, () => {
      const result = run(['--environment-profile', profile, '--target', 'staging', '--confirm-operation', stage, ...mode], 'postgresql://synthetic:private@prod.example.invalid/production')
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('database_identity_not_confirmed')
      expect(result.stderr).not.toContain('synthetic:private')
    })
  }
  it('requires a private registry', () => {
    expect(run(['--list']).stderr).toContain('environment_registry_invalid')
  })
  it('requires separate production acknowledgement before connecting', () => {
    expect(run(['--environment-profile', profile, '--target', 'production', '--confirm-operation', prod, '--list'], 'postgresql://synthetic@prod.example.invalid/production').stderr).toContain('production_confirmation_required')
  })
  it('does not load dotenv when DATABASE_URL is absent', () => {
    expect(run(['--environment-profile', profile, '--target', 'staging', '--confirm-operation', stage, '--list']).stderr).toContain('database_identity_not_confirmed')
  })
})
