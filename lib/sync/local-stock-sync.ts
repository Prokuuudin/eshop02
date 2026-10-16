import { createHash } from 'crypto'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '@/lib/prisma'
import { GRINS_CHECKOUT_GATE_KEY } from '@/lib/grins-import-maintenance'
import { verifyStockReconciliationManifest } from './ftps-source-verification'
import { runScheduledStockSync, type ScheduledStockSyncOutcome } from './scheduled-stock-sync'

export const STOCK_REHEARSAL_MARKER_KEY = 'grins-stock-ledger-write-rehearsal'
export const STOCK_REHEARSAL_PURPOSE = 'grins-stock-ledger-write-rehearsal'

type ReadDb = Pick<ExtendedPrismaClient | ExtendedTransactionClient, '$queryRawUnsafe'>

export interface LocalStockSource {
  xml: string
  manifest: string
  expectedRunId: string
  expectedSha256: string
}

export interface LocalStockRehearsalConfirmation {
  instanceId: string
  branchId: string
  endpointId: string
  catalogFingerprint: string
}

export interface LocalStockSafetySnapshot {
  productCount: number
  catalogMetadataFingerprint: string
  erpMetadataFingerprint: string
  allocationCount: number
  allocationFingerprint: string
  orderCount: number
  orderFingerprint: string
}

export interface LocalStockSafetyResult {
  updateOnly: boolean
  catalogMetadataUnchanged: boolean
  erpMetadataUnchanged: boolean
  reservationsUnchanged: boolean
  ordersUnchanged: boolean
  passed: boolean
}

interface LocalStockManifest {
  mode?: unknown
  published?: unknown
  runId?: unknown
}

const hex64 = /^[0-9a-f]{64}$/u
const hex32 = /^[0-9a-f]{32}$/u
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

function parseManifest(text: string): LocalStockManifest {
  try {
    return JSON.parse(text) as LocalStockManifest
  } catch {
    throw new Error('local_stock_manifest_invalid_json')
  }
}

/** Source-only checks run before a database client is requested. */
export function verifyLocalStockSource(source: LocalStockSource, now: Date, maxAgeHours = 3): void {
  if (!hex64.test(source.expectedSha256)) throw new Error('local_stock_expected_sha256_invalid')
  const actualSha256 = createHash('sha256').update(source.xml, 'utf-8').digest('hex')
  if (actualSha256 !== source.expectedSha256) throw new Error('local_stock_xml_sha256_mismatch')
  const manifest = parseManifest(source.manifest)
  if (manifest.mode !== 'shadow') throw new Error('local_stock_manifest_requires_shadow_mode')
  if (manifest.published !== undefined && manifest.published !== false) throw new Error('local_stock_manifest_must_be_unpublished')
  if (manifest.runId !== source.expectedRunId) throw new Error('local_stock_manifest_run_id_mismatch')
  const verification = verifyStockReconciliationManifest(source.xml, source.manifest, now, { maxAgeHours })
  if (verification.verdict !== 'PASS') {
    throw new Error(`local_stock_manifest_verification_failed:${verification.failures.join('; ')}`)
  }
}

/**
 * Requires a purpose-specific marker installed externally only after the
 * disposable branch and its restore path have been approved. This function
 * creates neither the branch nor the marker.
 */
export async function verifyLocalStockRehearsalTarget(
  db: ReadDb,
  confirmation: LocalStockRehearsalConfirmation,
  now: Date,
): Promise<void> {
  if (!uuid.test(confirmation.instanceId)
    || !/^br-[a-z0-9-]+$/u.test(confirmation.branchId)
    || !/^ep-[a-z0-9-]+$/u.test(confirmation.endpointId)
    || !hex32.test(confirmation.catalogFingerprint)) {
    throw new Error('local_stock_rehearsal_confirmation_invalid')
  }
  const markerRows = await db.$queryRawUnsafe<Array<{ value: unknown }>>(
    'SELECT value FROM "KeyValueSetting" WHERE key=$1 FOR SHARE',
    STOCK_REHEARSAL_MARKER_KEY,
  )
  const marker = markerRows[0]?.value as Record<string, unknown> | undefined
  if (!marker
    || marker.version !== 1
    || marker.purpose !== STOCK_REHEARSAL_PURPOSE
    || marker.instanceId !== confirmation.instanceId
    || marker.branchId !== confirmation.branchId
    || marker.endpointId !== confirmation.endpointId) {
    throw new Error('local_stock_rehearsal_marker_mismatch')
  }
  const recoveryVerifiedAt = typeof marker.recoveryVerifiedAt === 'string' ? new Date(marker.recoveryVerifiedAt) : null
  const expiresAt = typeof marker.expiresAt === 'string' ? new Date(marker.expiresAt) : null
  if (!recoveryVerifiedAt || Number.isNaN(recoveryVerifiedAt.getTime()) || recoveryVerifiedAt.getTime() > now.getTime()
    || !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    throw new Error('local_stock_rehearsal_recovery_not_verified')
  }
  const [gate, baseline, active] = await Promise.all([
    db.$queryRawUnsafe<Array<{ closed: boolean }>>(
      `SELECT (value->'checkoutClosed' = 'true'::jsonb) AS closed FROM "KeyValueSetting" WHERE key=$1`,
      GRINS_CHECKOUT_GATE_KEY,
    ),
    db.$queryRawUnsafe<Array<{ fingerprint: string }>>(
      `SELECT md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) AS fingerprint FROM "Product" p`,
    ),
    db.$queryRawUnsafe<Array<{ active: boolean }>>(
      `SELECT EXISTS(SELECT 1 FROM "SyncRun" WHERE status='running')
           OR EXISTS(SELECT 1 FROM "KeyValueSetting" WHERE key='sync-run-lock' AND (value->>'lockedUntil')::timestamptz >= now()) AS active`,
    ),
  ])
  if (gate[0]?.closed !== true) throw new Error('local_stock_rehearsal_checkout_must_be_closed')
  if (baseline[0]?.fingerprint !== confirmation.catalogFingerprint) throw new Error('local_stock_rehearsal_catalog_drift')
  if (active[0]?.active === true) throw new Error('local_stock_rehearsal_sync_active')
}

