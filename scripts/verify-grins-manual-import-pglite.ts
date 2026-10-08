// Isolated end-to-end check of the admin manual GrinS import against REAL SQL:
// in-memory PGlite (transitive dev dependency @electric-sql/pglite + pglite-socket)
// with the current prisma/schema.prisma, the real runSync, lock, consume and restore.
// Never touches .env.local or any remote database.
//
//   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > <tmp>/schema.sql
//   npx tsx scripts/verify-grins-manual-import-pglite.ts <tmp>/schema.sql
import { readFileSync } from 'fs'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const PORT = 54329
const ROWS = 15_000
const schemaFile = process.argv[2]
if (!schemaFile) throw new Error('usage: verify-grins-manual-import-pglite.ts <schema.sql>')

process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`
if (new URL(process.env.DATABASE_URL).hostname !== '127.0.0.1') throw new Error('refusing non-loopback database')

type Item = { sku: string; price2?: string; wh?: number[] }
const makeXml = (items: Item[]) => '﻿<?xml version="1.0" encoding="utf-8"?><root>' + items.map(({ sku, price2 = '10.00', wh = [1, 1, 1, 0, 0, 1, 0, 0, 0] }) =>
  `<item><sku>${sku}</sku><code /><title>x</title><capacity>1</capacity><price1>12</price1><price2>${price2}</price2><price3>5</price3><price4>0</price4><quantity>4</quantity>` +
  `<warehouses>${wh.map((q, i) => `<warehouse id="${i + 1}">${q}</warehouse>`).join('')}</warehouses></item>`).join('') + '</root>'

const results: Array<{ check: string; pass: boolean; detail?: unknown }> = []
const check = (name: string, pass: boolean, detail?: unknown) => { results.push({ check: name, pass, ...(pass ? {} : { detail }) }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ' ' + JSON.stringify(detail)}`) }

