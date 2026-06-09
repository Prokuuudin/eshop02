# ERP Product Sync (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build sync infrastructure that pulls products from an external ERP API into Neon PostgreSQL via a two-phase upsert strategy with a full audit trail via SyncRun.

**Architecture:** Two phases per run: (1) fetch + upsert products while marking each with the current `runId`; (2) deactivate products whose `lastSyncRunId` doesn't match the current run (absent from ERP). `ErpAdapter` interface decouples sync logic from the specific ERP API format. GitHub Actions cron triggers the sync every 6 hours.

**Tech Stack:** Node.js 20, TypeScript, tsx, Prisma 7 + pg (Neon PostgreSQL), Vitest (unit tests with `globals: true`), GitHub Actions

---

## File Map

**Create:**
- `lib/sync/erp-adapter.ts` — `ErpProduct`, `ErpFetchResult`, `ErpAdapter` interface
- `lib/sync/adapters/rest-paginated.ts` — placeholder implementation (stub until real ERP API format known)
- `lib/sync/logger.ts` — `SyncLogger`: structured console output + 10-entry `errorSample` cap
- `lib/sync/logger.test.ts`
- `lib/sync/retry.ts` — `withRetry` with exponential backoff
- `lib/sync/retry.test.ts`
- `lib/sync/upsert-products.ts` — raw SQL `INSERT ... ON CONFLICT` batch upsert
- `lib/sync/upsert-products.test.ts`
- `lib/sync/deactivate-missing.ts` — raw SQL `UPDATE isActive=false WHERE lastSyncRunId != runId`
- `lib/sync/deactivate-missing.test.ts`
- `lib/sync/sync-runner.ts` — orchestrates SyncRun lifecycle, fetch loop, retry, deactivation
- `lib/sync/sync-runner.test.ts`
- `scripts/sync-products.ts` — entry point for GitHub Actions
- `.github/workflows/sync-products.yml`

**Modify:**
- `prisma/schema.prisma` — add `externalId`/`isActive`/`lastSyncRunId` to `Product` + add `SyncRun` model
- `lib/product-overrides-store.ts:148,159` — add `isActive: true` to catalog `where` clauses

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add sync fields to Product model**

In `prisma/schema.prisma`, find the `Product` model. Add these 3 fields immediately before the closing `}` of the model, after the existing `@@index` lines:

```prisma
  externalId    String?  @unique
  isActive      Boolean  @default(true)
  lastSyncRunId String?

  @@index([externalId])
  @@index([isActive])
  @@index([lastSyncRunId])
```

- [ ] **Step 2: Add SyncRun model**

Append this model at the end of `prisma/schema.prisma`:

```prisma
model SyncRun {
  id             String    @id @default(cuid())
  startedAt      DateTime  @default(now())
  finishedAt     DateTime?
  status         String    @default("running")
  productsTotal  Int       @default(0)
  productsSynced Int       @default(0)
  variantsSynced Int       @default(0)
  deactivated    Int       @default(0)
  errorCount     Int       @default(0)
  errorSample    Json?
  triggeredBy    String    @default("cron")

  @@index([status])
  @@index([startedAt])
}
```

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name add_product_sync_fields_and_sync_run
```

Expected output contains:
```
Applying migration `..._add_product_sync_fields_and_sync_run`
```

- [ ] **Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Product sync fields (externalId, isActive, lastSyncRunId) and SyncRun model"
```

---

## Task 2: ErpAdapter interface + placeholder adapter

**Files:**
- Create: `lib/sync/erp-adapter.ts`
- Create: `lib/sync/adapters/rest-paginated.ts`

- [ ] **Step 1: Create `lib/sync/erp-adapter.ts`**

```typescript
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

export interface ErpFetchResult {
  products: ErpProduct[]
  hasMore: boolean
  nextCursor?: string | number
}

export interface ErpAdapter {
  readonly name: string
  fetchPage(cursor?: string | number): Promise<ErpFetchResult>
  fetchAllIds?(): Promise<string[]>
}
```

- [ ] **Step 2: Create `lib/sync/adapters/rest-paginated.ts`**

