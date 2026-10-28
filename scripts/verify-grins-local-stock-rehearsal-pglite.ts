// Synthetic loopback PostgreSQL only. Never reads .env or connects externally.
// Proves the guarded local-file stocks-only adapter end to end against the real
// runScheduledStockSync/applyStockSnapshot path and the adapter's raw SQL.
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const schema = process.argv[2]
if (!schema) throw new Error('usage: verify-grins-local-stock-rehearsal-pglite.ts <schema.sql>')
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54341/postgres?sslmode=disable'
// Only order creation reads process.env; the adapter forces its own flag set.
process.env.GRINS_STOCK_LEDGER_ENABLED = 'true'
process.env.GRINS_STOCK_SYNC_ENABLED = 'false'
process.env.GRINS_STOCK_MANIFEST_ENABLED = 'false'
process.env.GRINS_STOCK_RECONCILIATION_ENABLED = 'false'

const checks: Array<{ name: string; pass: boolean }> = []
const check = (name: string, pass: boolean) => { checks.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`) }

const LINKED = 14_100
const UNKNOWN = 50
const id5 = (i: number) => String(i).padStart(5, '0')

function buildXml(quantityFor: (sku: string) => number): string {
  const item = (sku: string, quantity: number) => {
    const warehouses = Array.from({ length: 9 }, (_, index) =>
      `<warehouse id="${index + 1}">${index === 0 ? quantity : 0}</warehouse>`).join('')
    // Prices deliberately differ from the database: a stocks-only run must ignore them.
    return `<item><sku>${sku}</sku><price1>999</price1><price2>888</price2><price3>777</price3><price4>666</price4><quantity>${quantity}</quantity><warehouses>${warehouses}</warehouses></item>`
  }
  const skus = [
    ...Array.from({ length: LINKED }, (_, i) => `G${id5(i + 1)}`),
    'GDEL',
    ...Array.from({ length: UNKNOWN }, (_, i) => `NEW${id5(i + 1)}`),
  ]
  return `<?xml version="1.0" encoding="utf-8"?><root>${skus.map(sku => item(sku, quantityFor(sku))).join('')}</root>`
}

function manifestFor(xml: string, runId: string, runStartedAt: Date, generatedAt: Date, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    runId,
    runStartedAt: runStartedAt.toISOString(),
    mode: 'shadow',
    generatedAt: generatedAt.toISOString(),
    xmlSha256: createHash('sha256').update(xml, 'utf-8').digest('hex'),
    xmlSizeBytes: Buffer.byteLength(xml, 'utf-8'),
    productCount: LINKED + 1 + UNKNOWN,
    warehousePolicy: '10000-10007',
    ...overrides,
  })
}

async function main() {
  const pg = new PGlite()
  await pg.exec(readFileSync(schema, 'utf8'))
  const migration = readFileSync('prisma/migrations/20261012170000_split_grins_stock_ledger/migration.sql', 'utf8')
  await pg.exec(migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION')))
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54341, maxConnections: 20 })
  await server.start()
  const { prisma: db } = await import('@/lib/prisma')
  const { createServerOrder } = await import('@/lib/orders-data-store')
  const {
    STOCK_REHEARSAL_MARKER_KEY,
    STOCK_REHEARSAL_PURPOSE,
    runLocalFileStockSync,
    verifyLocalStockRehearsalTarget,
  } = await import('@/lib/sync/local-stock-sync')

  const confirmation = {
    instanceId: randomUUID(),
    branchId: 'br-synthetic-rehearsal',
    endpointId: 'ep-synthetic-rehearsal',
    catalogFingerprint: '',
  }
  const setMarker = (overrides: Record<string, unknown> = {}) => pg.query(
    `INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES ($1,$2::jsonb,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=now()`,
    [STOCK_REHEARSAL_MARKER_KEY, JSON.stringify({
      version: 1,
      purpose: STOCK_REHEARSAL_PURPOSE,
      instanceId: confirmation.instanceId,
      branchId: confirmation.branchId,
      endpointId: confirmation.endpointId,
      recoveryVerifiedAt: new Date(Date.now() - 3_600_000).toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      ...overrides,
    })],
  )
  const setCheckout = (closed: boolean) => pg.query(
    `UPDATE "KeyValueSetting" SET value=jsonb_set(value,'{checkoutClosed}',$1::jsonb),"updatedAt"=now() WHERE key='grins-prices-only-maintenance'`,
    [JSON.stringify(closed)],
  )
  const catalogFingerprint = async () => (await pg.query<{ fingerprint: string }>(
    `SELECT md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) AS fingerprint FROM "Product" p`,
  )).rows[0].fingerprint
  // Independent of the adapter's own safety SQL: every price-bearing and identity column.
  const priceFingerprint = async () => (await pg.query<{ fingerprint: string }>(
    `SELECT md5(string_agg(concat_ws('|', id, price, "oldPrice", "manualApprovedPrice", "erpPriceMissing", "isActive", "isDeleted", "externalId", sku, "lastSyncRunId"), ',' ORDER BY id)) AS fingerprint FROM "Product"`,
  )).rows[0].fingerprint
  const count = async (sql: string) => (await pg.query<{ n: number }>(sql)).rows[0].n
  const syncRuns = () => count('SELECT COUNT(*)::int AS n FROM "SyncRun"')
  const verifyTarget = (target: typeof db, at: Date) => verifyLocalStockRehearsalTarget(target, confirmation, at)
  const run = (xml: string, manifest: string, runId: string, now = () => new Date()) => runLocalFileStockSync({
    source: { xml, manifest, expectedRunId: runId, expectedSha256: createHash('sha256').update(xml, 'utf-8').digest('hex') },
    now,
    getDb: async () => db,
    verifyTarget,
  })

  try {
    await pg.exec(`
      INSERT INTO "Product"(id,title,brand,price,category,"updatedAt","externalId",sku,stock,"isActive","isDeleted")
      SELECT 'p' || lpad(i::text, 5, '0'), 'P' || i, 'B', 10 + (i % 7), 'hair', now(),
             'G' || lpad(i::text, 5, '0'), 'G' || lpad(i::text, 5, '0'), 5, true, false
        FROM generate_series(1, ${LINKED}) AS i;
      INSERT INTO "Product"(id,title,brand,price,category,"updatedAt","externalId",sku,stock,"isActive","isDeleted")
      VALUES ('local','Local','B',12,'hair',now(),NULL,'LOCAL',3,true,false),
             ('deleted','Deleted','B',12,'hair',now(),'GDEL','GDEL',4,false,true);
      INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES
        ('grins-prices-only-maintenance','{"checkoutClosed":true}',now()),
        ('erp-extra-data','{"G00001":{"price2":"8.00","price3":"7.00"}}',now());
    `)
    await setMarker()
    confirmation.catalogFingerprint = await catalogFingerprint()
    const productsBefore = await count('SELECT COUNT(*)::int AS n FROM "Product"')
    const pricesBefore = await priceFingerprint()

    const xml1 = buildXml(sku => sku.startsWith('NEW') ? 3 : sku === 'GDEL' ? 9 : 6)
    const start1 = new Date(Date.now() - 120_000)
    const manifest1 = manifestFor(xml1, 'run-1', start1, new Date(start1.getTime() + 60_000))

    // ── Source guards: rejected before a database client is requested ────────
    const sourceRejected = async (manifest: string, runId: string, expected: string) => {
      let dbRequested = false
      try {
        await runLocalFileStockSync({
          source: { xml: xml1, manifest, expectedRunId: runId, expectedSha256: createHash('sha256').update(xml1, 'utf-8').digest('hex') },
          getDb: async () => { dbRequested = true; return db },
          verifyTarget,
        })
        return false
      } catch (error) {
        return !dbRequested && String(error).includes(expected)
      }
    }
    check('stale manifest is rejected before DB access', await sourceRejected(
      manifestFor(xml1, 'run-1', new Date(Date.now() - 5 * 3_600_000), new Date(Date.now() - 4 * 3_600_000)), 'run-1', 'stale'))
    check('publish-mode manifest is rejected before DB access', await sourceRejected(
      manifestFor(xml1, 'run-1', start1, new Date(start1.getTime() + 60_000), { mode: 'publish' }), 'run-1', 'local_stock_manifest_requires_shadow_mode'))
    check('published manifest is rejected before DB access', await sourceRejected(
      manifestFor(xml1, 'run-1', start1, new Date(start1.getTime() + 60_000), { published: true }), 'run-1', 'local_stock_manifest_must_be_unpublished'))
    check('manifest for another run is rejected before DB access', await sourceRejected(manifest1, 'run-other', 'local_stock_manifest_run_id_mismatch'))

    // ── Target guards: fail closed without even a diagnostic SyncRun ─────────
    const rejectedBeforeCapture = async (expected: string) => {
      try { await run(xml1, manifest1, 'run-1'); return false } catch (error) { return String(error).includes(expected) }
    }
    await setCheckout(false)
    check('open checkout is rejected with no write', await rejectedBeforeCapture('local_stock_rehearsal_checkout_must_be_closed'))
    await setCheckout(true)
    await setMarker({ endpointId: 'ep-other-endpoint' })
    check('marker for another endpoint is rejected with no write', await rejectedBeforeCapture('local_stock_rehearsal_marker_mismatch'))
    await setMarker({ expiresAt: new Date(Date.now() - 1_000).toISOString() })
    check('expired marker is rejected with no write', await rejectedBeforeCapture('local_stock_rehearsal_recovery_not_verified'))
    await setMarker()
    await pg.exec(`INSERT INTO "SyncRun"(id,status,mode) VALUES ('foreign-running','running','stocks-only')`)
    check('active sync run is rejected with no write', await rejectedBeforeCapture('local_stock_rehearsal_sync_active'))
    await pg.exec(`DELETE FROM "SyncRun" WHERE id='foreign-running'`)
    const realFingerprint = confirmation.catalogFingerprint
    confirmation.catalogFingerprint = '0'.repeat(32)
    check('catalog drift from the confirmed baseline is rejected with no write', await rejectedBeforeCapture('local_stock_rehearsal_catalog_drift'))
    confirmation.catalogFingerprint = realFingerprint
    check('no rejected attempt created a SyncRun', await syncRuns() === 0)

    // ── First initialization through the real stocks-only path ───────────────
    const first = await run(xml1, manifest1, 'run-1')
    const runRow = first.sync.runId ? await db.syncRun.findUnique({ where: { id: first.sync.runId } }) : null
    check('initialization completes as a manual stocks-only run and adapter safety passes', first.sync.status === 'completed'
      && first.safety.passed && runRow?.mode === 'stocks-only' && runRow?.triggeredBy === 'manual')
    check('update-only: no product created, unknown SKUs ignored', await count('SELECT COUNT(*)::int AS n FROM "Product"') === productsBefore
      && await count(`SELECT COUNT(*)::int AS n FROM "Product" WHERE "externalId" LIKE 'NEW%'`) === 0)
    check('prices, identity and activation unchanged', await priceFingerprint() === pricesBefore)
    check('ERP price metadata unchanged', (await pg.query<{ v: string }>(`SELECT value::text AS v FROM "KeyValueSetting" WHERE key='erp-extra-data'`)).rows[0].v.includes('"8.00"'))
    check('every linked product initialized to the XML quantity', await count(
      `SELECT COUNT(*)::int AS n FROM "Product" WHERE "externalId" ~ '^G[0-9]{5}$' AND "grinsStock" = 6 AND stock = 6`) === LINKED)
    check('soft-deleted and local-only products untouched', await count(
      `SELECT COUNT(*)::int AS n FROM "Product" WHERE (id='deleted' AND stock=4 AND "grinsStock" IS NULL) OR (id='local' AND stock=3 AND "grinsStock" IS NULL)`) === 2)

    const runsAfterFirst = await syncRuns()
    check('repeating the same command after a write is rejected (baseline moved)',
      await rejectedBeforeCapture('local_stock_rehearsal_catalog_drift') && await syncRuns() === runsAfterFirst)
    confirmation.catalogFingerprint = await catalogFingerprint()
    const replay = await run(xml1, manifest1, 'run-1')
    check('same source with a re-confirmed baseline is a no-write replay', replay.sync.status === 'skipped'
      && replay.safety.passed && await catalogFingerprint() === confirmation.catalogFingerprint)

    // ── Existing holds survive a later snapshot ──────────────────────────────
    await setCheckout(false)
    const order = await createServerOrder({
      createdAt: new Date().toISOString(),
      items: [{ id: 'p00001', title: 'P1', brand: 'B', image: '', category: 'hair', rating: 0, price: 11, stock: 6, quantity: 2 }],
      subtotal: 22, tax: 0, delivery: 0, deliveryMethod: 'pickup', paymentMethod: 'manual', discount: 0, total: 22,
      firstName: 'Synthetic', lastName: 'Rehearsal', email: 'rehearsal@example.invalid', phone: '000', address: 'Test', city: 'Test',
      paymentStatus: 'paid', stockReservationStatus: 'committed',
    } as never)
    await setCheckout(true)
    confirmation.catalogFingerprint = await catalogFingerprint()
    const allocationBefore = await db.stockAllocation.findFirstOrThrow({ where: { orderId: order.id } })
    const orderBefore = await db.order.findUniqueOrThrow({ where: { id: order.id } })

    const xml2 = buildXml(sku => sku === 'G00001' ? 8 : sku.startsWith('NEW') ? 3 : sku === 'GDEL' ? 9 : 6)
    const start2 = new Date(Date.now() - 30_000)
    const second = await run(xml2, manifestFor(xml2, 'run-2', start2, new Date(start2.getTime() + 10_000)), 'run-2')
    const p1 = await db.product.findUniqueOrThrow({ where: { id: 'p00001' } })
    const allocationAfter = await db.stockAllocation.findFirstOrThrow({ where: { orderId: order.id } })
    const orderAfter = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    check('later snapshot keeps the hold: availability = physical - allocation', second.sync.status === 'completed' && second.safety.passed
      && p1.grinsStock === 8 && p1.stock === 6)
    check('allocation and order unchanged by the snapshot', JSON.stringify(allocationAfter) === JSON.stringify(allocationBefore)
      && JSON.stringify(orderAfter) === JSON.stringify(orderBefore))
    check('prices still unchanged after the second snapshot', await priceFingerprint() === pricesBefore)
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
