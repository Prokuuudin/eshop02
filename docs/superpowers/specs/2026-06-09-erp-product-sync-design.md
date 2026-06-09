# ERP Product Sync — Design Spec (Phase 1)

**Date:** 2026-06-09  
**Status:** Approved  
**Scope:** Phase 1 — sync infrastructure. Phase 2 (ProductVariant schema) deferred until real ERP data is available.

---

## Context

- **Database:** Neon (PostgreSQL) via Prisma
- **Backend:** Node.js (TypeScript)
- **Sync runner:** GitHub Actions cron
- **Source:** External ERP / legacy shop (API format TBD)
- **Volume:** 4 000–5 000 products; variants deferred to Phase 2
- **ERP is source of truth** — sync overwrites all fields on every run

---

## Decisions

| Question | Decision | Reason |
|---|---|---|
| Extend `Product` or separate tables? | Extend `Product` | Single source of truth, simpler catalog queries |
| Manual edits vs ERP? | ERP always wins | Keeps sync logic simple and predictable |
| Sync approach | Two-phase with `SyncRun` | Safe partial failure, idempotent, audit trail |
| Worker host | GitHub Actions | Free, no extra infra, logs in UI |
| ERP coupling | `ErpAdapter` interface | Real API format unknown; decouple now |
| Variant schema | Deferred to Phase 2 | Cannot design correctly without real ERP data |

---

## Data Model Changes

### 1. Extend `Product` (Prisma migration)

Add three fields to the existing `Product` model:

```prisma
externalId    String?  @unique   // ERP identifier; null = manually created product
isActive      Boolean  @default(true)  // false = deactivated by sync (absent from ERP)
lastSyncRunId String?             // set to current SyncRun.id on every upsert

@@index([externalId])
@@index([isActive])
@@index([lastSyncRunId])
```

- Existing `isDeleted` = admin manual soft-delete. Unchanged.
- Catalog filter: `WHERE isActive = true AND isDeleted = false`
- Manual products (`externalId IS NULL`) are never touched by sync deactivation.

### 2. New `SyncRun` table

```prisma
model SyncRun {
  id             String    @id @default(cuid())
  startedAt      DateTime  @default(now())
  finishedAt     DateTime?
  status         String    @default("running")  // running | completed | failed
  productsTotal  Int       @default(0)
  productsSynced Int       @default(0)
  variantsSynced Int       @default(0)
  deactivated    Int       @default(0)
  errorCount     Int       @default(0)
  errorSample    Json?     // up to 10 error objects: { batch, error, productIds }
  triggeredBy    String    @default("cron")  // cron | manual | webhook

  @@index([status])
  @@index([startedAt])
}
```

---

## ErpAdapter Interface

Decouples sync logic from any specific ERP API. One interface, multiple implementations.

```typescript
// lib/sync/erp-adapter.ts

export interface ErpProduct {
  externalId: string       // required — dedup key
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
  rawData?: Record<string, unknown>  // full ERP payload for Phase 2 mapping
}

export interface ErpFetchResult {
  products: ErpProduct[]
  hasMore: boolean
  nextCursor?: string | number   // page / offset / opaque cursor
}

export interface ErpAdapter {
  readonly name: string
  fetchPage(cursor?: string | number): Promise<ErpFetchResult>
  fetchAllIds?(): Promise<string[]>   // optional fast-diff path
}
```

Concrete adapters live in `lib/sync/adapters/`. Only one adapter is active at runtime (configured via env var).

---

## Sync Workflow (Two-Phase)

```
1. INIT
   └─ Check for stale running SyncRun (> 30 min) → mark failed
   └─ If SyncRun running < 30 min → abort (concurrent run guard)
   └─ Create new SyncRun { status: "running", triggeredBy }

2. FETCH + UPSERT LOOP
   └─ cursor = undefined
   └─ loop:
       ├─ adapter.fetchPage(cursor)          ← sequential, no parallelism
       ├─ split page into DB write batches of 200 (ERP page size is independent)
       ├─ for each DB batch: generate cuid() for new products (id = cuid if no existing id)
       ├─ UPSERT batch into Product          ← raw SQL, 1 round-trip per batch
       │   ON CONFLICT (externalId) DO UPDATE SET ..., lastSyncRunId = $runId
       ├─ update SyncRun.productsSynced += batch.length
       ├─ cursor = result.nextCursor
       └─ break if !result.hasMore

3. DEACTIVATE MISSING
   └─ UPDATE Product
      SET isActive = false
      WHERE externalId IS NOT NULL
        AND lastSyncRunId != $runId
   └─ update SyncRun.deactivated = affected rows

4. FINALIZE
   └─ SyncRun.status = "completed" (or "failed" if aborted)
   └─ SyncRun.finishedAt = now()
```

### Idempotency

Every run creates a new `SyncRun` with a new `id`. The deactivation step uses `lastSyncRunId != currentRunId` — so a product upserted earlier in the same run keeps its `lastSyncRunId` and survives deactivation. Re-running after partial failure is safe: previously synced products already have the correct `lastSyncRunId`.

### Partial failure behavior

