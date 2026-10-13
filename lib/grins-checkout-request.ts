/**
 * Plesk "Run script" checkout close/open via one-time requests (lib/grins-operation-request.ts).
 * close: idempotent; the result carries the maintenanceWindowId the later open must quote.
 * open: refuses on an incoherent stock ledger and accepts exactly one reason —
 *   no-change     → existing abort-window rules (nothing ran since close)
 *   prices-import → existing prices-only open (completedRunId)
 *   stock-ledger  → only terminal snapshot/rollback/deinitialize runs since close
 * Gate change and the DB replay marker commit in one transaction.
 */
import { hasAdminPermission } from '@/lib/admin-permissions'
import { controlGrinsCheckout } from '@/lib/grins-checkout-control'
import { readGrinsCheckoutState } from '@/lib/grins-checkout-preparation'
import { GRINS_CHECKOUT_GATE_KEY } from '@/lib/grins-import-maintenance'
import { withGrinsEnvironment } from '@/lib/grins-operation-environment'
import {
  claimOperationRequest,
  runOperationRequest,
  UUID,
  type BaseOperationRequest,
  type OperationRequestDeps,
  type OperationRequestOutcome,
} from '@/lib/grins-operation-request'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { openCheckoutAfterStockOperation, stockLedgerOpenBlockers } from '@/lib/stock-ledger-checkout'

export const CHECKOUT_OPEN_REASONS = ['no-change', 'prices-import', 'stock-ledger'] as const
export type CheckoutOpenReason = typeof CHECKOUT_OPEN_REASONS[number]

export interface CheckoutOpenRequest extends BaseOperationRequest {
  maintenanceWindowId: string
  openReason: CheckoutOpenReason
  completedRunId?: string
}

async function assertOpenPreconditions(tx: ExtendedTransactionClient, request: CheckoutOpenRequest, env: Record<string, string | undefined>): Promise<void> {
  const state = await readGrinsCheckoutState(tx)
  if (state === 'missing') throw new Error('checkout_gate_missing')
  if (state !== true) throw new Error('checkout_state_invalid')
  const gate = await tx.keyValueSetting.findUniqueOrThrow({ where: { key: GRINS_CHECKOUT_GATE_KEY } })
  if ((gate.value as { maintenanceWindowId?: string }).maintenanceWindowId !== request.maintenanceWindowId) throw new Error('completion_not_verified')
  if (await tx.syncRun.count({ where: { status: 'running' } })) throw new Error('import_active')
  const locks = await tx.$queryRawUnsafe<Array<{ held: boolean }>>("SELECT (value->>'lockedUntil')::timestamptz >= now() AS held FROM \"KeyValueSetting\" WHERE key='sync-run-lock'")
  if (locks.length && locks[0].held !== false) throw new Error('lease_active')
  const blockers = await stockLedgerOpenBlockers(tx, env)
  if (blockers.length) throw new Error(blockers[0])
}

export function runCheckoutCloseRequest(deps: OperationRequestDeps): Promise<OperationRequestOutcome> {
  return runOperationRequest<BaseOperationRequest>({
    operation: 'checkout-close',
    mode: 'execute',
    validate: () => true,
    permissions: ['catalog.update'],
    consume: true,
    run: async ({ request, expected, db }) => {
      const result = await withGrinsEnvironment(db, expected, async (tx) => {
        const alreadyClosed = await readGrinsCheckoutState(tx) === true
        const gate = await controlGrinsCheckout(tx, 'close')
        await claimOperationRequest(tx, 'checkout-close', request.requestId)
        return { ...gate, alreadyClosed }
      })
      return { exitCode: 0, output: { ok: result.checkoutClosed, ...result } }
    },
  }, deps)
}

export function runCheckoutOpenRequest(deps: OperationRequestDeps): Promise<OperationRequestOutcome> {
  return runOperationRequest<CheckoutOpenRequest>({
    operation: 'checkout-open',
    mode: 'execute',
    validate: (value) => UUID.test(String(value.maintenanceWindowId ?? ''))
      && (CHECKOUT_OPEN_REASONS as readonly string[]).includes(String(value.openReason))
      && (value.openReason !== 'prices-import' || (typeof value.completedRunId === 'string' && value.completedRunId.trim() !== '')),
    permissions: ['catalog.update'],
    consume: true,
    // Read-only and before consumption, so a not-yet-safe state does not burn the request.
    precheck: async (tx, request, env) => {
      if (request.openReason === 'prices-import') {
        const actor = await tx.user.findUnique({ where: { id: request.actor }, select: { platformRole: true, teamRole: true } })
        if (!hasAdminPermission(actor, 'prices.update')) throw new Error('admin_actor_required')
      }
      await assertOpenPreconditions(tx, request, env)
    },
    run: async ({ request, expected, db, env }) => {
      const result = await withGrinsEnvironment(db, expected, async (tx) => {
        // Re-checked atomically: the state may have changed since the precheck.
        await assertOpenPreconditions(tx, request, env)
        const gate = request.openReason === 'stock-ledger'
          ? await openCheckoutAfterStockOperation(tx, request.maintenanceWindowId)
          : request.openReason === 'prices-import'
            ? await controlGrinsCheckout(tx, 'open', request.completedRunId)
            : await controlGrinsCheckout(tx, 'abort-window', undefined, { window: request.maintenanceWindowId, confirmedRollback: request.maintenanceWindowId })
        await claimOperationRequest(tx, 'checkout-open', request.requestId)
        return gate
      })
      return { exitCode: 0, output: { ok: result.checkoutClosed === false, openReason: request.openReason, ...result } }
    },
  }, deps)
}
