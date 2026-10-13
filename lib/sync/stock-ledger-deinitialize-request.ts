/**
 * Plesk "Run script" deinitialize via a one-time request (lib/grins-operation-request.ts).
 * Every protection of scripts/operate-grins-stock-deinitialize.ts still applies
 * (closed checkout, disabled scheduled stocks, no active holds) plus request
 * expiry, one-time use (file rename + unique SyncRun.sourceIdentity) and the
 * dry-run state fingerprint re-checked after all locks are held.
 */
import { grinsMaintenanceClosed } from '@/lib/grins-import-maintenance'
import {
  parseOperationRequest,
  runOperationRequest,
  type BaseOperationRequest,
  type OperationRequestDeps,
  type OperationRequestOutcome,
  UUID,
} from '@/lib/grins-operation-request'
import { stockLedgerFlags } from '@/lib/stock-ledger-config'
import { deinitializeStockLedger, inspectStockLedgerDeinitialize } from './stock-ledger-deinitialize'

export { MAX_REQUEST_LIFETIME_MS, assertPrivatePath } from '@/lib/grins-operation-request'
export const DEINITIALIZE_OPERATION = 'stock-deinitialize'
export const DEINITIALIZE_REQUEST_FILE = `${DEINITIALIZE_OPERATION}.request.json`
const SHA256 = /^[0-9a-f]{64}$/u

export type DeinitializeRequestMode = 'dry-run' | 'execute'

export interface DeinitializeRequest extends BaseOperationRequest {
  confirmDeinitialize?: string
  dryRunFingerprint?: string
}

const validateFor = (mode: DeinitializeRequestMode) => (value: Record<string, unknown>) => mode === 'dry-run'
  || (UUID.test(String(value.confirmDeinitialize ?? '')) && SHA256.test(String(value.dryRunFingerprint ?? '')))

export function parseDeinitializeRequest(raw: string, mode: DeinitializeRequestMode, now: Date): DeinitializeRequest {
  return parseOperationRequest<DeinitializeRequest>(raw, now, validateFor(mode))
}

export function runDeinitializeRequest(mode: DeinitializeRequestMode, deps: OperationRequestDeps): Promise<OperationRequestOutcome> {
  return runOperationRequest<DeinitializeRequest>({
    operation: DEINITIALIZE_OPERATION,
    mode,
    validate: validateFor(mode),
    permissions: ['catalog.update'],
    consume: mode === 'execute',
    precheck: async (tx, request, env) => {
      if (mode === 'dry-run') return
      if (request.confirmDeinitialize !== request.confirmOperation) throw new Error('operator_confirmation_required')
      if (!await grinsMaintenanceClosed(tx)) throw new Error('maintenance_required')
      if (stockLedgerFlags(env).scheduledStocksEnabled) throw new Error('stock_sync_must_be_disabled')
    },
    run: async ({ request, guarded, env }) => {
      if (mode === 'dry-run') {
        const report = await inspectStockLedgerDeinitialize(guarded, env)
        const ready = report.blockers.length === 0
        return { exitCode: ready ? 0 : 2, output: { ok: ready, readyForExecute: ready, dryRunFingerprint: report.stateFingerprint, report } }
      }
      const result = await deinitializeStockLedger(guarded, `operator:${request.actor}`, env, {
        sourceIdentity: `deinitialize-request:${request.requestId}`,
        expectedStateFingerprint: request.dryRunFingerprint,
      })
      return { exitCode: 0, output: { ok: true, result } }
    },
  }, deps)
}
