// Synthetic loopback PostgreSQL only. Never reads .env or connects externally.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const schema = process.argv[2]
if (!schema) throw new Error('usage: verify-grins-stock-ledger-pglite.ts <schema.sql>')
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54339/postgres?sslmode=disable'
process.env.GRINS_STOCK_LEDGER_ENABLED = 'true'
process.env.GRINS_STOCK_SYNC_ENABLED = 'true'
process.env.GRINS_STOCK_MANIFEST_ENABLED = 'true'
process.env.GRINS_STOCK_RECONCILIATION_ENABLED = 'true'
process.env.GRINS_MANIFEST_CLOCK_SKEW_SECONDS = '0'

const checks: Array<{ name: string; pass: boolean }> = []
const check = (name: string, pass: boolean) => { checks.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`) }

async function verifyMigrationContract(): Promise<void> {
  const pg = new PGlite()
  try {
    await pg.exec(`
      CREATE TABLE "Product" (id TEXT PRIMARY KEY, stock INTEGER NOT NULL);
      CREATE TABLE "Order" (id TEXT PRIMARY KEY);
      CREATE TABLE "SyncRun" (id TEXT PRIMARY KEY);
      INSERT INTO "Product"(id, stock) VALUES ('historical-product', -2);
      INSERT INTO "Order"(id) VALUES ('historical-order');
      INSERT INTO "SyncRun"(id) VALUES ('historical-run');
    `)
    await pg.exec(readFileSync('prisma/migrations/20261012170000_split_grins_stock_ledger/migration.sql', 'utf8'))
    const products = await pg.query<{ id: string; stock: number; grinsStock: number | null }>(
      'SELECT id, stock, "grinsStock" FROM "Product"',
    )
    const allocations = await pg.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM "StockAllocation"')
    const historicalOrders = await pg.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM "Order"')
    const oldRun = await pg.query<{ mode: string }>('SELECT mode FROM "SyncRun" WHERE id = $1', ['historical-run'])
    check('migration preserves historical rows and creates no inferred allocations', products.rows[0]?.stock === -2
      && products.rows[0]?.grinsStock === null
      && allocations.rows[0]?.count === 0
      && historicalOrders.rows[0]?.count === 1
      && oldRun.rows[0]?.mode === 'full')

    await pg.exec('UPDATE "Product" SET stock = 3 WHERE id = \'historical-product\';')
    await pg.exec(`
      BEGIN;
      SELECT set_config('hairshop.stock_ledger_write', 'on', true);
      INSERT INTO "SyncRun"(id) VALUES ('initial-stock-run');
      UPDATE "Product"
      SET stock = 5, "grinsStock" = 5, "grinsStockRunId" = 'initial-stock-run'
      WHERE id = 'historical-product';
      COMMIT;
    `)
    let guarded = false
    try { await pg.exec('UPDATE "Product" SET stock = 6 WHERE id = \'historical-product\';') } catch { guarded = true }
    check('migration leaves legacy rows writable until initialization then activates the DB guard', guarded)
  } finally {
    await pg.close()
  }
}

async function main() {
  await verifyMigrationContract()
  console.log('START synthetic stock ledger harness')
  const pg = new PGlite()
  await pg.exec(readFileSync(schema, 'utf8'))
  console.log('READY schema')
  const migration = readFileSync('prisma/migrations/20261012170000_split_grins_stock_ledger/migration.sql', 'utf8')
  await pg.exec(migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION')))
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54339, maxConnections: 20 })
  await server.start()
  console.log('READY loopback')
  const { prisma: db } = await import('@/lib/prisma')
  const { applyOrderReservationPaymentState, createServerOrder } = await import('@/lib/orders-data-store')
  const {
    acknowledgeCommittedAllocations,
    adjustOrderStock,
    assertNoAwaitingAllocation,
    holdOrderStock,
    releaseOrderStock,
    stockLedgerInvariantViolations,
  } = await import('@/lib/stock-ledger')
  const { applyStockSnapshot, rollbackLatestStockSnapshot } = await import('@/lib/sync/stock-snapshot')
  const { runSync } = await import('@/lib/sync/sync-runner')
  const preflight = {
    hard: [], warnings: [], metrics: {
      rows: 2, previousProductsTotal: 2, matched: 2, unlinked: 0, softDeletedSkipped: 0,
      linkedMissingFromXml: 0, currentPhysicalSum: 20, incomingPhysicalSum: 20, activeZeroed: 0, linkedStockZero: 0,
    },
  }
  const product = (externalId: string, stock: number) => ({
    externalId, sku: externalId, title: externalId, price: 10, stock,
    prices: { price1: 10, price2: 10, price3: 10, price4: 10 },
    warehouseQuantities: { '10000': stock },
  })
  const source = (identity: string, startedAt: string) => ({
    identity, sha256: identity.padEnd(64, '0').slice(0, 64), runStartedAt: new Date(startedAt),
    generatedAt: new Date(new Date(startedAt).getTime() + 60_000), manifestVerified: true,
  })
  const orderBase = (id: string, quantity = 2) => ({
    createdAt: new Date().toISOString(),
    items: [{ id, title: id, brand: 'B', image: '', category: 'hair', rating: 0, price: 10, stock: 10, quantity }],
    subtotal: 10 * quantity, tax: 0, delivery: 0, deliveryMethod: 'pickup', paymentMethod: 'manual', discount: 0, total: 10 * quantity,
    firstName: 'Synthetic', lastName: 'Ledger', email: 'ledger@example.invalid', phone: '000', address: 'Test', city: 'Test',
    paymentStatus: 'paid' as const, stockReservationStatus: 'committed' as const,
  })

  try {
    await pg.exec(`
      INSERT INTO "Product"(id,title,brand,price,category,"updatedAt","externalId",stock,"grinsStock","isActive")
      VALUES ('p1','P1','B',10,'hair',now(),'S1',10,10,true),
             ('p2','P2','B',10,'hair',now(),'S2',10,10,true),
             ('p3','P3','B',10,'hair',now(),'S3',1,1,true),
             ('p4','P4','B',10,'hair',now(),'S4',2,2,true),
             ('p5','P5','B',10,'hair',now(),'S5',2,2,true),
             ('p6','P6','B',10,'hair',now(),'S6',10,10,true),
             ('local','Local','B',10,'hair',now(),NULL,3,NULL,true);
      INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES ('grins-prices-only-maintenance','{"checkoutClosed":false}',now());
    `)
    const lastUnit = await Promise.allSettled([
      createServerOrder(orderBase('p3', 1)),
      createServerOrder(orderBase('p3', 1)),
    ])
    const lastUnitOrders = lastUnit.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    check('two concurrent checkouts cannot both buy the last unit', lastUnitOrders.length === 1
      && (await db.product.findUniqueOrThrow({ where: { id: 'p3' } })).stock === 0)
    await db.$transaction((tx) => releaseOrderStock(tx, {
      orderId: lastUnitOrders[0].id, items: lastUnitOrders[0].items, reason: 'cancelled',
    }))

    const concurrencyBase = Date.now() - 60_000
    const fallbackOrder = await createServerOrder(orderBase('p6'))
    await db.$transaction((tx) => acknowledgeCommittedAllocations(tx, fallbackOrder.id, 'synthetic-admin'))
    process.env.GRINS_STOCK_RECONCILIATION_ENABLED = 'false'
    process.env.GRINS_STOCK_MANIFEST_ENABLED = 'false'
    const legacy = await applyStockSnapshot(db, [product('S6', 9)], {
      identity: 'legacy-first', sha256: 'b'.repeat(64),
      transportModifiedAt: new Date(concurrencyBase - 10_000), manifestVerified: false,
    }, preflight)
    const legacyProduct = await db.product.findUniqueOrThrow({ where: { id: 'p6' } })
    check('manifestless snapshot updates physical stock but keeps awaiting holds', legacy.status === 'completed'
      && legacy.reconciled === 0 && legacyProduct.grinsStock === 9 && legacyProduct.stock === 7)
    process.env.GRINS_STOCK_RECONCILIATION_ENABLED = 'true'
    process.env.GRINS_STOCK_MANIFEST_ENABLED = 'true'

    const checkoutSnapshotSource = source('checkout-snapshot', new Date(concurrencyBase).toISOString())
    const [checkoutRace, firstCheckoutSnapshot] = await Promise.all([
      createServerOrder(orderBase('p4', 1)),
      applyStockSnapshot(db, [product('S4', 1)], checkoutSnapshotSource, preflight),
    ])
    const checkoutSnapshot = firstCheckoutSnapshot.status === 'failed'
      ? await applyStockSnapshot(db, [product('S4', 1)], checkoutSnapshotSource, preflight)
      : firstCheckoutSnapshot
    check('checkout concurrent with snapshot serializes to one derived hold', checkoutSnapshot.status === 'completed'
      && (await db.product.findUniqueOrThrow({ where: { id: 'p4' } })).stock === 0
      && (await db.$transaction((tx) => stockLedgerInvariantViolations(tx, ['p4']))).length === 0)

    const cancelRaceOrder = await createServerOrder(orderBase('p5', 1))
    const cancelSnapshotSource = source('cancel-snapshot', new Date(concurrencyBase + 10_000).toISOString())
    const [cancelRace, firstCancelSnapshot] = await Promise.allSettled([
      db.$transaction((tx) => releaseOrderStock(tx, {
        orderId: cancelRaceOrder.id, items: cancelRaceOrder.items, reason: 'cancelled',
      })),
      applyStockSnapshot(db, [product('S5', 1)], cancelSnapshotSource, preflight),
    ])
    if (cancelRace.status === 'rejected') {
      await db.$transaction((tx) => releaseOrderStock(tx, {
        orderId: cancelRaceOrder.id, items: cancelRaceOrder.items, reason: 'cancelled',
      }))
    }
    const firstCancelResult = firstCancelSnapshot.status === 'fulfilled' ? firstCancelSnapshot.value : null
    const cancelSnapshot = !firstCancelResult || firstCancelResult.status === 'failed'
      ? await applyStockSnapshot(db, [product('S5', 1)], cancelSnapshotSource, preflight)
      : firstCancelResult
    check('cancel concurrent with snapshot preserves physical-minus-holds invariant', cancelSnapshot.status === 'completed'
      && (await db.product.findUniqueOrThrow({ where: { id: 'p5' } })).stock === 1
      && (await db.$transaction((tx) => stockLedgerInvariantViolations(tx, ['p5']))).length === 0)
    await db.$transaction((tx) => releaseOrderStock(tx, {
      orderId: checkoutRace.id, items: checkoutRace.items, reason: 'cancelled',
    }))

    const localOrder = await createServerOrder(orderBase('local', 1))
    await db.$transaction((tx) => releaseOrderStock(tx, {
      orderId: localOrder.id, items: localOrder.items, reason: 'cancelled',
    }))
    await db.product.update({ where: { id: 'local' }, data: { stock: 4 } })
    check('local-only products retain legacy stock behavior and no allocation',
      (await db.product.findUniqueOrThrow({ where: { id: 'local' } })).stock === 4
      && await db.stockAllocation.count({ where: { orderId: localOrder.id } }) === 0)

    const reserved = await createServerOrder({
      ...orderBase('p2'),
      paymentMethod: 'paysera',
      paymentStatus: 'pending',
      stockReservationStatus: 'reserved',
      stockReservedUntil: new Date(Date.now() + 300_000).toISOString(),
    })
    await db.$transaction((tx) => applyOrderReservationPaymentState(tx, reserved.id, 'failed'))
    const releasedAfterFailure = await db.product.findUniqueOrThrow({ where: { id: 'p2' } })
    check('failed payment releases a reservation exactly once', releasedAfterFailure.stock === 10
      && await db.stockAllocation.count({ where: { orderId: reserved.id, status: 'released' } }) === 1)

    await db.$transaction((tx) => applyOrderReservationPaymentState(tx, reserved.id, 'paid'))
    check('late paid callback atomically reacquires a committed hold',
      (await db.product.findUniqueOrThrow({ where: { id: 'p2' } })).stock === 8
      && await db.stockAllocation.count({ where: { orderId: reserved.id, status: 'committed' } }) === 1)

    const oldItems = reserved.items
    const increasedItems = oldItems.map((item) => ({ ...item, quantity: item.quantity + 1 }))
    await db.$transaction((tx) => adjustOrderStock(tx, {
      orderId: reserved.id, oldItems, newItems: increasedItems, allocationStatus: 'committed', customerSellability: false,
    }))
    await db.$transaction((tx) => adjustOrderStock(tx, {
      orderId: reserved.id, oldItems: increasedItems, newItems: oldItems, allocationStatus: 'committed', customerSellability: false,
    }))
    check('order edit increase and decrease preserve the derived availability invariant',
      (await db.product.findUniqueOrThrow({ where: { id: 'p2' } })).stock === 8)

    await db.$transaction((tx) => releaseOrderStock(tx, { orderId: reserved.id, items: oldItems, reason: 'cancelled' }))
    await db.$transaction((tx) => holdOrderStock(tx, {
      orderId: reserved.id, items: oldItems, status: 'committed', eventPrefix: `order:${reserved.id}:synthetic-reopen`, customerSellability: false,
    }))
    check('cancel then reopen releases and reacquires exactly one hold',
      (await db.product.findUniqueOrThrow({ where: { id: 'p2' } })).stock === 8)
    await db.$transaction((tx) => releaseOrderStock(tx, { orderId: reserved.id, items: oldItems, reason: 'returned' }))
    check('return before acknowledgment releases the remaining mutable hold',
      (await db.product.findUniqueOrThrow({ where: { id: 'p2' } })).stock === 10)

    const order = await createServerOrder(orderBase('p1'))
    check('checkout creates one committed allocation and derives availability',
      await db.stockAllocation.count({ where: { orderId: order.id, status: 'committed' } }) === 1
      && (await db.product.findUniqueOrThrow({ where: { id: 'p1' } })).stock === 8)

    const ack = await db.$transaction((tx) => acknowledgeCommittedAllocations(tx, order.id, 'synthetic-admin'))
    const ackRow = await db.stockAllocation.findFirstOrThrow({ where: { orderId: order.id } })
    check('acknowledgment is idempotent and does not change availability', !ack.idempotent
      && (await db.$transaction((tx) => acknowledgeCommittedAllocations(tx, order.id, 'synthetic-admin'))).idempotent
      && (await db.product.findUniqueOrThrow({ where: { id: 'p1' } })).stock === 8)

    await db.$transaction((tx) => releaseOrderStock(tx, { orderId: order.id, items: order.items, reason: 'cancelled' }))
    await db.$transaction((tx) => releaseOrderStock(tx, { orderId: order.id, items: order.items, reason: 'returned' }))
    let awaitingEditBlocked = false
    try { await db.$transaction((tx) => assertNoAwaitingAllocation(tx, order.id)) } catch { awaitingEditBlocked = true }
    check('cancel, edit and return cannot release an acknowledged hold', awaitingEditBlocked
      && (await db.product.findUniqueOrThrow({ where: { id: 'p1' } })).stock === 8
      && (await db.stockAllocation.findFirstOrThrow({ where: { orderId: order.id } })).status === 'awaiting_grins_sync')

    const beforeAckStart = new Date(ackRow.acknowledgedAt!.getTime() - 1).toISOString()
    const beforeAckSnapshot = await applyStockSnapshot(db, [product('S1', 9)], source('before-ack', beforeAckStart), preflight)
    const beforeAckProduct = await db.product.findUniqueOrThrow({ where: { id: 'p1' } })
    const beforeAckPass = beforeAckSnapshot.status === 'completed'
      && beforeAckSnapshot.reconciled === 0
      && beforeAckProduct.stock === 7
    if (!beforeAckPass) console.log('DIAG before-ack', { beforeAckSnapshot, stock: beforeAckProduct.stock, grinsStock: beforeAckProduct.grinsStock })
    check('snapshot whose source query began before acknowledgment keeps the hold', beforeAckPass)

    const freshStart = new Date(ackRow.acknowledgedAt!.getTime() + 1_000).toISOString()
    const applied = await applyStockSnapshot(db, [product('S1', 7), product('S2', 10)], source('fresh', freshStart), preflight)
    const after = await db.product.findUniqueOrThrow({ where: { id: 'p1' } })
    check('fresh manifest reconciles without a second subtraction', applied.status === 'completed' && applied.reconciled === 1 && after.grinsStock === 7 && after.stock === 7)

    await db.$transaction((tx) => releaseOrderStock(tx, { orderId: order.id, items: order.items, reason: 'returned' }))
    check('return after reconciliation never increments availability', (await db.product.findUniqueOrThrow({ where: { id: 'p1' } })).stock === 7)

    const replay = await applyStockSnapshot(db, [product('S1', 7), product('S2', 10)], source('fresh', freshStart), preflight)
    check('same source identity is a no-write replay', replay.status === 'skipped' && replay.reason === 'snapshot_replay')

    const beforeOld = await db.product.findUniqueOrThrow({ where: { id: 'p1' } })
    const old = await applyStockSnapshot(db, [product('S1', 99), product('S2', 10)], source('old', '2026-01-01T00:00:00Z'), preflight)
    check('older manifest is rejected without Product changes', old.status === 'failed'
      && (await db.product.findUniqueOrThrow({ where: { id: 'p1' } })).stock === beforeOld.stock)

    process.env.GRINS_STOCK_RECONCILIATION_ENABLED = 'false'
    process.env.GRINS_STOCK_MANIFEST_ENABLED = 'false'
    const downgrade = await applyStockSnapshot(db, [product('S1', 99)], {
      identity: 'legacy-downgrade', sha256: 'd'.repeat(64), transportModifiedAt: new Date('2026-12-01T00:00:00Z'), manifestVerified: false,
    }, preflight)
    check('legacy source cannot downgrade a manifest-managed timeline', downgrade.status === 'failed'
      && downgrade.reason === 'legacy_stock_source_cannot_follow_manifest_source'
      && (await db.product.findUniqueOrThrow({ where: { id: 'p1' } })).stock === after.stock)
    process.env.GRINS_STOCK_RECONCILIATION_ENABLED = 'true'
    process.env.GRINS_STOCK_MANIFEST_ENABLED = 'true'

    const stableP1 = (await db.product.findUniqueOrThrow({ where: { id: 'p1' } })).stock
    const stableP2 = (await db.product.findUniqueOrThrow({ where: { id: 'p2' } })).stock
    await pg.exec(`CREATE FUNCTION stock_boom() RETURNS trigger AS $$ BEGIN IF NEW.id='p2' AND NEW."grinsStock" IS DISTINCT FROM OLD."grinsStock" THEN RAISE EXCEPTION 'synthetic stock failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql; CREATE TRIGGER stock_boom BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION stock_boom();`)
    const failed = await applyStockSnapshot(
      db,
      [product('S1', 4), product('S2', 4)],
      source('failure', new Date(new Date(freshStart).getTime() + 1_000).toISOString()),
      preflight,
    )
    check('mid-Apply failure rolls back the whole snapshot', failed.status === 'failed'
      && (await db.product.findUniqueOrThrow({ where: { id: 'p1' } })).stock === stableP1
      && (await db.product.findUniqueOrThrow({ where: { id: 'p2' } })).stock === stableP2)
    await pg.exec('DROP TRIGGER stock_boom ON "Product"; DROP FUNCTION stock_boom();')

    const rollback = await rollbackLatestStockSnapshot(db, applied.runId, 'synthetic-operator')
    const rolledBack = await db.product.findUniqueOrThrow({ where: { id: 'p1' } })
    check('compensating rollback restores physical stock and preserves current holds', rollback.restored === 2
      && rolledBack.grinsStock === 9 && rolledBack.stock === 9)

    let directBlocked = false
    try { await db.product.update({ where: { id: 'p1' }, data: { stock: 100 } }) } catch (error) { directBlocked = String(error).includes('erp_stock_write_requires_ledger') }
    check('database trigger blocks bypass writes', directBlocked)
    const finalViolations = await db.$transaction((tx) => stockLedgerInvariantViolations(tx))
    if (finalViolations.length) console.log('DIAG invariant product IDs', finalViolations.map((row) => row.id))
    check('ledger invariant holds after all transitions', finalViolations.length === 0)

    let fullBlocked = false
    try { await runSync({ name: 'blocked-full', fetchPage: async () => ({ products: [], hasMore: false }) }, db) } catch (error) { fullBlocked = String(error).includes('full_sync_blocked_by_stock_ledger') }
    check('FULL sync cannot bypass the stock ledger', fullBlocked)
  } finally {
    await db.$disconnect()
    await server.stop()
    await pg.close()
  }
  console.log(JSON.stringify({ checks, failed: checks.filter((entry) => !entry.pass).length }, null, 2))
  process.exitCode = checks.every((entry) => entry.pass) ? 0 : 1
}

const keepAlive = setInterval(() => {}, 1_000)
main()
  .catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(() => clearInterval(keepAlive))
