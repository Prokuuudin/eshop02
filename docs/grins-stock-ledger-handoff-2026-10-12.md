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
7. `GRINS_STOCK_MANIFEST_MAX_AGE_HOURS=3` (allowed range above 0 through 24)

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
- Read-only hold/exception report: `npm run report:stock-ledger-holds`.
- Read-only cutover inventory: `npm run audit:stock-ledger-cutover`.
- Each run records mode, SHA, source times, counts, warnings, reconciliation count and awaiting count in `SyncRun`; no credentials are logged.
- Replay by source identity is skipped. Legacy identity binds FTPS MDTM and SHA, so a valid later A→B→A sequence is accepted; older/non-increasing MDTM is rejected.
- XML validation, matching, physical update, reconciliation, derived availability, rollback journal and completion marker are atomic. Mid-Apply failure leaves the previous Product/allocation state intact.

Rollback is never automatic. Only the latest completed stocks-only run can be compensated, checkout must be closed, and the existing private environment profile/instance marker is required by `scripts/operate-grins-stock-rollback.ts`. The protected operation takes the normal sync lock and locks the checkout gate row. It restores physical values and changes allocations reconciled by that exact snapshot back to `awaiting_grins_sync` in the same transaction. Initialization (`previousGrinsStock IS NULL`), repeat rollback and known dependent allocation changes are rejected. Whole-database restore over newer orders is prohibited.

## Deinitialize (return to legacy mode)

Turning `GRINS_STOCK_LEDGER_ENABLED` off while `Product.grinsStock` is populated is **not** a rollback: the DB trigger then rejects every legacy `stock` write (`erp_stock_write_requires_ledger`), breaking checkout, cancel, returns and admin stock edits. `scripts/operate-grins-stock-deinitialize.ts` (`lib/sync/stock-ledger-deinitialize.ts`) is the protected manual return path. It clears only `grinsStock`, `grinsStockRunId`, `grinsStockUpdatedAt`; `stock` (availability), prices, orders, payments, allocations and the snapshot journal are unchanged and verified unchanged in the same Serializable transaction (`StockAllocation` exclusively locked, initialized products `FOR UPDATE`, shared sync lock held). It refuses unless checkout is closed, `GRINS_STOCK_SYNC_ENABLED` is not `true`, no other run holds the sync lock, no allocation is `reserved`/`committed`/`awaiting_grins_sync`, and availability matches the ledger formula. A second run is a recorded no-op. Every run is a `SyncRun` with `mode='stock-ledger-deinitialize'`.

Procedure (operator console in the app root; Plesk "Run script" cannot pass the arguments):

1. Disable the `sync:stocks:scheduled` task; set `GRINS_STOCK_SYNC_ENABLED=false` (keep `GRINS_STOCK_LEDGER_ENABLED=true`).
2. Close checkout: `scripts/operate-grins-staging.ts --action close …`. Drain payments; resolve every active/awaiting hold through the normal order paths (an awaiting hold needs a reconciling manifest snapshot — there is no forced release).
3. `npx tsx scripts/operate-grins-stock-deinitialize.ts --environment-profile <registry> --target <staging|production> --confirm-operation <instanceId> --dry-run` → exit 0 and `blockers: []` (exit 2 = blockers listed).
4. `… --execute --confirm-deinitialize <instanceId> --actor <admin user id>` (production also needs `--confirm-production <instanceId>`) → `status: completed`, `clearedProducts` = initialized count.
5. Set `GRINS_STOCK_LEDGER_ENABLED=false` (manifest/reconciliation false) → restart the web process → smoke test → open checkout.

Re-enabling later is a new cutover (fresh audit, fresh first snapshot). Isolated proof: `node --conditions=react-server --import tsx scripts/verify-grins-stock-deinitialize-pglite.ts <schema.sql>` (in-memory PGlite on loopback; schema from `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`).

## Independent-audit corrections

- A paid callback after reservation expiry now always persists `paymentStatus=paid`. If the full order cannot be re-held, availability and allocations stay unchanged and one idempotent `late_payment_stock_unavailable` operational exception is stored. The admin order list displays a red warning; the structured operational log uses `alert: true`.
- Holding a multi-line order now locks and validates every product before the first decrement. A handled insufficient-stock result therefore cannot commit a partial hold.
- Snapshot Apply journals and updates only physical changes and reconciliation candidates. Unchanged products are not locked, do not receive journal rows and keep `Product.updatedAt` unchanged. Serializable/deadlock/P2028 failures have a maximum of three attempts.
- A manifest is three hours fresh by default (configurable through the bounded flag above). Transport MDTM is used only for legacy ordering/identity, never to release acknowledged holds.
- `npm run test:stock-ledger:postgres` is a destructive synthetic runner with a fail-closed URL guard: host must be loopback and database must be exactly `hairshop_ledger_test`. It covers real PostgreSQL concurrency and 15,700 products. It must be run only after creating a disposable schema; it never reads the private environment profile.

