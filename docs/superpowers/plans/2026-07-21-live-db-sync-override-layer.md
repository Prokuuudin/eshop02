# Product Override-Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revive the dead `ProductOverride`/`getProductOverrides()` machinery in `lib/product-overrides-store.ts` so admin edits to `price`/`description`/etc. survive future ERP sync runs, instead of colliding with the same `Product` columns the sync's `ON CONFLICT DO UPDATE` overwrites.

**Architecture:** `Product.<field>` becomes a "base" value freely refreshed by sync. Admin edits are stored separately as a JSON map in the existing `KeyValueSetting` table (key `product-overrides`, one row for the whole catalog — same pattern already used for `deleted-products-archive`). Read paths merge `{ ...base, ...override[productId] }`, override wins per-field. `stock` is excluded from the override mechanism for synced products, since live inventory must always reflect the ERP-side value.

**Tech Stack:** TypeScript, Prisma (Postgres/Neon), Vitest.

## Global Constraints

- No Prisma migrations. Every change uses fields/tables that already exist (`KeyValueSetting`, `Product.externalId`).
- No new npm dependencies.
- Follow the existing `vi.mock('@/lib/prisma', ...)` mocking convention (see `lib/newsletter-store.test.ts`) — do not hit a real database in tests.
- This plan covers only `lib/product-overrides-store.ts` and its test file. The ERP adapter's real HTTP implementation and the checkout write-back call are **out of scope** — they depend on a REST contract that does not exist yet (see `docs/superpowers/specs/2026-07-21-live-db-multistore-sync-design.md`, "Открытые внешние зависимости"). Do not stub or invent that contract here.

---

## Task 1: Pure override-merge helper + regression test for the found collision

**Files:**
- Modify: `lib/product-overrides-store.ts`
- Create: `lib/product-overrides-store.test.ts`

**Interfaces:**
- Produces: `applyProductOverride(base: Product, override: ProductOverride | undefined): Product`, `mergeProductsWithOverrides(products: Product[], overrides: Record<string, ProductOverride>): Product[]` — both exported, pure, no I/O. Later tasks (3) wire these into the read paths.

- [ ] **Step 1: Write the failing tests**

Create `lib/product-overrides-store.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    keyValueSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
// Every name this test file will ever need across all 6 tasks is imported once,
// here, up front — later tasks add tests, not new import lines, to avoid
// duplicate-import churn on a single module specifier.
import {
  applyProductOverride,
  mergeProductsWithOverrides,
  getProductOverrides,
  getAdminProducts,
  upsertProductOverride,
  resetProductOverride,
  restoreDeletedProduct,
  type ProductOverride,
} from '@/lib/product-overrides-store'
import type { Product } from '@/data/products'

beforeEach(() => vi.clearAllMocks())

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    title: 'Base title',
    brand: 'Base brand',
    price: 100,
    description: 'Base description',
    rating: 4,
    category: 'hair',
    stock: 10,
    ...overrides,
  }
}

describe('applyProductOverride', () => {
  it('returns the base product unchanged when there is no override', () => {
    const base = makeProduct()
    expect(applyProductOverride(base, undefined)).toEqual(base)
  })

  it('lets an overridden field win over the base value while keeping other base fields', () => {
    const base = makeProduct({ price: 100, description: 'From ERP sync' })
    const override: ProductOverride = { price: 150 }
    const result = applyProductOverride(base, override)
    expect(result.price).toBe(150)
    expect(result.description).toBe('From ERP sync')
    expect(result.title).toBe(base.title)
  })

  it('regression: a sync-refreshed base price/description does not clobber an admin override', () => {
    // This is the exact collision found in the 2026-07-21 audit: upsert-products.ts
    // writes fresh price/description into the base Product row on every sync run.
    // The override layer must still show the admin's values afterwards.
    const freshBaseFromSync = makeProduct({ price: 999, description: 'Raw ERP HTML &amp; entities' })
    const adminOverride: ProductOverride = { price: 149.99, description: 'Curated local description' }
    const result = applyProductOverride(freshBaseFromSync, adminOverride)
    expect(result.price).toBe(149.99)
    expect(result.description).toBe('Curated local description')
  })
})

describe('mergeProductsWithOverrides', () => {
  it('applies each product\'s own override by id and leaves untouched products as-is', () => {
    const products = [makeProduct({ id: 'p1', price: 100 }), makeProduct({ id: 'p2', price: 200 })]
    const overrides: Record<string, ProductOverride> = { p1: { price: 111 } }
    const result = mergeProductsWithOverrides(products, overrides)
    expect(result.find((p) => p.id === 'p1')?.price).toBe(111)
    expect(result.find((p) => p.id === 'p2')?.price).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: FAIL — `applyProductOverride` and `mergeProductsWithOverrides` are not exported yet.

- [ ] **Step 3: Implement the helpers**

In `lib/product-overrides-store.ts`, immediately after the existing line `export type ProductOverride = Partial<Omit<Product, 'id'>>`, add:

```ts
export function applyProductOverride(base: Product, override: ProductOverride | undefined): Product {
  return override ? { ...base, ...override } : base
}