async function main(): Promise<void> {
  const pg = new PGlite()
  await pg.exec(readFileSync(schemaFile, 'utf-8'))
  const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1', maxConnections: 20 })
  await server.start()

  const { prisma } = await import('@/lib/prisma')
  const mi = await import('@/lib/sync/manual-import')
  const { runSync } = await import('@/lib/sync/sync-runner')
  const db = prisma

  const q = <T = Record<string, unknown>>(sql: string) => db.$queryRawUnsafe<T[]>(sql)
  const product = async (externalId: string) => (await q<{ price: string; stock: number; epm: boolean; mpa: boolean; map: string | null }>(
    `SELECT price::text AS price, stock, "erpPriceMissing" AS epm, "manualPriceApproved" AS mpa, "manualApprovedPrice"::text AS map FROM "Product" WHERE "externalId" = '${externalId}'`))[0]
  const fingerprint = async () => (await q<{ f: string; n: number }>(
    `SELECT md5(string_agg(concat_ws('|', id, "externalId", price, stock, "erpPriceMissing", "manualPriceApproved", "manualApprovedPrice", "isActive", "isDeleted"), ',' ORDER BY id)) AS f, COUNT(*)::int AS n FROM "Product"`))[0]
  const lockFree = async () => !(await (await import('@/lib/sync/sync-lock')).isSyncLockHeld(db))

  try {
    // ── Seed: 15000 linked, 100 local-only, 1 soft-deleted linked, a previous FULL run ──
    await pg.exec(`
      INSERT INTO "Product"(id, title, brand, price, category, "updatedAt", "externalId", sku, stock, "isActive")
        SELECT 'p' || i, 'T' || i, 'B', 10.00, 'hair', now(), 'S' || i, 'S' || i, 4, true FROM generate_series(0, ${ROWS - 1}) i;
      INSERT INTO "Product"(id, title, brand, price, category, "updatedAt", sku, stock, "isActive")
        SELECT 'local' || i, 'L' || i, 'B', 7.00, 'hair', now(), 'L' || i, 3, true FROM generate_series(0, 99) i;
      INSERT INTO "Product"(id, title, brand, price, category, "updatedAt", "externalId", sku, stock, "isActive", "isDeleted")
        VALUES ('pdel', 'D', 'B', 5.00, 'hair', now(), 'S_DEL', 'S_DEL', 2, false, true);
      UPDATE "Product" SET price = 9.99, "erpPriceMissing" = true, "manualPriceApproved" = true, "manualApprovedPrice" = 9.99 WHERE "externalId" IN ('S5', 'S6');
      INSERT INTO "SyncRun"(id, status, "triggeredBy", "productsTotal", "productsSynced", "finishedAt") VALUES ('prev', 'completed', 'cron', ${ROWS}, ${ROWS}, now());
    `)
    const before = await fingerprint()
    const revision = async (id: string) => (await db.product.findUniqueOrThrow({ where: { id }, select: { revision: true } })).revision
    const openedRevision = await revision('p1')
    const unchangedRevision = await revision('p0')

    const items: Item[] = Array.from({ length: ROWS - 1 }, (_, i) => ({ sku: `S${i}` })) // S14999 missing from file
    items[1].price2 = '11.50'
    items[2].wh = [0, 0, 0, 40, 40, 0, 40, 40, 40] // only excluded warehouses
    items[3].wh = [5, 0, 0, 0, 0, 5, 0, 0, 0]
    items[5].price2 = '0'
    items[6].price2 = '12.00'
    items.push({ sku: 'NEW1', price2: '3.00' }, { sku: 'S_DEL', price2: '1.00' })
    const xmlA = makeXml(items)

    const doPreview = async (xml: string, actorId = 'admin-1') => {
      const decoded = mi.decodeUpload(new TextEncoder().encode(xml), 'export.xml')
      if (!decoded.ok) throw new Error(decoded.error)
      const evaluation = await mi.evaluateFeed(db, decoded.xml)
      const pending = evaluation.preflight.hard.length === 0
        ? await mi.savePendingPreview(db, { sha256: decoded.sha256, fileName: 'export.xml', sizeBytes: xml.length, actorId, xml: decoded.xml })
        : null
      return { evaluation, pending, sha256: decoded.sha256 }
    }
    const apply = (p: { pending: { previewId: string } | null; sha256: string }, actorId = 'admin-1') =>
      mi.applyManualImport({ db, runSync }, { previewId: p.pending!.previewId, sha256: p.sha256, actorId })

    // ── 1. Preview is read-only for the catalog ──
    const pA = await doPreview(xmlA)
    check('preview: no HARD failures on a correct export', pA.evaluation.preflight.hard.length === 0, pA.evaluation.preflight.hard)
    check('preview: summary counts', pA.evaluation.summary.matched === ROWS - 1 && pA.evaluation.summary.unlinked === 1 && pA.evaluation.summary.softDeletedSkipped === 1
      && pA.evaluation.summary.priceChanges === 2 && pA.evaluation.summary.priceZero === 1 && pA.evaluation.summary.stockChanges === 2 && pA.evaluation.summary.linkedMissingFromXml === 1, pA.evaluation.summary)
    check('preview: catalog unchanged', JSON.stringify(await fingerprint()) === JSON.stringify(before))

    // ── 2. Concurrent scheduled run holds the lock → refused, preview kept ──
    await pg.exec(`INSERT INTO "KeyValueSetting"(key, value, "updatedAt") VALUES ('sync-run-lock', '{"runId":"cron-x","lockedUntil":"2999-01-01T00:00:00.000Z"}', now())`)
    const busy = await apply(pA)
    check('lock held: apply refused with sync_running', busy.status === 'rejected' && busy.error === 'sync_running', busy)
    check('lock held: catalog unchanged', JSON.stringify(await fingerprint()) === JSON.stringify(before))
    await pg.exec(`UPDATE "KeyValueSetting" SET value = '{"runId":"cron-x","lockedUntil":"1970-01-01T00:00:00.000Z"}' WHERE key = 'sync-run-lock'`)

    // ── 3. Apply + concurrent duplicate apply of the same preview ──
    const [r1, r2] = await Promise.all([apply(pA), apply(pA)])
    const winners = [r1, r2].filter(r => r.status === 'completed')
    const losers = [r1, r2].filter(r => r.status === 'rejected')
    check('double apply: exactly one run completes, the other is refused', winners.length === 1 && losers.length === 1, [r1, r2])
    const s1 = await product('S1'), s2 = await product('S2'), s3 = await product('S3'), s5 = await product('S5'), s6 = await product('S6')
    check('apply: price2 → Product.price', s1.price === '11.50' && !s1.epm, s1)
    check('changed ERP row increments revision', await revision('p1') === openedRevision + 1)
    check('unchanged ERP row keeps revision', await revision('p0') === unchangedRevision)
    const staleSave = await db.product.updateMany({ where: { id: 'p1', revision: openedRevision }, data: { price: 10 } })
    check('stale form conditional write cannot lose the ERP price', staleSave.count === 0 && (await product('S1')).price === '11.50')
    check('apply: excluded warehouses (10003/4/6/7, slot 9) not counted', s2.stock === 0, s2)
    check('apply: included warehouses summed', s3.stock === 10, s3)
    check('apply: price2=0 keeps price, marks ERP price missing, keeps approval', s5.price === '9.99' && s5.epm && s5.mpa && s5.map === '9.99', s5)
    check('apply: positive price2 replaces price and consumes approval', s6.price === '12.00' && !s6.epm && !s6.mpa && s6.map === null, s6)
    check('apply: product missing from file untouched', JSON.stringify(await product('S14999')) === JSON.stringify({ price: '10.00', stock: 4, epm: false, mpa: false, map: null }))
    const counts = (await q<{ total: number; newOnes: number; del: string; local: number }>(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE "externalId" = 'NEW1')::int AS "newOnes",
              (SELECT price::text FROM "Product" WHERE id = 'pdel') AS del,
              COUNT(*) FILTER (WHERE "externalId" IS NULL AND price = 7.00 AND stock = 3 AND "isActive")::int AS local FROM "Product"`))[0]
    check('apply: no inserts, soft-deleted and local-only untouched', counts.total === ROWS + 101 && counts.newOnes === 0 && counts.del === '5.00' && counts.local === 100, counts)
    check('apply: no deactivation', (await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "Product" WHERE "externalId" LIKE 'S%' AND "externalId" <> 'S_DEL' AND NOT "isActive"`))[0].n === 0)
    const run = await db.syncRun.findFirst({ where: { triggeredBy: 'manual', status: 'completed' }, orderBy: { startedAt: 'desc' } })
    const diag = run?.errorSample as Record<string, unknown> | null
    check('journal: SyncRun completed/manual with file, SHA, actor, backup', !!run && diag?.kind === 'admin-manual-import' && diag?.xmlSha256 === pA.sha256 && diag?.fileName === 'export.xml' && diag?.actorId === 'admin-1' && typeof diag?.backupKey === 'string' && run.productsTotal === ROWS + 1, { run, diag: diag && { ...diag, metrics: undefined } })
    check('lock released after apply', await lockFree())
    const extra = await db.keyValueSetting.findUnique({ where: { key: 'erp-extra-data' } })
    check('ERP extra metadata written for the run', !!extra && (extra.value as Record<string, unknown>).S1 !== undefined)

    // ── 4. Replay of a consumed preview ──
    const replay = await apply(pA)
    check('replay: consumed preview cannot be applied again', replay.status === 'rejected' && replay.error === 'preview_not_found', replay)

    // ── 5. Re-import of the same file is a no-op for the catalog ──
    const afterA = await fingerprint()
    const pA2 = await doPreview(xmlA)
    check('re-import preview: zero price/stock changes', pA2.evaluation.summary.priceChanges === 0 && pA2.evaluation.summary.stockChanges === 0, pA2.evaluation.summary)
    const rA2 = await apply(pA2)
    check('re-import apply completes', rA2.status === 'completed', rA2)
    const afterA2 = await fingerprint()
    check('re-import: catalog values identical', afterA2.f === afterA.f && afterA2.n === afterA.n)
    check('identical re-import creates no revision conflict', await revision('p1') === openedRevision + 1)

    // ── 6. Tampering with the stored snapshot between preview and apply ──
    const pT = await doPreview(xmlA)
    await pg.exec(`UPDATE "KeyValueSetting" SET value = jsonb_set(value, '{xml}', to_jsonb(replace(value->>'xml', '<sku>S9</sku><code /><title>x</title><capacity>1</capacity><price1>12</price1><price2>10.00', '<sku>S9</sku><code /><title>x</title><capacity>1</capacity><price1>12</price1><price2>99.00'))) WHERE key = 'grins-manual-import-pending'`)
    const tampered = await apply(pT)
    check('tamper: modified snapshot refused (content_mismatch)', tampered.status === 'rejected' && tampered.error === 'content_mismatch', tampered)
    check('tamper: catalog unchanged', (await fingerprint()).f === afterA2.f)

    // ── 7. Another user cannot apply someone else's preview ──
    const pU = await doPreview(xmlA, 'admin-1')
    const other = await apply(pU, 'admin-2')
    check('other user: refused', other.status === 'rejected' && other.error === 'preview_mismatch', other)

    // ── 8. Failure in the middle of apply, then recovery from the backup ──
    await pg.exec(`UPDATE "Product" SET "erpPriceMissing" = true, "manualPriceApproved" = true, "manualApprovedPrice" = 9.00, price = 9.00 WHERE "externalId" = 'S8'`)
    const beforeB = await fingerprint()
    const itemsB: Item[] = items.map(item => ({ ...item, wh: item.sku === 'S2' ? item.wh : [2, 1, 1, 0, 0, 1, 0, 0, 0] }))
    itemsB[8].price2 = '13.00'
    const pB = await doPreview(makeXml(itemsB))
    check('file B preview passes', !!pB.pending, pB.evaluation.preflight.hard)
    await pg.exec(`
      CREATE FUNCTION boom() RETURNS trigger AS $$ BEGIN IF NEW."externalId" = 'S7000' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER boom BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION boom();`)
    const failed = await apply(pB)
    check('failure: run reported failed, never completed', failed.status === 'failed', failed.status === 'rejected' ? failed : failed.result)
    const partial = (await q<{ n5: number }>(`SELECT COUNT(*) FILTER (WHERE stock = 5)::int AS n5 FROM "Product"`))[0]
    check('failure: partial batches committed (expected, not atomic)', partial.n5 > 0 && (await product('S7000')).stock === 4, partial)
    const failedRun = failed.status === 'rejected' ? null : await db.syncRun.findUnique({ where: { id: failed.result.runId } })
    check('failure: SyncRun failed with errorCount > 0', failedRun?.status === 'failed' && (failedRun?.errorCount ?? 0) > 0, failedRun)
    check('failure: lock released', await lockFree())
    await pg.exec(`DROP TRIGGER boom ON "Product"; DROP FUNCTION boom();`)

    const backupKey = failed.status === 'rejected' ? '' : failed.backupKey
    const dry = await mi.restorePreImportBackup(db, backupKey, { execute: false })
    check('restore dry-run: reports differing rows, writes nothing', dry.differing > 0 && dry.restored === 0 && (await product('S1')).stock !== 4, dry)
    const preRestoreRevision = await revision('p1')
    const preRestoreUnchangedRevision = await revision('p2')
    const restored = await mi.restorePreImportBackup(db, backupKey, { execute: true })
    check('restore increments changed row revision', await revision('p1') === preRestoreRevision + 1)
    check('restore leaves unchanged row revision intact', await revision('p2') === preRestoreUnchangedRevision)
    check('restore execute: restores every differing row', restored.restored === dry.differing, restored)
    check('restore: sync-owned fields equal the pre-import state', (await fingerprint()).f === beforeB.f)
    const s8 = await product('S8')
    check('restore: consumed manual price approval is back', s8.mpa && s8.map === '9.00' && s8.epm, s8)
    const restoreRun = await db.syncRun.findUnique({ where: { id: restored.runId! } })
    check('restore: journal entry (triggeredBy restore, completed)', restoreRun?.status === 'completed' && restoreRun.triggeredBy === 'restore', restoreRun)
    check('restore: lock released', await lockFree())
    const again = await mi.restorePreImportBackup(db, backupKey, { execute: false })
    check('restore is idempotent (nothing left to restore)', again.differing === 0, again)

    // ── 9. Restore refuses while a sync holds the lock ──
    await pg.exec(`UPDATE "Product" SET stock = 77 WHERE "externalId" = 'S1'; UPDATE "KeyValueSetting" SET value = '{"runId":"cron-y","lockedUntil":"2999-01-01T00:00:00.000Z"}' WHERE key = 'sync-run-lock'`)
    let refused = false
    try { await mi.restorePreImportBackup(db, backupKey, { execute: true }) } catch { refused = true }
    check('restore under foreign lock: refused, nothing written', refused && (await product('S1')).stock === 77)
  } finally {
    await prisma.$disconnect()
    await server.stop()
    await pg.close()
  }
  const failedChecks = results.filter(r => !r.pass)
  console.log(JSON.stringify({ event: 'grins_manual_import_pglite_verification', checks: results.length, failed: failedChecks.length }))
  process.exitCode = failedChecks.length ? 1 : 0
}

main().catch(err => { console.error(err); process.exitCode = 1 })
