# GrinS stock ledger — implementation handoff, 12.10.2026

Base: `c4568f93c04fb36f56f26db853c75bb3c712e1a8`. Integration branch: `feat/grins-stock-ledger`. This document is not deployment authorization.

## Implemented model

- `Product.grinsStock` is the latest accepted physical GrinS snapshot.
- `Product.stock = max(grinsStock - active allocations, 0)` remains the storefront/checkout availability cache.
- `StockAllocation` states are `reserved`, `committed`, `awaiting_grins_sync`, `reconciled`, `released`. Only the first three reduce availability.
- Checkout still performs an atomic conditional decrement. In ledger mode the same transaction creates a unique allocation. With all flags false, existing behavior remains.
- Payment, late paid callback, expiry/failure, cancel, reopen, order edit and return use the same ledger adapter. An acknowledged quantity is frozen: cancel/edit/return cannot release it before a causally fresh snapshot.
- Admin order UI exposes “Goods posted in GrinS”. It records DB `clock_timestamp()` and does not change stock.
- Every accepted stock snapshot stores a bounded rollback journal (`StockSnapshotEntry`). A compensating rollback restores physical values, then recomputes availability from allocations that exist at rollback time.

## Source and manifest contract

Legacy `export.xml` contains no trustworthy source timestamp. Without a manifest, automatic sync may update `grinsStock` only when FTPS MDTM is present and monotonically newer; it never reconciles acknowledgments.

The source mode cannot silently downgrade: after one accepted manifest-backed snapshot, a legacy MDTM-only snapshot is rejected. The first manifest-backed snapshot after legacy operation must have `runStartedAt` strictly newer than the last accepted legacy MDTM. This deliberately prefers a stopped sync over an unprovable timeline switch.

For reconciliation, `export.manifest.json` must be published with the exact XML and contain:

```json
{
  "schemaVersion": 1,
  "runStartedAt": "UTC time captured before the GrinS query begins",
  "generatedAt": "UTC time after XML generation completes",
  "xmlSha256": "sha256 of exact published bytes",
  "xmlSizeBytes": 0,
  "productCount": 0,
  "warehousePolicy": "10000-10007",
  "exporterVersion": "..."
}
```

The exporter must capture `runStartedAt` before reading GrinS, write XML and manifest to temporary names, fsync/close them, and publish the pair atomically or manifest-last. `generatedAt` and FTPS download/copy time are not causal evidence. Reconciliation is allowed only when `manifest.runStartedAt > allocation.acknowledgedAt + GRINS_MANIFEST_CLOCK_SKEW_SECONDS`.
Only allocations for products actually present and exactly matched in that accepted snapshot are eligible for reconciliation; a linked SKU missing from XML keeps its hold.

## Feature flags

All default to false. Safe dependency checks reject invalid combinations.

1. `GRINS_STOCK_LEDGER_ENABLED`
2. `GRINS_STOCK_SYNC_ENABLED` (requires ledger)
3. `GRINS_STOCK_MANIFEST_ENABLED`
4. `GRINS_STOCK_RECONCILIATION_ENABLED` (requires ledger + manifest)
5. `GRINS_MANIFEST_CLOCK_SKEW_SECONDS=300`
6. `GRINS_STOCK_ROLLBACK_RUNS=24` (allowed range 2–168)

When ledger mode is enabled, legacy FULL sync is fail-closed with `full_sync_blocked_by_stock_ledger_use_stocks_only`. Prices-only Preview/Apply does not use FULL and does not touch stock fields.

## Migration and cutover gates

1. Verify a Neon backup by restoring it to an isolated database. A site ZIP is not a database backup.
2. Deploy code and schema with every new flag false. Migration only adds nullable/defaulted fields and tables; it does not initialize stock or enable behavior.
3. Run `npm run audit:stock-ledger-cutover` read-only. Historical `committed` does **not** prove that a sale is still absent from GrinS. If candidate orders exist, a seller must explicitly identify the still-unposted orders. Do not auto-backfill every historical committed order.
4. Stop FULL sync and every other stock writer. Close checkout. Drain reserved payments and pause/verify delayed payment callbacks, expiry workers, admin edits, returns and CSV jobs. Absence of reservations alone is insufficient.
5. Create reviewed allocations only for explicitly confirmed unposted orders. No generic executable backfill is supplied because the current database cannot infer this fact safely.
6. Take a fresh XML, run stock preflight, enable ledger + scheduled stocks in the one-off process, and accept the first snapshot while checkout remains closed. Verify all linked products are initialized and `npm run check:stock-ledger` is healthy.
7. Restart the web process with ledger enabled before opening checkout. Keep FULL disabled. Enable the recurring `sync:stocks:scheduled` task.
8. Keep manifest and reconciliation flags false until the real exporter clock and atomic publication chain pass an end-to-end staging test. Accumulating `awaiting_grins_sync` rows must be monitored meanwhile.

Cutover is blocked if any candidate existing order is not classified, any stock writer cannot be stopped, payment callbacks cannot be drained/paused, linked products remain partly initialized, or backup restore has not been rehearsed.

## Scheduling and diagnostics

- Scheduled entry: `npm run sync:stocks:scheduled` (`scripts/sync-products.ts --stocks-only-scheduled`).
- Read-only health: `npm run check:stock-ledger`.
- Read-only cutover inventory: `npm run audit:stock-ledger-cutover`.
- Each run records mode, SHA, source times, counts, warnings, reconciliation count and awaiting count in `SyncRun`; no credentials are logged.
- Replay by source identity is skipped. Older manifest snapshots and non-increasing legacy MDTM are rejected.
- XML validation, matching, physical update, reconciliation, derived availability, rollback journal and completion marker are atomic. Mid-Apply failure leaves the previous Product/allocation state intact.

Rollback is never automatic. Only the latest completed stocks-only run can be compensated, checkout must be closed, and the existing private environment profile/instance marker is required by `scripts/operate-grins-stock-rollback.ts`. A rollback creates its own `SyncRun`; it does not rewind orders or allocations. Whole-database restore over newer orders is prohibited.

## Files and review focus

- Schema/migration: `prisma/schema.prisma`, `prisma/migrations/20261012170000_split_grins_stock_ledger/`.
- Core: `lib/stock-ledger*.ts`, `lib/sync/stock-{snapshot,sync-preflight}.ts`.
- Scheduler/manifest: `lib/sync/scheduled-stock-sync.ts`, `lib/sync/ftps-source-verification.ts`, `scripts/sync-products.ts`.
- Order paths: `lib/orders-data-store.ts`, order-meta single/bulk, returns, acknowledgment API/UI.
- Controls: DB trigger, FULL block, existing manual/CSV guards, restore preserving linked stock, invariant/cutover scripts.

Independent review should focus on PostgreSQL lock ordering under Neon pooling, production historical-order classification, exporter clock discipline/publication atomicity, and operational pausing of delayed payment callbacks.
