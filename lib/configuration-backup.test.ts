import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { NextRequest } from 'next/server'
import path from 'node:path'
import os from 'node:os'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))

import {
  CONFIGURATION_FILES,
  ConfigurationRestoreError,
  createConfigurationBackup,
  restoreConfigurationBackup,
  validateConfigurationBackup,
} from './configuration-backup'

const directories: string[] = []
const actor = { id: 'admin-1', email: 'admin@example.test', name: 'Admin' }
const request = new NextRequest('http://localhost/api/admin/backup', { method: 'POST' })
const audit = { actor, request } as never
type TestTx = { $executeRaw: ReturnType<typeof vi.fn> }

async function fixture(seed = 0): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'configuration-backup-'))
  directories.push(dir)
  await Promise.all(CONFIGURATION_FILES.map((name, index) => writeFile(
    path.join(dir, name),
    JSON.stringify({ index: index + seed }),
  )))
  return dir
}

function dependencies(options: {
  appendAudit?: ReturnType<typeof vi.fn>
  transaction?: (run: (tx: TestTx) => Promise<string[]>, tx: TestTx) => Promise<string[]>
  auditLookup?: ReturnType<typeof vi.fn>
  files?: Record<string, unknown>
} = {}) {
  const appendAudit = options.appendAudit ?? vi.fn().mockResolvedValue(undefined)
  const auditLookup = options.auditLookup ?? vi.fn().mockResolvedValue(null)
  const tx = { $executeRaw: vi.fn().mockResolvedValue(0) }
  const transaction = vi.fn(async (run: (tx: TestTx) => Promise<string[]>) => (
    options.transaction ? options.transaction(run, tx) : run(tx)
  ))
  return {
    appendAudit,
    tx,
    transaction,
    overrides: {
      db: { $transaction: transaction, auditLog: { findFirst: auditLookup } },
      appendAudit,
      files: options.files ?? { readFile, writeFile, rename, unlink },
      operationId: () => 'restore-operation-1',
    },
  }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('configuration backup', () => {
  it('creates a complete backup with valid checksums', async () => {
    const backup = await createConfigurationBackup(await fixture())
    expect(Object.keys(backup.files)).toEqual(CONFIGURATION_FILES)
    expect(() => validateConfigurationBackup(backup)).not.toThrow()
  })

  it('rejects modified and incomplete backups', async () => {
    const backup = await createConfigurationBackup(await fixture())
    backup.files['site-content.json'] = { changed: true }
    expect(() => validateConfigurationBackup(backup)).toThrow('backup_checksum_mismatch')
    delete (backup.files as Partial<typeof backup.files>)['site-content.json']
    expect(() => validateConfigurationBackup(backup)).toThrow('incomplete_backup')
  })

  it('restores changed files and audits only names, byte sizes and hashes', async () => {
    const source = await fixture()
    const target = await fixture()
    const backup = await createConfigurationBackup(source)
    await writeFile(path.join(target, 'site-content.json'), '{"secret":"must-not-enter-audit"}')
    const harness = dependencies()

    await expect(restoreConfigurationBackup(backup, audit, target, harness.overrides as never))
      .resolves.toEqual(['site-content.json'])

    expect(JSON.parse(await readFile(path.join(target, 'site-content.json'), 'utf8'))).toEqual({ index: 1 })
    expect(harness.appendAudit).toHaveBeenCalledWith(harness.tx, request, actor, expect.objectContaining({
      action: 'settings.configuration_restored',
      entityType: 'configuration',
      entityId: 'configuration-files',
      requestId: 'restore-operation-1',
      before: { files: [expect.objectContaining({ name: 'site-content.json', bytes: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })] },
      after: { files: [expect.objectContaining({ name: 'site-content.json', bytes: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })] },
    }))
    expect(JSON.stringify(harness.appendAudit.mock.calls[0][3])).not.toContain('must-not-enter-audit')
    expect((await readdir(target)).sort()).toEqual([...CONFIGURATION_FILES].sort())
  })

  it('does not replace files or append an event for the same semantic state', async () => {
    const target = await fixture()
    const backup = await createConfigurationBackup(target)
    const renameMock = vi.fn(rename)
    const harness = dependencies({ files: {
      readFile, writeFile, rename: renameMock, unlink,
    } })

    await expect(restoreConfigurationBackup(backup, audit, target, harness.overrides as never)).resolves.toEqual([])

    expect(renameMock).not.toHaveBeenCalled()
    expect(harness.appendAudit).not.toHaveBeenCalled()
    expect((await readdir(target)).sort()).toEqual([...CONFIGURATION_FILES].sort())
  })

  it('serializes parallel restores and preserves the second complete state', async () => {
    const firstSource = await fixture(100)
    const secondSource = await fixture(200)
    const target = await fixture()
    const firstBackup = await createConfigurationBackup(firstSource)
    const secondBackup = await createConfigurationBackup(secondSource)
    let active = 0
    let maxActive = 0
    const harness = dependencies({
      transaction: async (run, transactionTx) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        try {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return await run(transactionTx)
        } finally {
          active -= 1
        }
      },
    })

    await Promise.all([
      restoreConfigurationBackup(firstBackup, audit, target, harness.overrides as never),
      restoreConfigurationBackup(secondBackup, audit, target, {
        ...harness.overrides, operationId: () => 'restore-operation-2',
      } as never),
    ])

    expect(maxActive).toBe(1)
    expect(harness.appendAudit).toHaveBeenCalledTimes(2)
    expect(JSON.parse(await readFile(path.join(target, 'site-content.json'), 'utf8'))).toEqual({ index: 201 })
  })

  it('restores every original after a failure following the first replacement', async () => {
    const source = await fixture(100)
    const target = await fixture()
    const backup = await createConfigurationBackup(source)
    const originals = await Promise.all(CONFIGURATION_FILES.map((name) => readFile(path.join(target, name), 'utf8')))
    let replacementRenames = 0
    const renameMock = vi.fn(async (from: string, to: string) => {
      if (from.includes('.stage.')) {
        replacementRenames += 1
        if (replacementRenames === 2) throw Object.assign(new Error('simulated rename failure'), { code: 'EACCES' })
      }
      await rename(from, to)
    })
    const harness = dependencies({ files: { readFile, writeFile, rename: renameMock, unlink } })

    await expect(restoreConfigurationBackup(backup, audit, target, harness.overrides as never))
      .rejects.toMatchObject({ code: 'configuration_restore_failed' })

    await Promise.all(CONFIGURATION_FILES.map(async (name, index) => {
      expect(await readFile(path.join(target, name), 'utf8')).toBe(originals[index])
    }))
    expect(harness.appendAudit).not.toHaveBeenCalled()
  })

  it('restores every original when audit append fails', async () => {
    const source = await fixture(100)
    const target = await fixture()
    const backup = await createConfigurationBackup(source)
    const originals = await Promise.all(CONFIGURATION_FILES.map((name) => readFile(path.join(target, name), 'utf8')))
    const appendAudit = vi.fn().mockRejectedValue(new Error('audit unavailable'))
    const harness = dependencies({ appendAudit })

    await expect(restoreConfigurationBackup(backup, audit, target, harness.overrides as never))
      .rejects.toMatchObject({
        code: 'configuration_restore_failed',
        diagnostics: { auditCommit: 'not_committed', compensation: 'succeeded' },
      })

    await Promise.all(CONFIGURATION_FILES.map(async (name, index) => {
      expect(await readFile(path.join(target, name), 'utf8')).toBe(originals[index])
    }))
  })

  it('reports failed compensation and retains the rollback copy for recovery', async () => {
    const source = await fixture(100)
    const target = await fixture()
    const backup = await createConfigurationBackup(source)
    const originalSiteContent = await readFile(path.join(target, 'site-content.json'), 'utf8')
    let replacementRenames = 0
    const renameMock = vi.fn(async (from: string, to: string) => {
      if (from.includes('.stage.')) {
        replacementRenames += 1
        if (replacementRenames === 2) throw Object.assign(new Error('replacement failed'), { code: 'EACCES' })
      }
      if (from.includes('.rollback.') && from.endsWith('blog-posts.json')) {
        throw Object.assign(new Error('rollback failed'), { code: 'EACCES' })
      }
      await rename(from, to)
    })
    const harness = dependencies({ files: { readFile, writeFile, rename: renameMock, unlink } })

    await expect(restoreConfigurationBackup(backup, audit, target, harness.overrides as never))
      .rejects.toMatchObject({
        code: 'configuration_restore_failed',
        diagnostics: {
          auditCommit: 'not_committed', compensation: 'failed',
          compensationFailedFiles: ['blog-posts.json'],
        },
      })
    // The file whose replacement failed was never removed: rename is an atomic replace.
    expect(await readFile(path.join(target, 'site-content.json'), 'utf8')).toBe(originalSiteContent)
    await expect(readFile(
      path.join(target, '.restore-operation-1.rollback.blog-posts.json'),
      'utf8',
    )).resolves.toContain('"index":0')
  })

  it('does not roll back over a newer state written after the uncertain commit', async () => {
    const source = await fixture(100)
    const target = await fixture()
    const backup = await createConfigurationBackup(source)
    const newer = '{"written":"by another restore"}'
    const harness = dependencies({
      transaction: async (run, transactionTx) => {
        await run(transactionTx)
        await writeFile(path.join(target, 'site-content.json'), newer)
        throw new Error('commit response lost')
      },
      auditLookup: vi.fn().mockResolvedValue(null),
    })

    await expect(restoreConfigurationBackup(backup, audit, target, harness.overrides as never))
      .rejects.toMatchObject({
        code: 'configuration_restore_failed',
        diagnostics: {
          failureStage: 'audit_commit', compensation: 'failed',
          compensationFailedFiles: ['site-content.json'],
        },
      })
    expect(await readFile(path.join(target, 'site-content.json'), 'utf8')).toBe(newer)
    expect(JSON.parse(await readFile(path.join(target, 'blog-posts.json'), 'utf8'))).toEqual({ index: 0 })
  })

  it('returns the changed files when the audit row proves the uncertain commit succeeded', async () => {
    const source = await fixture(100)
    const target = await fixture()
    const backup = await createConfigurationBackup(source)
    const harness = dependencies({
      transaction: async (run, transactionTx) => {
        await run(transactionTx)
        throw new Error('commit response lost')
      },
      auditLookup: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    })

    await expect(restoreConfigurationBackup(backup, audit, target, harness.overrides as never))
      .resolves.toEqual([...CONFIGURATION_FILES])
    expect(JSON.parse(await readFile(path.join(target, 'site-content.json'), 'utf8'))).toEqual({ index: 101 })
    expect((await readdir(target)).sort()).toEqual([...CONFIGURATION_FILES].sort())
  })

  it('reports an unknown audit commit and compensates when verification is unavailable', async () => {
    const source = await fixture(100)
    const target = await fixture()
    const backup = await createConfigurationBackup(source)
    const originals = await Promise.all(CONFIGURATION_FILES.map((name) => readFile(path.join(target, name), 'utf8')))
    const harness = dependencies({
      transaction: async (run, transactionTx) => {
        await run(transactionTx)
        throw new Error('commit response lost')
      },
      auditLookup: vi.fn().mockRejectedValue(new Error('database unavailable')),
    })

    const error = await restoreConfigurationBackup(backup, audit, target, harness.overrides as never).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ConfigurationRestoreError)
    expect(error).toMatchObject({ code: 'configuration_restore_consistency_unknown' })

    await Promise.all(CONFIGURATION_FILES.map(async (name, index) => {
      expect(await readFile(path.join(target, name), 'utf8')).toBe(originals[index])
    }))
  })
})