export function mergeProductsWithOverrides(
  products: Product[],
  overrides: Record<string, ProductOverride>
): Product[] {
  return products.map((p) => applyProductOverride(p, overrides[p.id]))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/product-overrides-store.ts lib/product-overrides-store.test.ts
git commit -m "feat(overrides): add pure override-merge helper with collision regression test"
```

---

## Task 2: Real override storage backed by KeyValueSetting

**Files:**
- Modify: `lib/product-overrides-store.ts`
- Modify: `lib/product-overrides-store.test.ts`

**Interfaces:**
- Consumes: nothing new (uses `prisma.keyValueSetting` already mocked in Task 1's test file).
- Produces: `getProductOverrides(): Promise<Record<string, ProductOverride>>` (real implementation, replaces the `return {}` stub) and an internal `writeOverridesMap(overrides: Record<string, ProductOverride>): Promise<void>`, both consumed by Task 4/5.

- [ ] **Step 1: Write the failing tests**

Add to `lib/product-overrides-store.test.ts` (`getProductOverrides` is already imported at the top of the file from Task 1):

```ts
describe('getProductOverrides', () => {
  it('returns {} when no override row exists yet', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    const result = await getProductOverrides()
    expect(result).toEqual({})
    expect(prisma.keyValueSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'product-overrides' } })
  })

  it('returns the parsed map from the KeyValueSetting row', async () => {
    const stored = { p1: { price: 149.99 }, p2: { description: 'Local text' } }
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: stored,
      updatedAt: new Date(),
    } as never)
    const result = await getProductOverrides()
    expect(result).toEqual(stored)
  })

  it('defensively returns {} if the stored value is not an object', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: 'not-an-object' as never,
      updatedAt: new Date(),
    } as never)
    const result = await getProductOverrides()
    expect(result).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: FAIL — current `getProductOverrides` always returns `{}` and never calls `prisma.keyValueSetting.findUnique`, so the second test's assertion on the returned map fails.

- [ ] **Step 3: Implement real storage**

In `lib/product-overrides-store.ts`, replace:

```ts
export const getProductOverrides = async (): Promise<Record<string, ProductOverride>> => {
  return {}
}
```

with:

```ts
const OVERRIDES_KEY = 'product-overrides'

export const getProductOverrides = async (): Promise<Record<string, ProductOverride>> => {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: OVERRIDES_KEY } })
  if (!row) return {}
  const parsed = row.value as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, ProductOverride>)
    : {}
}

const writeOverridesMap = async (overrides: Record<string, ProductOverride>): Promise<void> => {
  await prisma.keyValueSetting.upsert({
    where: { key: OVERRIDES_KEY },
    create: { key: OVERRIDES_KEY, value: overrides as unknown as Prisma.InputJsonValue },
    update: { value: overrides as unknown as Prisma.InputJsonValue },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/product-overrides-store.ts lib/product-overrides-store.test.ts
git commit -m "feat(overrides): back getProductOverrides with real KeyValueSetting storage"
```

---

## Task 3: Wire the merge into the product read paths

**Files:**
- Modify: `lib/product-overrides-store.ts`
- Modify: `lib/product-overrides-store.test.ts`

**Interfaces:**
- Consumes: `mergeProductsWithOverrides` (Task 1), `getProductOverrides` (Task 2).
- Produces: `getDbProducts`, `getDbProductsPaginated`, `getAdminProducts` now return override-merged products instead of raw base rows. Signatures unchanged — safe for existing callers (`getMergedProducts`, admin API routes, catalog service).

