import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { NextRequest } from 'next/server'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'
import { prisma, type ExtendedPrismaClient, type ExtendedTransactionClient } from '@/lib/prisma'
import { logOperationalEvent } from '@/lib/observability'

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

// One literal path per file, like the other data stores: Next.js output tracing then resolves exactly
// these files. A directory combined with a computed name (path.resolve(dir, name)) is traced as the
// whole project, which put .next/lock and .git into this route and broke Vercel deployments.
const PRODUCTION_FILE_PATHS: Readonly<Record<ConfigurationFile, string>> = {
  'blog-posts.json': path.join(process.cwd(), 'data', 'blog-posts.json'),
  'site-content.json': path.join(process.cwd(), 'data', 'site-content.json'),
  'custom-products.json': path.join(process.cwd(), 'data', 'custom-products.json'),
  'product-overrides.json': path.join(process.cwd(), 'data', 'product-overrides.json'),
  'banners.json': path.join(process.cwd(), 'data', 'banners.json'),
  'promo-codes.json': path.join(process.cwd(), 'data', 'promo-codes.json'),
  'shipping-settings.json': path.join(process.cwd(), 'data', 'shipping-settings.json'),
  'email-templates.json': path.join(process.cwd(), 'data', 'email-templates.json'),
  'price-groups.json': path.join(process.cwd(), 'data', 'price-groups.json'),
}

const canonicalJson = (value: unknown): string => JSON.stringify(value)
const digest = (text: string): string => createHash('sha256').update(text).digest('hex')

type FileMetadata = { name: ConfigurationFile; sha256: string; bytes: number }
type AuditContext = { actor: ServerUser; request: NextRequest }
type FileOperations = Pick<typeof fs, 'readFile' | 'writeFile' | 'rename' | 'unlink'>
type RestoreDependencies = {
  db: Pick<ExtendedPrismaClient, '$transaction' | 'auditLog'>
  appendAudit: typeof appendServerAudit
  files: FileOperations
  operationId: () => string
}
type RestoreState = {
  operationId: string
  staged: Map<ConfigurationFile, string>
  rollback: Map<ConfigurationFile, string>
  /** sha256 of the staged bytes; compensation only rolls back a file that still holds them. */
  expected: Map<ConfigurationFile, string>
  touched: ConfigurationFile[]
  changed: ConfigurationFile[]
  callbackCompleted: boolean
  failureStage: 'file_replacement' | 'audit_append'
}

const defaultDependencies: RestoreDependencies = {
  db: prisma,
  appendAudit: appendServerAudit,
  files: fs,
  operationId: randomUUID,
}

let restoreQueue: Promise<void> = Promise.resolve()

async function serialized<T>(run: () => Promise<T>): Promise<T> {
  const previous = restoreQueue
  let release = (): void => undefined
  restoreQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    return await run()
  } finally {
    release()
  }
}

function fileMetadata(name: ConfigurationFile, raw: string): FileMetadata {
  return { name, sha256: digest(raw), bytes: Buffer.byteLength(raw) }
}

/** `dataDir` overrides the production directory (tests); temporary files live next to their target. */
function configurationPath(dataDir: string | undefined, filename: ConfigurationFile, suffix = ''): string {
  const destination = dataDir === undefined ? PRODUCTION_FILE_PATHS[filename] : path.join(dataDir, filename)
  const root = path.dirname(destination)
  const target = path.join(root, `${suffix}${filename}`)
  if (path.dirname(target) !== root) throw new Error('invalid_configuration_path')
  return target
}

function semanticDigest(raw: string): string | null {
  try {
    return digest(canonicalJson(JSON.parse(raw) as unknown))
  } catch {
    return null
  }
}

function errorCode(error: unknown): string {
  if (error instanceof ConfigurationRestoreError) return error.code
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code.slice(0, 80)
  return error instanceof Error ? error.name.slice(0, 80) : 'unknown_error'
}

export class ConfigurationRestoreError extends Error {
  constructor(
    public readonly code: string,
    public readonly diagnostics: Record<string, unknown>,
  ) {
    super(code)
    this.name = 'ConfigurationRestoreError'
  }
}

