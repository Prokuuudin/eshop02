# Sync Runner Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three correctness gaps in the existing (already-live) `lib/sync/sync-runner.ts` pipeline that the 2026-07-22 GrinS-topology correction flagged as real bugs in the current code, independent of transport (they apply the same whether the adapter is the still-stubbed `RestPaginatedAdapter` or a future XML-based one).

**Architecture:** No new subsystems. Three targeted fixes inside the existing `SyncRunner` lifecycle (`INIT → FETCH+UPSERT LOOP → DEACTIVATE MISSING → FINALIZE`): (1) a batch-level error must fail the whole run instead of silently completing and deactivating products, (2) a feed with a repeated `externalId` must be rejected instead of crashing the upsert or silently last-write-wins-ing, (3) the concurrent-run guard becomes a real atomic compare-and-swap instead of a check-then-create race. All three reuse existing tables (`SyncRun`, `KeyValueSetting`) — no Prisma migration.

**Tech Stack:** TypeScript, Prisma (`ExtendedPrismaClient` from `lib/prisma.ts`), Vitest.

## Global Constraints

- No Neon schema changes (no new columns, no new tables, no new indexes) — reuse `KeyValueSetting` for the run-lock. (Standing project constraint — see `feedback_no_schema_changes` memory.)
- Every new/changed code path needs a Vitest unit test; run `npx vitest run lib/sync/` after each task.
- `npm run typecheck` must stay clean after each task.
- Out of scope for this plan (deferred pending external answers per `docs/superpowers/specs/2026-07-22-live-db-sync-design-correction.md`): the actual XML/ZIP snapshot adapter, staging/atomic-publish table redesign, price1-4 / per-warehouse-quantity storage, safety-buffer display values, snapshot rollback storage, write-back (write-back is cancelled outright, not deferred).

---

## Task 1: Fail the run instead of completing when any batch errored

**Files:**
- Modify: `lib/sync/sync-runner.ts:106-129`
- Test: `lib/sync/sync-runner.test.ts`

**Interfaces:**
- Consumes: `SyncLogger.getErrorCount(): number`, `SyncLogger.getErrorSample(): SyncError[]` (both already exist in `lib/sync/logger.ts`, unchanged).
- Produces: `runSync()` return type `SyncRunResult` is unchanged (`{ runId, status, productsSynced, deactivated, errorCount }`) — only the *values* it can now return change (`status: 'failed'` with `deactivated: 0` is now reachable from the "loop finished, no thrown exception" path, not just from the outer catch).

Today, `runSync` (`lib/sync/sync-runner.ts`) calls `logger.recordBatchError` when an individual batch's `upsertProducts` throws (line 99), but nothing reads `logger.getErrorCount()` until *after* `deactivateMissing` has already run and the `SyncRun` has already been marked `'completed'`. A batch that fails to upsert (e.g. a transient DB error on one page of 200 products) today still deactivates every product missing from the run and reports success.

- [ ] **Step 1: Write the failing test**

Add to `lib/sync/sync-runner.test.ts` (inside the existing `describe('runSync', ...)` block, alongside the other tests):

```ts
  it('does not call deactivateMissing when a batch upsert failed', async () => {
    const products = [
      { externalId: 'e1', title: 'P1', price: 100, stock: 1 },
      { externalId: 'e2', title: 'P2', price: 200, stock: 2 },
    ]
    ;(upsertProducts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db timeout'))
    await runSync(makeAdapter(products), makeMockDb())
    expect(deactivateMissing).not.toHaveBeenCalled()
  })

  it('marks the run failed when a batch upsert failed, even though the loop completed', async () => {
    const products = [
      { externalId: 'e1', title: 'P1', price: 100, stock: 1 },
    ]
    ;(upsertProducts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db timeout'))
    const result = await runSync(makeAdapter(products), makeMockDb())
    expect(result.status).toBe('failed')
    expect(result.deactivated).toBe(0)
  })
```

