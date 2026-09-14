import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const CONFIGURATION_BACKUP_VERSION = 1
export const CONFIGURATION_FILES = [
  'blog-posts.json', 'site-content.json', 'custom-products.json',
  'product-overrides.json', 'banners.json', 'promo-codes.json',
  'shipping-settings.json', 'email-templates.json', 'price-groups.json',
] as const

type ConfigurationFile = (typeof CONFIGURATION_FILES)[number]
export type ConfigurationBackup = {
  kind: 'configuration-backup'
  version: number
  createdAt: string
  manifest: Record<ConfigurationFile, { sha256: string; bytes: number }>
  files: Record<ConfigurationFile, unknown>
}

const canonicalJson = (value: unknown): string => JSON.stringify(value)
const digest = (text: string): string => createHash('sha256').update(text).digest('hex')

export async function createConfigurationBackup(dataDir = path.join(process.cwd(), 'data')): Promise<ConfigurationBackup> {
  const files = {} as ConfigurationBackup['files']
  const manifest = {} as ConfigurationBackup['manifest']
  for (const filename of CONFIGURATION_FILES) {
    const value: unknown = JSON.parse(await fs.readFile(path.join(dataDir, filename), 'utf8'))
    const canonical = canonicalJson(value)
    files[filename] = value
    manifest[filename] = { sha256: digest(canonical), bytes: Buffer.byteLength(canonical) }
  }
  return { kind: 'configuration-backup', version: CONFIGURATION_BACKUP_VERSION, createdAt: new Date().toISOString(), manifest, files }
}

export function validateConfigurationBackup(value: unknown): asserts value is ConfigurationBackup {
  if (!value || typeof value !== 'object') throw new Error('invalid_backup')
  const backup = value as Partial<ConfigurationBackup>
  if (backup.kind !== 'configuration-backup' || backup.version !== CONFIGURATION_BACKUP_VERSION) throw new Error('unsupported_backup_version')
  if (!backup.files || typeof backup.files !== 'object' || !backup.manifest || typeof backup.manifest !== 'object') throw new Error('invalid_backup')
  const actual = Object.keys(backup.files).sort()
  const expected = [...CONFIGURATION_FILES].sort()
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) throw new Error('incomplete_backup')
  for (const filename of CONFIGURATION_FILES) {
    const canonical = canonicalJson(backup.files[filename])
    const item = backup.manifest[filename]
    if (!item || item.sha256 !== digest(canonical) || item.bytes !== Buffer.byteLength(canonical)) throw new Error('backup_checksum_mismatch')
  }
}

export async function restoreConfigurationBackup(backup: ConfigurationBackup, dataDir = path.join(process.cwd(), 'data')): Promise<string[]> {
  validateConfigurationBackup(backup)
  const operationId = randomUUID()
  const originals = new Map<string, string>()
  const staged = new Map<string, string>()
  try {
    for (const filename of CONFIGURATION_FILES) {
      const destination = path.join(dataDir, filename)
      originals.set(filename, await fs.readFile(destination, 'utf8'))
      const temporary = path.join(dataDir, `.${filename}.${operationId}.tmp`)
      await fs.writeFile(temporary, `${JSON.stringify(backup.files[filename], null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      staged.set(filename, temporary)
    }
    for (const filename of CONFIGURATION_FILES) await fs.rename(staged.get(filename)!, path.join(dataDir, filename))
    return [...CONFIGURATION_FILES]
  } catch (error) {
    await Promise.all([...originals].map(([filename, raw]) => fs.writeFile(path.join(dataDir, filename), raw, 'utf8').catch(() => undefined)))
    throw error
  } finally {
    await Promise.all([...staged.values()].map((temporary) => fs.unlink(temporary).catch(() => undefined)))
  }
}