describe('configuration backup default location', () => {
  it('reads and restores the production files under <cwd>/data when no directory is passed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'configuration-backup-cwd-'))
    directories.push(root)
    const data = path.join(root, 'data')
    await mkdir(data)
    await Promise.all(CONFIGURATION_FILES.map((name, index) => writeFile(path.join(data, name), JSON.stringify({ index }))))
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root)
    try {
      vi.resetModules()
      // The production paths are fixed when the module loads, so it is loaded under the mocked cwd.
      const fresh = await import('./configuration-backup')
      const backup = await fresh.createConfigurationBackup()
      expect(backup.files['price-groups.json']).toEqual({ index: CONFIGURATION_FILES.indexOf('price-groups.json') })

      await writeFile(path.join(data, 'banners.json'), JSON.stringify({ index: 'changed' }))
      const harness = dependencies()
      await expect(fresh.restoreConfigurationBackup(backup, audit, undefined, harness.overrides as never)).resolves.toEqual(['banners.json'])
      expect(JSON.parse(await readFile(path.join(data, 'banners.json'), 'utf8'))).toEqual({ index: CONFIGURATION_FILES.indexOf('banners.json') })
      expect((await readdir(data)).sort()).toEqual([...CONFIGURATION_FILES].sort())
    } finally {
      cwd.mockRestore()
    }
  })
})
