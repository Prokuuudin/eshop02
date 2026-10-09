import type { ExtendedTransactionClient } from './prisma'
import { randomUUID } from 'node:crypto'
import { GRINS_CHECKOUT_GATE_KEY } from './grins-import-maintenance'
import { readGrinsCheckoutState } from './grins-checkout-preparation'

export async function controlGrinsCheckout(tx: ExtendedTransactionClient, action: 'check' | 'close' | 'open', completedRunId?: string): Promise<{ checkoutClosed: boolean }> {
  // Serialize completion checks with the core import's KVS transaction lock.
  // A plain row lock would let an opener wait for an import then open based on
  // a stale successful run read before that import failed.
  if (action !== 'check') await tx.$executeRawUnsafe('LOCK TABLE "KeyValueSetting" IN SHARE ROW EXCLUSIVE MODE')
  const state = await readGrinsCheckoutState(tx)
  if (state === 'missing') throw new Error('checkout_gate_missing')
  if (action === 'check') return { checkoutClosed: state }
  const active = await tx.syncRun.count({ where: { status: 'running' } })
  if (active) throw new Error('import_active')
  const locks = await tx.$queryRawUnsafe<Array<{ held: boolean }>>("SELECT (value->>'lockedUntil')::timestamptz >= now() AS held FROM \"KeyValueSetting\" WHERE key='sync-run-lock'")
  if (locks[0]?.held) throw new Error('lease_active')
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
  if (action === 'close' && state === true) return { checkoutClosed: true }
  const changed = await tx.$executeRawUnsafe(
    `UPDATE "KeyValueSetting" SET value=jsonb_set(value,'{checkoutClosed}',$1::jsonb) || $4::jsonb,"updatedAt"=now()
      WHERE key=$2 AND value->'checkoutClosed'=$3::jsonb`,
    action === 'close' ? 'true' : 'false', GRINS_CHECKOUT_GATE_KEY, action === 'close' ? 'false' : 'true', action === 'close' ? JSON.stringify({ maintenanceWindowId: randomUUID() }) : '{}',
  )
  if (changed !== 1) throw new Error('checkout_state_invalid')
  const checkoutClosed = await readGrinsCheckoutState(tx)
  if (checkoutClosed !== (action === 'close')) throw new Error('checkout_state_invalid')
  return { checkoutClosed }
}
