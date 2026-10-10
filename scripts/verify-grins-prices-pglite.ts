// Synthetic loopback SQL only. Multi-backend wait/timeout behavior requires PG.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import type { ExtendedPrismaClient } from '@/lib/prisma'
const schema = process.argv[2]
if (!schema) throw new Error('usage: verify-grins-prices-pglite.ts <schema.sql>')
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable'
const ROWS = 15_000
const xml = (label: string, primary = '11.50', bulk = false) => `<root>${Array.from({ length: ROWS }, (_, index) => index === 5 ? '' :
  `<item><sku>${index === 3 ? 'UNKNOWN' : `S${index}`}</sku><title>${label}</title><price1>12</price1><price2>${index === 0 || (bulk && index < 1000) ? primary : index === 1 ? '0.005' : index === 2 ? '0' : '10'}</price2><price3>5</price3><price4>0</price4><quantity>999</quantity><warehouses>${Array.from({ length: 9 }, (_, slot) => `<warehouse id="${slot + 1}">0</warehouse>`).join('')}</warehouses></item>`).join('')}</root>`
const checks: Array<{ name: string; pass: boolean }> = []
function check(name: string, pass: boolean) { checks.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`) }
async function main() {
  const pg = new PGlite()
  await pg.exec(readFileSync(schema, 'utf8'))
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54329, maxConnections: 20 })
  await server.start()
  const { prisma: db } = await import('@/lib/prisma')
  const mi = await import('@/lib/sync/manual-import')
  const { GRINS_CHECKOUT_GATE_KEY: gate, CheckoutMaintenanceError } = await import('@/lib/grins-import-maintenance')
  const { initializeGrinsCheckoutState, readGrinsCheckoutState } = await import('@/lib/grins-checkout-preparation')
  const { createServerOrder, applyOrderReservationPaymentState } = await import('@/lib/orders-data-store')
  const setClosed = (checkoutClosed: boolean) => db.keyValueSetting.upsert({ where: { key: gate }, create: { key: gate, value: { checkoutClosed } }, update: { value: { checkoutClosed } } })
  const product = (index: number) => db.product.findUniqueOrThrow({ where: { id: `p${index}` } })
  const stocks = async () => JSON.stringify(await db.$queryRawUnsafe(`SELECT id,stock,"isActive","isDeleted" FROM "Product" ORDER BY id`))
  const prices = async () => JSON.stringify(await db.$queryRawUnsafe(`SELECT id,price,"erpPriceMissing","manualPriceApproved","manualApprovedPrice" FROM "Product" ORDER BY id`))
  const orders = async () => JSON.stringify(await db.$queryRawUnsafe('SELECT * FROM "Order" ORDER BY id'))
  const extra = async () => JSON.stringify((await db.keyValueSetting.findUnique({ where: { key: 'erp-extra-data' } }))?.value)
  const preview = (content: string) => mi.savePendingPreview(db, { xml: content, sha256: mi.sha256Hex(content), fileName: 'synthetic.xml', sizeBytes: Buffer.byteLength(content), actorId: 'synthetic-admin' })
  const apply = (pending: Awaited<ReturnType<typeof preview>>, client = db) => mi.applyManualImport({ db: client }, { previewId: pending.previewId, sha256: pending.sha256, actorId: pending.actorId })
  const orderBase = { createdAt: new Date().toISOString(), items: [{ id: 'p0', title: 'T', brand: 'B', image: '', category: 'hair', price: 10, rating: 0, stock: 4, quantity: 1 }], subtotal: 10, tax: 0, delivery: 0, deliveryMethod: 'pickup', paymentMethod: 'manual', discount: 0, total: 10, firstName: 'Synthetic', lastName: 'Test', email: 'test@example.invalid', phone: '000', address: 'Test', city: 'Test' }
  try {
    await pg.exec(`INSERT INTO "Product"(id,title,brand,price,category,"updatedAt","externalId",stock,"isActive") SELECT 'p'||i,'T','B',10,'hair',now(),'S'||i,4,true FROM generate_series(0,${ROWS - 1}) i;
      INSERT INTO "SyncRun"(id,status,"triggeredBy","productsTotal","productsSynced","finishedAt") VALUES ('baseline','completed','cron',${ROWS},${ROWS},now());
      UPDATE "Product" SET price=9,"manualPriceApproved"=true,"manualApprovedPrice"=9 WHERE id='p2';
      UPDATE "Product" SET "isDeleted"=true WHERE id='p4';`)
    await db.keyValueSetting.create({ data: { key: 'erp-extra-data', value: { S0: { prices: { price1: 12, price2: 10, price3: 5, price4: 0 }, warehouseQuantities: { '10000': 321, '10001': 123 } } } } })
    check('missing checkout state is explicitly unknown before preparation', await readGrinsCheckoutState(db) === 'missing')
    let missingDenied = false
    try { await createServerOrder(orderBase) } catch (error) { missingDenied = error instanceof CheckoutMaintenanceError }
    check('missing state does not open checkout or create an order', missingDenied && await db.order.count() === 0)
    const initialized = await initializeGrinsCheckoutState(db)
    check('explicit initialization creates an open record for a new installation', initialized.created && !initialized.checkoutClosed)
    const firstState = await db.keyValueSetting.findUniqueOrThrow({ where: { key: gate } })
    const repeated = await initializeGrinsCheckoutState(db)
    check('repeated initialization does not modify existing value or timestamp', !repeated.created && !repeated.checkoutClosed && (await db.keyValueSetting.findUniqueOrThrow({ where: { key: gate } })).updatedAt.getTime() === firstState.updatedAt.getTime())
    await setClosed(true)
    const preserved = await initializeGrinsCheckoutState(db)
    check('initialization never resets existing closed checkout', !preserved.created && preserved.checkoutClosed)
    await db.keyValueSetting.delete({ where: { key: gate } })
    const raced = await Promise.all(Array.from({ length: 8 }, () => initializeGrinsCheckoutState(db)))
    check('concurrent initializers create exactly one row', raced.filter(result => result.created).length === 1 && await db.keyValueSetting.count({ where: { key: gate } }) === 1)
    check('concurrent initializers all verify the same open state', raced.every(result => !result.checkoutClosed))
    const reserved = await createServerOrder({ ...orderBase, stockReservationStatus: 'reserved', stockReservedUntil: new Date(Date.now() + 300_000).toISOString() })
    check('actual reservation decrements stock before import', (await product(0)).stock === 3)
    await setClosed(true)
    const oldStocks = await stocks(), oldOrders = await orders(), oldExtra = await extra(), oldPrices = await prices()
    const evaluation = await mi.evaluateFeed(db, xml('A'))
    check('price preview ignores XML stock 0 and extreme quantity', !evaluation.preflight.hard.length && evaluation.summary.stockChanges === 0 && evaluation.samples.stockChanges.length === 0)
    check('preview/SQL round 0.005 to 0.01', evaluation.products.find(row => row.externalId === 'S1')?.price === 0.01)
    const p = await preview(xml('A'))
    const first = await apply(p)
    check('successful price Apply completes', first.status === 'completed')
    if (first.status !== 'completed') throw new Error('Apply failed')
    check('all stocks and stock availability fields identical', await stocks() === oldStocks)
    check('all orders/reservations identical', await orders() === oldOrders)
    check('ERP prices/warehouse metadata byte-equivalent', await extra() === oldExtra)
    check('actual 0.005 produces 0.01, never free', Number((await product(1)).price) === 0.01 && !(await product(1)).erpPriceMissing)
    const zero = await product(2)
    check('literal zero keeps price approval and ERP price validity unchanged', Number(zero.price) === 9 && !zero.erpPriceMissing && zero.manualPriceApproved && Number(zero.manualApprovedPrice) === 9)
    check('unmatched/deleted/missing records never created or changed', await db.product.count() === ROWS && Number((await product(3)).price) === 10 && Number((await product(4)).price) === 10 && Number((await product(5)).price) === 10)
    const run = await db.syncRun.findUniqueOrThrow({ where: { id: first.result.runId } })
    const diag = run.errorSample as Record<string, unknown>
    check('journal includes mode and zero stock changes', diag.mode === 'prices-only' && (diag.changes as { stock: number }).stock === 0)
    check('journal lists only actual Product write fields', JSON.stringify(diag.writeFields) === JSON.stringify(['price', 'revision', 'updatedAt']))
    const backup = (await db.keyValueSetting.findUniqueOrThrow({ where: { key: first.backupKey } })).value as Record<string, unknown>
    check('backup version 3 contains no stock or warehouse fields', backup.version === 3 && backup.mode === 'prices-only' && !/stock|warehouse/u.test(JSON.stringify(backup)))
    const duplicate = await apply(await preview(xml('A')))
    check('successful SHA replay is rejected', duplicate.status === 'rejected' && duplicate.error === 'already_applied')
    const restored = await mi.restorePreImportBackup(db, first.backupKey, { execute: true })
    check('restore returns prices without touching stocks/orders/ERP', restored.restored === 2 && await prices() === oldPrices && await stocks() === oldStocks && await orders() === oldOrders && await extra() === oldExtra)
    const second = await apply(await preview(xml('B')))
    if (second.status !== 'completed') throw new Error('second Apply failed')
    let checkoutRefused = false
    try { await createServerOrder(orderBase) } catch (error) { checkoutRefused = error instanceof CheckoutMaintenanceError }
    check('closed maintenance rejects actual new order before stock writes', checkoutRefused && await stocks() === oldStocks && await orders() === oldOrders)
    await db.$transaction(tx => applyOrderReservationPaymentState(tx, reserved.id, 'failed'))
    check('reservation release after price import returns original stock, not ERP plus quantity', (await product(0)).stock === 4)
    let conflict = false
    try { await mi.restorePreImportBackup(db, second.backupKey, { execute: true }) } catch (error) { conflict = String(error).includes('restore_conflict') }
    check('restore after reservation change refuses without altering prices/stock', conflict && Number((await product(0)).price) === 11.5 && (await product(0)).stock === 4)
    await setClosed(false)
    const freshOrder = await createServerOrder(orderBase, async tx => {
      const current = await tx.product.findUniqueOrThrow({ where: { id: 'p0' } })
      const price = Number(current.price)
      return { ...orderBase, items: [{ ...orderBase.items[0], price }], subtotal: price, total: price }
    })
    check('reopened checkout reads new authoritative price; previous order snapshot stays old', freshOrder.items[0].price === 11.5 && Number((await db.order.findUniqueOrThrow({ where: { id: reserved.id } })).total) === 10)
    const openApply = await apply(await preview(xml('maintenance')))
    check('Apply while checkout open is rejected', openApply.status === 'rejected' && openApply.error === 'maintenance_required')
    await setClosed(true)
    const stale = await preview(xml('stale'))
    await db.product.update({ where: { id: 'p20' }, data: { price: 10.25 } })
    const stalePrices = await prices()
    const rejected = await apply(stale)
    check('price edit after preview rejects stale plan despite passing ratio thresholds', rejected.status === 'rejected' && rejected.hard?.includes('catalog_changed_since_preview') === true && await prices() === stalePrices)
    for (const value of ['0.004', '0.0049', '0x10', '1e2', '-1', '10000000000']) {
      const invalid = await mi.evaluateFeed(db, xml(`invalid-${value}`, value))
      check(`invalid price ${value} HARD before SQL`, invalid.preflight.hard.length > 0 && invalid.products.length === 0)
    }
    const beforeFailure = await prices(), failureStocks = await stocks(), failureExtra = await extra()
    await pg.exec(`CREATE FUNCTION boom() RETURNS trigger AS $$ BEGIN IF NEW."externalId"='S700' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql; CREATE TRIGGER boom BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION boom();`)
    const failed = await apply(await preview(xml('failure', '12', true)))
    check('failure after earlier SQL updates rolls all prices back', failed.status === 'failed' && await prices() === beforeFailure)
    check('failed price Apply also leaves stock/ERP unchanged', await stocks() === failureStocks && await extra() === failureExtra)
    await pg.exec('DROP TRIGGER boom ON "Product"; DROP FUNCTION boom();')
    await pg.exec(`CREATE FUNCTION backup_boom() RETURNS trigger AS $$ BEGIN IF NEW.key LIKE 'grins-manual-import-backup:%' THEN RAISE EXCEPTION 'synthetic canary-secret'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql; CREATE TRIGGER backup_boom BEFORE INSERT ON "KeyValueSetting" FOR EACH ROW EXECUTE FUNCTION backup_boom();`)
    const backupFailed = await apply(await preview(xml('backup-failure', '12', true)))
    check('backup SQL failure refuses before any price writes', backupFailed.status === 'rejected' && backupFailed.error === 'backup_failed' && await prices() === beforeFailure)
    await pg.exec('DROP TRIGGER backup_boom ON "KeyValueSetting"; DROP FUNCTION backup_boom();')
    await pg.exec(`CREATE FUNCTION marker_boom() RETURNS trigger AS $$ BEGIN IF NEW.status='completed' AND NEW."triggeredBy"='manual' THEN RAISE EXCEPTION 'synthetic final marker failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql; CREATE TRIGGER marker_boom BEFORE UPDATE ON "SyncRun" FOR EACH ROW EXECUTE FUNCTION marker_boom();`)
    const markerFailed = await apply(await preview(xml('marker-failure', '12', true)))
    check('final completed marker failure rolls back prices, backup and ledger', markerFailed.status === 'failed' && await prices() === beforeFailure)
    await pg.exec('DROP TRIGGER marker_boom ON "SyncRun"; DROP FUNCTION marker_boom();')
    const parallel = await preview(xml('parallel', '12', true))
    const pair = await Promise.all([apply(parallel), apply(parallel)])
    check('concurrent same preview has one committed winner', pair.filter(result => result.status === 'completed').length === 1)
    const winner = pair.find(result => result.status === 'completed')
    if (winner && winner.status !== 'rejected') {
      const beforeRestoreFailure = await prices()
      await pg.exec(`CREATE FUNCTION restore_boom() RETURNS trigger AS $$ BEGIN IF NEW."externalId"='S700' THEN RAISE EXCEPTION 'synthetic restore failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql; CREATE TRIGGER restore_boom BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION restore_boom();`)
      let restoreFailed = false
      try { await mi.restorePreImportBackup(db, winner.backupKey, { execute: true }) } catch { restoreFailed = true }
      check('restore SQL error after earlier statements rolls all price restores back', restoreFailed && await prices() === beforeRestoreFailure && await stocks() === failureStocks)
      await pg.exec('DROP TRIGGER restore_boom ON "Product"; DROP FUNCTION restore_boom();')
    }
    const realTransaction = db.$transaction.bind(db)
    let loseAck = true
    const lostAck = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return async (...args: Parameters<typeof realTransaction>) => {
        const result = await Reflect.apply(realTransaction, target, args)
        if (loseAck) { loseAck = false; throw new Error('synthetic lost COMMIT ack') }
        return result
      }
      return Reflect.get(target, key)
    } }) as ExtendedPrismaClient
    const ack = await apply(await preview(xml('ack', '12.10')), lostAck)
    check('committed price update resolves lost COMMIT acknowledgement correctly', ack.status === 'completed')
    const firstFile = await preview(xml('different-A'))
    const lastFile = await preview(xml('different-B'))
    const different = await Promise.all([apply(firstFile), apply(lastFile)])
    check('concurrent different XML never commits two previews', different.filter(result => result.status === 'completed').length <= 1)
    const latest = await apply(lastFile)
    check('latest different preview remains applicable or already recorded', latest.status === 'completed' || (latest.status === 'rejected' && latest.error === 'already_applied'))
    const legacy = await preview(xml('legacy'))
    await db.keyValueSetting.update({ where: { key: 'grins-manual-import-pending' }, data: { value: { ...legacy, mode: 'full' } } })
    const wrongMode = await apply(legacy)
    check('old/full preview cannot invoke any stock path', wrongMode.status === 'rejected' && wrongMode.error === 'preview_mode_mismatch')
    await db.$executeRawUnsafe('UPDATE "Product" SET "erpPriceMissing"=true,"manualPriceApproved"=true,"manualApprovedPrice"=price WHERE id=\'p0\'')
    const approvalPrices = await prices(), approvalStocks = await stocks()
    check('Preview blocks loss of sellability before Apply', (await mi.evaluateFeed(db, xml('approval-availability', '13.20'))).preflight.hard.includes('price_change_would_alter_sellability'))
    const invalidatedApproval = await apply(await preview(xml('approval-availability', '13.20')))
    check('price change cannot invalidate manually approved sellability', invalidatedApproval.status === 'rejected' && invalidatedApproval.error === 'preflight_failed')
    check('sellability rejection leaves every price approval and stock unchanged', await prices() === approvalPrices && await stocks() === approvalStocks)
    await db.$executeRawUnsafe('UPDATE "Product" SET "manualApprovedPrice"=13.20 WHERE id=\'p0\'')
    check('Preview blocks gain of sellability before Apply', (await mi.evaluateFeed(db, xml('approval-restoration', '13.20'))).preflight.hard.includes('price_change_would_alter_sellability'))
    const gained = await apply(await preview(xml('approval-restoration', '13.20')))
    check('Apply also blocks automatic restoration of sellability', gained.status === 'rejected' && gained.error === 'preflight_failed')
    await db.$executeRawUnsafe('UPDATE "Product" SET "erpPriceMissing"=false,"manualPriceApproved"=false,"manualApprovedPrice"=NULL WHERE id IN (\'p0\',\'p2\')')
    const zeroBefore = await product(2)
    const zeroApproval = await apply(await preview(xml('zero-unapproved-preserved')))
    const zeroAfter = await product(2)
    check('zero price on an unapproved sellable product applies without disabling it', zeroApproval.status === 'completed' && !zeroAfter.erpPriceMissing && !zeroAfter.manualPriceApproved)
    check('zero price leaves the complete Product row unchanged', JSON.stringify(zeroBefore) === JSON.stringify(zeroAfter))
    await db.keyValueSetting.delete({ where: { key: gate } })
    const absent = await apply(await preview(xml('missing-gate')))
    check('missing maintenance configuration denies Apply', absent.status === 'rejected' && absent.error === 'maintenance_required')
  } finally { await db.$disconnect(); await server.stop(); await pg.close() }
  console.log(JSON.stringify({ checks, count: checks.length, failed: checks.filter(check => !check.pass).length }, null, 2))
  process.exitCode = checks.every(check => check.pass) ? 0 : 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