```typescript
import type { ErpAdapter, ErpFetchResult } from '../erp-adapter'

export class RestPaginatedAdapter implements ErpAdapter {
  readonly name = 'rest-paginated'

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly pageSize = 100,
  ) {}

  async fetchPage(_cursor?: string | number): Promise<ErpFetchResult> {
    // TODO: implement when real ERP API format is known.
    // Replace this stub with actual HTTP fetch + ErpProduct mapping.
    throw new Error(
      'RestPaginatedAdapter.fetchPage: not implemented. Implement ErpProduct mapping for your ERP API.',
    )
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/sync/
git commit -m "feat: ErpAdapter interface and placeholder RestPaginatedAdapter"
```

---

## Task 3: SyncLogger

**Files:**
- Create: `lib/sync/logger.ts`
- Create: `lib/sync/logger.test.ts`

- [ ] **Step 1: Write failing test in `lib/sync/logger.test.ts`**

```typescript
import { SyncLogger } from './logger'

describe('SyncLogger', () => {
  it('errorSample is capped at 10 entries', () => {
    const logger = new SyncLogger()
    for (let i = 0; i < 15; i++) {
      logger.recordBatchError(i, new Error(`err ${i}`))
    }
    expect(logger.getErrorSample()).toHaveLength(10)
  })

  it('errorCount reflects all errors including those beyond cap', () => {
    const logger = new SyncLogger()
    for (let i = 0; i < 15; i++) {
      logger.recordBatchError(i, new Error(`err ${i}`))
    }
    expect(logger.getErrorCount()).toBe(15)
  })

  it('errorSample entry includes batch index, message, and productIds', () => {
    const logger = new SyncLogger()
    logger.recordBatchError(3, new Error('db timeout'), ['ext-1', 'ext-2'])
    expect(logger.getErrorSample()[0]).toMatchObject({
      batch: 3,
      message: 'db timeout',
      productIds: ['ext-1', 'ext-2'],
    })
  })
})
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
npx vitest run lib/sync/logger.test.ts
```

Expected: FAIL with `Cannot find module './logger'`

- [ ] **Step 3: Create `lib/sync/logger.ts`**

```typescript
export interface SyncError {
  batch: number
  message: string
  productIds?: string[]
}

export class SyncLogger {
  private errors: SyncError[] = []
  private count = 0

  info(message: string, data?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'info', message, ...data, ts: new Date().toISOString() }))
  }

  error(message: string, data?: Record<string, unknown>): void {
    console.error(JSON.stringify({ level: 'error', message, ...data, ts: new Date().toISOString() }))
  }

  recordBatchError(batch: number, err: unknown, productIds?: string[]): void {
    this.count++
    if (this.errors.length < 10) {
      this.errors.push({
        batch,
        message: err instanceof Error ? err.message : String(err),
        productIds,
      })
    }
  }

  getErrorCount(): number {
    return this.count
  }

  getErrorSample(): SyncError[] {
    return this.errors
  }
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
npx vitest run lib/sync/logger.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sync/logger.ts lib/sync/logger.test.ts
git commit -m "feat: SyncLogger with 10-entry errorSample cap"
```

---

## Task 4: withRetry utility

**Files:**
- Create: `lib/sync/retry.ts`
- Create: `lib/sync/retry.test.ts`

- [ ] **Step 1: Write failing tests in `lib/sync/retry.test.ts`**

```typescript
import { withRetry } from './retry'

describe('withRetry', () => {
  it('returns result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and returns on eventual success', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValueOnce('ok')
    const result = await withRetry(fn, { baseDelayMs: 0 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws the last error after maxAttempts exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'))
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('always fail')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('applies exponential backoff between attempts', async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok')
    const promise = withRetry(fn, { baseDelayMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise
    expect(result).toBe('ok')
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
npx vitest run lib/sync/retry.test.ts
```

Expected: FAIL with `Cannot find module './retry'`