Emergency mode C remains deliberately conservative: manifest and reconciliation stay disabled, while scheduled snapshots may update physical `grinsStock`. Acknowledged allocations continue reducing availability and accumulate. Run `npm run report:stock-ledger-holds` daily and review old holds plus products whose availability is materially lower than physical stock.

No mutating manual-compensation command is supplied. A safe future command would require exact order/allocation IDs, seller evidence that the specific quantity was posted in GrinS, closed checkout, verified backup/restore, two-person confirmation, and a unique immutable compensation key. The current data model cannot prove that evidence automatically, so releasing a hold from a total GrinS decrease remains prohibited.

## Verification notes from the independent-audit pass

- Node 22 local PostgreSQL 17 runner: 15/15 checks passed, including real `40001`, `40P01`, duplicate callbacks and rollback atomicity. At 15,700 products, a fully changing snapshot took about 5.6 s and the following no-op snapshot about 0.26 s; the no-op locked zero products, wrote zero journal rows and preserved `updatedAt`. A deliberately held product row produced a measured 284 ms wait and then completed with the invariant intact.
- Clean historical `prisma migrate deploy` is currently blocked before the ledger migration: `20260824190000_add_contact_message_answered` references an absent `ContactMessage` relation (`42P01`). The ledger tests used a disposable `prisma db push` schema plus `scripts/stock-ledger-postgres-contract.sql`; this is not evidence that the full historical migration chain is healthy. Do not edit or resolve production migration history without a separate reviewed repair.

## Migration alignment with staging (MFA column)

Staging Neon already has `20261007120000_session_mfa_verified` applied (it came from `feat/mandatory-admin-mfa`, commit `2bc14c47`). This branch now carries that migration byte-identical to `2bc14c47` and the matching schema field `Session.mfaVerified Boolean @default(false)`. Only the column is aligned: no MFA login, API, UI or session enforcement from `feat/mandatory-admin-mfa` is included, and nothing here enables MFA. No other `feat/mandatory-admin-mfa` migration is missing from this branch.

Local verification (disposable loopback PostgreSQL 17, removed afterwards): the full 61-migration chain applies in order (`…session_mfa_verified` before both ledger migrations) once the out-of-band tables below exist; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` is empty; `Session.mfaVerified` is `boolean NOT NULL DEFAULT false`. Both ledger migrations are unchanged from `9bc0532c`.

Fresh-database deploy is still blocked by the old `ContactMessage` issue: `ContactMessage`, `CompanyApiKey`, `CompanyActivityLog` and `MediaAsset` were created out-of-band on 2026-08-15 by `scripts/apply-*-table.ts`, so `20260824190000_add_contact_message_answered` fails with `42P01` on an empty database. A proposed non-rewriting repair is a new idempotent migration `20260815000000_create_out_of_band_tables` containing the exact `CREATE ... IF NOT EXISTS` SQL from those scripts; it was proven only in a scratch copy and is not part of this branch. Existing staging/production databases already contain the tables.

Before any staging migration, run `prisma migrate status` against a restored Neon child branch (direct endpoint, verified not to be staging or production): only `20261012170000_split_grins_stock_ledger` and `20261012210000_add_order_operational_exceptions` may be pending, with no failed rows. Deploy order on Plesk: `prisma migrate deploy` before restarting the app, because the admin order list reads `OrderOperationalException` even with every ledger flag false.

## Files and review focus

- Schema/migration: `prisma/schema.prisma`, `prisma/migrations/20261012170000_split_grins_stock_ledger/`.
- Core: `lib/stock-ledger*.ts`, `lib/sync/stock-{snapshot,sync-preflight}.ts`.
- Scheduler/manifest: `lib/sync/scheduled-stock-sync.ts`, `lib/sync/ftps-source-verification.ts`, `scripts/sync-products.ts`.
- Order paths: `lib/orders-data-store.ts`, order-meta single/bulk, returns, acknowledgment API/UI.
- Controls: DB trigger, FULL block, existing manual/CSV guards, restore preserving linked stock, invariant/cutover scripts.

Independent review should focus on PostgreSQL lock ordering under Neon pooling, production historical-order classification, exporter clock discipline/publication atomicity, and operational pausing of delayed payment callbacks.