Note: `upsertProducts` is already imported and mocked at the top of this test file (`vi.mock('./upsert-products', ...)` with a default `mockResolvedValue(0)`); `mockRejectedValueOnce` overrides just the next call.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/sync/sync-runner.test.ts -t "does not call deactivateMissing when a batch upsert failed"`
Expected: FAIL — `deactivateMissing` was called (current code calls it unconditionally after the loop).

- [ ] **Step 3: Fix `runSync`**

In `lib/sync/sync-runner.ts`, replace the block from just after the `while (hasMore) { ... }` loop closes through the end of the `try` block (currently lines 106-129):

```ts
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
```

with:

```ts
    const errorCount = logger.getErrorCount()
    const errorSample = logger.getErrorSample()

    if (errorCount > 0) {
      logger.error('Sync completed with batch errors — skipping deactivation', { errorCount })
      await db.syncRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          productsSynced,
          deactivated: 0,
          errorCount,
          // cast required: Prisma Json field does not accept typed arrays directly
          ...(errorSample.length > 0 && { errorSample: errorSample as unknown as never }),
        },
      })
      return { runId, status: 'failed', productsSynced, deactivated: 0, errorCount }
    }

    deactivated = await deactivateMissing(db, runId)
    logger.info('Deactivation complete', { deactivated })

    await db.syncRun.update({
      where: { id: runId },
      data: { status: 'completed', finishedAt: new Date(), productsSynced, deactivated, errorCount: 0 },
    })

    return { runId, status: 'completed', productsSynced, deactivated, errorCount: 0 }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/sync/sync-runner.test.ts`
Expected: PASS — all tests including the two new ones, and the pre-existing `'calls deactivateMissing after all pages are fetched'` test (which uses a clean adapter with no errors, so `errorCount` stays `0` and the old behavior is preserved).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/sync-runner.ts lib/sync/sync-runner.test.ts
git commit -m "fix(sync): fail the run instead of deactivating products when a batch errored"
```

---

## Task 2: Reject duplicate `externalId` within a single run

**Files:**
- Modify: `lib/sync/sync-runner.ts:77-101`
- Test: `lib/sync/sync-runner.test.ts`