- [ ] **Step 3: Create `lib/sync/retry.ts`**

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000 } = options
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await sleep(baseDelayMs * Math.pow(2, attempt - 1))
      }
    }
  }

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
npx vitest run lib/sync/retry.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sync/retry.ts lib/sync/retry.test.ts
git commit -m "feat: withRetry with exponential backoff"
```

---

## Task 5: upsertProducts (batch raw SQL)

**Files:**
- Create: `lib/sync/upsert-products.ts`
- Create: `lib/sync/upsert-products.test.ts`

**Key design:** Each product row needs 14 columns. For 200 products, that's 2800 positional params (`$1..$2800`) in a single `INSERT ... ON CONFLICT` — one DB round-trip per batch. ERP-owned fields are updated on conflict; shop-owned fields (`id`, `createdAt`, `rating`, etc.) are never touched by the sync.

- [ ] **Step 1: Write failing tests in `lib/sync/upsert-products.test.ts`**

```typescript
import { upsertProducts, buildUpsertQuery, COLS_PER_ROW } from './upsert-products'
import type { PrismaClient } from '@/generated/prisma/client'

function makeMockDb(): PrismaClient {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(2),
  } as unknown as PrismaClient
}

describe('buildUpsertQuery', () => {
  it('generates the correct last positional param for N rows', () => {
    const sql = buildUpsertQuery(3)
    expect(sql).toContain(`$${3 * COLS_PER_ROW}`)
  })

  it('contains ON CONFLICT on externalId', () => {
    expect(buildUpsertQuery(1)).toContain('ON CONFLICT ("externalId")')
  })

  it('DO UPDATE SET includes ERP-owned fields', () => {
    const updatePart = buildUpsertQuery(1).split('DO UPDATE SET')[1]
    expect(updatePart).toContain('"lastSyncRunId"')
    expect(updatePart).toContain('"isActive"')
    expect(updatePart).toContain('price')
    expect(updatePart).toContain('stock')
  })

  it('DO UPDATE SET does not include id or createdAt', () => {
    const updatePart = buildUpsertQuery(1).split('DO UPDATE SET')[1]
    expect(updatePart).not.toMatch(/\bid\b\s*=/)
    expect(updatePart).not.toContain('"createdAt"')
  })
})

