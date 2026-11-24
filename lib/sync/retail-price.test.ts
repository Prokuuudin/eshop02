import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {
  RETAIL_PRICE_SYNC_FLAG, applyRetailPrices, buildRetailPriceQuery, diffRetailPrices, isRetailPriceSyncActive, isRetailPriceSyncEnabled,
  normalizeRetailPrice, restoreRetailPrices, retailRowsFromErpProducts, snapshotRetailPrices,
} from './retail-price'
import { buildUpsertQuery } from './upsert-products'
import { buildManualPriceQuery } from './manual-price-query'
import type { ExtendedPrismaClient } from '@/lib/prisma'

const RETAIL_COLUMNS = ['retailPrice', 'retailPriceMissing', 'retailPriceUpdatedAt']

const SCHEMA = `CREATE TABLE "Product" (
  id text PRIMARY KEY, "externalId" text UNIQUE, price numeric(12,2) NOT NULL, "oldPrice" numeric(12,2),
  stock integer NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false,
  "erpPriceMissing" boolean NOT NULL DEFAULT false, "manualPriceApproved" boolean NOT NULL DEFAULT false,
  "manualApprovedPrice" numeric(12,2), revision integer NOT NULL DEFAULT 1,
  "updatedAt" timestamp(3) NOT NULL DEFAULT '2026-01-01 00:00:00', "bonusRate" double precision, "bulkPricingTiers" jsonb,
  "retailPrice" numeric(12,2), "retailPriceMissing" boolean NOT NULL DEFAULT false, "retailPriceUpdatedAt" timestamp(3),
  "b2cBasePrice" numeric(12,2), "b2cBasePriceSource" text, "b2cBasePriceUpdatedAt" timestamp(3)
);
INSERT INTO "Product"(id,"externalId",price,"oldPrice",stock,"erpPriceMissing","manualPriceApproved","manualApprovedPrice","bulkPricingTiers","retailPrice","retailPriceUpdatedAt","b2cBasePrice","b2cBasePriceSource") VALUES
  ('p-change','S-change',10,12,4,false,false,NULL,'[{"quantity":10,"pricePerUnit":9}]',11,'2026-02-02 10:00:00.123',13.50,'nopcommerce'),
  ('p-same','S-same',10,NULL,4,false,false,NULL,NULL,12,'2026-02-02 10:00:00.123',NULL,NULL),
  ('p-zero','S-zero',10,NULL,4,false,false,NULL,NULL,12,'2026-02-02 10:00:00.123',14,'manual'),
  ('p-new','S-new',10,NULL,4,true,true,10,NULL,NULL,NULL,NULL,NULL),
  ('p-deleted','S-deleted',10,NULL,4,false,false,NULL,NULL,12,'2026-02-02 10:00:00.123',NULL,NULL),
  ('p-local',NULL,7,NULL,1,false,false,NULL,NULL,NULL,NULL,9,'manual');
UPDATE "Product" SET "isDeleted"=true WHERE id='p-deleted';`

/** Minimal raw-SQL adapter so the production helpers run against PGlite. */
function rawDb(pg: PGlite) {
  const toPg = (sql: string, params: unknown[]) => [sql, params] as const
  return {
    $executeRawUnsafe: async (sql: string, ...params: unknown[]) => (await pg.query(...toPg(sql, params))).affectedRows ?? 0,
    $queryRawUnsafe: async <T,>(sql: string, ...params: unknown[]) => (await pg.query(...toPg(sql, params))).rows as T,
  } as unknown as Pick<ExtendedPrismaClient, '$executeRawUnsafe' | '$queryRawUnsafe'>
}

// One embedded Postgres for the whole file (booting one per test competes for CPU with
// the other PGlite suites); every scenario starts from a freshly recreated table.
let shared: PGlite | undefined
beforeAll(async () => { shared = new PGlite() }, 60_000)
afterAll(async () => { await shared?.close() })

async function withDb(run: (pg: PGlite) => Promise<void>) {
  const pg = shared!
  await pg.exec(`DROP TABLE IF EXISTS "Product"; ${SCHEMA}`)
  await run(pg)
}

/** Every Product column except the retail ones, per row, as stored. */
async function nonRetailState(pg: PGlite): Promise<string> {
  const { rows } = await pg.query<{ row: Record<string, unknown> }>(`SELECT to_jsonb(p) AS row FROM "Product" p ORDER BY id`)
  return JSON.stringify(rows.map(({ row }) => Object.fromEntries(Object.entries(row).filter(([key]) => !RETAIL_COLUMNS.includes(key)))))
}

