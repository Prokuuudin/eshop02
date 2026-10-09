import { readFileSync, statSync } from 'node:fs'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import { resolveGrinsEnvironment, safeGrinsOperationError, guardGrinsTransactions, withGrinsEnvironment } from '@/lib/grins-operation-environment'
import { controlGrinsCheckout } from '@/lib/grins-checkout-control'
import { hasAdminPermission } from '@/lib/admin-permissions'

const option = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1] }
async function main(): Promise<void> {
  const file = option('--environment-profile')
  if (!file) throw new Error('environment_registry_invalid')
  const expected = resolveGrinsEnvironment(JSON.parse(readFileSync(file, 'utf8')), option('--target'), process.env.DATABASE_URL, option('--confirm-production'))
  const action = option('--action')
  if (!['check', 'close', 'open', 'preview', 'apply', 'result', 'checkpoint'].includes(action ?? '')) throw new Error('operator_confirmation_required')
  const wanted = option('--expect-state')
  if (wanted && (!['open', 'closed'].includes(wanted) || (action === 'open' && wanted !== 'open') || (action === 'close' && wanted !== 'closed'))) throw new Error('checkout_state_unexpected_release_blocked')
  if (['close', 'open', 'preview', 'apply'].includes(action!) && option('--confirm-operation') !== expected.instanceId) throw new Error('operator_confirmation_required')
  const { prisma: db } = await import('@/lib/prisma')
  try {
    if (['check', 'close', 'open'].includes(action!)) {
      const result = await withGrinsEnvironment(db, expected, tx => controlGrinsCheckout(tx, action as 'check' | 'close' | 'open', option('--completed-run')))
      console.log(JSON.stringify({ target: expected.target, instanceId: expected.instanceId, action, ...result }))
      if (wanted && result.checkoutClosed !== (wanted === 'closed')) throw new Error('checkout_state_unexpected_release_blocked')
      return
    }
    await withGrinsEnvironment(db, expected, async () => true)
    const guarded = guardGrinsTransactions(db, expected)
    const execute = async () => {
      const mi = await import('@/lib/sync/manual-import')
      if (action === 'checkpoint') return withGrinsEnvironment(db, expected, async tx => {
        const { grinsMaintenanceClosed } = await import('@/lib/grins-import-maintenance')
        if (!await grinsMaintenanceClosed(tx)) throw new Error('maintenance_required')
        const point = await tx.$queryRawUnsafe<Array<{ databaseTime: string; lsn: string }>>('SELECT clock_timestamp()::text AS "databaseTime",pg_current_wal_lsn()::text AS lsn')
        return { ...point[0], products: await tx.product.count(), orders: await tx.order.count(), note: 'metadata_only_not_a_database_backup' }
      })
      if (action === 'result') {
        const run = await db.syncRun.findUniqueOrThrow({ where: { id: option('--run') ?? '' } })
        const data = run.errorSample as Record<string, unknown>
        return { runId: run.id, status: run.status, errorCount: run.errorCount, mode: data?.mode, sha256: data?.xmlSha256, backupKey: data?.backupKey }
      }
      const actorId = option('--actor')
      const actor = actorId ? await db.user.findUnique({ where: { id: actorId }, select: { platformRole: true, teamRole: true } }) : null
      if (!hasAdminPermission(actor, 'catalog.update') || !hasAdminPermission(actor, 'prices.update')) throw new Error('admin_actor_required')
      const { grinsMaintenanceClosed } = await import('@/lib/grins-import-maintenance')
      if (!await grinsMaintenanceClosed(db)) throw new Error('maintenance_required')
      if (action === 'preview') return withGrinsEnvironment(db, expected, async tx => {
        const view = tx as unknown as ExtendedPrismaClient // helpers use only tx-safe read/KVS methods
        const xmlFile = option('--xml')
        if (!xmlFile || statSync(xmlFile).size > mi.MANUAL_IMPORT_MAX_BYTES) throw new Error('operator_confirmation_required')
        const upload = mi.decodeUpload(readFileSync(xmlFile), xmlFile.split(/[\\/]/u).pop()!)
        if (!upload.ok) throw new Error('operator_confirmation_required')
        const evaluation = await mi.evaluateFeed(view, upload.xml)
        if (evaluation.preflight.hard.length) return { canApply: false, hard: evaluation.preflight.hard, summary: evaluation.summary }
        const pending = await mi.savePendingPreview(view, { xml: upload.xml, sha256: upload.sha256, fileName: 'operator-export.xml', sizeBytes: Buffer.byteLength(upload.xml), actorId: actorId!, catalogFingerprint: evaluation.catalogFingerprint })
        return { canApply: true, previewId: pending.previewId, sha256: pending.sha256, warnings: evaluation.preflight.warnings, summary: evaluation.summary }
      })
      if (!process.argv.includes('--acknowledge-price-warnings')) throw new Error('operator_confirmation_required')
      const gate = await db.keyValueSetting.findUniqueOrThrow({ where: { key: 'grins-prices-only-maintenance' } })
      const maintenanceWindowId = (gate.value as { maintenanceWindowId?: string }).maintenanceWindowId
      if (!maintenanceWindowId) throw new Error('operator_confirmation_required')
      return mi.applyManualImport({ db: guarded, operationContext: { maintenanceWindowId } }, { previewId: option('--preview') ?? '', sha256: option('--sha256') ?? '', actorId: actorId! })
    }
    const result = await execute()
    console.log(JSON.stringify({ target: expected.target, instanceId: expected.instanceId, action, result }))
    if ('canApply' in result && !result.canApply) process.exitCode = 1
    if ('status' in result && result.status !== 'completed') process.exitCode = 1
  } finally { await db.$disconnect() }
}
main().catch(error => {
  console.error(JSON.stringify({ event: 'grins_operator_action_failed', reason: safeGrinsOperationError(error), checkout: 'keep_closed_until_verified' }))
  process.exitCode = 1
})