export async function captureLocalStockSafetySnapshot(db: ReadDb): Promise<LocalStockSafetySnapshot> {
  const [products, metadata, allocations, orders] = await Promise.all([
    db.$queryRawUnsafe<Array<{ productCount: number; catalogMetadataFingerprint: string }>>(
      `SELECT COUNT(*)::int AS "productCount",
              md5(COALESCE(string_agg((to_jsonb(p) - 'stock' - 'grinsStock' - 'grinsStockUpdatedAt' - 'grinsStockRunId' - 'updatedAt')::text, '' ORDER BY p.id), '')) AS "catalogMetadataFingerprint"
         FROM "Product" p`,
    ),
    db.$queryRawUnsafe<Array<{ fingerprint: string }>>(
      `SELECT md5(COALESCE((SELECT value::text FROM "KeyValueSetting" WHERE key='erp-extra-data'), '')) AS fingerprint`,
    ),
    db.$queryRawUnsafe<Array<{ count: number; fingerprint: string }>>(
      `SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(row_to_json(a)::text, '' ORDER BY a.id), '')) AS fingerprint FROM "StockAllocation" a`,
    ),
    db.$queryRawUnsafe<Array<{ count: number; fingerprint: string }>>(
      `SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(row_to_json(o)::text, '' ORDER BY o.id), '')) AS fingerprint FROM "Order" o`,
    ),
  ])
  return {
    productCount: products[0]?.productCount ?? -1,
    catalogMetadataFingerprint: products[0]?.catalogMetadataFingerprint ?? '',
    erpMetadataFingerprint: metadata[0]?.fingerprint ?? '',
    allocationCount: allocations[0]?.count ?? -1,
    allocationFingerprint: allocations[0]?.fingerprint ?? '',
    orderCount: orders[0]?.count ?? -1,
    orderFingerprint: orders[0]?.fingerprint ?? '',
  }
}

export function compareLocalStockSafety(before: LocalStockSafetySnapshot, after: LocalStockSafetySnapshot): LocalStockSafetyResult {
  const result = {
    updateOnly: before.productCount === after.productCount,
    catalogMetadataUnchanged: before.catalogMetadataFingerprint === after.catalogMetadataFingerprint,
    erpMetadataUnchanged: before.erpMetadataFingerprint === after.erpMetadataFingerprint,
    reservationsUnchanged: before.allocationCount === after.allocationCount && before.allocationFingerprint === after.allocationFingerprint,
    ordersUnchanged: before.orderCount === after.orderCount && before.orderFingerprint === after.orderFingerprint,
  }
  return { ...result, passed: Object.values(result).every(Boolean) }
}

export interface LocalFileStockSyncDeps {
  source: LocalStockSource
  now?: () => Date
  getDb: () => Promise<ExtendedPrismaClient>
  verifyTarget: (db: ExtendedPrismaClient, now: Date) => Promise<void>
  runStockSync?: typeof runScheduledStockSync
  captureSafety?: typeof captureLocalStockSafetySnapshot
}

export interface LocalFileStockSyncOutcome {
  sync: ScheduledStockSyncOutcome
  safety: LocalStockSafetyResult
}

/** No FTPS, mail or generic full-sync path is reachable from this adapter. */
export async function runLocalFileStockSync(deps: LocalFileStockSyncDeps): Promise<LocalFileStockSyncOutcome> {
  const now = deps.now ?? (() => new Date())
  const startedAt = now()
  verifyLocalStockSource(deps.source, startedAt)
  const db = await deps.getDb()
  const capture = deps.captureSafety ?? captureLocalStockSafetySnapshot
  await deps.verifyTarget(db, startedAt)
  const before = await capture(db)
  const runner = deps.runStockSync ?? runScheduledStockSync
  const sync = await runner({
    env: {
      GRINS_STOCK_LEDGER_ENABLED: 'true',
      GRINS_STOCK_SYNC_ENABLED: 'true',
      GRINS_STOCK_MANIFEST_ENABLED: 'true',
      GRINS_STOCK_RECONCILIATION_ENABLED: 'false',
      GRINS_STOCK_MANIFEST_MAX_AGE_HOURS: '3',
      GRINS_FTPS_REMOTE_PATH: 'export.xml',
    },
    getDb: async () => db,
    verifyTarget: async (targetDb) => deps.verifyTarget(targetDb, now()),
    downloadXml: async () => ({ content: deps.source.xml }),
    downloadManifest: async () => ({ content: deps.source.manifest }),
    // Local rehearsal must not send operational SMTP alerts.
    sendAlert: async () => 'skipped',
    now,
    sourceLabel: 'local file',
    triggeredBy: 'manual',
  })
  const after = await capture(db)
  const safety = compareLocalStockSafety(before, after)
  return { sync, safety }
}
