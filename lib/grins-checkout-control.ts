import type { ExtendedTransactionClient } from './prisma'
import { randomUUID } from 'node:crypto'
import { GRINS_CHECKOUT_GATE_KEY } from './grins-import-maintenance'
import { readGrinsCheckoutState } from './grins-checkout-preparation'

export async function controlGrinsCheckout(tx: ExtendedTransactionClient, action: 'check' | 'close' | 'open' | 'abort-window', completedRunId?: string, abort?: { window: string; confirmedRollback: string }): Promise<{ checkoutClosed: boolean; maintenanceWindowId?: string }> {
  // Serialize completion checks with the core import's KVS transaction lock.
  // A plain row lock would let an opener wait for an import then open based on
  // a stale successful run read before that import failed.
  if (action !== 'check') await tx.$executeRawUnsafe('LOCK TABLE "KeyValueSetting" IN SHARE ROW EXCLUSIVE MODE')
  const state = await readGrinsCheckoutState(tx)
  if (state === 'missing') throw new Error('checkout_gate_missing')
  const snapshot = async (checkoutClosed: boolean) => {
    const gate = await tx.keyValueSetting.findUniqueOrThrow({ where: { key: GRINS_CHECKOUT_GATE_KEY } })
    const windowId = (gate.value as { maintenanceWindowId?: string }).maintenanceWindowId
    return { checkoutClosed, ...(typeof windowId === 'string' && { maintenanceWindowId: windowId }) }
  }
  if (action === 'check') return snapshot(state)
  const active = await tx.syncRun.count({ where: { status: 'running' } })
  if (active) throw new Error('import_active')
  const locks = await tx.$queryRawUnsafe<Array<{ held: boolean }>>("SELECT (value->>'lockedUntil')::timestamptz >= now() AS held FROM \"KeyValueSetting\" WHERE key='sync-run-lock'")
  if (locks.length && locks[0].held !== false) throw new Error('lease_active') // null/unknown is not a proven free lease
  if (action === 'abort-window') {
    if (await tx.syncRun.count({ where: { status: { notIn: ['completed', 'failed', 'skipped'] } } })) throw new Error('completion_not_verified')
    const gate = await tx.keyValueSetting.findUniqueOrThrow({ where: { key: GRINS_CHECKOUT_GATE_KEY } })
    const detail = gate.value as { maintenanceWindowId?: string; maintenanceBaselineRunIds?: unknown }
    const windowId = detail.maintenanceWindowId
    if (state !== true || !windowId || abort?.window !== windowId || abort.confirmedRollback !== windowId) throw new Error('completion_not_verified')
    if (!Array.isArray(detail.maintenanceBaselineRunIds) || detail.maintenanceBaselineRunIds.some(id => typeof id !== 'string')) throw new Error('completion_not_verified')
    const baseline = new Set(detail.maintenanceBaselineRunIds as string[])
    const allRuns = await tx.syncRun.findMany()
    if (allRuns.some(run => !baseline.has(run.id) && (run.errorSample as { maintenanceWindowId?: string } | null)?.maintenanceWindowId !== windowId)) throw new Error('completion_not_verified')
    const runs = await tx.syncRun.findMany({ where: { errorSample: { path: ['maintenanceWindowId'], equals: windowId } } })
    for (const run of runs) {
      const detail = run.errorSample as { mode?: string; stage?: string; reason?: string; backupKey?: unknown }
      const noWrite = run.status === 'failed'
        ? ['rolled_back', 'preflight_rejected'].includes(detail.stage ?? '')
        : run.status === 'skipped' && (detail.stage === 'rejected' || ['maintenance_required', 'sync_running'].includes(detail.reason ?? ''))
      if (!noWrite || !run.finishedAt || run.productsSynced !== 0 || detail.mode !== 'prices-only' || detail.backupKey) throw new Error('completion_not_verified')
      const committed = await tx.$queryRawUnsafe<Array<{ key: string }>>('SELECT key FROM "KeyValueSetting" WHERE value->>\'runId\'=$1 AND key<>\'sync-run-lock\'', run.id)
      if (committed.length) throw new Error('completion_not_verified')
    }
  }
  if (action === 'open') {
    if (!completedRunId) throw new Error('completed_run_required')
    const gate = await tx.keyValueSetting.findUniqueOrThrow({ where: { key: GRINS_CHECKOUT_GATE_KEY } })
    const windowId = (gate.value as { maintenanceWindowId?: string }).maintenanceWindowId
    const run = await tx.syncRun.findUnique({ where: { id: completedRunId } })
    const diagnostics = run?.errorSample as { mode?: unknown; maintenanceWindowId?: unknown } | undefined
    if (!windowId || state !== true || run?.status !== 'completed' || run.errorCount !== 0 || diagnostics?.mode !== 'prices-only' || diagnostics.maintenanceWindowId !== windowId) throw new Error('completion_not_verified')
    const failures = await tx.syncRun.count({ where: { status: { in: ['running', 'failed'] }, errorSample: { path: ['maintenanceWindowId'], equals: windowId } } })
    if (failures) throw new Error('completion_not_verified')
    const otherCompletions = await tx.syncRun.count({ where: { id: { not: completedRunId }, status: 'completed', errorSample: { path: ['maintenanceWindowId'], equals: windowId } } })
    if (otherCompletions) throw new Error('completion_not_verified') // ambiguous multi-Apply window needs operator review
  }
  if (action === 'close' && state === true) return snapshot(true)
  const newWindow = action === 'close' ? { maintenanceWindowId: randomUUID(), maintenanceBaselineRunIds: (await tx.syncRun.findMany({ select: { id: true } })).map(run => run.id) } : {}
  const changed = await tx.$executeRawUnsafe(
    `UPDATE "KeyValueSetting" SET value=jsonb_set(value - 'maintenanceWindowId' - 'maintenanceBaselineRunIds','{checkoutClosed}',$1::jsonb) || $4::jsonb,"updatedAt"=now()
      WHERE key=$2 AND value->'checkoutClosed'=$3::jsonb`,
    action === 'close' ? 'true' : 'false', GRINS_CHECKOUT_GATE_KEY, action === 'close' ? 'false' : 'true', JSON.stringify(newWindow),
  )
  if (changed !== 1) throw new Error('checkout_state_invalid')
  const checkoutClosed = await readGrinsCheckoutState(tx)
  if (checkoutClosed !== (action === 'close')) throw new Error('checkout_state_invalid')
  return snapshot(checkoutClosed)
}
