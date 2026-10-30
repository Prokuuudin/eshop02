# Release runbook — Taxonomy Sync v2, BrandLine, line promotions (Windows Plesk + Neon)

| Item | Value (verified 2026-10-31, read-only) |
|---|---|
| Production application | `a056e854` — public fingerprints: chunk `2178-5153e8ea9a56b8cd.js` contains "Не сохранено", pages reference `5147-6dbdd902ed4373d8.js`, `/api/internal/hairshop-catalog-sync` GET 405 / POST without key 401, new routes absent (404 fallback) |
| Plesk branch | **presumed** `fix/2026-10-30-client-email-save` (= `a056e854`; the only origin branch at that commit, matches the owner's deploy record). Plesk itself was not inspected — **must be confirmed directly in Plesk** (Git settings / `git rev-parse HEAD` in the application directory) before the deploy |
| origin/main | `5cb33783` = `a056e854` + `dda7e3cf`; no other branch moved since 2026-10-30 |
| Release branch | `release/2026-10-31-taxonomy-brand-lines` on origin (published 2026-10-31, not deployed): stage 1–8 commits `922a7922`…`ae5e68a5` plus this runbook update, on top of `5cb33783` |
| Application rollback target | `a056e854` (presumed branch `fix/2026-10-30-client-email-save`) |
| Production migrations pending | exactly three: `20261030170000_taxonomy_snapshot_staging`, `20261030200000_brand_line_bootstrap`, `20261030230000_promo_code_brand_lines` |
| Taxonomy write gate | `HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED` stays **unset (off)** during and after the deploy |
| C1 / C2 | conditions of the **separate** taxonomy activation (section 6), not of this deploy |

Content difference production → release: the stage 1–8 feature files, `dda7e3cf` (manual-import refactor, already on
`main`, CI green) and the offline script `scripts/repair-client-name-encoding.ts`. Other `main`-only history is
already in production under other hashes (identical content). No GrinS, stock, order, payment, cart or checkout file
changes; `package.json`/`package-lock.json` are identical to production.

Schema change production → release (introspected): 11 new tables with their indexes, foreign keys and one trigger on
`BrandLine`, plus `ALTER TABLE "PromoCode" ADD COLUMN "brandLineIds" TEXT[] DEFAULT ARRAY[]::TEXT[]`. Nothing is dropped,
altered or rewritten. The production (`a056e854`) Prisma client was run against the migrated schema: promo-code
read/create/update, products, orders, sync runs and campaigns all work, and new promo rows get `brandLineIds = []` —
so rolling back only the application is safe.

Every step is done by the owner/operator. Nothing here runs automatically. A STOP means: do not continue, keep the
current production as it is, report.

## 0. Preconditions

- Re-check the fingerprints above immediately before the release. **STOP** if production is not `a056e854` or a
  branch other than the ones above changed: re-run the divergence analysis first.
- Confirm in Plesk itself which branch and commit the application directory runs. **STOP** if it is not `a056e854`
  (the rollback target and the migration baseline above assume it).
- Neon production project `lively-resonance-45595963`, branch `br-late-cherry-aqvszfzq`, endpoint `ep-long-glitter-aq88pk3t`.
- No other release, ERP backfill or migration is in progress. The last GrinS hourly sync succeeded.

## 1. Backup and restore drill

1. Neon restore point: create a branch from production at the current state, e.g. `pre-taxonomy-release-<date>` (copy-on-write, instant).
2. Logical backup: `npm run backup:database` (writes outside the web root; keep it in `C:\Users\User\eshop02-work\backups`).
3. Restore drill (`docs/production-runbooks.md`): point `RESTORE_DATABASE_URL` at the restore branch and run `npm run test:restore`.
4. Confirm Neon PITR retention covers the release window.

**STOP** if the backup fails, the restore drill fails, or `RESTORE_DATABASE_URL` equals `DATABASE_URL`.

## 2. Release branch

1. `release/2026-10-31-taxonomy-brand-lines` is on origin (published 2026-10-31; nothing deployed).
2. Before the deploy verify: `git merge-base --is-ancestor a056e854 release/2026-10-31-taxonomy-brand-lines` succeeds and
   `git diff --stat a056e854 release/2026-10-31-taxonomy-brand-lines -- package.json package-lock.json` is empty.
3. CI on the release branch: lint, typecheck, `audit:security`, `audit:architecture`, `check:encoding`, unit, `build`.

**STOP** if `a056e854` is not an ancestor, the package files differ, or CI is red (the 37 Windows CRLF allowlist
failures do not occur on Linux CI).

## 3–4. Plesk deployment with migrations first (`docs/deploy-plesk.md`, unchanged workflow)

**Mandatory order, no step may be skipped or moved:** backup (section 1) → restore check (section 1) → Prisma
migrations (steps 3–5) → Prisma Client generation (step 6) → Plesk build (step 6) → production checks (section 5).

**Never build the new release before the required migrations have been applied** (no `npm run prisma:generate`,
`npm run build` or `npm run build:plesk` before step 5 passes). On Windows Plesk, not pressing Restart App does **not**
keep the old version running: on 2026-10-31 `npm run build:plesk` alone made production serve the new code on the
old schema, and promo-code validation returned 500 until the migrations were applied.

Order on the Plesk server, in the application directory:

1. Switch the deployed branch to `release/2026-10-31-taxonomy-brand-lines` and `git pull`. Do **not** build or restart yet.
2. `npm ci` (lockfile is identical to production).
3. `npx prisma migrate status` → exactly the three migrations above pending (plus the known historical rows of
   `20260802170000_add_admin_mfa` / `20260802200000_harden_product_mutations`).
4. `npm run db:migrate:deploy`, in a quiet window (no running ERP sync, no bulk admin edits). The first two files
   run in their own transaction with `lock_timeout = 5s`; the `ProductBrandLine → Product` foreign key briefly locks
   `Product` (writes wait, reads continue). The third file is a metadata-only `ADD COLUMN` on `PromoCode` without a
   lock timeout: it is instant, but waits behind any long transaction holding `PromoCode` (and queues promo reads
   meanwhile). **STOP** and cancel it if it does not finish within a few seconds.
5. `npx prisma migrate status` → nothing pending; `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → empty migration.
6. Only after step 5: `npm run prisma:generate`, then `npm run build:plesk`, then Plesk → Node.js → Restart App.
   Assume the new code may already be live as soon as the build finishes; go to section 5 immediately.
7. Environment: keep `HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED` **unset** (the v2 endpoint answers 403). No other env change.

The new code must not start before step 5 passes: it reads `PromoCode.brandLineIds`, and promo-code validation
(and therefore checkout with a promo code) would fail without the column. The old process is fully compatible with
the migrated schema, but it is only guaranteed to keep serving while nothing of the new release has been built.

**STOP** before step 6 if step 3 shows anything else pending/failed, or step 4/5 fails. On a migration failure do
**not** run any corrective command (`prisma migrate resolve`, a re-run of `migrate deploy`, manual SQL). Keep the old
application running (it is compatible with every subset of these additive migrations) and only diagnose, read-only:
- `npx prisma migrate status` — which migration failed and which are applied;
- the `_prisma_migrations` row of the failed migration (`finished_at`, `rolled_back_at`, `logs`);
- in PostgreSQL, which objects of that migration exist (tables, indexes, foreign keys, the `BrandLine` trigger, the
  `PromoCode.brandLineIds` column) — the first two files run in a transaction, the third is a single statement;
- `pg_stat_activity` / `pg_locks` for the blocking or long-running transaction (lock timeout).

Report the findings. Any corrective action is a separate owner decision after this diagnosis. Never start the new
code on a partial schema.
**Roll back the application** to `a056e854` (`fix/2026-10-30-client-email-save`: git checkout, `npm ci`,
`npm run build`, Restart App) if the build fails or the app does not start. Leave the migrations in place.

## 5. Smoke tests (production, read-only)

- `/`, `/lv`, `/lv/catalog`, `/lv/cart`, `/lv/checkout` → 200; health → db ok; guest sees no prices (`/api/products`, `/api/search`).
- `/api/internal/hairshop-catalog-sync` GET → 405, POST without key → 401; `/api/internal/hairshop-catalog-sync/taxonomy`
  POST without key → 401 and with the key → 403 (`taxonomy_sync_write_disabled`).
- `/api/internal/hairshop-catalog-sync/storefront-revalidate` POST without key → 401.
- Admin: `/lv/admin/brand-lines` opens and is empty; `/lv/admin/marketing/discounts` and `/campaigns` open; existing
  promo codes and campaigns unchanged; validating an existing promo code in the cart still works.
- Manager account: `/api/admin/brand-lines` → 403. Paysera webhook GET → 405. The next GrinS hourly run completes without errors.

**STOP / roll back the application** to `a056e854` if any check fails. The new tables and column stay (the old code ignores them).

## 6. Controlled taxonomy snapshot load — separate activation, CONDITIONS C1/C2 NOT MET

Required before this step can run:
- **C1** a read-only MSSQL principal on the live nopCommerce database (`tools/hairshop-catalog-exporter/sql/provision-catalog-reader.sql`, executed by the database administrator); the exporter refuses any other principal.
- **C2** a v2 sender: the PowerShell module builds the begin/batch/finalize requests (`New-HairshopTaxonomySyncRequests`) but has no HTTP sender yet. It must POST them in order to `/api/internal/hairshop-catalog-sync/taxonomy` with the catalog-sync key, retry identical requests on network errors, and stop on any 4xx.

When C1 and C2 exist:
1. Export with the read-only principal; check counts against the reference (≈533 categories, ≈231 manufacturers, ≈14.2k product–category edges; reference only, not limits).
2. Set `HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED=true` for the load window only. Send in `dry-run` mode, then in `apply` mode with a new `runId`.
3. Unset the flag again (Restart App).

**STOP** if any request is rejected (`*_mismatch`, `snapshot_incomplete`, hierarchy errors, `stale_snapshot`), if counts differ
by more than a few percent from the reference, or if finalize does not return `completed` with `mirrorApplied: true`.
A rejected snapshot never changes the mirror; fix the source and use a new `runId`.

## 7. Production BrandLine plan (read-only)

From the operator machine (NEON_API_KEY and the production `DATABASE_URL` in the environment, never printed):

```
node --conditions=react-server --import tsx scripts/brand-lines-release.ts plan \
  --expect-project lively-resonance-45595963 --expect-branch br-late-cherry-aqvszfzq --expect-endpoint ep-long-glitter-aq88pk3t \
  --seed <reviewed inventory.json> --out plan.json
```

Expected for the first run: about 32 lines, 294 product links, 0 missing marks, ~32 review items, 0 preserved overrides.
**STOP** on any refusal (`ENDPOINT_MISMATCH`, `BRANCH_MISMATCH`, `MIGRATIONS_MISSING`, `NO_ACTIVE_SNAPSHOT`, `SYNC_IN_PROGRESS`),
if `guard.exceeded` is true, or if the counts differ materially from the expectation. Owner reviews `plan.json`.

## 8. Production apply (separate owner approval)

Only after the owner approves the exact `planSha256`:

```
BRANDLINE_RELEASE_APPLY_ENDPOINT=ep-long-glitter-aq88pk3t HAIRSHOP_CATALOG_SYNC_SECRET=<key> \
node --conditions=react-server --import tsx scripts/brand-lines-release.ts apply --plan plan.json --approve <planSha256> \
  --operator <platform admin e-mail> --expect-project ... --expect-branch ... --expect-endpoint ... --seed <same inventory.json> \
  --revalidate-base-url https://hairshoppro.lv
```

Exit 1 = refused (nothing written; e.g. `PLAN_CHANGED` → plan again). Exit 2 = transaction failed and rolled back.
Exit 0 = committed and caches revalidated. Exit 3 = committed, revalidation pending (step 9).
**STOP** on exit 1 or 2; never retry with a different approval without a new plan review.

## 9. Cache invalidation

Done by step 8. If it returned 3: `brand-lines-release.ts revalidate --plan plan.json --revalidate-base-url https://hairshoppro.lv`
(idempotent, safe to repeat). Without it the caches still expire within 10 minutes (sale 300 s, bestsellers 600 s);
checkout and promo validation are always computed live.

## 10. Monitoring and rollback

- First hour: application errors, `hairshop_taxonomy_sync_v2_*` and `brand_line_storefront_revalidated` events, admin
  `/lv/admin/brand-lines` (32 lines, review queue open), one guest and one customer checkout, the next GrinS run.
- AuditLog: one `catalog.brand_line_bootstrap_applied` row per apply, `storefront.cache_revalidated` rows.
- Application rollback: redeploy `a056e854` (`fix/2026-10-30-client-email-save`); the additive tables/column stay and are ignored by the old code (verified with the production Prisma client).
- BrandLine data: never delete in a hurry. Promotions only use lines an administrator selects; to neutralise a mistake,
  archive the line or exclude products in `/admin/brand-lines`. A full data rollback (emptying the BrandLine tables) needs
  a separate owner decision and a fresh backup.
- Database recovery only from the step-1 restore point/PITR, never by ad-hoc destructive SQL.
