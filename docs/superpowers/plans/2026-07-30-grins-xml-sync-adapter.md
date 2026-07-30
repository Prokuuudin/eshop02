# GrinS XML Sync Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the still-stubbed `RestPaginatedAdapter` with a real `GrinsXmlAdapter` that downloads the hourly GrinS product export over FTPS, parses it, and feeds the already-hardened `runSync` pipeline — while fixing a correctness bug in `upsertProducts` that would otherwise let every sync run silently destroy admin-curated `title`/`brand`/`category`/`description`/`images` on ~2,231 existing products (the feed doesn't send those fields at all, so today's unconditional `ON CONFLICT DO UPDATE SET title = EXCLUDED.title, ...` would blank them out).

**Architecture:** `GrinsXmlAdapter implements ErpAdapter` — a single-page adapter (the source is one full hourly dump, not paginated) that: (1) downloads `export.xml` over FTPS via a thin `basic-ftp` wrapper, (2) saves the raw file into a rotating rollback trail (own `KeyValueSetting` rows — GrinS's own backup is confirmed unreliable, see spec), (3) parses it with `fast-xml-parser` into `ErpProduct[]`, mapping the feed's `warehouse id="1..9"` slots to real warehouse ids via a fixed lookup table confirmed by the store owner on 2026-07-30. The existing `sync-runner.ts` batching/error/lock machinery (`lib/sync/*`, hardened 2026-07-22/23) is reused unchanged except for one addition: it now also accumulates `price1-4`/per-warehouse quantities per product and, only on a fully successful run, atomically replaces one `KeyValueSetting` blob with them (`lib/sync/erp-extra-data-store.ts`) — mirroring the existing `lib/product-overrides-store.ts` one-blob-per-KV-row pattern.

**Tech Stack:** TypeScript, Prisma (`ExtendedPrismaClient`), Vitest, `basic-ftp` (new dependency), `fast-xml-parser` (new dependency).

## Global Constraints

- No Neon schema changes (no new columns, no new tables, no new indexes) — every new data point (price1-4, per-warehouse quantities, XML rollback snapshots) goes into `KeyValueSetting`, same pattern as `lib/product-overrides-store.ts`. Standing project constraint, see `feedback_no_schema_changes` memory.
- Every new/changed code path needs a Vitest unit test; run `npx vitest run lib/sync/` after each task.
- `npm run typecheck` must stay clean after each task.
- Secrets (`GRINS_FTPS_*`) come from environment variables only — never hardcoded, never committed. This plan does not add them to `.env.local` or Vercel; that's a manual step for the user once the code is reviewed.
- **Confirmed 2026-07-30 mapping used throughout this plan:** `warehouse id="1"`..`"9"` in the XML → real ids `10000, 10001, 10002, 10003, 10004, 10005, 10006, 10007, 10010` in that exact order (verified against `export_sample.xml`: item `6580075`'s `warehouse id="1"` = 22, already included in the 51-vs-53 sum). `price2` is the hairshop-pro.lv public price (masters/pros audience, confirmed 07-27) — **`Product.price` is fed from `price2`, not `price1`.** `price1`, `price3`, `price4` are stored for reference only, never used as the displayed price. `capacity` is ignored entirely (GrinS ticket-printing field, confirmed 07-23 as not needed). `title`/`brand`/`category`/`description`/`images` are admin-owned forever for synced products — the parser never reads the feed's `<title>` into a display name; a brand-new pending row is seeded with its SKU as a neutral placeholder title, never the feed's LV+EN+brand mashup string.
- **Not in scope for this plan** (each is either a separate spec/business decision or a one-time operational step, not part of the recurring adapter):
  - Admin UI to review/approve pending (`isActive=false`, `externalId` set) products — this plan only makes the *data-layer* safety property true (new synced SKUs never auto-publish); a review screen is a follow-up plan.
  - Safety-buffer stock display transform, checkout capture/refund redesign — blocked on a business-supplied buffer value and a separate checkout spec (see `docs/superpowers/specs/2026-07-22-live-db-sync-design-correction.md`, section D).
  - Cron/HTTP wiring for a scheduled or admin-triggered run — only the existing CLI entrypoint (`scripts/sync-products.ts`) is updated. Deploying a Vercel Cron route is an infra step, not a code task, and the owner confirmed the schedule "floats" and manual triggering must stay possible regardless.
  - **One-time backfill before the first real run against production data:** today, all ~2,231 already-migrated products (`scripts/migrate-from-mssql.ts`) have `externalId = null` but a `sku` that likely already matches the GrinS feed's `<sku>` (both trace back to the same nopCommerce/GrinS-fed data). Running `GrinsXmlAdapter` for real *before* backfilling `externalId` from a `Product.sku` ↔ feed `sku` match would create ~2,231 duplicate pending rows instead of updating the existing curated ones. **Do not point this adapter at production without that backfill** — it needs the real 16,025-row `export.xml` to build and verify against, which isn't available yet (only the 23-row sample is), so it's excluded from this plan and must be its own follow-up once the real file is obtainable for a dry run.

---

## Task 1: Warehouse index → real id map, and extend `ErpProduct`

**Files:**
- Create: `lib/sync/grins-warehouse-map.ts`
- Test: `lib/sync/grins-warehouse-map.test.ts`
- Modify: `lib/sync/erp-adapter.ts`

**Interfaces:**
- Produces: `GRINS_WAREHOUSE_INDEX_TO_ID: readonly string[]` (index 0 = XML `warehouse id="1"`, ..., index 8 = `id="9"`); `ErpProduct` gains two new optional fields, `prices` and `warehouseQuantities`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

Create `lib/sync/grins-warehouse-map.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GRINS_WAREHOUSE_INDEX_TO_ID } from './grins-warehouse-map'

describe('GRINS_WAREHOUSE_INDEX_TO_ID', () => {
  it('has exactly 9 entries, one per XML warehouse index', () => {
    expect(GRINS_WAREHOUSE_INDEX_TO_ID).toHaveLength(9)
  })

  it('maps index 1 (Centrāla noliktava) to 10000 and index 9 (Jelgava) to 10010, confirmed 2026-07-30', () => {
    expect(GRINS_WAREHOUSE_INDEX_TO_ID[0]).toBe('10000')
    expect(GRINS_WAREHOUSE_INDEX_TO_ID[8]).toBe('10010')
  })

  it('matches the full confirmed order', () => {
    expect(GRINS_WAREHOUSE_INDEX_TO_ID).toEqual([
      '10000', '10001', '10002', '10003', '10004', '10005', '10006', '10007', '10010',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/sync/grins-warehouse-map.test.ts`
Expected: FAIL — `Cannot find module './grins-warehouse-map'`.

- [ ] **Step 3: Implement the map**

Create `lib/sync/grins-warehouse-map.ts`:

```ts
// Confirmed by the store owner 2026-07-30 and verified against export_sample.xml
// (item 6580075: warehouse id="1" = 22, already inside the 51-vs-quantity-53 sum,
// so index 1 is the central warehouse itself, not excluded from the feed).
// Index 0 here = XML `warehouse id="1"`, index 8 = `warehouse id="9"`.
export const GRINS_WAREHOUSE_INDEX_TO_ID: readonly string[] = [
  '10000', // 1: Centrāla noliktava, Rencēnu iela 10A
  '10001', // 2: Plavnieki, Brāļu Kaudzīšu iela 13, Rīga
  '10002', // 3: Imanta, Anniņmuižas bulvāris 82, Rīga
  '10003', // 4: Liepāja, Graudu iela 43N
  '10004', // 5: Daugavpils, Viestura iela 68
  '10005', // 6: Rīga (veikals), Rencēnu iela 10A
  '10006', // 7: Valmiera, Stacijas iela 17
  '10007', // 8: Rēzekne, Atbrīvošanas aleja 128
  '10010', // 9: Jelgava, Katoļu iela 1A, LV-3001
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/sync/grins-warehouse-map.test.ts`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Extend `ErpProduct` with the two new optional fields**

In `lib/sync/erp-adapter.ts`, replace:

```ts
export interface ErpProduct {
  externalId: string
  sku?: string
  title: string
  description?: string
  brand?: string
  category?: string
  price: number
  oldPrice?: number
  stock: number
  isActive?: boolean
  images?: string[]
  rawData?: Record<string, unknown>
}
```

with:

```ts
export interface ErpProduct {
  externalId: string
  sku?: string
  title: string
  description?: string
  brand?: string
  category?: string
  price: number
  oldPrice?: number
  stock: number
  isActive?: boolean
  images?: string[]
  rawData?: Record<string, unknown>
  /** price1-4 as sent by the feed, kept for reference — never used as the displayed price. */
  prices?: { price1: number; price2: number; price3: number; price4: number }
  /** Real warehouse id (e.g. "10001") -> quantity. Only populated by feed sources that break out stock per warehouse. */
  warehouseQuantities?: Record<string, number>
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean — the two new fields are optional, so no existing adapter/call site breaks.

- [ ] **Step 7: Commit**

```bash
git add lib/sync/grins-warehouse-map.ts lib/sync/grins-warehouse-map.test.ts lib/sync/erp-adapter.ts
git commit -m "feat(sync): add confirmed GrinS warehouse index map, extend ErpProduct with price1-4/warehouse quantities"
```

---

## Task 2: `parseGrinsXml` — pure XML → `ErpProduct[]` parser

**Files:**
- Create: `lib/sync/grins-xml-parser.ts`
- Test: `lib/sync/grins-xml-parser.test.ts`
- Modify: `package.json` (add `fast-xml-parser`)

**Interfaces:**
- Consumes: `GRINS_WAREHOUSE_INDEX_TO_ID` (Task 1), `ErpProduct` (Task 1).
- Produces: `export function parseGrinsXml(xml: string): ErpProduct[]`.

The real sample file already lives at repo root: `export_sample.xml` (23 real items out of the full 16,025-row feed, copied node-for-node so the field set is real, not a fixture guess). This task parses against that real file, not a hand-written fixture.

Deliberately **not** doing here (already handled elsewhere, don't duplicate): dropping empty/duplicate SKUs — `sync-runner.ts`'s existing `withId`/`seenExternalIds` guards (from the 2026-07-22 hardening plan) already reject those and fail the run; re-implementing that in the parser would let a duplicate silently vanish instead of failing the run, which is the opposite of what the spec requires.

- [ ] **Step 1: Add the XML parser dependency**

```bash
npm install fast-xml-parser
```

- [ ] **Step 2: Write the failing test**

Create `lib/sync/grins-xml-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseGrinsXml } from './grins-xml-parser'

const sampleXml = readFileSync(join(__dirname, '..', '..', 'export_sample.xml'), 'utf-8')

describe('parseGrinsXml', () => {
  it('parses all 23 items from the real sample file', () => {
    const products = parseGrinsXml(sampleXml)
    expect(products).toHaveLength(23)
  })

  it('uses sku as externalId, opaque and untouched (leading dash, slash, percent preserved)', () => {
    const products = parseGrinsXml(sampleXml)
    const skus = products.map(p => p.externalId)
    expect(skus).toContain('SF0301/GL')
    expect(skus).toContain('F12%')
    expect(skus).toContain('-310-051OSTER')
  })

  it('seeds title with the sku placeholder, never the feed title text', () => {
    const products = parseGrinsXml(sampleXml)
    const glue = products.find(p => p.externalId === 'SF0301/GL')
    expect(glue?.title).toBe('SF0301/GL')
  })

  it('maps Product.price from price2 (hairshop-pro.lv public price), not price1', () => {
    const products = parseGrinsXml(sampleXml)
    const remover = products.find(p => p.externalId === '6580075')
    // price1=9, price2=7 in the sample file for this item
    expect(remover?.price).toBe(7)
    expect(remover?.prices).toEqual({ price1: 9, price2: 7, price3: 2.44, price4: 5 })
  })

  it('sets stock from <quantity> as-is, no buffer applied', () => {
    const products = parseGrinsXml(sampleXml)
    const remover = products.find(p => p.externalId === '6580075')
    expect(remover?.stock).toBe(53)
  })

  it('maps the 9 warehouse slots to real ids and preserves the known quantity-vs-sum discrepancy', () => {
    const products = parseGrinsXml(sampleXml)
    const remover = products.find(p => p.externalId === '6580075')
    expect(remover?.warehouseQuantities).toEqual({
      '10000': 22, '10001': 4, '10002': 7, '10003': 2, '10004': 3,
      '10005': 3, '10006': 5, '10007': 5, '10010': 0,
    })
    // 22+4+7+2+3+3+5+5+0 = 51, vs stock (quantity) = 53 — the known +2 delta from wholesale (10008), untouched here.
    const sum = Object.values(remover!.warehouseQuantities!).reduce((a, b) => a + b, 0)
    expect(sum).toBe(51)
  })

  it('does not read capacity into the result at all', () => {
    const products = parseGrinsXml(sampleXml)
    for (const p of products) {
      expect(p).not.toHaveProperty('capacity')
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/sync/grins-xml-parser.test.ts`
Expected: FAIL — `Cannot find module './grins-xml-parser'`.

- [ ] **Step 4: Implement the parser**

Create `lib/sync/grins-xml-parser.ts`:

```ts
import { XMLParser } from 'fast-xml-parser'
import { GRINS_WAREHOUSE_INDEX_TO_ID } from './grins-warehouse-map'
import type { ErpProduct } from './erp-adapter'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'item' || name === 'warehouse',
})

interface RawWarehouse {
  '@_id': string | number
  '#text'?: string | number
}

interface RawItem {
  sku: string | number
  title?: string
  price1?: string | number
  price2?: string | number
  price3?: string | number
  price4?: string | number
  quantity?: string | number
  warehouses?: { warehouse?: RawWarehouse[] }
}

interface RawRoot {
  root?: { item?: RawItem[] }
}

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return Number.isFinite(n) ? n : 0
}

export function parseGrinsXml(xml: string): ErpProduct[] {
  const parsed = parser.parse(xml) as RawRoot
  const items = parsed.root?.item ?? []

  return items.map((item): ErpProduct => {
    const sku = String(item.sku ?? '').trim()

    const warehouseQuantities: Record<string, number> = {}
    const rawWarehouses = item.warehouses?.warehouse ?? []
    for (const w of rawWarehouses) {
      const idx = parseInt(String(w['@_id']), 10)
      const realId = GRINS_WAREHOUSE_INDEX_TO_ID[idx - 1]
      if (realId) warehouseQuantities[realId] = toNumber(w['#text'])
    }

    const price1 = toNumber(item.price1)
    const price2 = toNumber(item.price2)
    const price3 = toNumber(item.price3)
    const price4 = toNumber(item.price4)

    return {
      externalId: sku,
      sku,
      // Feed title is a nopCommerce search-index mashup of brand + LV + EN, never a
      // display name (confirmed 2026-07-23) — seed brand-new pending rows with the
      // SKU itself instead, admin fills in the real title before publishing.
      title: sku,
      price: price2,
      stock: toNumber(item.quantity),
      prices: { price1, price2, price3, price4 },
      warehouseQuantities,
    }
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/sync/grins-xml-parser.test.ts`
Expected: PASS — all 7 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/sync/grins-xml-parser.ts lib/sync/grins-xml-parser.test.ts package.json package-lock.json
git commit -m "feat(sync): parse GrinS XML export into ErpProduct[]"
```

---

## Task 3: Fix `upsertProducts` — stop clobbering admin-owned fields, pending-review for new SKUs

**Files:**
- Modify: `lib/sync/upsert-products.ts`
- Test: `lib/sync/upsert-products.test.ts`

**Interfaces:**
- Consumes: `ErpProduct` (unchanged shape usage).
- Produces: same exports (`COLS_PER_ROW`, `buildUpsertQuery`, `upsertProducts`), behavior changes only.

Today, `buildUpsertQuery`'s `ON CONFLICT DO UPDATE SET` unconditionally overwrites `title`, `brand`, `category`, `description`, `images` on every sync run for every already-known product. Since the GrinS feed never sends brand/category/image/description (confirmed 2026-07-23) and this plan deliberately seeds `title` with just the SKU (Task 2), running this unmodified against the ~2,231 already-curated products would blank out their real titles/brands/categories/images/descriptions on the very first live run. Also, `isActive` is unconditionally set to `true` in the INSERT values — this task changes that to `false` for genuinely new rows (pending review, per spec section 10), while the `DO UPDATE SET "isActive" = true` path for already-known products is unchanged (that's the existing, correct reactivation behavior).

- [ ] **Step 1: Write the failing tests**

Add to `lib/sync/upsert-products.test.ts` (inside the existing `describe('buildUpsertQuery', ...)` block):

```ts
  it('DO UPDATE SET does not overwrite admin-owned fields (title/brand/category/description/images)', () => {
    const updatePart = buildUpsertQuery(1).split('DO UPDATE SET')[1]
    expect(updatePart).not.toMatch(/\btitle\b\s*=/)
    expect(updatePart).not.toMatch(/\bbrand\b\s*=/)
    expect(updatePart).not.toMatch(/\bcategory\b\s*=/)
    expect(updatePart).not.toMatch(/\bdescription\b\s*=/)
    expect(updatePart).not.toMatch(/\bimages\b\s*=/)
  })
```

And inside the existing `describe('upsertProducts', ...)` block:

```ts
  it('inserts new rows as isActive=false (pending review), regardless of feed value', async () => {
    const db = makeMockDb()
    await upsertProducts(db, [{ externalId: 'e1', title: 'placeholder', price: 10, stock: 1 }], 'run-1')
    const args = (db.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0]
    // args[0] is the SQL string; params start at args[1]. isActive is column
    // index 11 (0-based) of the 14 COLS_PER_ROW, so its param is args[1 + 11].
    expect(args[1 + 11]).toBe(false)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/sync/upsert-products.test.ts`
Expected: FAIL — today's `DO UPDATE SET` includes `title`/`brand`/`category`/`description`/`images`, and the INSERT value for `isActive` is `true`.

- [ ] **Step 3: Fix `buildUpsertQuery`**

In `lib/sync/upsert-products.ts`, replace:

```ts
    ON CONFLICT ("externalId") DO UPDATE SET
      title           = EXCLUDED.title,
      brand           = EXCLUDED.brand,
      category        = EXCLUDED.category,
      price           = EXCLUDED.price,
      "oldPrice"      = EXCLUDED."oldPrice",
      stock           = EXCLUDED.stock,
      sku             = EXCLUDED.sku,
      images          = EXCLUDED.images,
      description     = EXCLUDED.description,
      "isActive"      = true,
      "lastSyncRunId" = EXCLUDED."lastSyncRunId",
      "updatedAt"     = now()
```

with:

```ts
    ON CONFLICT ("externalId") DO UPDATE SET
      -- title/brand/category/description/images are admin-owned forever for synced
      -- products: the feed doesn't send brand/category/image/description at all, and
      -- title is deliberately seeded from SKU only (see grins-xml-parser.ts), so
      -- overwriting them here on every run would blank out real admin-entered data.
      price           = EXCLUDED.price,
      "oldPrice"      = EXCLUDED."oldPrice",
      stock           = EXCLUDED.stock,
      sku             = EXCLUDED.sku,
      "isActive"      = true,
      "lastSyncRunId" = EXCLUDED."lastSyncRunId",
      "updatedAt"     = now()
```

- [ ] **Step 4: Fix the INSERT-value for `isActive` in `buildParams`**

In `lib/sync/upsert-products.ts`, replace:

```ts
    p.description ?? null,  // description
    true,                   // isActive
    runId,                  // lastSyncRunId
```

with:

```ts
    p.description ?? null,  // description
    // Brand-new rows start hidden (pending review, spec section 10 — the feed has no
    // machine-readable flag for non-product junk rows). Already-known rows are
    // unaffected: ON CONFLICT DO UPDATE forces isActive back to true unconditionally.
    false,                  // isActive
    runId,                  // lastSyncRunId
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/sync/upsert-products.test.ts`
Expected: PASS — all tests, including the pre-existing `'DO UPDATE SET includes ERP-owned fields'` test (still checks for `lastSyncRunId`/`isActive`/`price`/`stock`, all still present).

- [ ] **Step 6: Run the full sync suite and typecheck**

Run: `npx vitest run lib/sync/`
Expected: PASS.
Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/sync/upsert-products.ts lib/sync/upsert-products.test.ts
git commit -m "fix(sync): stop overwriting admin-owned fields on sync update, gate new SKUs behind pending review"
```

---

## Task 4: `erp-extra-data-store.ts` — price1-4 / per-warehouse quantities storage

**Files:**
- Create: `lib/sync/erp-extra-data-store.ts`
- Test: `lib/sync/erp-extra-data-store.test.ts`

**Interfaces:**
- Consumes: `ExtendedPrismaClient` (injected, matching the rest of `lib/sync/*`, not the `@/lib/prisma` singleton import style used by `lib/product-overrides-store.ts` — this module is only ever called from `sync-runner.ts`, which already threads `db` through).
- Produces:
  ```ts
  export interface ErpExtraData {
    prices: { price1: number; price2: number; price3: number; price4: number }
    warehouseQuantities: Record<string, number>
  }
  export async function getErpExtraData(db: ExtendedPrismaClient): Promise<Record<string, ErpExtraData>>
  export async function getErpExtraDataFor(db: ExtendedPrismaClient, externalId: string): Promise<ErpExtraData | undefined>
  export async function replaceErpExtraData(db: ExtendedPrismaClient, data: Record<string, ErpExtraData>): Promise<void>
  ```

Whole-blob replace (not merge) in one `KeyValueSetting` row — mirrors `lib/product-overrides-store.ts`'s `OVERRIDES_KEY` pattern, and gives this data genuine atomic-publish semantics for free: a single `UPDATE` either lands or doesn't, no partial state possible, unlike the per-batch `Product` table writes.

- [ ] **Step 1: Write the failing tests**

Create `lib/sync/erp-extra-data-store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import { getErpExtraData, getErpExtraDataFor, replaceErpExtraData, type ErpExtraData } from './erp-extra-data-store'

function makeMockDb(storedValue: unknown = undefined) {
  return {
    keyValueSetting: {
      findUnique: vi.fn().mockResolvedValue(storedValue === undefined ? null : { key: 'erp-extra-data', value: storedValue }),
      upsert: vi.fn().mockResolvedValue({}),
    },
  } as unknown as ExtendedPrismaClient
}

const sample: Record<string, ErpExtraData> = {
  '6580075': {
    prices: { price1: 9, price2: 7, price3: 2.44, price4: 5 },
    warehouseQuantities: { '10000': 22, '10001': 4 },
  },
}

describe('getErpExtraData', () => {
  it('returns an empty object when nothing stored yet', async () => {
    const db = makeMockDb(undefined)
    expect(await getErpExtraData(db)).toEqual({})
  })

  it('returns the stored map', async () => {
    const db = makeMockDb(sample)
    expect(await getErpExtraData(db)).toEqual(sample)
  })
})

describe('getErpExtraDataFor', () => {
  it('returns the entry for a known externalId', async () => {
    const db = makeMockDb(sample)
    expect(await getErpExtraDataFor(db, '6580075')).toEqual(sample['6580075'])
  })

  it('returns undefined for an unknown externalId', async () => {
    const db = makeMockDb(sample)
    expect(await getErpExtraDataFor(db, 'nope')).toBeUndefined()
  })
})

describe('replaceErpExtraData', () => {
  it('upserts the whole map under a single fixed key', async () => {
    const db = makeMockDb(undefined)
    await replaceErpExtraData(db, sample)
    expect(db.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'erp-extra-data' },
        create: expect.objectContaining({ key: 'erp-extra-data', value: sample }),
        update: expect.objectContaining({ value: sample }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/sync/erp-extra-data-store.test.ts`
Expected: FAIL — `Cannot find module './erp-extra-data-store'`.

- [ ] **Step 3: Implement the store**

Create `lib/sync/erp-extra-data-store.ts`:

```ts
import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export interface ErpExtraData {
  prices: { price1: number; price2: number; price3: number; price4: number }
  warehouseQuantities: Record<string, number>
}

const ERP_EXTRA_DATA_KEY = 'erp-extra-data'

export async function getErpExtraData(db: ExtendedPrismaClient): Promise<Record<string, ErpExtraData>> {
  const row = await db.keyValueSetting.findUnique({ where: { key: ERP_EXTRA_DATA_KEY } })
  const parsed = row?.value as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, ErpExtraData>)
    : {}
}

export async function getErpExtraDataFor(
  db: ExtendedPrismaClient,
  externalId: string,
): Promise<ErpExtraData | undefined> {
  const all = await getErpExtraData(db)
  return all[externalId]
}

export async function replaceErpExtraData(
  db: ExtendedPrismaClient,
  data: Record<string, ErpExtraData>,
): Promise<void> {
  await db.keyValueSetting.upsert({
    where: { key: ERP_EXTRA_DATA_KEY },
    create: { key: ERP_EXTRA_DATA_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/sync/erp-extra-data-store.test.ts`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/erp-extra-data-store.ts lib/sync/erp-extra-data-store.test.ts
git commit -m "feat(sync): store price1-4 and per-warehouse quantities as one atomically-replaced KV blob"
```

---

## Task 5: `ftps-client.ts` — FTPS download wrapper

**Files:**
- Create: `lib/sync/ftps-client.ts`
- Test: `lib/sync/ftps-client.test.ts`
- Modify: `package.json` (add `basic-ftp`)

**Interfaces:**
- Produces:
  ```ts
  export interface FtpsConfig { host: string; user: string; password: string; remotePath: string }
  export function getFtpsConfigFromEnv(): FtpsConfig
  export async function downloadFtpsFile(config: FtpsConfig): Promise<string>
  ```

Transport is already fully resolved (2026-07-27): explicit-TLS FTPS, port 21, a dedicated read-only `hairshop-pro` FTP account whose home directory is scoped to the `Sync` folder containing exactly one file, `export.xml` (confirmed live via WinSCP, 8,565 KB). `basic-ftp`'s `secure: true` on `client.access()` is explicit TLS, matching that setup.

- [ ] **Step 1: Add the FTP client dependency**

```bash
npm install basic-ftp
```

- [ ] **Step 2: Write the failing tests**

Create `lib/sync/ftps-client.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const accessMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const downloadToMock = vi.hoisted(() =>
  vi.fn().mockImplementation(async (sink: NodeJS.WritableStream) => {
    sink.write(Buffer.from('<root></root>'))
    sink.end()
  }),
)
const closeMock = vi.hoisted(() => vi.fn())

vi.mock('basic-ftp', () => ({
  Client: vi.fn().mockImplementation(() => ({
    access: accessMock,
    downloadTo: downloadToMock,
    close: closeMock,
  })),
}))

import { getFtpsConfigFromEnv, downloadFtpsFile } from './ftps-client'

describe('getFtpsConfigFromEnv', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('throws when required env vars are missing', () => {
    delete process.env.GRINS_FTPS_HOST
    delete process.env.GRINS_FTPS_USER
    delete process.env.GRINS_FTPS_PASSWORD
    expect(() => getFtpsConfigFromEnv()).toThrow(/GRINS_FTPS_HOST/)
  })

  it('defaults remotePath to export.xml', () => {
    process.env.GRINS_FTPS_HOST = 'host'
    process.env.GRINS_FTPS_USER = 'user'
    process.env.GRINS_FTPS_PASSWORD = 'pass'
    delete process.env.GRINS_FTPS_REMOTE_PATH
    expect(getFtpsConfigFromEnv().remotePath).toBe('export.xml')
  })

  it('reads all four values when set', () => {
    process.env.GRINS_FTPS_HOST = 'ftp.example.com'
    process.env.GRINS_FTPS_USER = 'hairshop-pro'
    process.env.GRINS_FTPS_PASSWORD = 'secret'
    process.env.GRINS_FTPS_REMOTE_PATH = 'custom.xml'
    expect(getFtpsConfigFromEnv()).toEqual({
      host: 'ftp.example.com',
      user: 'hairshop-pro',
      password: 'secret',
      remotePath: 'custom.xml',
    })
  })
})

describe('downloadFtpsFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('connects with explicit TLS, downloads the configured path, and returns its text', async () => {
    const config = { host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' }
    const result = await downloadFtpsFile(config)
    expect(accessMock).toHaveBeenCalledWith({ host: 'h', user: 'u', password: 'p', secure: true })
    expect(downloadToMock).toHaveBeenCalledWith(expect.anything(), 'export.xml')
    expect(result).toBe('<root></root>')
  })

  it('always closes the client, even on failure', async () => {
    accessMock.mockRejectedValueOnce(new Error('connection refused'))
    const config = { host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' }
    await expect(downloadFtpsFile(config)).rejects.toThrow('connection refused')
    expect(closeMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/sync/ftps-client.test.ts`
Expected: FAIL — `Cannot find module './ftps-client'`.

- [ ] **Step 4: Implement the client**

Create `lib/sync/ftps-client.ts`:

```ts
import { Client } from 'basic-ftp'
import { Writable } from 'stream'

export interface FtpsConfig {
  host: string
  user: string
  password: string
  remotePath: string
}

export function getFtpsConfigFromEnv(): FtpsConfig {
  const host = process.env.GRINS_FTPS_HOST
  const user = process.env.GRINS_FTPS_USER
  const password = process.env.GRINS_FTPS_PASSWORD
  const remotePath = process.env.GRINS_FTPS_REMOTE_PATH ?? 'export.xml'

  if (!host || !user || !password) {
    throw new Error(
      'GRINS_FTPS_HOST, GRINS_FTPS_USER and GRINS_FTPS_PASSWORD must all be set',
    )
  }

  return { host, user, password, remotePath }
}

export async function downloadFtpsFile(config: FtpsConfig): Promise<string> {
  const client = new Client()
  try {
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      secure: true, // explicit TLS — confirmed working transport, 2026-07-27
    })

    const chunks: Buffer[] = []
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
    })

    await client.downloadTo(sink, config.remotePath)
    return Buffer.concat(chunks).toString('utf-8')
  } finally {
    client.close()
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/sync/ftps-client.test.ts`
Expected: PASS — all 5 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/sync/ftps-client.ts lib/sync/ftps-client.test.ts package.json package-lock.json
git commit -m "feat(sync): add FTPS client wrapper for the GrinS export"
```

---

## Task 6: `xml-snapshot-store.ts` — rollback trail for raw XML downloads

**Files:**
- Create: `lib/sync/xml-snapshot-store.ts`
- Test: `lib/sync/xml-snapshot-store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SnapshotMeta { slot: number; checksum: string; sizeBytes: number; downloadedAt: string }
  export function checksumOf(xml: string): string
  export async function saveSnapshot(xml: string): Promise<SnapshotMeta>
  export async function getSnapshotHistory(): Promise<SnapshotMeta[]>
  export async function getSnapshotContent(slot: number): Promise<string | undefined>
  ```

Owner confirmed (2026-07-27) GrinS's own backup RPO/RTO is unknown/untested — this is the *only* reliable rollback for a bad import on the hairshop-pro.lv side. Keeps the last 3 raw downloads (content + checksum + size + timestamp), round-robin across 3 fixed `KeyValueSetting` slots so metadata lookups never have to load megabytes of XML text. Uses the `@/lib/prisma` singleton (like `lib/product-overrides-store.ts`), not DI — this store isn't part of the tightly-mocked `sync-runner.ts` DB pipeline; it's called directly from inside the adapter (Task 7), which has no `db` handle to thread through (`ErpAdapter.fetchPage()` takes no such parameter, by design — adapters only talk to the external source).

- [ ] **Step 1: Write the failing tests**

Create `lib/sync/xml-snapshot-store.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const findUniqueMock = vi.hoisted(() => vi.fn())
const upsertMock = vi.hoisted(() => vi.fn().mockResolvedValue({}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
    },
  },
}))

import { checksumOf, saveSnapshot, getSnapshotHistory, getSnapshotContent } from './xml-snapshot-store'

beforeEach(() => {
  vi.clearAllMocks()
  findUniqueMock.mockResolvedValue(null)
})

describe('checksumOf', () => {
  it('is deterministic and content-sensitive', () => {
    expect(checksumOf('abc')).toBe(checksumOf('abc'))
    expect(checksumOf('abc')).not.toBe(checksumOf('abd'))
  })
})

describe('getSnapshotHistory', () => {
  it('returns an empty array when nothing stored yet', async () => {
    expect(await getSnapshotHistory()).toEqual([])
  })
})

describe('saveSnapshot', () => {
  it('writes the raw content to slot 0 on the first call', async () => {
    findUniqueMock.mockResolvedValueOnce(null) // index row: nothing yet
    const meta = await saveSnapshot('<root>first</root>')
    expect(meta.slot).toBe(0)
    expect(meta.checksum).toBe(checksumOf('<root>first</root>'))
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'erp-xml-snapshot-content:0' } }),
    )
  })

  it('rotates to the next slot on each subsequent call, wrapping after 3', async () => {
    findUniqueMock.mockResolvedValueOnce({
      value: { nextSlot: 1, entries: [{ slot: 0, checksum: 'x', sizeBytes: 1, downloadedAt: 'a' }] },
    })
    const meta = await saveSnapshot('<root>second</root>')
    expect(meta.slot).toBe(1)
  })
})

describe('getSnapshotContent', () => {
  it('returns undefined when the slot has nothing stored', async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    expect(await getSnapshotContent(0)).toBeUndefined()
  })

  it('returns the stored xml text for a populated slot', async () => {
    findUniqueMock.mockResolvedValueOnce({ value: { xml: '<root>stored</root>' } })
    expect(await getSnapshotContent(0)).toBe('<root>stored</root>')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/sync/xml-snapshot-store.test.ts`
Expected: FAIL — `Cannot find module './xml-snapshot-store'`.

- [ ] **Step 3: Implement the store**

Create `lib/sync/xml-snapshot-store.ts`:

```ts
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export interface SnapshotMeta {
  slot: number
  checksum: string
  sizeBytes: number
  downloadedAt: string
}

interface SnapshotIndex {
  nextSlot: number
  entries: SnapshotMeta[]
}

const MAX_SNAPSHOTS = 3
const INDEX_KEY = 'erp-xml-snapshot-index'
const contentKey = (slot: number) => `erp-xml-snapshot-content:${slot}`

export function checksumOf(xml: string): string {
  return createHash('sha256').update(xml, 'utf-8').digest('hex')
}

async function getIndex(): Promise<SnapshotIndex> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: INDEX_KEY } })
  const parsed = row?.value as Partial<SnapshotIndex> | undefined
  return {
    nextSlot: typeof parsed?.nextSlot === 'number' ? parsed.nextSlot : 0,
    entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
  }
}

export async function getSnapshotHistory(): Promise<SnapshotMeta[]> {
  return (await getIndex()).entries
}

export async function saveSnapshot(xml: string): Promise<SnapshotMeta> {
  const index = await getIndex()
  const slot = index.nextSlot

  const meta: SnapshotMeta = {
    slot,
    checksum: checksumOf(xml),
    sizeBytes: Buffer.byteLength(xml, 'utf-8'),
    downloadedAt: new Date().toISOString(),
  }

  await prisma.keyValueSetting.upsert({
    where: { key: contentKey(slot) },
    create: { key: contentKey(slot), value: { xml } as unknown as Prisma.InputJsonValue },
    update: { value: { xml } as unknown as Prisma.InputJsonValue },
  })

  const nextEntries = [meta, ...index.entries.filter(e => e.slot !== slot)].slice(0, MAX_SNAPSHOTS)
  const nextIndex: SnapshotIndex = { nextSlot: (slot + 1) % MAX_SNAPSHOTS, entries: nextEntries }

  await prisma.keyValueSetting.upsert({
    where: { key: INDEX_KEY },
    create: { key: INDEX_KEY, value: nextIndex as unknown as Prisma.InputJsonValue },
    update: { value: nextIndex as unknown as Prisma.InputJsonValue },
  })

  return meta
}

export async function getSnapshotContent(slot: number): Promise<string | undefined> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: contentKey(slot) } })
  const parsed = row?.value as { xml?: string } | undefined
  return parsed?.xml
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/sync/xml-snapshot-store.test.ts`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/xml-snapshot-store.ts lib/sync/xml-snapshot-store.test.ts
git commit -m "feat(sync): keep a rotating rollback trail of raw GrinS XML downloads"
```

---

## Task 7: `GrinsXmlAdapter` — wire transport + snapshot + parse

**Files:**
- Create: `lib/sync/adapters/grins-xml.ts`
- Test: `lib/sync/adapters/grins-xml.test.ts`

**Interfaces:**
- Consumes: `getFtpsConfigFromEnv`, `downloadFtpsFile` (Task 5); `saveSnapshot` (Task 6); `parseGrinsXml` (Task 2); `ErpAdapter`, `ErpFetchResult` (`../erp-adapter`).
- Produces: `export class GrinsXmlAdapter implements ErpAdapter`.

The source is one full hourly dump, not paginated — `fetchPage()` ignores its cursor argument and always returns everything with `hasMore: false`, matching `ErpAdapter`'s existing contract exactly, so `sync-runner.ts` needs no changes to consume it (batching into `BATCH_SIZE` chunks already happens inside `sync-runner.ts`, independent of how many products one `fetchPage()` call returns).

- [ ] **Step 1: Write the failing test**

Create `lib/sync/adapters/grins-xml.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const getFtpsConfigFromEnvMock = vi.hoisted(() => vi.fn())
const downloadFtpsFileMock = vi.hoisted(() => vi.fn())
const saveSnapshotMock = vi.hoisted(() => vi.fn())
const parseGrinsXmlMock = vi.hoisted(() => vi.fn())

vi.mock('../ftps-client', () => ({
  getFtpsConfigFromEnv: getFtpsConfigFromEnvMock,
  downloadFtpsFile: downloadFtpsFileMock,
}))
vi.mock('../xml-snapshot-store', () => ({
  saveSnapshot: saveSnapshotMock,
}))
vi.mock('../grins-xml-parser', () => ({
  parseGrinsXml: parseGrinsXmlMock,
}))

import { GrinsXmlAdapter } from './grins-xml'

beforeEach(() => {
  vi.clearAllMocks()
  getFtpsConfigFromEnvMock.mockReturnValue({ host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' })
  downloadFtpsFileMock.mockResolvedValue('<root>...</root>')
  saveSnapshotMock.mockResolvedValue({ slot: 0, checksum: 'abc', sizeBytes: 10, downloadedAt: 'now' })
  parseGrinsXmlMock.mockReturnValue([{ externalId: 'e1', title: 'e1', price: 1, stock: 1 }])
})

describe('GrinsXmlAdapter', () => {
  it('downloads, snapshots, then parses, in that order', async () => {
    const adapter = new GrinsXmlAdapter()
    const result = await adapter.fetchPage()

    expect(downloadFtpsFileMock).toHaveBeenCalledWith({ host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' })
    expect(saveSnapshotMock).toHaveBeenCalledWith('<root>...</root>')
    expect(parseGrinsXmlMock).toHaveBeenCalledWith('<root>...</root>')

    const downloadOrder = downloadFtpsFileMock.mock.invocationCallOrder[0]
    const snapshotOrder = saveSnapshotMock.mock.invocationCallOrder[0]
    const parseOrder = parseGrinsXmlMock.mock.invocationCallOrder[0]
    expect(downloadOrder).toBeLessThan(snapshotOrder)
    expect(snapshotOrder).toBeLessThan(parseOrder)
  })

  it('returns a single full page — hasMore is always false', async () => {
    const adapter = new GrinsXmlAdapter()
    const result = await adapter.fetchPage()
    expect(result.hasMore).toBe(false)
    expect(result.products).toEqual([{ externalId: 'e1', title: 'e1', price: 1, stock: 1 }])
  })

  it('exposes a stable adapter name', () => {
    expect(new GrinsXmlAdapter().name).toBe('grins-xml')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/sync/adapters/grins-xml.test.ts`
Expected: FAIL — `Cannot find module './grins-xml'`.

- [ ] **Step 3: Implement the adapter**

Create `lib/sync/adapters/grins-xml.ts`:

```ts
import type { ErpAdapter, ErpFetchResult } from '../erp-adapter'
import { getFtpsConfigFromEnv, downloadFtpsFile } from '../ftps-client'
import { saveSnapshot } from '../xml-snapshot-store'
import { parseGrinsXml } from '../grins-xml-parser'

export class GrinsXmlAdapter implements ErpAdapter {
  readonly name = 'grins-xml'

  async fetchPage(): Promise<ErpFetchResult> {
    const config = getFtpsConfigFromEnv()
    const xml = await downloadFtpsFile(config)
    await saveSnapshot(xml)
    const products = parseGrinsXml(xml)
    return { products, hasMore: false }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/sync/adapters/grins-xml.test.ts`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/adapters/grins-xml.ts lib/sync/adapters/grins-xml.test.ts
git commit -m "feat(sync): add GrinsXmlAdapter wiring FTPS transport, rollback snapshot, and XML parsing"
```

---

## Task 8: Accumulate and flush price1-4/warehouse data from `sync-runner.ts`

**Files:**
- Modify: `lib/sync/sync-runner.ts`
- Test: `lib/sync/sync-runner.test.ts`

**Interfaces:**
- Consumes: `replaceErpExtraData`, `ErpExtraData` (Task 4).
- Produces: no new exports; `runSync`'s behavior gains one side effect on the success path only.

Only flushed when the run has zero errors (same gate the 2026-07-22 hardening plan already added for `deactivateMissing`) — a failed run must not publish a new extra-data snapshot, matching "snapshot не публикуется" from the spec. Also skipped entirely when no product in the run carried `prices`/`warehouseQuantities` (e.g. a non-GrinS adapter), so a different adapter's run can never wipe out GrinS's extra data with an empty blob.

- [ ] **Step 1: Write the failing test**

In `lib/sync/sync-runner.test.ts`, add a mock for the new module next to the existing `vi.mock('./upsert-products', ...)`/`vi.mock('./deactivate-missing', ...)` calls near the top of the file:

```ts
vi.mock('./erp-extra-data-store', () => ({
  replaceErpExtraData: vi.fn().mockResolvedValue(undefined),
}))
```

Add the import next to the existing `upsertProducts`/`deactivateMissing` imports:

```ts
import { replaceErpExtraData } from './erp-extra-data-store'
```

Then add the tests themselves (inside the existing `describe('runSync', ...)` block), following the same `(x as ReturnType<typeof vi.fn>)` cast style already used for `upsertProducts` elsewhere in this file:

```ts
  it('flushes accumulated price/warehouse data only when the run succeeds', async () => {
    const products = [
      {
        externalId: 'e1',
        title: 'e1',
        price: 7,
        stock: 53,
        prices: { price1: 9, price2: 7, price3: 2.44, price4: 5 },
        warehouseQuantities: { '10000': 22 },
      },
    ]
    await runSync(makeAdapter(products), makeMockDb())
    expect(replaceErpExtraData).toHaveBeenCalledWith(
      expect.anything(),
      { e1: { prices: { price1: 9, price2: 7, price3: 2.44, price4: 5 }, warehouseQuantities: { '10000': 22 } } },
    )
  })

  it('does not flush price/warehouse data when the run fails', async () => {
    const products = [
      { externalId: 'e1', title: 'e1', price: 7, stock: 53, prices: { price1: 9, price2: 7, price3: 2.44, price4: 5 }, warehouseQuantities: {} },
    ]
    ;(upsertProducts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db timeout'))
    await runSync(makeAdapter(products), makeMockDb())
    expect(replaceErpExtraData).not.toHaveBeenCalled()
  })

  it('does not flush at all when no product in the run carries extra data', async () => {
    const products = [{ externalId: 'e1', title: 'e1', price: 7, stock: 53 }]
    await runSync(makeAdapter(products), makeMockDb())
    expect(replaceErpExtraData).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/sync/sync-runner.test.ts -t "flushes accumulated"`
Expected: FAIL — `runSync` doesn't import or call `replaceErpExtraData` yet.

- [ ] **Step 3: Wire the accumulation and flush into `runSync`**

In `lib/sync/sync-runner.ts`, add the import alongside the existing ones:

```ts
import { replaceErpExtraData, type ErpExtraData } from './erp-extra-data-store'
```

Add the accumulator next to `seenExternalIds`:

```ts
  const seenExternalIds = new Set<string>()
  const extraDataByExternalId: Record<string, ErpExtraData> = {}
```

Inside the existing per-product loop (`for (const p of withId) { ... }`), right after `valid.push(p)`, add:

```ts
          if (p.prices || p.warehouseQuantities) {
            extraDataByExternalId[p.externalId] = {
              prices: {
                price1: p.prices?.price1 ?? 0,
                price2: p.prices?.price2 ?? 0,
                price3: p.prices?.price3 ?? 0,
                price4: p.prices?.price4 ?? 0,
              },
              warehouseQuantities: p.warehouseQuantities ?? {},
            }
          }
```

So that block now reads:

```ts
        const valid: ErpProduct[] = []
        const duplicateIds: string[] = []
        for (const p of withId) {
          if (seenExternalIds.has(p.externalId)) {
            duplicateIds.push(p.externalId)
            continue
          }
          seenExternalIds.add(p.externalId)
          valid.push(p)
          if (p.prices || p.warehouseQuantities) {
            extraDataByExternalId[p.externalId] = {
              prices: {
                price1: p.prices?.price1 ?? 0,
                price2: p.prices?.price2 ?? 0,
                price3: p.prices?.price3 ?? 0,
                price4: p.prices?.price4 ?? 0,
              },
              warehouseQuantities: p.warehouseQuantities ?? {},
            }
          }
        }
```

Finally, in the success branch, right after `logger.info('Deactivation complete', { deactivated })` and before the `db.syncRun.update({ ..., status: 'completed', ... })` call, add:

```ts
    if (Object.keys(extraDataByExternalId).length > 0) {
      await replaceErpExtraData(db, extraDataByExternalId)
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/sync/sync-runner.test.ts`
Expected: PASS — all tests, including the 3 new ones and every pre-existing test (the accumulator/flush is additive and gated, so runs that never populate `prices`/`warehouseQuantities` behave exactly as before).

- [ ] **Step 5: Run the full sync suite and typecheck**

Run: `npx vitest run lib/sync/`
Expected: PASS.
Run: `npm run typecheck`
Expected: clean.
Run: `npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/sync-runner.ts lib/sync/sync-runner.test.ts
git commit -m "feat(sync): flush accumulated price1-4/warehouse data after a fully successful run"
```

---

## Task 9: Point the CLI entrypoint at `GrinsXmlAdapter`

**Files:**
- Modify: `scripts/sync-products.ts`

**Interfaces:**
- Consumes: `GrinsXmlAdapter` (Task 7).
- Produces: none — this is the manual-trigger entrypoint (`triggeredBy: 'manual'`), no HTTP route involved (see Global Constraints — that's out of scope).

- [ ] **Step 1: Replace the adapter wiring**

Replace the full contents of `scripts/sync-products.ts`:

```ts
import { runSync } from '@/lib/sync/sync-runner'
import { prisma } from '@/lib/prisma'
import { GrinsXmlAdapter } from '@/lib/sync/adapters/grins-xml'

async function main() {
  const adapter = new GrinsXmlAdapter()

  try {
    const result = await runSync(adapter, prisma, 'manual')
    console.log(JSON.stringify({ event: 'sync_complete', ...result }))
    process.exit(result.status === 'completed' ? 0 : 1)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error(JSON.stringify({ event: 'sync_fatal', error: String(err) }))
  process.exit(1)
})
```

`GrinsXmlAdapter` reads its own config from `GRINS_FTPS_*` env vars (Task 5) at call time, so there's no `ERP_API_URL`/`ERP_API_KEY` precondition to check here anymore — `getFtpsConfigFromEnv()` throws a clear error if they're unset, which `main().catch(...)` already surfaces as `sync_fatal`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual smoke check (no real credentials needed)**

Run: `GRINS_FTPS_HOST= npx tsx scripts/sync-products.ts` (or however the project normally invokes this script — check `package.json` `scripts` for an existing alias first).
Expected: process exits 1, prints a `sync_fatal` JSON line whose `error` mentions `GRINS_FTPS_HOST` — confirms the script actually reaches `GrinsXmlAdapter.fetchPage()` and fails on missing config rather than on some earlier wiring mistake.

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-products.ts
git commit -m "chore(sync): point the manual sync CLI at GrinsXmlAdapter, drop the REST stub"
```

---

## Final verification

- [ ] Run: `npx vitest run` (full unit suite)
  Expected: all files pass.
- [ ] Run: `npm run typecheck`
  Expected: clean.
- [ ] Run: `npm run lint`
  Expected: clean.
- [ ] Confirm `RestPaginatedAdapter` (`lib/sync/adapters/rest-paginated.ts`) is now unused outside its own test — leave the file in place (it's a harmless dead stub, not worth a churny deletion in this plan) but do not wire it anywhere.
- [ ] Re-read the "Not in scope" list in Global Constraints and confirm none of it silently crept into a task — in particular, **do not** add `GRINS_FTPS_*` to `.env.local` or Vercel, and **do not** run this against production data, until the one-time `externalId` backfill (see Global Constraints) has its own reviewed plan.
