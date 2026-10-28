/**
 * Argument-free operator requests for Plesk "Run script". The operator writes a
 * private one-time JSON request into GRINS_OPERATIONS_DIR (outside the
 * application/document root); npm scripts only choose the operation. Every
 * request is bound to the approved environment registry, the DB marker, the
 * instanceId confirmation and an admin actor; it expires (notAfter) and is
 * consumed (renamed) before the first database write. Operations add their own
 * database-level replay guard inside their transaction.
 */
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'fs'
import path from 'path'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '@/lib/prisma'
import { hasAdminPermission, type AdminPermission } from '@/lib/admin-permissions'
import {
  guardGrinsTransactions,
  resolveGrinsEnvironment,
  safeGrinsOperationError,
  withGrinsEnvironment,
  type GrinsEnvironment,
} from '@/lib/grins-operation-environment'

export const MAX_REQUEST_LIFETIME_MS = 2 * 60 * 60 * 1000
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const PUBLIC_SEGMENT = /(?:httpdocs|^public|^wwwroot)$/iu

export interface BaseOperationRequest {
  requestId: string
  target: 'staging' | 'production'
  environmentProfile: string
  confirmOperation: string
  actor: string
  notAfter: string
  confirmProduction?: string
}

export interface OperationRequestDeps {
  env: Record<string, string | undefined>
  appRoot: string
  db: ExtendedPrismaClient
  now?: () => Date
}

export interface OperationRequestOutcome {
  exitCode: 0 | 1 | 2
  resultFile?: string
  output: Record<string, unknown>
}

export interface OperationContext<T extends BaseOperationRequest> {
  request: T
  expected: GrinsEnvironment
  /** Every $transaction re-verifies the DB marker. */
  guarded: ExtendedPrismaClient
  db: ExtendedPrismaClient
  env: Record<string, string | undefined>
}

export interface OperationRequestSpec<T extends BaseOperationRequest> {
  /** File prefix: <operation>.request.json, <operation>.<requestId>.consumed.json, <operation>.<requestId>.<mode>.result.json */
  operation: string
  mode: string
  /** Extra field validation for this operation/mode; false = operation_request_invalid. */
  validate: (value: Record<string, unknown>) => boolean
  permissions: readonly AdminPermission[]
  /** Read-only checks inside the verified environment, before the request is consumed. */
  precheck?: (tx: ExtendedTransactionClient, request: T, env: Record<string, string | undefined>) => Promise<void>
  /** Consume (rename) the request before run(). Read-only modes keep it for the following execute. */
  consume: boolean
  run: (context: OperationContext<T>) => Promise<{ exitCode: 0 | 1 | 2; output: Record<string, unknown> }>
}

function inside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** Absolute, existing, outside the application/document root and outside any web-served folder. */
export function assertPrivatePath(candidate: string | undefined, appRoot: string, label: 'operations_dir' | 'environment_profile'): string {
  if (!candidate || !path.isAbsolute(candidate)) throw new Error(`${label}_not_private`)
  let real: string
  try {
    real = realpathSync.native(candidate)
  } catch {
    throw new Error(`${label}_missing`)
  }
  const root = realpathSync.native(appRoot)
  if (inside(real, root) || real.split(/[\\/]+/u).some((segment) => PUBLIC_SEGMENT.test(segment))) {
    throw new Error(`${label}_not_private`)
  }
  return real
}

export function parseOperationRequest<T extends BaseOperationRequest>(
  raw: string,
  now: Date,
  validate: (value: Record<string, unknown>) => boolean = () => true,
): T {
  let value: Record<string, unknown>
  try {
    value = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('operation_request_invalid')
  }
  const text = (field: unknown) => typeof field === 'string' && field.trim() !== ''
  if (!value || typeof value !== 'object'
    || !UUID.test(String(value.requestId ?? ''))
    || !['staging', 'production'].includes(String(value.target))
    || !text(value.environmentProfile)
    || !UUID.test(String(value.confirmOperation ?? ''))
    || !text(value.actor)
    || !text(value.notAfter)
    || !validate(value)) {
    throw new Error('operation_request_invalid')
  }
  const notAfter = new Date(String(value.notAfter))
  if (Number.isNaN(notAfter.getTime())) throw new Error('operation_request_invalid')
  if (notAfter.getTime() <= now.getTime()) throw new Error('operation_request_expired')
  if (notAfter.getTime() - now.getTime() > MAX_REQUEST_LIFETIME_MS) throw new Error('operation_request_lifetime_too_long')
  return value as unknown as T
}

