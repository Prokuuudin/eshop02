// Synthetic data only, loopback only. PGlite exercises SQL/rollback, not a
// multi-backend PostgreSQL server or Neon/IIS. See handoff for those limits.
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import type { ExtendedPrismaClient } from '@/lib/prisma'

const schema = process.argv[2]
if (!schema) throw new Error('usage: verify-grins-atomic-pglite.ts <schema.sql>')
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable'
for (const key of ['POSTGRES_PRISMA_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING']) delete process.env[key]
const ROWS = 15_000
const xml = (stock: number, label = '', price = '10.00') => `<root>${Array.from({ length: ROWS }, (_, index) =>
  `<item><sku>S${index}</sku><title>${label}</title><price1>12</price1><price2>${index === 1 ? price : '10.00'}</price2><price3>5</price3><price4>0</price4><quantity>${stock + 3}</quantity><warehouses>${Array.from({ length: 9 }, (_, slot) => `<warehouse id="${slot + 1}">${slot === 0 ? stock : [1, 2, 5].includes(slot) ? 1 : 0}</warehouse>`).join('')}</warehouses></item>`).join('')}</root>`
const checks: Array<{ scenario: string; expected: string; actual: string; pass: boolean }> = []
function check(scenario: string, pass: boolean, expected = 'condition true', actual = String(pass)) {
  checks.push({ scenario, pass, expected, actual })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${scenario}: ${actual}`)
}

async function main() {
  const pg = new PGlite()
  await pg.exec(readFileSync(schema, 'utf8'))
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54329, maxConnections: 20 })
  await server.start()
  const { prisma: db } = await import('@/lib/prisma')
  const mi = await import('@/lib/sync/manual-import')
  const { runSync } = await import('@/lib/sync/sync-runner')
  const { acquireSyncLock, releaseSyncLock, isSyncLockHeld } = await import('@/lib/sync/sync-lock')
  const { getErpExtraData } = await import('@/lib/sync/erp-extra-data-store')
  const fingerprint = async () => JSON.stringify(await db.$queryRawUnsafe(`SELECT md5(string_agg(row_to_json(p)::text, ',' ORDER BY id)) AS hash FROM "Product" p`))
  const preview = async (content: string) => mi.savePendingPreview(db, { xml: content, actorId: 'synthetic-admin', sha256: mi.sha256Hex(content), fileName: 'synthetic.xml', sizeBytes: Buffer.byteLength(content) })
  const apply = (p: Awaited<ReturnType<typeof preview>>, client = db) => mi.applyManualImport({ db: client, runSync }, { previewId: p.previewId, sha256: p.sha256, actorId: p.actorId })
  const reset = async () => {
    await pg.exec(`DELETE FROM "Order"; DELETE FROM "KeyValueSetting"; DELETE FROM "SyncRun"; DELETE FROM "Product";
      INSERT INTO "Product"(id,title,brand,price,category,"updatedAt","externalId",sku,stock,"isActive")
      SELECT 'p'||i,'T'||i,'B',10,'hair',now(),'S'||i,'S'||i,4,true FROM generate_series(0,${ROWS - 1}) i;
      INSERT INTO "SyncRun"(id,status,"triggeredBy","productsTotal","productsSynced","finishedAt") VALUES ('baseline','completed','cron',${ROWS},${ROWS},now());`)
  }
  try {
    await reset()
    const before = await fingerprint()
    const content = xml(2, 'A', '11.50')
    const evaluation = await mi.evaluateFeed(db, content)
    check('successful preview: gates pass; no product writes', evaluation.preflight.hard.length === 0 && await fingerprint() === before)
    const p = await preview(content)
    const first = await apply(p)
    check('successful Apply: completed', first.status === 'completed', 'completed', first.status)
    if (first.status !== 'completed') throw new Error('first Apply failed')
    const after = await fingerprint()
    const history = await db.syncRun.findUniqueOrThrow({ where: { id: first.result.runId } })
    const diag = history.errorSample as Record<string, unknown>
    check('journal: actor, SHA, run, backup and committed stage', diag.actorId === p.actorId && diag.xmlSha256 === p.sha256 && diag.backupKey === first.backupKey && diag.stage === 'committed' && history.errorCount === 0)
    check('affected counters reflect SQL not planned full file', diag.affected === ROWS)
    check('successful backup retained with full metadata', (await db.keyValueSetting.findUnique({ where: { key: first.backupKey } })) !== null)
    check('successful Apply: lock released', !await isSyncLockHeld(db))
    const lostResponse = await apply(p)
    check('lost HTTP response: retry identifies original committed run', lostResponse.status === 'rejected' && lostResponse.error === 'already_applied' && lostResponse.runId === first.result.runId)
    const duplicate = await apply(await preview(content))
    check('new preview of successful SHA: rejected; unchanged catalog', duplicate.status === 'rejected' && duplicate.error === 'already_applied' && await fingerprint() === after)
    const dry = await mi.restorePreImportBackup(db, first.backupKey, { execute: false })
    check('guarded restore dry-run detects changed fields', dry.differing === ROWS && dry.restored === 0)
    await pg.exec(`CREATE FUNCTION restore_boom() RETURNS trigger AS $$ BEGIN IF NEW."externalId"='S7000' THEN RAISE EXCEPTION 'restore failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER restore_boom BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION restore_boom();`)
    let failedRestore = false
    try { await mi.restorePreImportBackup(db, first.backupKey, { execute: true }) } catch { failedRestore = true }
    check('restore mid-SQL failure rolls back every changed row', failedRestore && await fingerprint() === after)
    await pg.exec('DROP TRIGGER restore_boom ON "Product"; DROP FUNCTION restore_boom();')
    const restored = await mi.restorePreImportBackup(db, first.backupKey, { execute: true })
    check('guarded restore restores all fields', restored.restored === ROWS && (await db.product.findUniqueOrThrow({ where: { id: 'p1' } })).stock === 4)
    check('guarded restore restores prior ERP metadata', Object.keys(await getErpExtraData(db)).length === 0)
    check('restore no-op after already restored', (await mi.restorePreImportBackup(db, first.backupKey, { execute: true })).restored === 0)
    check('restore no-op releases its acquired lock', !await isSyncLockHeld(db))

    await reset()
    const parallel = await preview(xml(2, 'parallel'))
    const pair = await Promise.all([apply(parallel), apply(parallel)])
    check('concurrent same preview: exactly one completion', pair.filter(outcome => outcome.status === 'completed').length === 1)
    check('concurrent same preview: one durable successful SHA', (await db.keyValueSetting.findMany({ where: { key: { startsWith: 'grins-manual-import-applied:' } } })).length === 1)
    await reset()
    const one = await preview(xml(2, 'different-A'))
    const two = await preview(xml(2, 'different-B'))
    const different = await Promise.all([apply(one), apply(two)])
    check('concurrent different XML: shared single preview has at most one completion', different.filter(outcome => outcome.status === 'completed').length <= 1)
    const latest = await apply(two)
    check('concurrent different XML: latest preview remains safely applicable or recorded', latest.status === 'completed' || (latest.status === 'rejected' && latest.error === 'already_applied'))

    await reset()
    const bad = await preview(xml(2, 'failure'))
    const failureBefore = await fingerprint()
    await pg.exec(`CREATE FUNCTION boom() RETURNS trigger AS $$ BEGIN IF NEW."externalId"='S7000' THEN RAISE EXCEPTION 'synthetic secret-canary'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER boom BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION boom();`)
    const failure = await apply(bad)
    check('mid-SQL failure: failed, zero catalog commits', failure.status === 'failed' && await fingerprint() === failureBefore)
    check('mid-SQL failure: no committed metadata/SHA/backup', Object.keys(await getErpExtraData(db)).length === 0 && (await db.keyValueSetting.findMany({ where: { key: { startsWith: mi.BACKUP_KEY_PREFIX } } })).length === 0)
    if (failure.status !== 'rejected') {
      const record = await db.syncRun.findUniqueOrThrow({ where: { id: failure.result.runId } })
      check('mid-SQL failure: journal says rolled_back, zero processed', record.status === 'failed' && record.productsSynced === 0 && (record.errorSample as Record<string, unknown>).stage === 'rolled_back')
      check('exception canary is absent from durable journal', !JSON.stringify(record).includes('secret-canary'))
    }
    check('failure releases shared lock', !await isSyncLockHeld(db))
    await pg.exec('DROP TRIGGER boom ON "Product"; DROP FUNCTION boom();')
    // PGlite does not deliver PostgreSQL's statement_timeout timer. Inject the
    // actual SQLSTATE for cancellation; real timer/Neon transport stays a gate.
    await pg.exec(`CREATE FUNCTION cancel_boom() RETURNS trigger AS $$ BEGIN IF NEW."externalId"='S7000' THEN RAISE EXCEPTION 'synthetic cancellation' USING ERRCODE='57014'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER cancel_boom BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION cancel_boom();`)
    const cancelled = await apply(await preview(xml(2, 'cancelled')))
    check('SQL cancellation 57014 after earlier statements rolls back all catalog writes', cancelled.status === 'failed' && await fingerprint() === failureBefore)
    await pg.exec('DROP TRIGGER cancel_boom ON "Product"; DROP FUNCTION cancel_boom();')

    // Trigger at the final completed marker: all earlier Product/metadata SQL
    // has executed, but the entire catalog and ledger must still roll back.
    await pg.exec(`CREATE FUNCTION journal_boom() RETURNS trigger AS $$ BEGIN IF NEW.status='completed' AND NEW."triggeredBy"='manual' THEN RAISE EXCEPTION 'final marker failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER journal_boom BEFORE UPDATE ON "SyncRun" FOR EACH ROW EXECUTE FUNCTION journal_boom();`)
    const finalFailure = await apply(await preview(xml(2, 'final-failure')))
    check('final marker failure rolls back entire catalog/metadata', finalFailure.status === 'failed' && await fingerprint() === failureBefore && Object.keys(await getErpExtraData(db)).length === 0)
    await pg.exec('DROP TRIGGER journal_boom ON "SyncRun"; DROP FUNCTION journal_boom();')

    await pg.exec(`CREATE FUNCTION backup_boom() RETURNS trigger AS $$ BEGIN IF NEW.key LIKE 'grins-manual-import-backup:%' THEN RAISE EXCEPTION 'backup failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER backup_boom BEFORE INSERT ON "KeyValueSetting" FOR EACH ROW EXECUTE FUNCTION backup_boom();`)
    const backupFailure = await apply(await preview(xml(2, 'backup-failure')))
    check('backup failure: rejection before product writes', backupFailure.status === 'rejected' && backupFailure.error === 'backup_failed' && await fingerprint() === failureBefore)
    await pg.exec('DROP TRIGGER backup_boom ON "KeyValueSetting"; DROP FUNCTION backup_boom();')

    const stale = await preview(xml(2, 'stale'))
    await pg.exec('UPDATE "Product" SET stock=100')
    const staleBefore = await fingerprint()
    const staleResult = await apply(stale)
    check('preflight re-evaluation: reject stale plan without catalog writes', staleResult.status === 'rejected' && staleResult.error === 'preflight_failed' && await fingerprint() === staleBefore)

    await reset()
    const realTransaction = db.$transaction.bind(db)
    let loseAck = true
    const lostAckDb = new Proxy(db, { get(target, property) {
      if (property === '$transaction') return async (...args: Parameters<typeof realTransaction>) => {
        const result = await Reflect.apply(realTransaction, target, args)
        if (loseAck) { loseAck = false; throw new Error('synthetic COMMIT acknowledgement lost') }
        return result
      }
      return Reflect.get(target, property)
    } }) as ExtendedPrismaClient
    const ack = await apply(await preview(xml(2, 'commit-ack')), lostAckDb)
    check('lost COMMIT acknowledgement: journal resolves completed', ack.status === 'completed')
    if (ack.status === 'completed') check('lost COMMIT acknowledgement never overwrites success', (await db.syncRun.findUniqueOrThrow({ where: { id: ack.result.runId } })).status === 'completed')

    await reset()
    const saleImport = await apply(await preview(xml(2, 'sale')))
    if (saleImport.status !== 'completed') throw new Error('sale import failed')
    const { createServerOrder } = await import('@/lib/orders-data-store')
    const order = await createServerOrder({ createdAt: new Date().toISOString(), items: [{ id: 'p1', title: 'T1', brand: 'B', image: '', category: 'hair', price: 10, rating: 0, stock: 5, quantity: 1 }], subtotal: 10, tax: 0, delivery: 0, deliveryMethod: 'pickup', paymentMethod: 'manual', discount: 0, total: 10, firstName: 'Synthetic', lastName: 'Test', email: 'test@example.invalid', phone: '000', address: 'Test', city: 'Test' })
    const afterSale = await fingerprint()
    let conflict = false
    try { await mi.restorePreImportBackup(db, saleImport.backupKey, { execute: true }) } catch (error) { conflict = String(error).includes('restore_conflict') }
    check('actual order stock debit: restore conflicts and preserves sale/order', conflict && await fingerprint() === afterSale && (await db.product.findUniqueOrThrow({ where: { id: 'p1' } })).stock === 4 && !!await db.order.findUnique({ where: { id: order.id } }))
    const replayAfterSale = await apply(await preview(xml(2, 'sale')))
    check('successful XML replay after order cannot restore stale stock', replayAfterSale.status === 'rejected' && replayAfterSale.error === 'already_applied' && await fingerprint() === afterSale)

    await reset()
    const cron = await db.syncRun.create({ data: { status: 'running', triggeredBy: 'cron' } })
    await acquireSyncLock(db, cron.id, 30 * 60 * 1000)
    const blockedPreview = await preview(xml(2, 'cron'))
    const blocked = await apply(blockedPreview)
    check('scheduled sync lease: manual apply refused, preview preserved', blocked.status === 'rejected' && blocked.error === 'sync_running' && !!await db.keyValueSetting.findUnique({ where: { key: 'grins-manual-import-pending' } }))
    await db.$executeRawUnsafe(`UPDATE "KeyValueSetting" SET value=jsonb_set(value,'{lockedUntil}',to_jsonb('2020-01-01T00:00:00.000Z'::text)) WHERE key='sync-run-lock'`)
    const expired = await apply(blockedPreview)
    check('expired running worker lease: no unsafe automatic takeover', expired.status === 'rejected' && expired.error === 'sync_running')
    await releaseSyncLock(db, cron.id)
    const successfulManual = await apply(blockedPreview)
    check('after explicit scheduler release: manual apply works', successfulManual.status === 'completed')
    const scheduled = await runSync({ name: 'synthetic-cron', fetchPage: async () => ({ products: [], hasMore: false }) }, db, 'cron')
    check('unchanged scheduled runner can acquire released manual lock', scheduled.status === 'completed')

    await reset()
    await db.product.update({ where: { id: 'p0' }, data: { price: 9, erpPriceMissing: true, manualPriceApproved: true, manualApprovedPrice: 9 } })
    await db.product.update({ where: { id: 'p1' }, data: { price: 9, manualPriceApproved: true, manualApprovedPrice: 9 } })
    await db.product.update({ where: { id: 'p2' }, data: { isDeleted: true } })
    let contract = xml(2, 'business-contract')
    contract = contract.replace('<sku>S0</sku><title>business-contract</title><price1>12</price1><price2>10.00</price2>', '<sku>S0</sku><title>business-contract</title><price1>12</price1><price2>0</price2>')
    contract = contract.replace('<sku>S9</sku>', '<sku>UNKNOWN</sku>')
    contract = contract.replace(/<item><sku>S14999<\/sku>.*?<\/item>/u, '')
    contract = contract.replaceAll('<warehouse id="4">0</warehouse>', '<warehouse id="4">999</warehouse>')
    const contractResult = await apply(await preview(contract))
    const zero = await db.product.findUniqueOrThrow({ where: { id: 'p0' } })
    const positive = await db.product.findUniqueOrThrow({ where: { id: 'p1' } })
    check('zero-price contract: keeps approved local price and marks ERP missing', contractResult.status === 'completed' && String(zero.price) === '9' && zero.manualPriceApproved && zero.erpPriceMissing)
    check('positive-price contract: clears manual approval', !positive.manualPriceApproved && !positive.erpPriceMissing && positive.manualApprovedPrice === null)
    check('excluded warehouses do not contribute stock', positive.stock === 5)
    check('unknown/missing/deleted identities never inserted or zeroed', await db.product.count() === ROWS && (await db.product.findUniqueOrThrow({ where: { id: 'p2' } })).stock === 4 && (await db.product.findUniqueOrThrow({ where: { id: 'p9' } })).stock === 4 && (await db.product.findUniqueOrThrow({ where: { id: 'p14999' } })).stock === 4)
    if (contractResult.status === 'completed') {
      const unchanged = await db.product.findUniqueOrThrow({ where: { id: 'p9' }, select: { revision: true } })
      const contractRestore = await mi.restorePreImportBackup(db, contractResult.backupKey, { execute: true })
      check('JSONB backup key order does not restore unchanged rows or increment their revision', contractRestore.restored === ROWS - 3 && (await db.product.findUniqueOrThrow({ where: { id: 'p9' } })).revision === unchanged.revision)
    }
  } finally {
    await db.$disconnect()
    await server.stop()
    await pg.close()
  }
  console.log(JSON.stringify({ checks, count: checks.length, failed: checks.filter(check => !check.pass).length }, null, 2))
  process.exitCode = checks.every(check => check.pass) ? 0 : 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
