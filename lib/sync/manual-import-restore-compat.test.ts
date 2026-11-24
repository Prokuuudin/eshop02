import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import { preRetailMigrationFingerprint, productFingerprint, restoreFingerprintMatches } from './manual-import-atomic'

// The pre-migration Product shape that matters for the whole-row fingerprint: the
// types used by the real table (text, numeric, integer, boolean, timestamp(3), jsonb,
// text[], double precision), in an arbitrary column order.
const OLD_SCHEMA = `CREATE TABLE "Product" (
  id text PRIMARY KEY, title text NOT NULL, price numeric(12,2) NOT NULL, "oldPrice" numeric(12,2),
  images text[] NOT NULL DEFAULT '{}', stock integer NOT NULL, rating double precision NOT NULL DEFAULT 0,
  "technicalSpecs" jsonb, "isDeleted" boolean NOT NULL DEFAULT false, "externalId" text,
  "erpPriceMissing" boolean NOT NULL DEFAULT false, "manualPriceApproved" boolean NOT NULL DEFAULT false,
  "manualApprovedPrice" numeric(12,2), revision integer NOT NULL DEFAULT 1, "updatedAt" timestamp(3) NOT NULL
);
INSERT INTO "Product" VALUES
  ('p1','Šampūns "5000ml"',23.50,NULL,'{a.jpg,b.jpg}',4,4.5,'{"x":1,"b":[1,2]}',false,'S1',false,false,NULL,3,'2026-06-11 10:00:00.123'),
  ('p2','Mask',9.92,12.00,'{}',0,0,NULL,false,'S2',true,true,9.92,1,'2026-06-11 10:00:00'),
  ('p3','Local',7,NULL,'{}',1,0,'[]',true,NULL,false,false,NULL,7,'2026-01-01 00:00:00');`

const migrationSql = readFileSync(path.join(process.cwd(), 'prisma/migrations/20261124120000_retail_price_foundation/migration.sql'), 'utf8')

let pg: PGlite
const db = () => ({
  $queryRawUnsafe: async <T,>(sql: string, ...params: unknown[]) => (await pg.query(sql, params)).rows as T,
}) as unknown as Pick<ExtendedPrismaClient, '$queryRawUnsafe'>

async function reset() {
  await pg.exec('DROP TABLE IF EXISTS "B2cPriceHistory"; DROP TABLE IF EXISTS "Product";')
  await pg.exec(OLD_SCHEMA)
}

beforeAll(async () => { pg = new PGlite() }, 60_000)
afterAll(async () => { await pg.close() })

describe('restore of backups taken before the retail migration', { timeout: 60_000 }, () => {
  it('the real migration changes the whole-row fingerprint, but not the pre-migration one', async () => {
    await reset()
    const before = await productFingerprint(db())
    expect(await preRetailMigrationFingerprint(db())).toBeNull()
    await pg.exec(migrationSql)
    expect(await productFingerprint(db())).not.toBe(before)
    expect(await preRetailMigrationFingerprint(db())).toBe(before)
  })

  it('accepts an old backup on an unchanged catalogue, even after retail values were written', async () => {
    await reset()
    const old = { afterFingerprint: await productFingerprint(db()) }
    await pg.exec(migrationSql)
    expect(await restoreFingerprintMatches(db(), old, await productFingerprint(db()))).toBe(true)
    await pg.exec(`UPDATE "Product" SET "retailPrice"=29.90, "retailPriceUpdatedAt"=now(), "b2cBasePrice"=25 WHERE id='p1'`)
    expect(await restoreFingerprintMatches(db(), old, await productFingerprint(db()))).toBe(true)
  })

  it.each([
    ['a B2B price', `UPDATE "Product" SET price=24.00 WHERE id='p1'`],
    ['stock (a sale)', `UPDATE "Product" SET stock=3 WHERE id='p1'`],
    ['a revision bump (ABA edit)', `UPDATE "Product" SET revision=revision+1 WHERE id='p2'`],
    ['a deletion flag', `UPDATE "Product" SET "isDeleted"=true WHERE id='p2'`],
    ['a new product', `INSERT INTO "Product"(id,title,price,stock,"updatedAt") VALUES ('p4','New',1,1,now())`],
    ['a json field', `UPDATE "Product" SET "technicalSpecs"='{"x":2,"b":[1,2]}' WHERE id='p1'`],
  ])('still refuses an old backup after %s changed', async (_label, change) => {
    await reset()
    const old = { afterFingerprint: await productFingerprint(db()) }
    await pg.exec(migrationSql)
    await pg.exec(change)
    expect(await restoreFingerprintMatches(db(), old, await productFingerprint(db()))).toBe(false)
  })

  it('a backup with retailRows needs the full-row match (it restores retail columns)', async () => {
    await reset()
    await pg.exec(migrationSql)
    const full = await productFingerprint(db())
    const withRetail = { afterFingerprint: full, retailRows: [] }
    expect(await restoreFingerprintMatches(db(), withRetail, full)).toBe(true)
    await pg.exec(`UPDATE "Product" SET "retailPrice"=29.90 WHERE id='p1'`)
    expect(await restoreFingerprintMatches(db(), withRetail, await productFingerprint(db()))).toBe(false)
    // The same change is harmless for a backup that does not touch retail columns.
    expect(await restoreFingerprintMatches(db(), { afterFingerprint: await preRetailMigrationFingerprint(db()) as string }, await productFingerprint(db()))).toBe(true)
  })

  it('a backup taken after the migration without retailRows matches on the full row as before', async () => {
    await reset()
    await pg.exec(migrationSql)
    const backup = { afterFingerprint: await productFingerprint(db()) }
    expect(await restoreFingerprintMatches(db(), backup, await productFingerprint(db()))).toBe(true)
    await pg.exec(`UPDATE "Product" SET price=1 WHERE id='p3'`)
    expect(await restoreFingerprintMatches(db(), backup, await productFingerprint(db()))).toBe(false)
  })
})
