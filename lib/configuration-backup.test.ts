import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

vi.mock('server-only', () => ({}))
import { CONFIGURATION_FILES, createConfigurationBackup, restoreConfigurationBackup, validateConfigurationBackup } from './configuration-backup'

const directories: string[] = []
async function fixture(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'configuration-backup-'))
  directories.push(dir)
  await Promise.all(CONFIGURATION_FILES.map((name, index) => writeFile(path.join(dir, name), JSON.stringify({ index }))))
  return dir
}
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))) })

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

  it('restores every supported file', async () => {
    const dir = await fixture()
    const backup = await createConfigurationBackup(dir)
    await writeFile(path.join(dir, 'site-content.json'), '{"changed":true}')
    await restoreConfigurationBackup(backup, dir)
    expect(JSON.parse(await readFile(path.join(dir, 'site-content.json'), 'utf8'))).toEqual({ index: 1 })
  })
})