If the process crashes on batch 15 of 25:
- Batches 1–14 are committed, products have current `runId`
- Deactivation step never ran → no products incorrectly deactivated
- `SyncRun` finalized as `failed` by the `finally` block
- Next scheduled run starts fresh, overwrites with a new `runId`

---

## Error Handling

### Batch-level (DB errors)
- Retry 3× with exponential backoff: 1s → 2s → 4s
- After 3 failures: log to `SyncRun.errorSample`, increment `errorCount`, continue to next batch
- Sync does not abort on single batch failure

### Fetch-level (ERP API errors)
- Retry on 429 / 5xx with backoff
- After 5 consecutive fetch errors: abort sync, `SyncRun.status = "failed"`

### Process-level
- `try/finally` in main entry point guarantees `SyncRun` is always finalized
- Unhandled exception → `status = "failed"`, `finishedAt = now()`

---

## GitHub Actions Setup

```yaml
# .github/workflows/sync-products.yml
name: ERP Product Sync
on:
  schedule:
    - cron: '0 */6 * * *'   # every 6 hours
  workflow_dispatch:          # manual trigger from GitHub UI

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx tsx scripts/sync-products.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          ERP_API_URL: ${{ secrets.ERP_API_URL }}
          ERP_API_KEY: ${{ secrets.ERP_API_KEY }}
```

Secrets required in GitHub → Settings → Secrets:
- `DATABASE_URL` — same Neon connection string used by Vercel
- `ERP_API_URL` — base URL of ERP API
- `ERP_API_KEY` — auth token / API key

---

## File Structure

```
scripts/
  sync-products.ts              ← entry point (GitHub Actions runs this)

lib/sync/
  erp-adapter.ts                ← ErpAdapter interface, ErpProduct type
  adapters/
    rest-paginated.ts           ← placeholder; implement when ERP API known
  sync-runner.ts                ← SyncRun lifecycle, fetch loop, deactivation
  upsert-products.ts            ← raw SQL batch upsert (INSERT ... ON CONFLICT)
  deactivate-missing.ts         ← UPDATE isActive=false WHERE lastSyncRunId != runId
  logger.ts                     ← structured logging, errorSample collector

prisma/migrations/
  YYYYMMDD_add_product_sync_fields/   ← externalId, isActive, lastSyncRunId
  YYYYMMDD_add_sync_run/              ← SyncRun model

.github/workflows/
  sync-products.yml
```

### Raw SQL upsert (critical for performance)

Prisma's `upsert()` issues one query per record. For 200 records = 200 round-trips.  
Raw SQL batch upsert = 1 round-trip for 200 records:

```sql
-- id is pre-generated (cuid) in Node before this query
-- ON CONFLICT uses externalId (unique), not id
-- id is never updated — preserves internal references
INSERT INTO "Product" (id, "externalId", title, price, stock, "isActive", "lastSyncRunId", "updatedAt", ...)
VALUES ($1,$2,$3,...), ($n,$n+1,...)
ON CONFLICT ("externalId") DO UPDATE SET
  title         = EXCLUDED.title,
  price         = EXCLUDED.price,
  stock         = EXCLUDED.stock,
  "isActive"    = true,
  "lastSyncRunId" = EXCLUDED."lastSyncRunId",
  "updatedAt"   = now()
-- id, createdAt, isDeleted, isCustom are NOT in the UPDATE SET
```

---

## Performance

| Metric | Value |
|---|---|
| Batch size | 200 products |
| ERP fetch concurrency | 1 (sequential) |
| DB writes per batch | 1 round-trip (raw SQL) |
| Expected duration (5k products) | ~3–5 min |
| Neon connection | Single persistent connection, no pooling needed for cron worker |

---

## Phase 2 (deferred)

When real ERP data is available:
1. Inspect actual payload — identify variant axes (color, material, kit parts)
2. Design `ProductVariant` schema to match real attribute structure
3. Extend `ErpAdapter` interface with variant support
4. Add variant upsert step between product upsert and deactivation
5. Add variant deactivation (same `lastSyncRunId` pattern on `ProductVariant`)

Phase 1 infrastructure requires zero changes for Phase 2 — only additive.

---

## Scaling (10k–100k products)

- **10k–20k:** increase batch size to 500, add `fetchAllIds()` for diff (skip unchanged)
- **50k+:** move to incremental sync — ERP sends `updatedSince` timestamp, only fetch changed
- **100k+:** dedicated sync worker process (Railway / Fly.io), connection pooling via PgBouncer, parallel batch writes with concurrency limit of 3–5
- **Webhook-ready:** `SyncRun` table and `ErpAdapter` interface work unchanged for push-based sync — just replace the cron trigger with a webhook handler

---

## Risks

| Risk | Mitigation |
|---|---|
| ERP API rate limiting | Sequential fetch + retry with backoff |
| Concurrent sync runs | Running guard (30-min stale check) at startup |
| ERP sends bad data (missing externalId) | Validate before upsert, skip + log invalid records |
| Neon connection drops mid-sync | Retry per batch, `SyncRun` always finalized in `finally` |
| ERP downtime during sync window | Abort after 5 consecutive fetch errors, next cron picks up |
| Manual product accidentally deactivated | `externalId IS NULL` guard — manual products never deactivated |