/** DB-level replay guard for operations without their own unique record; call inside the operation's transaction. */
export async function claimOperationRequest(tx: ExtendedTransactionClient, operation: string, requestId: string): Promise<void> {
  const claimed = await tx.$queryRawUnsafe<Array<{ key: string }>>(
    `INSERT INTO "KeyValueSetting"(key, value, "updatedAt") VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO NOTHING RETURNING key`,
    `grins-operation-request:${requestId}`,
    JSON.stringify({ operation, requestId, claimedAt: new Date().toISOString() }),
  )
  if (claimed.length !== 1) throw new Error('operation_request_already_used')
}

export async function runOperationRequest<T extends BaseOperationRequest>(
  spec: OperationRequestSpec<T>,
  deps: OperationRequestDeps,
): Promise<OperationRequestOutcome> {
  const now = deps.now ?? (() => new Date())
  const action = spec.operation
  let dir: string
  try {
    dir = assertPrivatePath(deps.env.GRINS_OPERATIONS_DIR, deps.appRoot, 'operations_dir')
  } catch (error) {
    // The directory is not trusted: report on stdout only, never write into it.
    return { exitCode: 1, output: { action, mode: spec.mode, ok: false, reason: safeGrinsOperationError(error) } }
  }
  let requestId: string | undefined
  const write = (output: Record<string, unknown>, exitCode: 0 | 1 | 2): OperationRequestOutcome => {
    const resultFile = path.join(dir, `${spec.operation}.${requestId ?? 'unidentified'}.${spec.mode}.result.json`)
    const full = { ...output, finishedAt: now().toISOString(), resultFile }
    writeFileSync(resultFile, `${JSON.stringify(full, null, 2)}\n`, 'utf8')
    return { exitCode, resultFile, output: full }
  }
  try {
    const requestPath = path.join(dir, `${spec.operation}.request.json`)
    if (!existsSync(requestPath)) throw new Error('operation_request_missing')
    const request = parseOperationRequest<T>(readFileSync(requestPath, 'utf8'), now(), spec.validate)
    requestId = request.requestId
    const consumedPath = path.join(dir, `${spec.operation}.${request.requestId}.consumed.json`)
    if (existsSync(consumedPath)) throw new Error('operation_request_already_used')

    const profile = assertPrivatePath(request.environmentProfile, deps.appRoot, 'environment_profile')
    const expected = resolveGrinsEnvironment(JSON.parse(readFileSync(profile, 'utf8')), request.target, deps.env.DATABASE_URL, request.confirmProduction)
    if (request.confirmOperation !== expected.instanceId) throw new Error('operator_confirmation_required')

    await withGrinsEnvironment(deps.db, expected, async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: request.actor }, select: { platformRole: true, teamRole: true } })
      if (spec.permissions.some((permission) => !hasAdminPermission(actor, permission))) throw new Error('admin_actor_required')
      await spec.precheck?.(tx, request, deps.env)
      return true
    })
    // Consume before the first database write: a crash after this point leaves
    // the database untouched and the operator must issue a new request.
    if (spec.consume) renameSync(requestPath, consumedPath)
    const base = { action, mode: spec.mode, requestId: request.requestId, target: expected.target, instanceId: expected.instanceId }
    const result = await spec.run({ request, expected, guarded: guardGrinsTransactions(deps.db, expected), db: deps.db, env: deps.env })
    return write({ ...base, ...result.output }, result.exitCode)
  } catch (error) {
    return write({ action, mode: spec.mode, requestId, ok: false, reason: safeGrinsOperationError(error) }, 1)
  }
}