describe('upsertProducts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 0 and skips the query for empty input', async () => {
    const db = makeMockDb()
    const count = await upsertProducts(db, [], 'run-1')
    expect(count).toBe(0)
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled()
  })

  it('returns count of products and calls $executeRawUnsafe once', async () => {
    const db = makeMockDb()
    const products = [
      { externalId: 'ext-1', title: 'Prod A', price: 100, stock: 10 },
      { externalId: 'ext-2', title: 'Prod B', price: 200, stock: 5 },
    ]
    const count = await upsertProducts(db, products, 'run-1')
    expect(count).toBe(2)
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it('includes the runId in query params', async () => {
    const db = makeMockDb()
    await upsertProducts(db, [{ externalId: 'e1', title: 'P', price: 10, stock: 1 }], 'my-run-id')
    const args = (db.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(args).toContain('my-run-id')
  })
})
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
npx vitest run lib/sync/upsert-products.test.ts
```

Expected: FAIL with `Cannot find module './upsert-products'`

- [ ] **Step 3: Create `lib/sync/upsert-products.ts`**

```typescript
import { randomUUID } from 'crypto'
import type { PrismaClient } from '@/generated/prisma/client'
import type { ErpProduct } from './erp-adapter'

// Columns per product row in the INSERT statement.
// Order must match buildParams exactly.
export const COLS_PER_ROW = 14

export function buildUpsertQuery(rowCount: number): string {
  const values = Array.from({ length: rowCount }, (_, i) => {
    const base = i * COLS_PER_ROW
    const params = Array.from({ length: COLS_PER_ROW }, (_, j) => `$${base + j + 1}`)
    return `(${params.join(',')})`
  }).join(',')

  return `
    INSERT INTO "Product" (
      id, "externalId", title, brand, category,
      price, "oldPrice", stock, sku, images,
      description, "isActive", "lastSyncRunId", "updatedAt"
    ) VALUES ${values}
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
  `
}

function buildParams(products: ErpProduct[], runId: string): unknown[] {
  return products.flatMap(p => [
    randomUUID(),           // id (new UUID for new rows; ignored on conflict)
    p.externalId,           // externalId
    p.title,                // title
    p.brand ?? '',          // brand
    p.category ?? 'uncategorized', // category
    p.price,                // price
    p.oldPrice ?? null,     // oldPrice
    p.stock,                // stock
    p.sku ?? null,          // sku
    p.images ?? null,       // images (TEXT[], nullable)
    p.description ?? null,  // description
    true,                   // isActive
    runId,                  // lastSyncRunId
    new Date(),             // updatedAt (createdAt uses DB DEFAULT for new rows)
  ])
}

export async function upsertProducts(
  db: PrismaClient,
  products: ErpProduct[],
  runId: string,
): Promise<number> {
  if (products.length === 0) return 0
  const sql = buildUpsertQuery(products.length)
  const params = buildParams(products, runId)
  await db.$executeRawUnsafe(sql, ...params)
  return products.length
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
npx vitest run lib/sync/upsert-products.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sync/upsert-products.ts lib/sync/upsert-products.test.ts
git commit -m "feat: upsertProducts — raw SQL batch INSERT ON CONFLICT for ERP sync"
```

---

## Task 6: deactivateMissing

**Files:**
- Create: `lib/sync/deactivate-missing.ts`
- Create: `lib/sync/deactivate-missing.test.ts`

- [ ] **Step 1: Write failing tests in `lib/sync/deactivate-missing.test.ts`**

```typescript
import { deactivateMissing } from './deactivate-missing'
import type { PrismaClient } from '@/generated/prisma/client'

function makeMockDb(rowCount: number): PrismaClient {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(rowCount),
  } as unknown as PrismaClient
}

describe('deactivateMissing', () => {
  it('returns the number of rows affected', async () => {
    const count = await deactivateMissing(makeMockDb(7), 'run-1')
    expect(count).toBe(7)
  })

  it('passes runId as a query parameter', async () => {
    const db = makeMockDb(0)
    await deactivateMissing(db, 'run-abc')
    const args = (db.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(args).toContain('run-abc')
  })

  it('SQL targets only products with externalId (skips manual products)', async () => {
    const db = makeMockDb(0)
    await deactivateMissing(db, 'run-1')
    const sql = (db.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(sql).toContain('"externalId" IS NOT NULL')
  })

  it('SQL deactivates products whose lastSyncRunId does not match', async () => {
    const db = makeMockDb(0)
    await deactivateMissing(db, 'run-1')
    const sql = (db.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(sql).toContain('"lastSyncRunId"')
    expect(sql).toContain('$1')
  })
})
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
npx vitest run lib/sync/deactivate-missing.test.ts
```

Expected: FAIL with `Cannot find module './deactivate-missing'`

- [ ] **Step 3: Create `lib/sync/deactivate-missing.ts`**

```typescript
import type { PrismaClient } from '@/generated/prisma/client'

export async function deactivateMissing(db: PrismaClient, runId: string): Promise<number> {
  const affected = await db.$executeRawUnsafe(
    `UPDATE "Product"
     SET "isActive" = false, "updatedAt" = now()
     WHERE "externalId" IS NOT NULL
       AND ("lastSyncRunId" IS NULL OR "lastSyncRunId" != $1)`,
    runId,
  )
  return affected
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
npx vitest run lib/sync/deactivate-missing.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sync/deactivate-missing.ts lib/sync/deactivate-missing.test.ts
git commit -m "feat: deactivateMissing — soft-deactivate products absent from current sync run"
```

---

## Task 7: SyncRunner

**Files:**
- Create: `lib/sync/sync-runner.ts`
- Create: `lib/sync/sync-runner.test.ts`

**Dependency injection:** `db: PrismaClient` is passed as a parameter so tests inject a mock without module-level mocking of `@/lib/prisma`.

- [ ] **Step 1: Write failing tests in `lib/sync/sync-runner.test.ts`**

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./retry', () => ({
  withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}))

vi.mock('./upsert-products', () => ({
  upsertProducts: vi.fn().mockResolvedValue(0),
}))

vi.mock('./deactivate-missing', () => ({
  deactivateMissing: vi.fn().mockResolvedValue(0),
}))

import { runSync } from './sync-runner'
import { upsertProducts } from './upsert-products'
import { deactivateMissing } from './deactivate-missing'
import type { ErpAdapter } from './erp-adapter'
import type { PrismaClient } from '@/generated/prisma/client'

function makeMockDb(): PrismaClient {
  return {
    syncRun: {
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaClient
}

function makeAdapter(products: object[] = [], hasMore = false): ErpAdapter {
  return {
    name: 'test',
    fetchPage: vi.fn().mockResolvedValue({ products, hasMore, nextCursor: undefined }),
  }
}

describe('runSync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates SyncRun with status "running"', async () => {
    const db = makeMockDb()
    await runSync(makeAdapter(), db)
    expect(db.syncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'running' }) }),
    )
  })

  it('returns completed status when all pages fetched successfully', async () => {
    const result = await runSync(makeAdapter(), makeMockDb())
    expect(result.status).toBe('completed')
  })

  it('throws when another sync is actively running', async () => {
    const db = makeMockDb()
    ;(db.syncRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing-run' })
    await expect(runSync(makeAdapter(), db)).rejects.toThrow('already running')
  })

  it('marks stale running syncs (> 30 min) as failed before starting', async () => {
    const db = makeMockDb()
    await runSync(makeAdapter(), db)
    expect(db.syncRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'running' }) }),
    )
  })

  it('calls upsertProducts with product batch and current runId', async () => {
    const products = [
      { externalId: 'e1', title: 'P1', price: 100, stock: 1 },
      { externalId: 'e2', title: 'P2', price: 200, stock: 2 },
    ]
    await runSync(makeAdapter(products), makeMockDb())
    expect(upsertProducts).toHaveBeenCalledWith(expect.anything(), products, 'run-1')
  })

  it('calls deactivateMissing after all pages are fetched', async () => {
    await runSync(makeAdapter(), makeMockDb())
    expect(deactivateMissing).toHaveBeenCalledWith(expect.anything(), 'run-1')
  })

  it('skips products with empty externalId before upserting', async () => {
    const products = [
      { externalId: '', title: 'Bad', price: 100, stock: 1 },
      { externalId: 'good', title: 'Good', price: 200, stock: 2 },
    ]
    await runSync(makeAdapter(products), makeMockDb())
    const calledWith = (upsertProducts as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(calledWith).toHaveLength(1)
    expect(calledWith[0].externalId).toBe('good')
  })

  it('returns failed status and finalizes SyncRun after 5 consecutive fetch errors', async () => {
    const failingAdapter: ErpAdapter = {
      name: 'failing',
      fetchPage: vi.fn().mockRejectedValue(new Error('API down')),
    }
    const db = makeMockDb()
    const result = await runSync(failingAdapter, db)
    expect(result.status).toBe('failed')
    expect(db.syncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    )
  })
})
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
npx vitest run lib/sync/sync-runner.test.ts
```

Expected: FAIL with `Cannot find module './sync-runner'`

- [ ] **Step 3: Create `lib/sync/sync-runner.ts`**

```typescript
import type { PrismaClient } from '@/generated/prisma/client'
import type { ErpAdapter } from './erp-adapter'
import { upsertProducts } from './upsert-products'
import { deactivateMissing } from './deactivate-missing'
import { withRetry } from './retry'
import { SyncLogger } from './logger'

const BATCH_SIZE = 200
const STALE_THRESHOLD_MS = 30 * 60 * 1000
const MAX_CONSECUTIVE_FETCH_ERRORS = 5

export interface SyncRunResult {
  runId: string
  status: 'completed' | 'failed'
  productsSynced: number
  deactivated: number
  errorCount: number
}

export async function runSync(
  adapter: ErpAdapter,
  db: PrismaClient,
  triggeredBy: 'cron' | 'manual' | 'webhook' = 'cron',
): Promise<SyncRunResult> {
  const logger = new SyncLogger()

  await db.syncRun.updateMany({
    where: {
      status: 'running',
      startedAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) },
    },
    data: { status: 'failed', finishedAt: new Date() },
  })

  const activeRun = await db.syncRun.findFirst({ where: { status: 'running' } })
  if (activeRun) {
    throw new Error(`Sync already running (id: ${activeRun.id})`)
  }

  const syncRun = await db.syncRun.create({ data: { status: 'running', triggeredBy } })
  const runId = syncRun.id

  let productsSynced = 0
  let deactivated = 0
  let consecutiveFetchErrors = 0

  try {
    let cursor: string | number | undefined = undefined
    let hasMore = true

    while (hasMore) {
      let fetchResult

      try {
        fetchResult = await withRetry(() => adapter.fetchPage(cursor), {
          maxAttempts: 3,
          baseDelayMs: 1000,
        })
        consecutiveFetchErrors = 0
      } catch (err) {
        consecutiveFetchErrors++
        logger.error('Fetch page failed', {
          cursor,
          consecutive: consecutiveFetchErrors,
          error: String(err),
        })
        if (consecutiveFetchErrors >= MAX_CONSECUTIVE_FETCH_ERRORS) {
          throw new Error(`Aborting: ${MAX_CONSECUTIVE_FETCH_ERRORS} consecutive fetch errors`)
        }
        continue
      }

      const { products, hasMore: more, nextCursor } = fetchResult
      hasMore = more
      cursor = nextCursor

      for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE)
        const batchIndex = Math.floor(productsSynced / BATCH_SIZE)
        const valid = batch.filter(p => p.externalId)

        if (valid.length < batch.length) {
          logger.info('Skipping products with missing externalId', {
            batchIndex,
            skipped: batch.length - valid.length,
          })
        }

        if (valid.length === 0) continue

        try {
          await withRetry(() => upsertProducts(db, valid, runId), {
            maxAttempts: 3,
            baseDelayMs: 1000,
          })
          productsSynced += valid.length
          logger.info('Batch upserted', { batchIndex, count: valid.length, total: productsSynced })
        } catch (err) {
          logger.recordBatchError(batchIndex, err, valid.map(p => p.externalId))
        }
      }

      await db.syncRun.update({ where: { id: runId }, data: { productsSynced } })
    }

    deactivated = await deactivateMissing(db, runId)
    logger.info('Deactivation complete', { deactivated })

    const errorSample = logger.getErrorSample()
    await db.syncRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        productsSynced,
        deactivated,
        errorCount: logger.getErrorCount(),
        // cast required: Prisma Json field does not accept typed arrays directly
        ...(errorSample.length > 0 && { errorSample: errorSample as unknown as never }),
      },
    })

    return {
      runId,
      status: 'completed',
      productsSynced,
      deactivated,
      errorCount: logger.getErrorCount(),
    }
  } catch (err) {
    logger.error('Sync failed', { error: String(err) })

    const errorSample = logger.getErrorSample()
    await db.syncRun
      .update({
        where: { id: runId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          productsSynced,
          errorCount: logger.getErrorCount() + 1,
          ...(errorSample.length > 0 && { errorSample: errorSample as unknown as never }),
        },
      })
      .catch(() => {})

    return {
      runId,
      status: 'failed',
      productsSynced,
      deactivated,
      errorCount: logger.getErrorCount() + 1,
    }
  }
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
npx vitest run lib/sync/sync-runner.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Run full test suite — check for regressions**

```bash
npx vitest run
```

Expected: all pre-existing tests pass

- [ ] **Step 6: Commit**

```bash
git add lib/sync/sync-runner.ts lib/sync/sync-runner.test.ts
git commit -m "feat: SyncRunner — two-phase sync with SyncRun lifecycle, concurrent run guard, retry"
```

---

## Task 8: Entry point script

**Files:**
- Create: `scripts/sync-products.ts`

- [ ] **Step 1: Create `scripts/sync-products.ts`**

```typescript
import { runSync } from '@/lib/sync/sync-runner'
import { prisma } from '@/lib/prisma'
import { RestPaginatedAdapter } from '@/lib/sync/adapters/rest-paginated'

async function main() {
  const erpUrl = process.env.ERP_API_URL
  const erpKey = process.env.ERP_API_KEY ?? ''

  if (!erpUrl) {
    console.error(JSON.stringify({ event: 'sync_abort', reason: 'ERP_API_URL is not set' }))
    process.exit(1)
  }

  const adapter = new RestPaginatedAdapter(erpUrl, erpKey)

  try {
    const result = await runSync(adapter, prisma, 'cron')
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

- [ ] **Step 2: Verify it type-checks**

```bash
npx tsc --noEmit
```

Expected: no type errors

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-products.ts
git commit -m "feat: sync-products entry point script for GitHub Actions"
```

---

## Task 9: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/sync-products.yml`

- [ ] **Step 1: Create `.github/workflows/sync-products.yml`**

```yaml
name: ERP Product Sync

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npx prisma generate

      - run: npx tsx scripts/sync-products.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          ERP_API_URL: ${{ secrets.ERP_API_URL }}
          ERP_API_KEY: ${{ secrets.ERP_API_KEY }}
```

- [ ] **Step 2: Add required GitHub Secrets (manual, one-time)**

Go to: `https://github.com/<your-repo>/settings/secrets/actions/new`

Add these secrets:
- `DATABASE_URL` — copy the Neon connection string from Vercel project → Settings → Environment Variables
- `ERP_API_URL` — base URL of ERP API (add once API is known; workflow will fail-fast with a clear error until set)
- `ERP_API_KEY` — API auth token (same — add once known)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sync-products.yml
git commit -m "ci: GitHub Actions cron for ERP product sync (every 6 hours)"
```

---

## Task 10: Catalog isActive filter

**Files:**
- Modify: `lib/product-overrides-store.ts`

Currently `isActive` defaults to `true` for all existing rows (set by the migration), so the catalog is unaffected until the first sync run. Still, add the filter now so it works correctly once synced products start being deactivated.

- [ ] **Step 1: Update `getDbProducts` at line ~148**

In `lib/product-overrides-store.ts`, find:

```typescript
const rows = await prisma.product.findMany({
  where: { isDeleted: false },
  orderBy: { createdAt: 'desc' },
})
```

Change to:

```typescript
const rows = await prisma.product.findMany({
  where: { isDeleted: false, isActive: true },
  orderBy: { createdAt: 'desc' },
})
```

- [ ] **Step 2: Update `getDbProductsPaginated` at line ~159**

In the same file, find:

```typescript
const where = {
  isDeleted: false,
  ...(opts.category ? { category: opts.category } : {}),
}
```

Change to:

```typescript
const where = {
  isDeleted: false,
  isActive: true,
  ...(opts.category ? { category: opts.category } : {}),
}
```

- [ ] **Step 3: Check for other query sites**

```bash
grep -rn "prisma.product.findMany\|prisma.product.count" --include="*.ts" lib/ app/
```

Review each result. Any query serving the public catalog or admin product listing should include `isActive: true`. Skip `findUnique`/`findFirst` by specific `id` (admin lookups, sync internals — these should still find deactivated products when explicitly looked up by ID).

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/product-overrides-store.ts
git commit -m "feat: add isActive: true filter to catalog product queries"
```

---

## Post-implementation verification

- [ ] **Verify full type-check passes**

```bash
npx tsc --noEmit
```

- [ ] **Run all tests**

```bash
npx vitest run
```

- [ ] **Dry-run the script locally** (uses the real Neon DB; `RestPaginatedAdapter` will throw `not implemented` — that's expected)

```bash
ERP_API_URL=https://example.com DATABASE_URL=<your-neon-url> npx tsx scripts/sync-products.ts
```

Expected: script starts, creates a `SyncRun` with `status='running'`, then fails because `RestPaginatedAdapter.fetchPage` throws `not implemented`, finalizes `SyncRun` with `status='failed'`. Verify the `SyncRun` row was written to Neon.

- [ ] **Confirm SyncRun row was created in Neon**

```bash
npx prisma studio
```

Open `SyncRun` table. Verify one row exists with `status='failed'`, `triggeredBy='cron'`, non-null `finishedAt`.

---

## Phase 2 checklist (deferred — do NOT start until real ERP data is available)

When real ERP data is in hand:

- [ ] Inspect the actual ERP API response payload (authentication, pagination style, field names)
- [ ] Implement `RestPaginatedAdapter.fetchPage` with real HTTP fetch + `ErpProduct` mapping
- [ ] Design `ProductVariant` schema based on real attribute axes (color, material, kit parts)
- [ ] Add `ProductVariant` model to `prisma/schema.prisma`, run migration
- [ ] Extend `ErpAdapter` interface with variant support
- [ ] Add variant upsert step in `sync-runner.ts` between product upsert and deactivation
- [ ] Add variant deactivation using the same `lastSyncRunId` pattern