- [ ] **Step 1: Write the failing test**

Add to `lib/product-overrides-store.test.ts` (`getAdminProducts` is already imported at the top of the file from Task 1):

```ts
describe('getAdminProducts', () => {
  it('merges stored overrides into the base rows it reads from Product', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: 'p1',
        title: 'Base title',
        titleKey: null, titleEn: null, titleLv: null,
        description: 'Base description', brand: 'Base brand',
        price: 100, oldPrice: null, rating: 4, ratingCount: 0, reviewCount: 0,
        image: null, images: [], metaTitle: null, metaDescription: null, ogImage: null, ogAlt: null,
        badges: [], category: 'hair', stock: 10, isActive: true, barcode: null,
        relatedProductIds: [], oftenBoughtTogether: [], minOrderQuantities: null, technicalSpecs: null,
        bulkPricingTiers: null, demoVideo: null, distributorName: null, distributorAddress: null,
        sku: null, unitOfMeasure: null, certificates: [], packagingSize: null, compatibleEquipment: [],
        manufacturerName: null, manufacturerAddress: null, manufacturerEmail: null, distributorEmail: null,
        bonusRate: null, feature1: null, feature1En: null, feature1Lv: null,
        feature2: null, feature2En: null, feature2Lv: null, feature3: null, feature3En: null, feature3Lv: null,
        feature4: null, feature4En: null, feature4Lv: null, specVolume: null, specType: null, specCountry: null,
        isCustom: false, isDeleted: false, externalId: 'ext-1', lastSyncRunId: null,
        createdAt: new Date(), updatedAt: new Date(),
      } as never,
    ])
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: { p1: { price: 149.99 } },
      updatedAt: new Date(),
    } as never)

    const result = await getAdminProducts()
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(149.99)
    expect(result[0].title).toBe('Base title')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: FAIL — `getAdminProducts` does not currently read overrides, so `result[0].price` is `100`, not `149.99`.

If instead the test errors out with something like "Cannot read properties of null" or an AsyncLocalStorage/cache-related error, `react`'s `cache()` is refusing to run outside a request scope in this test environment. Fix by adding this mock at the top of the test file, before the `@/lib/product-overrides-store` import:

```ts
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}))
```

- [ ] **Step 3: Implement the wiring**

In `lib/product-overrides-store.ts`, replace the three read functions:

```ts
const getDbProducts = cache(async (): Promise<Product[]> => {
  const rows = await prisma.product.findMany({
    where: { isDeleted: false, isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(mapDbToProduct)
})

export async function getDbProductsPaginated(opts: {
  category?: string
  skip?: number
  take?: number
}): Promise<{ products: Product[]; total: number }> {
  const where = {
    isDeleted: false,
    isActive: true,
    ...(opts.category ? { category: opts.category } : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: opts.skip,
      take: opts.take,
    }),
    prisma.product.count({ where }),
  ])

  return { products: rows.map(mapDbToProduct), total }
}

export const getMergedProducts = cache(async (): Promise<Product[]> => {
  return getDbProducts()
})

// Для админки: без фильтра isActive, иначе скрытые товары нельзя ни увидеть, ни включить обратно.
export const getAdminProducts = cache(async (): Promise<Product[]> => {
  const rows = await prisma.product.findMany({ where: { isDeleted: false }, orderBy: { createdAt: 'desc' } })
  return rows.map(mapDbToProduct)
})
```

with:

```ts
const getDbProducts = cache(async (): Promise<Product[]> => {
  const [rows, overrides] = await Promise.all([
    prisma.product.findMany({
      where: { isDeleted: false, isActive: true },
      orderBy: { createdAt: 'desc' },
    }),
    getProductOverrides(),
  ])
  return mergeProductsWithOverrides(rows.map(mapDbToProduct), overrides)
})

// Примечание: category-фильтр ниже сравнивается с базовым (пред-override) значением
// Product.category на уровне SQL. Если admin когда-нибудь переопределит category
// конкретного товара через override, для пагинированного по категории списка он
// продолжит фильтроваться по старой базовой категории. Известное ограничение,
// не решается здесь — переопределение category встречается на практике крайне редко.
export async function getDbProductsPaginated(opts: {
  category?: string
  skip?: number
  take?: number
}): Promise<{ products: Product[]; total: number }> {
  const where = {
    isDeleted: false,
    isActive: true,
    ...(opts.category ? { category: opts.category } : {}),
  }
  const [rows, total, overrides] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: opts.skip,
      take: opts.take,
    }),
    prisma.product.count({ where }),
    getProductOverrides(),
  ])

  return { products: mergeProductsWithOverrides(rows.map(mapDbToProduct), overrides), total }
}