async function retailState(pg: PGlite) {
  const { rows } = await pg.query<Record<string, unknown>>(`SELECT id,"retailPrice","retailPriceMissing","retailPriceUpdatedAt"::text AS "updatedAt","b2cBasePrice" FROM "Product" ORDER BY id`)
  return new Map(rows.map((row) => [row.id as string, row]))
}

const FEED = [
  { externalId: 'S-change', retailPrice: '12.50' },
  { externalId: 'S-same', retailPrice: '12.00' },
  { externalId: 'S-zero', retailPrice: null },
  { externalId: 'S-new', retailPrice: '9.99' },
  { externalId: 'S-deleted', retailPrice: '99.00' },
  { externalId: 'S-unknown', retailPrice: '5.00' },
]

describe('sync ownership boundaries', () => {
  const syncDir = path.join(process.cwd(), 'lib', 'sync')
  const sources = readdirSync(syncDir).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    // Code only: comments may name the column to document that it is not written.
    .map((file) => [file, readFileSync(path.join(syncDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '')] as const)

  it('no GrinS sync module can write the owner-decided B2C base price', () => {
    expect(sources.length).toBeGreaterThan(20)
    expect(sources.filter(([, source]) => /b2cBase/u.test(source)).map(([file]) => file)).toEqual([])
  })

  it('stocks-only sync never touches retail columns', () => {
    for (const file of ['scheduled-stock-sync.ts', 'local-stock-sync.ts']) {
      expect(sources.find(([name]) => name === file)?.[1]).not.toMatch(/retail/iu)
    }
  })
})

describe('retail price sync flag', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is off unless exactly "true"', () => {
    expect(isRetailPriceSyncEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false)
    for (const value of ['', 'false', 'TRUE', '1', 'yes', 'on', 'tru']) {
      expect(isRetailPriceSyncEnabled({ [RETAIL_PRICE_SYNC_FLAG]: value } as unknown as NodeJS.ProcessEnv)).toBe(false)
    }
    expect(isRetailPriceSyncEnabled({ [RETAIL_PRICE_SYNC_FLAG]: ' true ' } as unknown as NodeJS.ProcessEnv)).toBe(true)
    vi.stubEnv(RETAIL_PRICE_SYNC_FLAG, 'true')
    expect(isRetailPriceSyncEnabled()).toBe(true)
  })
})

describe('normalizeRetailPrice', () => {
  it.each([
    ['23.5', '23.50'], [23.5, '23.50'], ['5.61', '5.61'], [' 9 ', '9.00'], ['1.005', '1.01'], ['0.005', '0.01'],
  ])('accepts %j as %s', (input, expected) => {
    expect(normalizeRetailPrice(input)).toBe(expected)
  })

  it.each([undefined, null, '', '0', 0, '0.00', '-1', -1, 'abc', '1e2', '0x10', '1,5', 'NaN', Number.NaN, Infinity, '10000000000', {}])('treats %j as missing', (input) => {
    expect(normalizeRetailPrice(input)).toBeNull()
  })

  it('FULL rows carry price1 only for products whose feed had prices', () => {
    expect(retailRowsFromErpProducts([
      { externalId: 'A', title: 'A', price: 7, stock: 1, prices: { price1: 9, price2: 7, price3: 3, price4: 0 } },
      { externalId: 'B', title: 'B', price: 7, stock: 1, prices: { price1: 0, price2: 7, price3: 0, price4: 0 } },
      { externalId: 'C', title: 'C', price: 7, stock: 1 },
    ])).toEqual([{ externalId: 'A', retailPrice: '9.00' }, { externalId: 'B', retailPrice: null }])
  })
})

