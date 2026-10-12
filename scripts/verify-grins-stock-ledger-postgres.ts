/**
 * Destructive synthetic harness for a disposable loopback PostgreSQL database.
 * It refuses every non-loopback host and every database name except
 * hairshop_ledger_test. Never load .env.local before this guard.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const parsedUrl = new URL(databaseUrl)
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname)
  || parsedUrl.pathname.replace(/^\//u, '') !== 'hairshop_ledger_test') {
  throw new Error('refusing_non_disposable_database')
}

process.env.GRINS_STOCK_LEDGER_ENABLED = 'true'
process.env.GRINS_STOCK_SYNC_ENABLED = 'true'
process.env.GRINS_STOCK_MANIFEST_ENABLED = 'true'
process.env.GRINS_STOCK_RECONCILIATION_ENABLED = 'true'
process.env.GRINS_MANIFEST_CLOCK_SKEW_SECONDS = '0'

const checks: Array<{ name: string; pass: boolean; details?: unknown }> = []
const check = (name: string, pass: boolean, details?: unknown): void => {
  checks.push({ name, pass, ...(pass || details === undefined ? {} : { details }) })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`)
}

const productInput = (externalId: string, stock: number) => ({
  externalId,
  sku: externalId,
  title: externalId,
  price: 10,
  stock,
  prices: { price1: 10, price2: 10, price3: 10, price4: 10 },
  warehouseQuantities: { '10000': stock },
})

async function main(): Promise<void> {
  const contractClient = new Client({ connectionString: databaseUrl })
  await contractClient.connect()
  try {
    await contractClient.query(readFileSync('scripts/stock-ledger-postgres-contract.sql', 'utf8'))
  } finally {
    await contractClient.end()
  }
  const { prisma: db } = await import('@/lib/prisma')
  const {
    applyStockSnapshot,
    rollbackLatestStockSnapshot,
    runStockSerializableTransaction,
  } = await import('@/lib/sync/stock-snapshot')
  const { holdOrderStock, releaseOrderStock, stockLedgerInvariantViolations } = await import('@/lib/stock-ledger')
  const { updateServerOrderPayment } = await import('@/lib/orders-data-store')

  let sourceSequence = 0
  const source = (label: string) => {
    sourceSequence += 1
    const runStartedAt = new Date(Date.UTC(2026, 9, 12, 12, 0, sourceSequence))
    const sha256 = createHash('sha256').update(`${label}:${sourceSequence}`).digest('hex')
    return {
      identity: `manifest:${runStartedAt.toISOString()}:${sha256}`,
      sha256,
      runStartedAt,
      generatedAt: new Date(runStartedAt.getTime() + 500),
      manifestVerified: true,
    }
  }
  const preflight = (count: number) => ({
    hard: [], warnings: [], metrics: {
      rows: count, previousProductsTotal: count, matched: count, unlinked: 0, softDeletedSkipped: 0,
      linkedMissingFromXml: 0, currentPhysicalSum: count, incomingPhysicalSum: count,
      activeZeroed: 0, linkedStockZero: 0,
    },
  })
  const createProduct = async (id: string, externalId: string, stock: number, grinsStock: number | null = stock) => db.product.create({
    data: {
      id, externalId, sku: externalId, title: id, brand: 'Synthetic', price: 10, category: 'hair', stock, grinsStock,
      images: [], badges: [], relatedProductIds: [], oftenBoughtTogether: [], certificates: [], compatibleEquipment: [],
    },
  })
  const items = (productId: string, quantity: number) => [{
    id: productId, title: productId, brand: 'Synthetic', image: '', category: 'hair', price: 10, rating: 0, stock: quantity, quantity,
  }]
  const createOrder = async (id: string, productId: string, quantity: number, state: 'reserved' | 'committed' | 'released' = 'committed') => db.order.create({
    data: {
      id, createdAt: new Date(), items: items(productId, quantity), subtotal: 10 * quantity, tax: 0, delivery: 0,
      deliveryMethod: 'pickup', paymentMethod: 'paysera', discount: 0, total: 10 * quantity,
      firstName: 'Synthetic', lastName: 'Test', email: `${id}@example.invalid`, phone: '0', address: 'A', city: 'Riga',
      paymentStatus: state === 'released' ? 'pending' : 'paid', paymentProvider: 'paysera',
      stockReservationStatus: state, stockReleasedAt: state === 'released' ? new Date() : null,
    },
  })

  try {
    await db.$executeRawUnsafe('ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_stock_nonnegative_check"')
    await db.$executeRawUnsafe('ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_grinsStock_nonnegative_check"')
    const checkConstraints = await db.$queryRawUnsafe<Array<{ name: string; valid: boolean }>>(
      `SELECT conname AS name, convalidated AS valid FROM pg_constraint
       WHERE conname IN ('Product_stock_nonnegative_check','Product_grinsStock_nonnegative_check',
         'StockAllocation_quantity_check','StockAllocation_status_check','StockAllocation_state_fields_check',
         'StockSnapshotEntry_values_check','OrderOperationalException_occurrences_check','OrderOperationalException_status_check')
       ORDER BY conname`,
    )
    check('all stock-ledger CHECK constraints exist and validate',
      checkConstraints.length === 8 && checkConstraints.every((constraint) => constraint.valid), checkConstraints)

    await db.keyValueSetting.upsert({
      where: { key: 'grins-prices-only-maintenance' },
      create: { key: 'grins-prices-only-maintenance', value: { checkoutClosed: false } },
      update: { value: { checkoutClosed: false } },
    })

    await createProduct('last-unit', 'PG-LAST', 1)
    await Promise.all([createOrder('last-a', 'last-unit', 1), createOrder('last-b', 'last-unit', 1)])
    const lastResults = await Promise.allSettled(['last-a', 'last-b'].map((orderId) => db.$transaction((tx) => holdOrderStock(tx, {
      orderId, items: items('last-unit', 1), status: 'committed', eventPrefix: `pg:${orderId}`,
    }))))
    const lastProduct = await db.product.findUniqueOrThrow({ where: { id: 'last-unit' } })
    check('N concurrent checkouts cannot sell the last unit twice',
      lastResults.filter((result) => result.status === 'fulfilled').length === 1
      && lastResults.filter((result) => result.status === 'rejected').length === 1
      && lastProduct.stock === 0
      && await db.stockAllocation.count({ where: { productId: 'last-unit', status: 'committed' } }) === 1,
      lastResults.map((result) => result.status))

    await createProduct('late-product', 'PG-LATE', 0)
    await createOrder('late-order', 'late-product', 1, 'released')
    await Promise.all([
      updateServerOrderPayment('late-order', { paymentStatus: 'paid', paymentProvider: 'paysera' }),
      updateServerOrderPayment('late-order', { paymentStatus: 'paid', paymentProvider: 'paysera' }),
    ])
    const [lateOrder, lateProduct, lateExceptions] = await Promise.all([
      db.order.findUniqueOrThrow({ where: { id: 'late-order' } }),
      db.product.findUniqueOrThrow({ where: { id: 'late-product' } }),
      db.orderOperationalException.findMany({ where: { orderId: 'late-order' } }),
    ])
    check('duplicate late-payment callbacks persist paid without fake stock and create one exception',
      lateOrder.paymentStatus === 'paid' && lateOrder.stockReservationStatus === 'released'
      && lateProduct.stock === 0 && lateExceptions.length === 1 && lateExceptions[0]?.occurrences === 1,
      { payment: lateOrder.paymentStatus, reservation: lateOrder.stockReservationStatus, stock: lateProduct.stock, exceptions: lateExceptions.length })

    await createProduct('checkout-race', 'PG-CHECKOUT-RACE', 2)
    await createOrder('checkout-race-order', 'checkout-race', 1)
    const checkoutSource = source('checkout-race')
    await Promise.all([
      db.$transaction((tx) => holdOrderStock(tx, {
        orderId: 'checkout-race-order', items: items('checkout-race', 1), status: 'committed', eventPrefix: 'pg:checkout-race',
      })),
      applyStockSnapshot(db, [productInput('PG-CHECKOUT-RACE', 1)], checkoutSource, preflight(1)),
    ])
    check('checkout concurrent with snapshot preserves the availability invariant',
      (await db.$transaction((tx) => stockLedgerInvariantViolations(tx, ['checkout-race']))).length === 0)

    await createProduct('cancel-race', 'PG-CANCEL-RACE', 3, 5)
    await createOrder('cancel-race-order', 'cancel-race', 2)
    await db.stockAllocation.create({
      data: { orderId: 'cancel-race-order', productId: 'cancel-race', quantity: 2, status: 'committed', eventKey: 'pg:cancel-race' },
    })
    await Promise.all([
      db.$transaction((tx) => releaseOrderStock(tx, {
        orderId: 'cancel-race-order', items: items('cancel-race', 2), reason: 'cancelled',
      })),
      applyStockSnapshot(db, [productInput('PG-CANCEL-RACE', 4)], source('cancel-race'), preflight(1)),
    ])
    const cancelProduct = await db.product.findUniqueOrThrow({ where: { id: 'cancel-race' } })
    check('cancel concurrent with snapshot neither double-returns nor loses stock',
      cancelProduct.grinsStock === 4 && cancelProduct.stock === 4
      && (await db.$transaction((tx) => stockLedgerInvariantViolations(tx, ['cancel-race']))).length === 0,
      { grinsStock: cancelProduct.grinsStock, stock: cancelProduct.stock })

    await createProduct('lock-wait', 'PG-LOCK-WAIT', 2)
    let confirmLock: (() => void) | undefined
    const lockAcquired = new Promise<void>((resolve) => { confirmLock = resolve })
    const blocker = db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM "Product" WHERE id=$1 FOR UPDATE', 'lock-wait')
      confirmLock?.()
      await new Promise((resolve) => setTimeout(resolve, 250))
    })
    await lockAcquired
    const lockWaitStarted = performance.now()
    const lockWaitSnapshot = applyStockSnapshot(db, [productInput('PG-LOCK-WAIT', 1)], source('lock-wait'), preflight(1))
    await Promise.all([blocker, lockWaitSnapshot])
    const measuredLockWaitMs = Math.round(performance.now() - lockWaitStarted)
    check('snapshot waits for an existing product row lock without breaking atomicity',
      measuredLockWaitMs >= 200
      && (await db.$transaction((tx) => stockLedgerInvariantViolations(tx, ['lock-wait']))).length === 0,
      { measuredLockWaitMs })

    await db.$executeRawUnsafe('CREATE TABLE "StockConcurrencyProbe" (id integer PRIMARY KEY, value integer NOT NULL)')
    await db.$executeRawUnsafe('INSERT INTO "StockConcurrencyProbe"(id,value) VALUES (1,0),(2,0),(3,0)')
    let attempts = 0
    let firstReads = 0
    let releaseFirstReads: (() => void) | undefined
    const firstReadBarrier = new Promise<void>((resolve) => { releaseFirstReads = resolve })
    const increment = () => runStockSerializableTransaction(db, async (tx) => {
      attempts += 1
      const firstAttempt = attempts <= 2
      const rows = await tx.$queryRawUnsafe<Array<{ value: number }>>('SELECT value FROM "StockConcurrencyProbe" WHERE id=1')
      if (firstAttempt) {
        firstReads += 1
        if (firstReads === 2) releaseFirstReads?.()
        else await firstReadBarrier
      }
      await tx.$executeRawUnsafe('UPDATE "StockConcurrencyProbe" SET value=$1 WHERE id=1', rows[0]!.value + 1)
    })
    await Promise.all([increment(), increment()])
    const probe = await db.$queryRawUnsafe<Array<{ value: number }>>('SELECT value FROM "StockConcurrencyProbe" WHERE id=1')
    let p2028Attempts = 0
    await runStockSerializableTransaction(db, async () => {
      p2028Attempts += 1
      if (p2028Attempts === 1) throw Object.assign(new Error('synthetic transaction expiry'), { code: 'P2028' })
    })
    let deadlockAttempts = 0
    let firstLocks = 0
    let releaseFirstLocks: (() => void) | undefined
    const firstLockBarrier = new Promise<void>((resolve) => { releaseFirstLocks = resolve })
    const deadlockOperation = (firstId: number, secondId: number) => runStockSerializableTransaction(db, async (tx) => {
      deadlockAttempts += 1
      const firstAttempt = deadlockAttempts <= 2
      await tx.$queryRawUnsafe('SELECT id FROM "StockConcurrencyProbe" WHERE id=$1 FOR UPDATE', firstId)
      if (firstAttempt) {
        firstLocks += 1
        if (firstLocks === 2) releaseFirstLocks?.()
        else await firstLockBarrier
      }
      await tx.$queryRawUnsafe('SELECT id FROM "StockConcurrencyProbe" WHERE id=$1 FOR UPDATE', secondId)
      await tx.$executeRawUnsafe('UPDATE "StockConcurrencyProbe" SET value=value+1 WHERE id IN ($1,$2)', firstId, secondId)
    })
    await Promise.all([deadlockOperation(2, 3), deadlockOperation(3, 2)])
    const deadlockRows = await db.$queryRawUnsafe<Array<{ id: number; value: number }>>(
      'SELECT id,value FROM "StockConcurrencyProbe" WHERE id IN (2,3) ORDER BY id',
    )
    check('real PostgreSQL 40001, 40P01 and P2028 failures are retried within bounds',
      probe[0]?.value === 2 && attempts >= 3 && attempts <= 6 && p2028Attempts === 2,
      { value: probe[0]?.value, attempts, p2028Attempts, deadlockAttempts, deadlockRows })
    check('deadlock victim retries and both opposite-order operations commit exactly once',
      deadlockAttempts >= 3 && deadlockAttempts <= 6 && deadlockRows.every((row) => row.value === 2),
      { deadlockAttempts, deadlockRows })

    await createProduct('rollback-product', 'PG-ROLLBACK', 7, 10)
    await createOrder('rollback-order', 'rollback-product', 3)
    await db.stockAllocation.create({
      data: {
        orderId: 'rollback-order', productId: 'rollback-product', quantity: 3, status: 'awaiting_grins_sync',
        eventKey: 'pg:rollback', acknowledgmentId: 'pg:rollback-ack', acknowledgedAt: new Date('2026-10-12T10:00:00Z'), acknowledgedBy: 'operator',
      },
    })
    const rollbackSnapshot = await applyStockSnapshot(db, [productInput('PG-ROLLBACK', 7)], source('rollback'), preflight(1))
    const beforeGateRollback = await rollbackLatestStockSnapshot(db, rollbackSnapshot.runId, 'pg-test').then(() => 'unexpected', (error) => String(error))
    check('rollback checks checkout closure inside the protected transaction', beforeGateRollback.includes('maintenance_required'))
    await db.keyValueSetting.update({ where: { key: 'grins-prices-only-maintenance' }, data: { value: { checkoutClosed: true } } })
    await rollbackLatestStockSnapshot(db, rollbackSnapshot.runId, 'pg-test')
    const [rolledProduct, rolledAllocation] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: 'rollback-product' } }),
      db.stockAllocation.findUniqueOrThrow({ where: { eventKey: 'pg:rollback' } }),
    ])
    check('rollback restores physical 10 and active hold 3, leaving availability 7',
      rolledProduct.grinsStock === 10 && rolledProduct.stock === 7
      && rolledAllocation.status === 'awaiting_grins_sync' && rolledAllocation.reconciledSyncRunId === null,
      { grinsStock: rolledProduct.grinsStock, stock: rolledProduct.stock, allocation: rolledAllocation.status })
    const repeatedRollback = await rollbackLatestStockSnapshot(db, rollbackSnapshot.runId, 'pg-test').then(() => 'unexpected', (error) => String(error))
    check('repeated rollback is rejected', repeatedRollback.includes('stock_snapshot_already_rolled_back') || repeatedRollback.includes('dependent_product_changes'))

    await Promise.all([
      createProduct('rollback-fail-a', 'PG-ROLLBACK-FAIL-A', 7, 10),
      createProduct('rollback-fail-b', 'PG-ROLLBACK-FAIL-B', 10, 10),
      createOrder('rollback-fail-order', 'rollback-fail-a', 3),
    ])
    await db.stockAllocation.create({
      data: {
        orderId: 'rollback-fail-order', productId: 'rollback-fail-a', quantity: 3, status: 'awaiting_grins_sync',
        eventKey: 'pg:rollback-fail', acknowledgmentId: 'pg:rollback-fail-ack', acknowledgedAt: new Date('2026-10-12T10:00:00Z'), acknowledgedBy: 'operator',
      },
    })
    const failSnapshot = await applyStockSnapshot(db, [
      productInput('PG-ROLLBACK-FAIL-A', 7), productInput('PG-ROLLBACK-FAIL-B', 7),
    ], source('rollback-fail'), preflight(2))
    await db.$executeRawUnsafe(`
      CREATE FUNCTION synthetic_rollback_failure() RETURNS trigger AS $$
      BEGIN
        IF NEW.id='rollback-fail-b' AND NEW."grinsStock"=10 AND OLD."grinsStock"=7 THEN
          RAISE EXCEPTION 'synthetic rollback failure';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER synthetic_rollback_failure BEFORE UPDATE ON "Product"
      FOR EACH ROW EXECUTE FUNCTION synthetic_rollback_failure();
    `)
    await rollbackLatestStockSnapshot(db, failSnapshot.runId, 'pg-test').catch(() => undefined)
    const [failedRollbackProduct, failedRollbackAllocation] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: 'rollback-fail-a' } }),
      db.stockAllocation.findUniqueOrThrow({ where: { eventKey: 'pg:rollback-fail' } }),
    ])
    check('mid-rollback failure restores neither products nor allocations partially',
      failedRollbackProduct.grinsStock === 7 && failedRollbackProduct.stock === 7
      && failedRollbackAllocation.status === 'reconciled')
    await db.$executeRawUnsafe('DROP TRIGGER synthetic_rollback_failure ON "Product"; DROP FUNCTION synthetic_rollback_failure()')
    await rollbackLatestStockSnapshot(db, failSnapshot.runId, 'pg-test')

    await createProduct('initialization', 'PG-INITIALIZATION', 5, null)
    const initializationSnapshot = await applyStockSnapshot(db, [productInput('PG-INITIALIZATION', 5)], source('initialization'), preflight(1))
    const initializationRollback = await rollbackLatestStockSnapshot(db, initializationSnapshot.runId, 'pg-test').then(() => 'unexpected', (error) => String(error))
    check('rollback of ledger initialization is forbidden', initializationRollback.includes('rollback_initialization_forbidden'))

    const scale = 15_700
    for (let offset = 0; offset < scale; offset += 1_000) {
      const count = Math.min(1_000, scale - offset)
      await db.product.createMany({
        data: Array.from({ length: count }, (_, index) => {
          const n = offset + index
          return {
            id: `scale-${n}`, externalId: `PG-SCALE-${n}`, sku: `PG-SCALE-${n}`, title: `Scale ${n}`, brand: 'Synthetic',
            price: 10, category: 'hair', stock: 1, grinsStock: 1,
            images: [], badges: [], relatedProductIds: [], oftenBoughtTogether: [], certificates: [], compatibleEquipment: [],
          }
        }),
      })
    }
    const scaleProducts = Array.from({ length: scale }, (_, n) => productInput(`PG-SCALE-${n}`, 2))
    const changedStarted = performance.now()
    const changedScale = await applyStockSnapshot(db, scaleProducts, source('scale-changed'), preflight(scale))
    const changedMs = Math.round(performance.now() - changedStarted)
    const sampleBeforeNoop = await db.product.findUniqueOrThrow({ where: { id: 'scale-0' }, select: { updatedAt: true } })
    const unchangedStarted = performance.now()
    const unchangedScale = await applyStockSnapshot(db, scaleProducts, source('scale-unchanged'), preflight(scale))
    const unchangedMs = Math.round(performance.now() - unchangedStarted)
    const [sampleAfterNoop, unchangedJournal, changedRun, unchangedRun] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: 'scale-0' }, select: { updatedAt: true } }),
      db.stockSnapshotEntry.count({ where: { runId: unchangedScale.runId } }),
      db.syncRun.findUniqueOrThrow({ where: { id: changedScale.runId }, select: { errorSample: true } }),
      db.syncRun.findUniqueOrThrow({ where: { id: unchangedScale.runId }, select: { errorSample: true } }),
    ])
    check('15,700-product no-op snapshot writes no journal and preserves Product.updatedAt',
      changedScale.status === 'completed' && unchangedScale.status === 'completed'
      && unchangedJournal === 0 && sampleAfterNoop.updatedAt.getTime() === sampleBeforeNoop.updatedAt.getTime(),
      { changedMs, unchangedMs, unchangedJournal, changedRun: changedRun.errorSample, unchangedRun: unchangedRun.errorSample })
    console.log(JSON.stringify({
      performance: {
        products: scale, changedMs, unchangedMs, measuredLockWaitMs,
        changedRun: changedRun.errorSample, unchangedRun: unchangedRun.errorSample,
      },
    }))

    const finalViolations = await db.$transaction((tx) => stockLedgerInvariantViolations(tx))
    check('final managed availability invariant holds', finalViolations.length === 0, finalViolations.slice(0, 10))
  } finally {
    await db.$disconnect()
  }

  console.log(JSON.stringify({ checks, failed: checks.filter((entry) => !entry.pass).length }, null, 2))
  if (checks.some((entry) => !entry.pass)) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