export async function createConfigurationBackup(dataDir?: string): Promise<ConfigurationBackup> {
  const files = {} as ConfigurationBackup['files']
  const manifest = {} as ConfigurationBackup['manifest']
  for (const filename of CONFIGURATION_FILES) {
    const value: unknown = JSON.parse(await fs.readFile(configurationPath(dataDir, filename), 'utf8'))
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

async function stageFiles(
  backup: ConfigurationBackup,
  dataDir: string | undefined,
  state: RestoreState,
  files: FileOperations,
): Promise<void> {
  for (const filename of CONFIGURATION_FILES) {
    const temporary = configurationPath(dataDir, filename, `.${state.operationId}.stage.`)
    const desired = `${JSON.stringify(backup.files[filename], null, 2)}\n`
    await files.writeFile(temporary, desired, { encoding: 'utf8', flag: 'wx' })
    state.staged.set(filename, temporary)
  }
}

async function inspectFiles(
  backup: ConfigurationBackup,
  dataDir: string | undefined,
  state: RestoreState,
  files: FileOperations,
): Promise<{ before: FileMetadata[]; after: FileMetadata[] }> {
  const before: FileMetadata[] = []
  const after: FileMetadata[] = []
  for (const filename of CONFIGURATION_FILES) {
    const destination = configurationPath(dataDir, filename)
    const current = await files.readFile(destination, 'utf8')
    if (semanticDigest(current) === backup.manifest[filename].sha256) continue
    const desired = await files.readFile(state.staged.get(filename)!, 'utf8')
    const rollback = configurationPath(dataDir, filename, `.${state.operationId}.rollback.`)
    await files.writeFile(rollback, current, { encoding: 'utf8', flag: 'wx' })
    state.rollback.set(filename, rollback)
    state.changed.push(filename)
    state.expected.set(filename, digest(desired))
    before.push(fileMetadata(filename, current))
    after.push(fileMetadata(filename, desired))
  }
  return { before, after }
}

async function replaceChangedFiles(
  dataDir: string | undefined,
  state: RestoreState,
  files: FileOperations,
): Promise<void> {
  for (const filename of state.changed) {
    // rename() replaces the destination atomically (MoveFileEx REPLACE_EXISTING on
    // Windows); no unlink first, so readers never observe a missing file and a
    // failed rename leaves the original in place.
    await files.rename(state.staged.get(filename)!, configurationPath(dataDir, filename))
    state.touched.push(filename)
  }
}

async function compensate(
  dataDir: string | undefined,
  state: RestoreState,
  files: FileOperations,
): Promise<ConfigurationFile[]> {
  const failed: ConfigurationFile[] = []
  for (const filename of [...state.touched].reverse()) {
    try {
      const destination = configurationPath(dataDir, filename)
      // Never overwrite a newer state written by another writer after our replacement.
      const current = await files.readFile(destination, 'utf8')
      if (digest(current) !== state.expected.get(filename)) throw new Error('configuration_changed_after_restore')
      await files.rename(state.rollback.get(filename)!, destination)
    } catch {
      failed.push(filename)
    }
  }
  state.touched = failed
  return failed
}

async function cleanupTemporaryFiles(state: RestoreState, files: FileOperations): Promise<void> {
  const cleanupFailures: string[] = []
  const retainedRecoveryFiles: string[] = []
  const retainedRollback = new Set(state.touched.map((filename) => state.rollback.get(filename)))
  for (const temporary of [...state.staged.values(), ...state.rollback.values()]) {
    if (retainedRollback.has(temporary)) {
      retainedRecoveryFiles.push(path.basename(temporary))
      continue
    }
    try {
      await files.unlink(temporary)
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') cleanupFailures.push(path.basename(temporary))
    }
  }
  if (cleanupFailures.length > 0) {
    logOperationalEvent({
      event: 'configuration_restore_temp_cleanup_failed', level: 'warn',
      operationId: state.operationId, leftovers: cleanupFailures,
    })
  }
  if (retainedRecoveryFiles.length > 0) logOperationalEvent({
    event: 'configuration_restore_recovery_files_retained', level: 'error', alert: true,
    operationId: state.operationId, retainedRecoveryFiles,
  })
}

async function restoreInsideTransaction(
  tx: ExtendedTransactionClient,
  backup: ConfigurationBackup,
  audit: AuditContext,
  dataDir: string | undefined,
  state: RestoreState,
  dependencies: RestoreDependencies,
): Promise<string[]> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('configuration-backup-restore'))`
  const metadata = await inspectFiles(backup, dataDir, state, dependencies.files)
  if (state.changed.length === 0) return []
  try {
    state.failureStage = 'file_replacement'
    await replaceChangedFiles(dataDir, state, dependencies.files)
    state.failureStage = 'audit_append'
    await dependencies.appendAudit(tx, audit.request, audit.actor, {
      action: 'settings.configuration_restored',
      entityType: 'configuration',
      entityId: 'configuration-files',
      entityTitle: 'Configuration files',
      requestId: state.operationId,
      before: { files: metadata.before },
      after: { files: metadata.after },
    })
    state.callbackCompleted = true
    return [...state.changed]
  } catch (error) {
    const compensationFailedFiles = await compensate(dataDir, state, dependencies.files)
    const diagnostics = {
      operationId: state.operationId,
      failureStage: state.failureStage,
      auditCommit: 'not_committed',
      compensation: compensationFailedFiles.length === 0 ? 'succeeded' : 'failed',
      compensationFailedFiles,
      errorCode: errorCode(error),
    }
    logOperationalEvent({
      event: 'configuration_restore_failed', level: 'error',
      alert: compensationFailedFiles.length > 0, ...diagnostics,
    })
    throw new ConfigurationRestoreError('configuration_restore_failed', diagnostics)
  }
}

async function resolveUncertainCommit(
  error: unknown,
  dataDir: string | undefined,
  state: RestoreState,
  dependencies: RestoreDependencies,
): Promise<string[]> {
  try {
    const committed = await dependencies.db.auditLog.findFirst({
      where: {
        requestId: state.operationId,
        action: 'settings.configuration_restored',
        entityType: 'configuration',
        entityId: 'configuration-files',
      },
      select: { id: true },
    })
    if (committed) {
      logOperationalEvent({
        event: 'configuration_restore_commit_confirmed_after_error', level: 'warn',
        operationId: state.operationId, changedFiles: state.changed,
      })
      state.touched = []
      return [...state.changed]
    }
    let compensationFailedFiles: ConfigurationFile[] = []
    try {
      await dependencies.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('configuration-backup-restore'))`
        compensationFailedFiles = await compensate(dataDir, state, dependencies.files)
      })
    } catch {
      compensationFailedFiles = await compensate(dataDir, state, dependencies.files)
    }
    const diagnostics = {
      operationId: state.operationId,
      failureStage: 'audit_commit', auditCommit: 'not_committed',
      compensation: compensationFailedFiles.length === 0 ? 'succeeded' : 'failed',
      compensationFailedFiles, errorCode: errorCode(error),
    }
    logOperationalEvent({ event: 'configuration_restore_failed', level: 'error', alert: compensationFailedFiles.length > 0, ...diagnostics })
    throw new ConfigurationRestoreError('configuration_restore_failed', diagnostics)
  } catch (verificationError) {
    if (verificationError instanceof ConfigurationRestoreError) throw verificationError
    const compensationFailedFiles = await compensate(dataDir, state, dependencies.files)
    const diagnostics = {
      operationId: state.operationId,
      failureStage: 'audit_commit_verification', auditCommit: 'unknown',
      compensation: compensationFailedFiles.length === 0 ? 'succeeded' : 'failed',
      compensationFailedFiles, errorCode: errorCode(error),
      verificationErrorCode: errorCode(verificationError),
    }
    logOperationalEvent({ event: 'configuration_restore_consistency_unknown', level: 'error', alert: true, ...diagnostics })
    throw new ConfigurationRestoreError('configuration_restore_consistency_unknown', diagnostics)
  }
}

export async function restoreConfigurationBackup(
  backup: ConfigurationBackup,
  audit: AuditContext,
  dataDir?: string,
  dependencyOverrides: Partial<RestoreDependencies> = {},
): Promise<string[]> {
  validateConfigurationBackup(backup)
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  return serialized(async () => {
    const state: RestoreState = {
      operationId: dependencies.operationId(), staged: new Map(), rollback: new Map(), expected: new Map(),
      touched: [], changed: [], callbackCompleted: false, failureStage: 'file_replacement',
    }
    try {
      await stageFiles(backup, dataDir, state, dependencies.files)
      try {
        const restored = await dependencies.db.$transaction(
          (tx) => restoreInsideTransaction(tx, backup, audit, dataDir, state, dependencies),
          { maxWait: 10_000, timeout: 30_000 },
        )
        // Committed: the replaced files are the new state, rollback copies are obsolete.
        state.touched = []
        return restored
      } catch (error) {
        if (!state.callbackCompleted) throw error
        return await resolveUncertainCommit(error, dataDir, state, dependencies)
      }
    } finally {
      await cleanupTemporaryFiles(state, dependencies.files)
    }
  })
}