export const getMergedProducts = cache(async (): Promise<Product[]> => {
  return getDbProducts()
})

// Для админки: без фильтра isActive, иначе скрытые товары нельзя ни увидеть, ни включить обратно.
export const getAdminProducts = cache(async (): Promise<Product[]> => {
  const [rows, overrides] = await Promise.all([
    prisma.product.findMany({ where: { isDeleted: false }, orderBy: { createdAt: 'desc' } }),
    getProductOverrides(),
  ])
  return mergeProductsWithOverrides(rows.map(mapDbToProduct), overrides)
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/product-overrides-store.ts lib/product-overrides-store.test.ts
git commit -m "feat(overrides): merge stored overrides into all product read paths"
```

---

## Task 4: `upsertProductOverride` writes to the override store, blocks stock overrides on synced products

**Files:**
- Modify: `lib/product-overrides-store.ts`
- Modify: `lib/product-overrides-store.test.ts`

**Interfaces:**
- Consumes: `writeOverridesMap`, `getProductOverrides` (Task 2).
- Produces: `upsertProductOverride(productId: string, nextValues: Partial<Omit<Product,'id'>>): Promise<{success:true; products: Product[]} | {success:false; error:string}>` — same signature as before, new behavior. Consumed unchanged by `app/api/admin/products/route.ts` (PUT) and by Task 6 (`restoreDeletedProduct`).

- [ ] **Step 1: Write the failing tests**

Add to `lib/product-overrides-store.test.ts` (`upsertProductOverride` is already imported at the top of the file from Task 1):

```ts
describe('upsertProductOverride', () => {
  const baseDbProduct = {
    id: 'p1', isDeleted: false, externalId: null as string | null,
  }

  it('returns an error when the product does not exist', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    const result = await upsertProductOverride('missing', { price: 10 })
    expect(result.success).toBe(false)
  })

  it('writes the patch into the override map instead of updating the Product row', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(baseDbProduct as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await upsertProductOverride('p1', { price: 149.99, description: 'Local text' })

    expect(result.success).toBe(true)
    expect(prisma.product.update).not.toHaveBeenCalled()
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'product-overrides' },
        update: { value: { p1: { price: 149.99, description: 'Local text' } } },
      })
    )
  })

  it('merges into any existing overrides for the same product without dropping other fields', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(baseDbProduct as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: { p1: { description: 'Already overridden description' } },
      updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    await upsertProductOverride('p1', { price: 149.99 })

    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          value: { p1: { description: 'Already overridden description', price: 149.99 } },
        },
      })
    )
  })

  it('rejects a stock change on a synced product (externalId set)', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...baseDbProduct, externalId: 'ext-1' } as never)

    const result = await upsertProductOverride('p1', { stock: 5 })

    expect(result.success).toBe(false)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('allows a stock change on a manually created product (externalId null)', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...baseDbProduct, externalId: null } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await upsertProductOverride('p1', { stock: 5 })

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: FAIL — current implementation calls `prisma.product.update`, never `prisma.keyValueSetting.upsert`, and has no stock guard.

- [ ] **Step 3: Implement**

Replace the entire current `upsertProductOverride` function body (everything from `export const upsertProductOverride = async (` down to its closing `}`, including the now-dead `fieldMap` loop) with:

```ts
export const upsertProductOverride = async (
  productId: string,
  nextValues: Partial<Omit<Product, 'id'>>
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const dbProduct = await prisma.product.findUnique({ where: { id: productId } })
  if (!dbProduct || dbProduct.isDeleted) return { success: false, error: 'Товар не найден' }

  if (dbProduct.externalId !== null && 'stock' in nextValues) {
    return {
      success: false,
      error: 'Остаток синхронизируемого товара нельзя менять вручную — источник истины живая БД',
    }
  }

  const normalizedPatch = normalizeProductPatch(nextValues)
  if (Object.keys(normalizedPatch).length > 0) {
    const overrides = await getProductOverrides()
    overrides[productId] = { ...overrides[productId], ...normalizedPatch }
    await writeOverridesMap(overrides)
  }

  return { success: true, products: await getAdminProducts() }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/product-overrides-store.ts lib/product-overrides-store.test.ts
git commit -m "feat(overrides): write admin edits to override store, block stock override on synced products"
```