**Interfaces:**
- Consumes: `SyncLogger.recordBatchError(batch: number, err: unknown, productIds?: string[]): void` (existing, unchanged).
- Produces: no new exports. Behavioral change only — a duplicate `externalId` anywhere in the run now increments `errorCount` (which Task 1's guard then turns into a failed run + skipped deactivation).

Why this matters on its own, not just as a defensive nicety: `buildUpsertQuery` (`lib/sync/upsert-products.ts`) generates a single multi-row `INSERT ... ON CONFLICT ("externalId") DO UPDATE` per batch. If the same `externalId` appears twice in one batch, Postgres raises `ON CONFLICT DO UPDATE command cannot affect row a second time` and the *entire batch* throws — today that becomes a `recordBatchError` (silently absorbed, run still completes). A duplicate `externalId` split across two different batches is worse: no Postgres error, just silent last-write-wins with no record anything was wrong. The 2026-07-22 GrinS report confirmed the current feed has zero duplicate SKUs and explicitly calls that out as a property worth protecting, not assuming.

- [ ] **Step 1: Write the failing test**

Add to `lib/sync/sync-runner.test.ts`:

```ts
  it('skips a repeated externalId and records it as an error', async () => {
    const products = [
      { externalId: 'dup', title: 'First', price: 100, stock: 1 },
      { externalId: 'dup', title: 'Second (duplicate id)', price: 150, stock: 3 },
      { externalId: 'unique', title: 'Fine', price: 200, stock: 2 },
    ]
    const result = await runSync(makeAdapter(products), makeMockDb())
    const calledWith = (upsertProducts as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(calledWith).toHaveLength(2)
    expect(calledWith.map((p: { externalId: string }) => p.externalId)).toEqual(['dup', 'unique'])
    expect(result.status).toBe('failed')
    expect(result.errorCount).toBeGreaterThan(0)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/sync/sync-runner.test.ts -t "skips a repeated externalId"`
Expected: FAIL — today's code has no duplicate detection, so `calledWith` has length 3 and `result.status` is `'completed'`.

- [ ] **Step 3: Add duplicate detection**

In `lib/sync/sync-runner.ts`, add `ErpProduct` to the existing type-only import at the top of the file:

```ts
import type { ErpAdapter, ErpProduct } from './erp-adapter'
```

Then add a `seenExternalIds` set at function scope (next to `productsSynced`/`deactivated`/`consecutiveFetchErrors`, around line 43-45):

```ts
  let productsSynced = 0
  let deactivated = 0
  let consecutiveFetchErrors = 0
  const seenExternalIds = new Set<string>()
```

Then replace the batch-filtering block (currently):

```ts
        const valid = batch.filter(p => p.externalId)

        if (valid.length < batch.length) {
          logger.info('Skipping products with missing externalId', {
            batchIndex,
            skipped: batch.length - valid.length,
          })
        }
```

with:

```ts
        const withId = batch.filter(p => p.externalId)
        if (withId.length < batch.length) {
          logger.info('Skipping products with missing externalId', {
            batchIndex,
            skipped: batch.length - withId.length,
          })
        }

        const valid: ErpProduct[] = []
        const duplicateIds: string[] = []
        for (const p of withId) {
          if (seenExternalIds.has(p.externalId)) {
            duplicateIds.push(p.externalId)
            continue
          }
          seenExternalIds.add(p.externalId)
          valid.push(p)
        }
        if (duplicateIds.length > 0) {
          logger.recordBatchError(batchIndex, new Error('Duplicate externalId in feed'), duplicateIds)
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/sync/sync-runner.test.ts`
Expected: PASS — all tests, including the pre-existing `'skips products with empty externalId before upserting'` test (missing-id handling is untouched, only duplicate-id handling was added).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/sync-runner.ts lib/sync/sync-runner.test.ts
git commit -m "fix(sync): reject repeated externalId within a run instead of last-write-wins"
```

---

## Task 3: Atomic run-lock (replace the check-then-create race)

**Files:**
- Create: `lib/sync/sync-lock.ts`
- Test: `lib/sync/sync-lock.test.ts`
- Modify: `lib/sync/sync-runner.ts:1-41`
- Test: `lib/sync/sync-runner.test.ts`

**Interfaces:**
- Produces (new, from `lib/sync/sync-lock.ts`):
  ```ts
  export async function acquireSyncLock(db: ExtendedPrismaClient, runId: string, staleMs: number): Promise<boolean>
  export async function releaseSyncLock(db: ExtendedPrismaClient, runId: string): Promise<void>
  ```
- Consumes in `sync-runner.ts`: the two functions above.

Today (`lib/sync/sync-runner.ts:35-40`):

```ts
  const activeRun = await db.syncRun.findFirst({ where: { status: 'running' } })
  if (activeRun) {
    throw new Error(`Sync already running (id: ${activeRun.id})`)
  }
```

This is a classic check-then-act race: two concurrent triggers (manual + cron firing at the same moment, or two overlapping requests) can both pass the `findFirst` check before either has called `syncRun.create`. Fix: gate concurrency with a single atomic SQL statement against `KeyValueSetting` (no migration — reuses the existing table) instead of two separate Prisma calls. `SyncRun` row creation stays as-is for audit/history; it is no longer what enforces exclusivity.

**Why `KeyValueSetting` CAS instead of `pg_advisory_lock`:** `lib/prisma.ts` uses the Neon serverless driver over WebSocket (`PrismaNeon` adapter) — a session-scoped advisory lock's guarantee (held until explicitly released or the session ends) requires every query in the lock's lifetime to run on the *same* underlying connection, which is not a safe assumption to bake into this codebase's pooling setup. A single atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE <expired>` statement doesn't depend on connection affinity — the compare-and-swap is enforced by Postgres row-level MVCC on that one statement, not by session state.

- [ ] **Step 1: Write the failing test for the lock helper**

Create `lib/sync/sync-lock.test.ts`:

```ts
import { vi, describe, it, expect } from 'vitest'
import { acquireSyncLock, releaseSyncLock } from './sync-lock'
import type { ExtendedPrismaClient } from '@/lib/prisma'

function makeMockDb(queryRawResult: unknown[]) {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue(queryRawResult),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  } as unknown as ExtendedPrismaClient
}

describe('acquireSyncLock', () => {
  it('returns true when the CAS insert/update returns a row', async () => {
    const db = makeMockDb([{ key: 'sync-run-lock' }])
    const acquired = await acquireSyncLock(db, 'run-1', 30 * 60 * 1000)
    expect(acquired).toBe(true)
  })

  it('returns false when the CAS statement matches no row (lock held and not stale)', async () => {
    const db = makeMockDb([])
    const acquired = await acquireSyncLock(db, 'run-1', 30 * 60 * 1000)
    expect(acquired).toBe(false)
  })

  it('passes the runId and a future lockedUntil to the CAS statement', async () => {
    const db = makeMockDb([{ key: 'sync-run-lock' }])
    await acquireSyncLock(db, 'run-42', 1000)
    const call = (db.$queryRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0]
    const valueArg = JSON.parse(call[2] as string)
    expect(valueArg.runId).toBe('run-42')
    expect(new Date(valueArg.lockedUntil).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('releaseSyncLock', () => {
  it('issues an UPDATE scoped to the given runId', async () => {
    const db = makeMockDb([])
    await releaseSyncLock(db, 'run-1')
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "KeyValueSetting"'),
      expect.any(String),
      'sync-run-lock',
      'run-1',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/sync/sync-lock.test.ts`
Expected: FAIL — `./sync-lock` does not exist yet (`Cannot find module`).

- [ ] **Step 3: Implement `lib/sync/sync-lock.ts`**

```ts
import type { ExtendedPrismaClient } from '@/lib/prisma'

const SYNC_LOCK_KEY = 'sync-run-lock'

export async function acquireSyncLock(
  db: ExtendedPrismaClient,
  runId: string,
  staleMs: number,
): Promise<boolean> {
  const lockedUntil = new Date(Date.now() + staleMs).toISOString()
  const value = JSON.stringify({ runId, lockedUntil })

  const rows = await db.$queryRawUnsafe<Array<{ key: string }>>(
    `INSERT INTO "KeyValueSetting" (key, value, "updatedAt")
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, "updatedAt" = now()
       WHERE ("KeyValueSetting".value->>'lockedUntil')::timestamptz < now()
     RETURNING key`,
    SYNC_LOCK_KEY,
    value,
  )

  return rows.length > 0
}

export async function releaseSyncLock(db: ExtendedPrismaClient, runId: string): Promise<void> {
  const releasedValue = JSON.stringify({ runId, lockedUntil: new Date(0).toISOString() })
  await db.$executeRawUnsafe(
    `UPDATE "KeyValueSetting" SET value = $1::jsonb, "updatedAt" = now()
     WHERE key = $2 AND (value->>'runId') = $3`,
    releasedValue,
    SYNC_LOCK_KEY,
    runId,
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/sync/sync-lock.test.ts`
Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit the lock helper**

```bash
git add lib/sync/sync-lock.ts lib/sync/sync-lock.test.ts
git commit -m "feat(sync): add atomic CAS run-lock backed by KeyValueSetting"
```

- [ ] **Step 6: Update the failing concurrency test in `sync-runner.test.ts`**

The existing test mocks `db.syncRun.findFirst` to simulate "another run active" — that's no longer the gate. Replace it:

```ts
  it('throws when another sync is actively running', async () => {
    const db = makeMockDb()
    ;(db as unknown as { $queryRawUnsafe: ReturnType<typeof vi.fn> }).$queryRawUnsafe = vi
      .fn()
      .mockResolvedValue([])
    await expect(runSync(makeAdapter(), db)).rejects.toThrow('already running')
  })
```

Also add `$queryRawUnsafe` and `$executeRawUnsafe` mocks (both defaulting to a successful acquire) to `makeMockDb()` at the top of the file so every *other* existing test still passes:

```ts
function makeMockDb(): ExtendedPrismaClient {
  return {
    syncRun: {
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ key: 'sync-run-lock' }]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  } as unknown as ExtendedPrismaClient
}
```

Run: `npx vitest run lib/sync/sync-runner.test.ts -t "throws when another sync is actively running"`
Expected: FAIL at this point — `runSync` doesn't call `acquireSyncLock` yet, so the mocked empty-array `$queryRawUnsafe` result has no effect and the old `findFirst`-based check (which returns `null`, i.e. "no active run") lets the sync proceed instead of throwing.

- [ ] **Step 7: Wire the lock into `runSync`**

In `lib/sync/sync-runner.ts`, add the import:

```ts
import { acquireSyncLock, releaseSyncLock } from './sync-lock'
```

Replace the existing gate (currently lines 35-40):

```ts
  const activeRun = await db.syncRun.findFirst({ where: { status: 'running' } })
  if (activeRun) {
    throw new Error(`Sync already running (id: ${activeRun.id})`)
  }

  const syncRun = await db.syncRun.create({ data: { status: 'running', triggeredBy } })
  const runId = syncRun.id
```

with:

```ts
  const syncRun = await db.syncRun.create({ data: { status: 'running', triggeredBy } })
  const runId = syncRun.id

  const acquired = await acquireSyncLock(db, runId, STALE_THRESHOLD_MS)
  if (!acquired) {
    await db.syncRun.update({ where: { id: runId }, data: { status: 'failed', finishedAt: new Date() } })
    throw new Error('Sync already running')
  }
```

(`SyncRun` creation moves before the lock attempt so a lost race is still recorded in `SyncRun` history as an immediately-failed row, not silently dropped.)

Then release the lock on every exit path. After Task 1, the `try` block ends with the `errorCount > 0` early-return branch and the final `'completed'` branch — add `await releaseSyncLock(db, runId)` right before each `return`:

```ts
    if (errorCount > 0) {
      logger.error('Sync completed with batch errors — skipping deactivation', { errorCount })
      await db.syncRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          productsSynced,
          deactivated: 0,
          errorCount,
          ...(errorSample.length > 0 && { errorSample: errorSample as unknown as never }),
        },
      })
      await releaseSyncLock(db, runId)
      return { runId, status: 'failed', productsSynced, deactivated: 0, errorCount }
    }

    deactivated = await deactivateMissing(db, runId)
    logger.info('Deactivation complete', { deactivated })

    await db.syncRun.update({
      where: { id: runId },
      data: { status: 'completed', finishedAt: new Date(), productsSynced, deactivated, errorCount: 0 },
    })

    await releaseSyncLock(db, runId)
    return { runId, status: 'completed', productsSynced, deactivated, errorCount: 0 }
```

And in the outer `catch (err) { ... }` block, right before its `return` (after the `.catch(() => {})`-guarded `db.syncRun.update` call), add the same release, wrapped so a lock-release failure never masks the real error:

```ts
    await releaseSyncLock(db, runId).catch(() => {})

    return {
      runId,
      status: 'failed',
      productsSynced,
      deactivated,
      errorCount: logger.getErrorCount() + 1,
    }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run lib/sync/sync-runner.test.ts`
Expected: PASS — all tests, including the updated concurrency test.

Run: `npx vitest run lib/sync/`
Expected: PASS — full `lib/sync/` suite (all files: `deactivate-missing.test.ts`, `logger.test.ts`, `retry.test.ts`, `sync-lock.test.ts`, `sync-runner.test.ts`, `upsert-products.test.ts`).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add lib/sync/sync-runner.ts lib/sync/sync-runner.test.ts
git commit -m "fix(sync): replace racy findFirst-then-create run guard with atomic CAS lock"
```

---

## Final verification

- [ ] Run: `npx vitest run` (full unit suite)
  Expected: all files pass, count ≥ 620 (617 pre-existing + at least 3 new tests in `sync-runner.test.ts` + 4 new in `sync-lock.test.ts`, minus/plus any renumbering).
- [ ] Run: `npm run typecheck`
  Expected: clean.
- [ ] Run: `npm run lint`
  Expected: clean.
