// Synthetic in-memory PostgreSQL (PGlite) on loopback only. Never reads .env or connects externally.
// Usage: node --conditions=react-server --import tsx scripts/verify-grins-stock-deinitialize-pglite.ts <schema.sql>
// <schema.sql> = `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const schema = process.argv[2]
if (!schema) throw new Error('usage: verify-grins-stock-deinitialize-pglite.ts <schema.sql>')
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54341/postgres?sslmode=disable'
process.env.GRINS_STOCK_LEDGER_ENABLED = 'true'
process.env.GRINS_STOCK_SYNC_ENABLED = 'true'
process.env.GRINS_STOCK_MANIFEST_ENABLED = 'true'
process.env.GRINS_STOCK_RECONCILIATION_ENABLED = 'true'
process.env.GRINS_MANIFEST_CLOCK_SKEW_SECONDS = '0'

const checks: Array<{ name: string; pass: boolean }> = []
const check = (name: string, pass: boolean, diag?: unknown) => {
  checks.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`)
  if (!pass && diag !== undefined) console.log('DIAG', JSON.stringify(diag))
}
const errorOf = async (run: () => Promise<unknown>): Promise<string> => {
  try { await run(); return 'no_error' } catch (error) { return error instanceof Error ? error.message : String(error) }
}
/** Deinitialize must run with scheduled stocks disabled; the app process keeps its own flags. */
const OFF = { GRINS_STOCK_LEDGER_ENABLED: 'true', GRINS_STOCK_SYNC_ENABLED: 'false' }

async function main() {
  const pg = new PGlite()
  await pg.exec(readFileSync(schema, 'utf8'))
  await pg.exec(readFileSync('scripts/stock-ledger-postgres-contract.sql', 'utf8'))
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54341, maxConnections: 20 })
  await server.start()
  const { prisma: db } = await import('@/lib/prisma')
  const { createServerOrder } = await import('@/lib/orders-data-store')
  const { acknowledgeCommittedAllocations, releaseOrderStock, stockLedgerInvariantViolations } = await import('@/lib/stock-ledger')
  const { applyStockSnapshot } = await import('@/lib/sync/stock-snapshot')
  const { deinitializeStockLedger, inspectStockLedgerDeinitialize } = await import('@/lib/sync/stock-ledger-deinitialize')
  const { guardGrinsTransactions, resolveGrinsEnvironment } = await import('@/lib/grins-operation-environment')

  const instanceId = randomUUID()
  const expected = { target: 'staging' as const, instanceId, hosts: ['127.0.0.1'], database: 'postgres', schema: 'public' }
  const guarded = guardGrinsTransactions(db, expected)
  const setGate = (closed: boolean) => pg.exec(`UPDATE "KeyValueSetting" SET value='{"checkoutClosed":${closed}}' WHERE key='grins-prices-only-maintenance'`)
  const fingerprint = async () => (await pg.query<Record<string, string>>(`SELECT
      (SELECT md5(string_agg((to_jsonb(p) - 'grinsStock' - 'grinsStockRunId' - 'grinsStockUpdatedAt')::text, '|' ORDER BY id)) FROM "Product" p) AS products,
      (SELECT md5(coalesce(string_agg(to_jsonb(o)::text, '|' ORDER BY id), '')) FROM "Order" o) AS orders,
      (SELECT md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY id), '')) FROM "StockAllocation" a) AS allocations,
      (SELECT count(*) FROM "Product" WHERE "grinsStock" IS NOT NULL)::text AS initialized`)).rows[0]
  const product = (externalId: string, stock: number) => ({
    externalId, sku: externalId, title: externalId, price: 10, stock,
    prices: { price1: 10, price2: 10, price3: 10, price4: 10 },
    warehouseQuantities: { '10000': stock },
  })
  const preflight = {
    hard: [], warnings: [], metrics: {
      rows: 3, previousProductsTotal: 3, matched: 3, unlinked: 0, softDeletedSkipped: 0,
      linkedMissingFromXml: 0, currentPhysicalSum: 30, incomingPhysicalSum: 30, activeZeroed: 0, linkedStockZero: 0,
    },
  }
  let sourceSeq = 0
  // Manifest times must strictly increase; acknowledgedAt comes from the DB
  // clock (session TimeZone may differ from the JS clock), so derive from it.
  let lastStart = 0
  const nextStart = (notBefore = 0) => {
    lastStart = Math.max(lastStart + 1_000, notBefore)
    return new Date(lastStart)
  }
  const source = (startedAt: Date) => {
    sourceSeq += 1
    const sha256 = `${sourceSeq}`.padStart(64, 'a')
    return { identity: `manifest:${startedAt.toISOString()}:${sha256}`, sha256, runStartedAt: startedAt, generatedAt: new Date(startedAt.getTime() + 1_000), manifestVerified: true }
  }
  const order = (id: string, quantity = 1) => ({
    createdAt: new Date().toISOString(),
    items: [{ id, title: id, brand: 'B', image: '', category: 'hair', rating: 0, price: 10, stock: 10, quantity }],
    subtotal: 10 * quantity, tax: 0, delivery: 0, deliveryMethod: 'pickup', paymentMethod: 'manual', discount: 0, total: 10 * quantity,
    firstName: 'Synthetic', lastName: 'Ledger', email: 'ledger@example.invalid', phone: '000', address: 'Test', city: 'Test',
    paymentStatus: 'paid' as const, stockReservationStatus: 'committed' as const,
  })

  try {
    await pg.exec(`
      INSERT INTO "Product"(id,title,brand,price,category,"updatedAt","externalId",stock,"grinsStock","isActive")
      VALUES ('p1','P1','B',10,'hair',now(),'S1',10,NULL,true),
             ('p2','P2','B',10,'hair',now(),'S2',10,NULL,true),
             ('p3','P3','B',10,'hair',now(),'S3',10,NULL,true),
             ('local','Local','B',10,'hair',now(),NULL,3,NULL,true);
      INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES
        ('grins-prices-only-maintenance','{"checkoutClosed":true}',now()),
        ('grins-deployment-environment','{"environment":"staging","instanceId":"${instanceId}"}',now());
    `)

    // 1. Empty ledger: nothing initialized -> idempotent no-op that changes nothing.
    const emptyBefore = await fingerprint()
    const empty = await deinitializeStockLedger(guarded, 'operator:test', OFF)
    check('empty ledger: deinitialize is a no-op and changes nothing',
      empty.status === 'noop' && JSON.stringify(await fingerprint()) === JSON.stringify(emptyBefore), empty)

    // Initialize the ledger (first stocks-only snapshot) and prove the legacy-mode problem.
    const t0 = Date.now() - 600_000
    const init = await applyStockSnapshot(db, [product('S1', 10), product('S2', 10), product('S3', 10)], source(nextStart(t0)), preflight)
    check('setup: first snapshot initializes grinsStock', init.status === 'completed' && (await fingerprint()).initialized === '3', init)
    await setGate(false)
    process.env.GRINS_STOCK_LEDGER_ENABLED = 'false'
    const legacyBefore = await errorOf(() => createServerOrder(order('p1')))
    process.env.GRINS_STOCK_LEDGER_ENABLED = 'true'
    check('problem reproduced: ledger flag off with initialized grinsStock breaks checkout',
      legacyBefore.includes('erp_stock_write_requires_ledger'), legacyBefore)

    // Active hold (committed) and an awaiting-GrinS hold.
    const committed = await createServerOrder(order('p1', 2))
    const awaiting = await createServerOrder(order('p2', 1))
    await db.$transaction((tx) => acknowledgeCommittedAllocations(tx, awaiting.id, 'synthetic-admin'))
    await setGate(true)

    // 2. Wrong endpoint / DB identity.
    const beforeWrong = await fingerprint()
    const wrongMarker = await errorOf(() => deinitializeStockLedger(guardGrinsTransactions(db, { ...expected, instanceId: randomUUID() }), 'operator:test', OFF))
    const registry = {
      version: 1,
      environments: {
        staging: { instanceId, hosts: ['ep-staging.example.invalid'], database: 'postgres', schema: 'public' },
        production: { instanceId: randomUUID(), hosts: ['ep-production.example.invalid'], database: 'postgres', schema: 'public' },
      },
    }
    const wrongHost = await errorOf(async () => resolveGrinsEnvironment(registry, 'staging', 'postgresql://u:p@ep-production.example.invalid/postgres'))
    check('wrong endpoint: DB marker mismatch and foreign host are refused, nothing changed',
      wrongMarker === 'database_environment_mismatch' && wrongHost === 'database_identity_not_confirmed'
      && JSON.stringify(await fingerprint()) === JSON.stringify(beforeWrong), { wrongMarker, wrongHost })

    // 3. Checkout open.
    await setGate(false)
    const dryOpen = await inspectStockLedgerDeinitialize(guarded, OFF)
    const openRefused = await errorOf(() => deinitializeStockLedger(guarded, 'operator:test', OFF))
    await setGate(true)
    check('open checkout: dry-run reports it and execute refuses with nothing changed',
      dryOpen.blockers.includes('maintenance_required') && openRefused === 'maintenance_required'
      && JSON.stringify(await fingerprint()) === JSON.stringify(beforeWrong), { dryOpen: dryOpen.blockers, openRefused })

    // Scheduled stocks still enabled.
    const syncOn = await errorOf(() => deinitializeStockLedger(guarded, 'operator:test', { ...OFF, GRINS_STOCK_SYNC_ENABLED: 'true' }))
    check('enabled scheduled stocks are refused before any write', syncOn === 'stock_sync_must_be_disabled', syncOn)

    // 4. Active (committed) hold + 5. awaiting-GrinS hold.
    const dryActive = await inspectStockLedgerDeinitialize(guarded, OFF)
    const activeRefused = await errorOf(() => deinitializeStockLedger(guarded, 'operator:test', OFF))
    check('active and awaiting-GrinS holds block deinitialize; dry-run counts them',
      activeRefused === 'stock_ledger_deinitialize_active_allocations'
      && dryActive.allocationsByStatus.committed === 1 && dryActive.allocationsByStatus.awaiting_grins_sync === 1
      && JSON.stringify(await fingerprint()) === JSON.stringify(beforeWrong), { activeRefused, dryActive })

    // Resolve holds through the normal ledger paths: cancel the committed order,
    // reconcile the acknowledged one with a fresh manifest snapshot.
    await db.$transaction((tx) => releaseOrderStock(tx, { orderId: committed.id, items: committed.items, reason: 'cancelled' }))
    const onlyAwaiting = await errorOf(() => deinitializeStockLedger(guarded, 'operator:test', OFF))
    check('a single awaiting-GrinS hold still blocks deinitialize', onlyAwaiting === 'stock_ledger_deinitialize_active_allocations', onlyAwaiting)
    const ack = await db.stockAllocation.findFirstOrThrow({ where: { orderId: awaiting.id, status: 'awaiting_grins_sync' } })
    const fresh = await applyStockSnapshot(db, [product('S1', 10), product('S2', 9), product('S3', 10)], source(nextStart(ack.acknowledgedAt!.getTime() + 1_000)), preflight)
    check('setup: fresh manifest reconciles the awaiting hold', fresh.status === 'completed' && fresh.reconciled === 1, fresh)

    // 7. Parallel sync: a held lock and a truly concurrent snapshot.
    await pg.exec(`INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES ('sync-run-lock', jsonb_build_object('runId','other-run','lockedUntil', (now() + interval '10 minutes')::text), now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`)
    const lockHeld = await errorOf(() => deinitializeStockLedger(guarded, 'operator:test', OFF))
    await pg.exec(`UPDATE "KeyValueSetting" SET value = jsonb_build_object('runId','other-run','lockedUntil','1970-01-01T00:00:00Z') WHERE key='sync-run-lock'`)
    const [raceDeinit, raceSnapshot] = await Promise.allSettled([
      deinitializeStockLedger(guarded, 'operator:test', OFF),
      applyStockSnapshot(db, [product('S1', 10), product('S2', 9), product('S3', 8)], source(nextStart()), preflight),
    ])
    const deinitWon = raceDeinit.status === 'fulfilled' && raceDeinit.value.status === 'completed'
    const snapshotWon = raceSnapshot.status === 'fulfilled' && raceSnapshot.value.status === 'completed'
    const loserRefused = deinitWon
      ? raceSnapshot.status === 'fulfilled' && raceSnapshot.value.status === 'skipped'
      : raceDeinit.status === 'rejected' && String(raceDeinit.reason?.message).includes('sync_lock_unavailable')
    check('parallel sync: held lock refuses; a concurrent snapshot and deinitialize never both write',
      lockHeld === 'stock_ledger_deinitialize_sync_lock_unavailable' && deinitWon !== snapshotWon && loserRefused,
      { lockHeld, raceDeinit, raceSnapshot })
    if (deinitWon) {
      // Re-initialize so the remaining scenarios start from an initialized ledger.
      await applyStockSnapshot(db, [product('S1', 10), product('S2', 9), product('S3', 10)], source(nextStart()), preflight)
    }

    // 6. Failure in the middle: the final SyncRun write fails after Product rows were cleared.
    await pg.exec(`
      CREATE FUNCTION fail_deinit_completion() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'synthetic_mid_operation_failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_deinit_completion BEFORE UPDATE ON "SyncRun"
      FOR EACH ROW WHEN (NEW.mode = 'stock-ledger-deinitialize' AND NEW.status = 'completed') EXECUTE FUNCTION fail_deinit_completion();
    `)
    const beforeFailure = await fingerprint()
    const midFailure = await errorOf(() => deinitializeStockLedger(guarded, 'operator:test', OFF))
    await pg.exec('DROP TRIGGER fail_deinit_completion ON "SyncRun"; DROP FUNCTION fail_deinit_completion();')
    const failedRun = await pg.query<{ status: string }>(`SELECT status FROM "SyncRun" WHERE mode='stock-ledger-deinitialize' ORDER BY "startedAt" DESC LIMIT 1`)
    const lockAfterFailure = await pg.query<{ held: boolean }>(`SELECT ((value->>'lockedUntil')::timestamptz >= now()) AS held FROM "KeyValueSetting" WHERE key='sync-run-lock'`)
    check('mid-operation failure rolls back every Product change, records failed, releases the lock',
      midFailure.includes('synthetic_mid_operation_failure')
      && JSON.stringify(await fingerprint()) === JSON.stringify(beforeFailure) && beforeFailure.initialized === '3'
      && failedRun.rows[0]?.status === 'failed' && lockAfterFailure.rows[0]?.held === false,
      { midFailure, beforeFailure, failedRun: failedRun.rows, lock: lockAfterFailure.rows })

    // 8. Success after initialization.
    const dryReady = await inspectStockLedgerDeinitialize(guarded, OFF)
    const beforeOk = await fingerprint()
    const stockBefore = await pg.query<{ id: string; stock: number }>('SELECT id, stock FROM "Product" ORDER BY id')
    const ok = await deinitializeStockLedger(guarded, 'operator:test', OFF)
    const afterOk = await fingerprint()
    const stockAfter = await pg.query<{ id: string; stock: number }>('SELECT id, stock FROM "Product" ORDER BY id')
    const leftover = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "Product" WHERE "grinsStock" IS NOT NULL OR "grinsStockRunId" IS NOT NULL OR "grinsStockUpdatedAt" IS NOT NULL`)
    check('initialized ledger: dry-run has no blockers, execute clears only ledger fields',
      dryReady.blockers.length === 0 && ok.status === 'completed' && ok.clearedProducts === 3 && leftover.rows[0].n === 0
      && afterOk.products === beforeOk.products && afterOk.orders === beforeOk.orders && afterOk.allocations === beforeOk.allocations
      && JSON.stringify(stockAfter.rows) === JSON.stringify(stockBefore.rows), { dryReady: dryReady.blockers, ok, beforeOk, afterOk })
    check('constraints and invariants hold after deinitialize',
      (await db.$transaction((tx) => stockLedgerInvariantViolations(tx))).length === 0)

    // 9. Repeat.
    const repeat = await deinitializeStockLedger(guarded, 'operator:test', OFF)
    check('repeated deinitialize is a recorded no-op', repeat.status === 'noop' && JSON.stringify(await fingerprint()) === JSON.stringify(afterOk), repeat)

    // Legacy paths work with the ledger flag off.
    process.env.GRINS_STOCK_LEDGER_ENABLED = 'false'
    process.env.GRINS_STOCK_SYNC_ENABLED = 'false'
    process.env.GRINS_STOCK_MANIFEST_ENABLED = 'false'
    process.env.GRINS_STOCK_RECONCILIATION_ENABLED = 'false'
    await setGate(false)
    const allocationsBefore = (await fingerprint()).allocations
    const p3Before = (await db.product.findUniqueOrThrow({ where: { id: 'p3' } })).stock
    const legacyOrder = await createServerOrder(order('p3', 2))
    const p3Held = (await db.product.findUniqueOrThrow({ where: { id: 'p3' } })).stock
    await db.$transaction((tx) => releaseOrderStock(tx, { orderId: legacyOrder.id, items: legacyOrder.items, reason: 'cancelled' }))
    const p3Released = (await db.product.findUniqueOrThrow({ where: { id: 'p3' } })).stock
    const adminEdit = await errorOf(() => db.product.update({ where: { id: 'p3' }, data: { stock: p3Released + 5 } }))
    const p3Edited = (await db.product.findUniqueOrThrow({ where: { id: 'p3' } })).stock
    check('legacy mode after deinitialize: order decrements, cancel restores, admin stock edit works, no allocations',
      p3Held === p3Before - 2 && p3Released === p3Before && adminEdit === 'no_error' && p3Edited === p3Before + 5
      && (await fingerprint()).allocations === allocationsBefore, { p3Before, p3Held, p3Released, adminEdit, p3Edited })
  } finally {
    await db.$disconnect().catch(() => {})
    await server.stop().catch(() => {})
    await pg.close().catch(() => {})
  }
  const failed = checks.filter((row) => !row.pass)
  console.log(`RESULT ${failed.length === 0 ? 'PASS' : 'FAIL'} ${checks.length - failed.length}/${checks.length}`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((error) => { console.error('HARNESS_ERROR', error instanceof Error ? error.stack : String(error)); process.exitCode = 1 })