---

## Task 5: `resetProductOverride` actually resets

**Files:**
- Modify: `lib/product-overrides-store.ts`
- Modify: `lib/product-overrides-store.test.ts`

**Interfaces:**
- Consumes: `getProductOverrides`, `writeOverridesMap` (Task 2).
- Produces: `resetProductOverride(productId: string): Promise<{success:true; products: Product[]} | {success:false; error:string}>` — same signature, now does real work. Consumed unchanged by `app/api/admin/products/route.ts` (DELETE, non-`permanently` branch).

- [ ] **Step 1: Write the failing tests**

Add to `lib/product-overrides-store.test.ts` (`resetProductOverride` is already imported at the top of the file from Task 1):

```ts
describe('resetProductOverride', () => {
  it('returns an error when the product does not exist', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    const result = await resetProductOverride('missing')
    expect(result.success).toBe(false)
  })

  it('removes the product\'s override entry and persists the rest of the map', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ id: 'p1', isDeleted: false } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: { p1: { price: 149.99 }, p2: { description: 'Keep me' } },
      updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await resetProductOverride('p1')

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: { p2: { description: 'Keep me' } } } })
    )
  })

  it('is a safe no-op when the product has no existing override', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ id: 'p1', isDeleted: false } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await resetProductOverride('p1')

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: FAIL — current implementation never touches `keyValueSetting`, so the "removes the entry" assertion fails.

- [ ] **Step 3: Implement**

Replace the current `resetProductOverride` function:

```ts
export const resetProductOverride = async (
  productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const adminProducts = await getAdminProducts()
  if (!adminProducts.some((p) => p.id === productId)) return { success: false, error: 'Товар не найден' }
  return { success: true, products: adminProducts }
}
```

with:

```ts
export const resetProductOverride = async (
  productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const dbProduct = await prisma.product.findUnique({ where: { id: productId } })
  if (!dbProduct || dbProduct.isDeleted) return { success: false, error: 'Товар не найден' }

  const overrides = await getProductOverrides()
  if (productId in overrides) {
    delete overrides[productId]
    await writeOverridesMap(overrides)
  }

  return { success: true, products: await getAdminProducts() }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/product-overrides-store.ts lib/product-overrides-store.test.ts
git commit -m "fix(overrides): resetProductOverride now actually clears the stored override"
```

---

## Task 6: Fix `restoreDeletedProduct` so it never reintroduces a stock override

**Files:**
- Modify: `lib/product-overrides-store.ts`
- Modify: `lib/product-overrides-store.test.ts`

**Context:** `restoreDeletedProduct` restores a soft-deleted, ERP-synced product by diffing the archived snapshot against the current base row (`buildOverrideFromSnapshot`) and re-applying the diff via `upsertProductOverride`. Since the archived snapshot's `stock` will almost always differ from the current base `stock` (it changes every sync run), this diff would include `stock` — which Task 4's guard now rejects outright for synced products, breaking restore entirely. `stock` must be dropped from the reconstructed diff before it reaches `upsertProductOverride`; the live base stock should show through regardless of what the archived snapshot had.

**Interfaces:**
- Consumes: `upsertProductOverride` (Task 4), existing `buildOverrideFromSnapshot`.
- Produces: no signature change to `restoreDeletedProduct`.

- [ ] **Step 1: Write the failing test**

Add to `lib/product-overrides-store.test.ts`. Note the fixture deliberately differs from the live row on **two** fields (`price` and `stock`), not just `stock` — if only `stock` differed, stripping it would leave an empty patch, `upsertProductOverride` would never be called, and the test would pass vacuously regardless of whether the fix is correct:

`restoreDeletedProduct` is already imported at the top of the file from Task 1:

```ts
describe('restoreDeletedProduct', () => {
  it('restores a synced product without reintroducing stock as an override', async () => {
    const archivedProduct = {
      id: 'p1', title: 'Base title', brand: 'Base brand', price: 139.99,
      rating: 4, category: 'hair' as const, stock: 3,
    }

    vi.mocked(prisma.keyValueSetting.findUnique).mockImplementation(async (args: unknown) => {
      const key = (args as { where: { key: string } }).where.key
      if (key === 'deleted-products-archive') {
        return {
          key,
          value: [{ id: 'p1', product: archivedProduct, source: 'base', deletedAt: new Date().toISOString() }],
          updatedAt: new Date(),
        } as never
      }
      return null // 'product-overrides' key: no pre-existing overrides
    })

    vi.mocked(prisma.product.update).mockResolvedValue({} as never)
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'p1', isDeleted: false, externalId: 'ext-1',
      title: 'Base title', brand: 'Base brand', price: 149.99, // live price has moved on since archiving
      rating: 4, category: 'hair', stock: 25, // live stock has moved on since archiving
      titleKey: null, titleEn: null, titleLv: null, description: null, oldPrice: null,
      ratingCount: 0, reviewCount: 0, image: null, images: [], metaTitle: null, metaDescription: null,
      ogImage: null, ogAlt: null, badges: [], isActive: true, barcode: null, relatedProductIds: [],
      oftenBoughtTogether: [], minOrderQuantities: null, technicalSpecs: null, bulkPricingTiers: null,
      demoVideo: null, distributorName: null, distributorAddress: null, sku: null, unitOfMeasure: null,
      certificates: [], packagingSize: null, compatibleEquipment: [], manufacturerName: null,
      manufacturerAddress: null, manufacturerEmail: null, distributorEmail: null, bonusRate: null,
      feature1: null, feature1En: null, feature1Lv: null, feature2: null, feature2En: null, feature2Lv: null,
      feature3: null, feature3En: null, feature3Lv: null, feature4: null, feature4En: null, feature4Lv: null,
      specVolume: null, specType: null, specCountry: null, isCustom: false, lastSyncRunId: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.keyValueSetting.upsert).mockResolvedValue({} as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await restoreDeletedProduct('p1')

    expect(result.success).toBe(true)

    // buildOverrideFromSnapshot sees both price (139.99 vs 149.99) and stock (3 vs 25)
    // differ, so the override write must have happened — find it and check its contents.
    const upsertCalls = vi.mocked(prisma.keyValueSetting.upsert).mock.calls
    const overridesWrite = upsertCalls.find((c) => (c[0] as { where: { key: string } }).where.key === 'product-overrides')
    expect(overridesWrite).toBeDefined()

    const written = (overridesWrite![0] as { update: { value: Record<string, ProductOverride> } }).update.value
    expect(written.p1?.price).toBe(139.99)
    expect(written.p1?.stock).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: FAIL — `buildOverrideFromSnapshot` includes both `price` and `stock` in the diff today, and nothing strips `stock` before calling `upsertProductOverride`. Task 4's stock-guard then rejects the entire call (because the patch still contains `stock` and the product's `externalId` is set), so no override ever gets written — `overridesWrite` comes back `undefined` and `expect(overridesWrite).toBeDefined()` fails.

- [ ] **Step 3: Implement the fix**

In `lib/product-overrides-store.ts`, inside `restoreDeletedProduct`, find:

```ts
    const dbProduct = await prisma.product.findUnique({ where: { id: nextId } })
    if (dbProduct) {
      const baseProduct = mapDbToProduct(dbProduct)
      const overridePatch = buildOverrideFromSnapshot(baseProduct, archived.product)
      if (Object.keys(overridePatch).length > 0) {
        await upsertProductOverride(nextId, overridePatch)
      }
    }
```

Replace with:

```ts
    const dbProduct = await prisma.product.findUnique({ where: { id: nextId } })
    if (dbProduct) {
      const baseProduct = mapDbToProduct(dbProduct)
      const overridePatch = buildOverrideFromSnapshot(baseProduct, archived.product)
      // Stock is never restored as an override — live inventory always wins,
      // regardless of what the archived snapshot happened to hold.
      delete overridePatch.stock
      if (Object.keys(overridePatch).length > 0) {
        await upsertProductOverride(nextId, overridePatch)
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/product-overrides-store.ts lib/product-overrides-store.test.ts
git commit -m "fix(overrides): never reintroduce stock as an override when restoring a deleted product"
```

---

## Task 7: Diff `upsertProductOverride` against the current merged value (added after final whole-branch review)

**Why this task exists:** The final whole-branch review (after Tasks 1-6) traced `upsertProductOverride` against the real, unmodified admin form (`lib/product-form-mapping.ts`, `mapFormValuesToProductPatch`) and found it always submits a full-record snapshot, not a per-field diff — `stock` is present unconditionally (`stock: values.stock`, no `|| undefined` guard), and most other fields are present whenever the form field is non-empty. Two consequences, both confirmed by direct code inspection:

1. **Critical (latent until the ERP adapter goes live):** Task 4's stock-guard (`'stock' in nextValues`) is presence-based. Once `externalId` gets populated by a real sync, saving the admin form for *any* synced product always includes `stock`, so the guard rejects the entire save — no field could ever be edited on a synced product again.
2. **Important:** because the form resubmits a near-full snapshot, the first time an admin touches *any* field on a synced product, every other field the form carries gets merged into the override map too — not just the field actually changed. This defeats the design's core promise (per-field: only touched fields freeze, everything else stays fresh from sync).

Both are fixed by diffing `nextValues` against the product's current *merged* (base + existing override) value inside `upsertProductOverride`, before the stock-guard check, so the guard and the override write only ever see fields that actually changed relative to what the admin currently sees. This requires no change to the admin form, API route, or any other caller.

**Files:**
- Modify: `lib/product-overrides-store.ts`
- Modify: `lib/product-overrides-store.test.ts`

**Interfaces:**
- Consumes: `applyProductOverride`, `mapDbToProduct` (existing), `getProductOverrides`/`writeOverridesMap` (Task 2), the existing `buildOverrideFromSnapshot` (widened, see below).
- Produces: `upsertProductOverride` — same external signature and return shape, changed internal behavior (diffs before storing/guarding). `buildOverrideFromSnapshot`'s second parameter type widens from `Product` to `Partial<Product>` — its only other caller, `restoreDeletedProduct`, passes a full `Product` (`archived.product`), which remains valid under the wider type, so this is a non-breaking change to that caller.

- [ ] **Step 1: Write the failing tests**

Add to `lib/product-overrides-store.test.ts` (all names used below are already imported at the top of the file):

```ts
describe('upsertProductOverride — diffing against the current merged value', () => {
  const syncedDbProduct = { id: 'p1', isDeleted: false, externalId: 'ext-1' }

  it('does not reject or store stock when the form resubmits the same stock value it was shown', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...syncedDbProduct, stock: 25 } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    // Full-form-style patch: stock is present, but unchanged from the live value (25).
    const result = await upsertProductOverride('p1', { stock: 25, price: 149.99 })

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: { p1: { price: 149.99 } } } })
    )
  })

  it('still rejects when stock is genuinely different from the live value on a synced product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...syncedDbProduct, stock: 25 } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)

    const result = await upsertProductOverride('p1', { stock: 5 })

    expect(result.success).toBe(false)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('does not freeze unrelated fields that the form resubmitted unchanged', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      ...syncedDbProduct, stock: 25, title: 'Base title', brand: 'Base brand',
    } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    // Simulates a full-form save where only price actually changed.
    const result = await upsertProductOverride('p1', {
      title: 'Base title', brand: 'Base brand', stock: 25, price: 149.99,
    })

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: { p1: { price: 149.99 } } } })
    )
  })

  it('re-affirming an already-overridden field with the same value is a harmless no-op write', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...syncedDbProduct, stock: 25 } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: { p1: { price: 149.99 } },
      updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await upsertProductOverride('p1', { price: 149.99 })

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: FAIL — today's implementation stores whatever is in `nextValues` verbatim (no diff against the current merged value), so:
- Test 1 fails: the current stock-guard rejects the call outright because `'stock' in nextValues` is true, regardless of whether 25 equals the live value.
- Test 3 fails: `title`/`brand`/`stock` would all be written into the override map alongside `price`, not just `price`.
- Test 4 fails: `keyValueSetting.upsert` gets called even though nothing actually changed.

- [ ] **Step 3: Widen `buildOverrideFromSnapshot` and rewrite `upsertProductOverride`**

In `lib/product-overrides-store.ts`, change:

```ts
const buildOverrideFromSnapshot = (base: Product, snapshot: Product): ProductOverride => {
```

to:

```ts
const buildOverrideFromSnapshot = (base: Product, snapshot: Partial<Product>): ProductOverride => {
```

(The function body is unchanged — it already only reads `Object.keys(snapshot)` and indexes into both objects, so it works identically over a partial object. Its existing caller, `restoreDeletedProduct`, passes a full `Product` — still valid under the wider parameter type.)

Then replace the current `upsertProductOverride` function body:

```ts
export const upsertProductOverride = async (
  productId: string,
  nextValues: Partial<Omit<Product, 'id'>>
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const dbProduct = await prisma.product.findUnique({ where: { id: productId } })
  if (!dbProduct || dbProduct.isDeleted) return { success: false, error: 'Товар не найден' }

  if (dbProduct.externalId !== null && 'stock' in nextValues) {
    return {
      success: false,
      error: 'Остаток синхронизируемого товара нельзя менять вручную — источник истины живая БД',
    }
  }

  const normalizedPatch = normalizeProductPatch(nextValues)
  if (Object.keys(normalizedPatch).length > 0) {
    const overrides = await getProductOverrides()
    overrides[productId] = { ...overrides[productId], ...normalizedPatch }
    await writeOverridesMap(overrides)
  }

  return { success: true, products: await getAdminProducts() }
}
```

with:

```ts
export const upsertProductOverride = async (
  productId: string,
  nextValues: Partial<Omit<Product, 'id'>>
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const dbProduct = await prisma.product.findUnique({ where: { id: productId } })
  if (!dbProduct || dbProduct.isDeleted) return { success: false, error: 'Товар не найден' }

  const normalizedPatch = normalizeProductPatch(nextValues)
  const overrides = await getProductOverrides()
  // Callers (the admin form) resend a near-full product snapshot on every save, not a
  // per-field diff. Diffing against what the admin currently sees (base + existing
  // override) before storing/guarding means: (1) resubmitting an unchanged field never
  // freezes it as an override, and (2) the stock-guard below only fires on a genuine
  // stock change, not merely because the form happened to include the field.
  const currentMerged = applyProductOverride(mapDbToProduct(dbProduct), overrides[productId])
  const changedFields = buildOverrideFromSnapshot(currentMerged, normalizedPatch)

  if (dbProduct.externalId !== null && 'stock' in changedFields) {
    return {
      success: false,
      error: 'Остаток синхронизируемого товара нельзя менять вручную — источник истины живая БД',
    }
  }

  if (Object.keys(changedFields).length > 0) {
    overrides[productId] = { ...overrides[productId], ...changedFields }
    await writeOverridesMap(overrides)
  }

  return { success: true, products: await getAdminProducts() }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: PASS (22 tests: 18 from Tasks 1-6 + 4 new)

Also run `npm run typecheck` — confirm the `buildOverrideFromSnapshot` signature widening doesn't break its existing call site in `restoreDeletedProduct`, and run the full suite once (`npx vitest run`) to confirm nothing else regresses.

- [ ] **Step 5: Commit**

```bash
git add lib/product-overrides-store.ts lib/product-overrides-store.test.ts
git commit -m "fix(overrides): diff admin patches against the current merged value

Fixes a gap found in final review: the admin form resubmits a near-full
product snapshot on every save, not a per-field diff. Without diffing,
the stock-guard rejected every save on synced products (stock is always
present), and every other resubmitted field got frozen as an override
even when unchanged."
```

---

## Final Verification

- [ ] Run the full test suite: `npx vitest run` — expect no regressions elsewhere (the read-path signature changes in Task 3 are the widest-reaching; `catalog-service.test.ts` already mocks `@/lib/product-overrides-store` wholesale, so it's unaffected).
- [ ] Run `npm run typecheck` — confirm no type errors from the removed `fieldMap` block or the new function signatures.
- [ ] Manually confirm in the admin UI (see the `verify` skill / dev server) that: editing a product's price/description sticks, "reset" (non-permanent delete) actually reverts to the base value, and a manually created product (no `externalId`) still allows editing `stock`.

## Out of Scope / Follow-up

Per `docs/superpowers/specs/2026-07-21-live-db-multistore-sync-design.md`: implementing `RestPaginatedAdapter.fetchPage()` against the real REST contract, the write-back checkout call, the `SYNC_PULL_ENABLED`/`SYNC_WRITEBACK_ENABLED` feature flags, and the hourly cron re-enable are a separate follow-up plan, written once the live DB's actual API contract is obtained from its owner.
