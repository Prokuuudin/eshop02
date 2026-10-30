# Hairshop taxonomy sync v2 contract

## Scope

Version 2 transports the complete nopCommerce taxonomy snapshot. It does not create or update products, prices,
stock, orders, promotions, `BrandLine`, or `ProductBrandLine`. The existing version 1 new-product contract and
endpoint behavior remain unchanged.

The pure protocol state machine in `lib/sync/hairshop-taxonomy-sync.ts` defines validation and finalization.
Stage 2 persists it in PostgreSQL (`lib/sync/hairshop-taxonomy-persistence.ts`, see "Stage-2 persistent staging").

## Canonical snapshot

The snapshot contains four arrays:

- `categories`: string `categoryId`, nullable string `parentCategoryId`, default and RU/LV/EN names, localized
  slugs, `published`, `createdOnUtc`, and `updatedOnUtc`;
- `manufacturers`: string `manufacturerId`, names, slugs, publication state, and source timestamps;
- `productCategories`: every Product–Category edge, including display order and featured state;
- `productManufacturers`: every Product–Manufacturer edge, including display order and featured state.

IDs are decimal strings to avoid JSON/JavaScript integer precision loss. Arrays are sorted by their numeric source
IDs before hashing. The full SHA-256 is calculated over compact UTF-8 JSON of this canonical object. Audit counts
(284 categories and 10,878 Product–Category mappings) are verification references only and are not contract limits.

## Requests

Every request has `schemaVersion: 2`, `runId`, and `mode` (`dry-run` or `apply`).

1. `begin` carries the manifest and opens a snapshot session.
2. `batch` carries one deterministic `batchId` (`<kind>:<zero-based-index>`), its index/total, payload SHA-256,
   snapshot SHA-256, and items of exactly one kind.
3. `finalize` repeats the original manifest.

The manifest contains source identity, generation time, four entity/edge counts, expected batch count, and the full
snapshot SHA-256.

An identical retry of an accepted batch is a no-op. A retry with the same `batchId` but different content is a
conflict. Finalization is rejected unless all batch indexes, counts, batch hashes, and the reassembled full snapshot
hash match the `begin` manifest. An interrupted session therefore cannot become an applied snapshot.

## Stage-2 persistent staging

Endpoint: `POST /api/internal/hairshop-catalog-sync/taxonomy`. It reuses the v1 secret header
`x-hairshop-catalog-sync-key` (`HAIRSHOP_CATALOG_SYNC_SECRET`, at least 32 characters, timing-safe comparison) and has
its own write gate `HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED=true`, required for every operation including `dry-run`,
because every operation persists staging state. Request bodies are limited to 4 MiB. Logs contain the correlation ID,
run ID, operation, status, counts and error code, never payloads or secrets.

Every state transition is committed to the database before the response, so a client may resend any request after
a network or server restart. Tables (migration `20261030170000_taxonomy_snapshot_staging`, purely additive):

- `TaxonomySnapshotSession`: one row per `(source, runId)` with manifest, snapshot SHA-256, expected batch count and
  `status` `receiving` → `completed` | `rejected` | `expired`; `appliedAt`, `lastErrorCode`, `errorCount`.
- `TaxonomySnapshotBatch`: accepted batches, unique per `(session, batchId)` and `(session, type, index)`.
- `CatalogSourceCategory`, `CatalogSourceManufacturer`, `CatalogSourceProductCategory`,
  `CatalogSourceProductManufacturer`: the source mirror. Mappings reference nopCommerce product IDs
  (`legacyProductId`) and have no foreign key to `Product`.

Concurrency: `begin` and `batch` take a per-run transaction advisory lock; `finalize` takes a per-source lock and then
the run lock, so finalizations never overlap. An identical retry returns `duplicate`; the same `runId`/`batchId`
with different content returns `409`.

`finalize` re-reads all batches, re-runs the protocol checks (complete indexes, manifest counts, full snapshot hash),
then checks unique source IDs, existing parents, an acyclic hierarchy and that every mapping references a category or
manufacturer of the same snapshot. In `apply` mode it also rejects a snapshot older (`generatedAtUtc`) than the
active one (`STALE_SNAPSHOT`). Only then, in the same transaction, it upserts the mirror and sets `appliedAt`; the
latest `appliedAt` is the active snapshot. `dry-run` validates the same way without touching the mirror.
Repeating a completed finalize returns `duplicate`.

A failed finalize changes no mirror data. `SNAPSHOT_INCOMPLETE` is recorded and the session stays `receiving`, so the
missing batches can still be sent. Data errors (hash/count mismatch, duplicates, missing references, cycles,
stale snapshot) close the session as `rejected`; further requests for it return `409 session_closed`.

Mirror rows are never deleted. A row absent from an applied snapshot keeps its data, gets `isPresent=false` and
increments `missingSnapshotCount` (reset when it reappears). The source exporter reads with READ COMMITTED, so a
single absence is not a deletion: consumers must require several consecutive misses before acting on one.

After every completed finalize, staging older than 14 days is pruned: `receiving` sessions become `expired` and
batch payloads of closed sessions are deleted. Session rows and the mirror are kept.

Integration tests run only against an isolated database (never production):
`TAXONOMY_TEST_DATABASE_URL=<branch url> TAXONOMY_TEST_WRITE_ACK=isolated-branch npx vitest run --config vitest.taxonomy-postgres.config.ts`.

Product-import state and taxonomy-snapshot state are independent: marking a legacy product as processed by v1 must
never suppress its taxonomy edges in v2.