// PGlite boots a full Postgres per test; allow for a loaded CI/full-suite run.
describe('retail price SQL', { timeout: 60_000 }, () => {
  it('sets only the retail columns and never inserts', () => {
    const query = buildRetailPriceQuery(3)
    const setClause = query.slice(query.indexOf('SET'), query.indexOf('FROM'))
    const assigned = [...setClause.matchAll(/"(\w+)"=/gu)].map((match) => match[1])
    expect(assigned).toEqual(RETAIL_COLUMNS)
    expect(query).not.toMatch(/INSERT|DELETE|b2cBase|\bstock\b|revision|"updatedAt"|erpPriceMissing|manualPrice|[^l"]price=/u)
  })

  it('changes nothing but the retail columns, even right after the B2B upsert', async () => {
    await withDb(async (pg) => {
      const db = rawDb(pg)
      await pg.query(buildUpsertQuery(2), ['S-change', 11, 5, 'S-new', 8, 4])
      const afterB2b = await nonRetailState(pg)
      await applyRetailPrices(db, FEED)
      expect(await nonRetailState(pg)).toBe(afterB2b)
    })
  })

  it('B2B results are identical with and without the retail step (FULL and prices-only SQL)', async () => {
    const b2bOnly = async (withRetail: boolean) => {
      let state = ''
      await withDb(async (pg) => {
        await pg.query(buildUpsertQuery(3), ['S-change', 11, 5, 'S-zero', 0, 4, 'S-new', 8, 4])
        await pg.query(buildManualPriceQuery(2), ['S-same', '10.50', 'S-zero', '0.00'])
        if (withRetail) await applyRetailPrices(rawDb(pg), FEED)
        const { rows } = await pg.query(`SELECT id,price,"oldPrice",stock,"isActive","erpPriceMissing","manualPriceApproved","manualApprovedPrice",revision,"bulkPricingTiers","b2cBasePrice","b2cBasePriceSource" FROM "Product" ORDER BY id`)
        state = JSON.stringify(rows)
      })
      return state
    }
    expect(await b2bOnly(true)).toBe(await b2bOnly(false))
  })

  it('writes price1, keeps the last value when missing, skips unchanged and deleted rows, never touches b2cBasePrice', async () => {
    await withDb(async (pg) => {
      const affected = await applyRetailPrices(rawDb(pg), FEED)
      const rows = await retailState(pg)
      expect(affected).toBe(3)
      expect(rows.get('p-change')).toMatchObject({ retailPrice: '12.50', retailPriceMissing: false, b2cBasePrice: '13.50' })
      expect(rows.get('p-change')!.updatedAt).not.toBe('2026-02-02 10:00:00.123')
      expect(rows.get('p-same')).toMatchObject({ retailPrice: '12.00', retailPriceMissing: false, updatedAt: '2026-02-02 10:00:00.123' })
      expect(rows.get('p-zero')).toMatchObject({ retailPrice: '12.00', retailPriceMissing: true, b2cBasePrice: '14.00' })
      expect(rows.get('p-new')).toMatchObject({ retailPrice: '9.99', retailPriceMissing: false })
      expect(rows.get('p-deleted')).toMatchObject({ retailPrice: '12.00', retailPriceMissing: false, updatedAt: '2026-02-02 10:00:00.123' })
      expect(rows.get('p-local')).toMatchObject({ retailPrice: null, b2cBasePrice: '9.00' })
      expect(await applyRetailPrices(rawDb(pg), FEED)).toBe(0)
    })
  })

  it('is active only with the flag AND the migrated columns present', async () => {
    const on = { [RETAIL_PRICE_SYNC_FLAG]: 'true' } as unknown as NodeJS.ProcessEnv
    await withDb(async (pg) => {
      const db = rawDb(pg)
      expect(await isRetailPriceSyncActive(db, on)).toBe(true)
      const query = vi.fn()
      expect(await isRetailPriceSyncActive({ $queryRawUnsafe: query } as never, {} as NodeJS.ProcessEnv)).toBe(false)
      expect(query).not.toHaveBeenCalled()
      await pg.exec('ALTER TABLE "Product" DROP COLUMN "retailPriceUpdatedAt"')
      expect(await isRetailPriceSyncActive(db, on)).toBe(false)
    })
  })

  it('defends against a non-positive value that bypassed normalisation', async () => {
    await withDb(async (pg) => {
      await applyRetailPrices(rawDb(pg), [{ externalId: 'S-same', retailPrice: '-5' }])
      expect((await retailState(pg)).get('p-same')).toMatchObject({ retailPrice: '12.00', retailPriceMissing: true })
    })
  })

  it('backup snapshot restores the exact retail state (value, flag and timestamp)', async () => {
    await withDb(async (pg) => {
      const db = rawDb(pg)
      const before = await snapshotRetailPrices(db)
      const original = await retailState(pg)
      await applyRetailPrices(db, FEED)
      const differing = await diffRetailPrices(db, before)
      expect(differing.map((row) => row.id).sort()).toEqual(['p-change', 'p-new', 'p-zero'])
      const afterB2bColumns = await nonRetailState(pg)
      expect(await restoreRetailPrices(db, differing)).toBe(3)
      expect(await retailState(pg)).toEqual(original)
      expect(await nonRetailState(pg)).toBe(afterB2bColumns)
      expect(await diffRetailPrices(db, before)).toEqual([])
    })
  })
})
