# Release runbook — Taxonomy Sync v2, BrandLine, line promotions (Windows Plesk + Neon)

Scope: commits `922a7922` (taxonomy v2, v1 lock fix), `7dd6a183` (BrandLine bootstrap), `3ba86286` (BrandLine admin),
`b2d32a16` (line promotions), `72fda299` (release bootstrap, shared locks, cache) and the stage-8 hardening (release CLI
revalidation retry/command). Three additive migrations: `20261030170000_taxonomy_snapshot_staging`,
`20261030200000_brand_line_bootstrap`, `20261030230000_promo_code_brand_lines` (rehearsed on an isolated branch; no
existing column or row is changed).

Every step is done by the owner/operator. Nothing here runs automatically. A STOP means: do not continue, keep the
current production as it is, report.

## 0. Preconditions

- Production code on Plesk is `a056e854` (confirm by the usual fingerprints: deployed chunks, `/api/internal/hairshop-catalog-sync` → 401 without key).
  **STOP** if production runs anything else: the release base must be the code actually running.
- Neon production project `lively-resonance-45595963`, branch `br-late-cherry-aqvszfzq`, endpoint `ep-long-glitter-aq88pk3t`.
- No other release, ERP backfill or migration is in progress. GrinS hourly sync healthy at the last run.

## 1. Backup and restore drill

1. Neon restore point: create a branch from production at the current state, e.g. `pre-taxonomy-release-<date>` (copy-on-write, instant).
2. Logical backup: `npm run backup:database` (writes outside the web root; keep it in `C:\Users\User\eshop02-work\backups`).
3. Restore drill (`docs/production-runbooks.md`): point `RESTORE_DATABASE_URL` at the restore branch and run `npm run test:restore`.
4. Confirm Neon PITR retention covers the release window.

**STOP** if the backup fails, the restore drill fails, or `RESTORE_DATABASE_URL` equals `DATABASE_URL`.

## 2. Release branch

1. From the reviewed feature head: `git switch -c release/<date>-taxonomy-brand-lines feature/2026-10-30-taxonomy-sync-v2-staging`.
2. Verify `git merge-base --is-ancestor a056e854 HEAD` succeeds (production commit included) and `git log a056e854..HEAD` lists only the commits above plus `dda7e3cf`/`5cb33783` (already on `main`).
3. CI on the release branch: lint, typecheck, `audit:security`, `audit:architecture`, `check:encoding`, unit, `build`.

**STOP** if `a056e854` is not an ancestor, unexpected commits appear, or CI is red (the 37 Windows CRLF allowlist failures do not occur on Linux CI).

## 3. Prisma migrations (production, explicit)

1. `npx prisma migrate status` against production. Expected: exactly the three migrations above pending (plus the known historical note about `20260802170000_add_admin_mfa`).
2. `npm run db:migrate:deploy` (uses the direct host via `prisma.config.ts`).
3. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → must print an empty migration.

Migrations must be applied **before** the new code starts: the new Prisma client reads `PromoCode.brandLineIds`.
**STOP** if status shows any other pending/failed migration, if deploy fails (then nothing else changes: the old code
ignores the new tables and column), or if the diff is not empty.

## 4. Deploy through the existing Plesk workflow (`docs/deploy-plesk.md`)

1. Plesk: switch the deployed branch to the release branch, `git pull`, `npm ci`, `npm run build`, Restart App.
2. Environment: keep `HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED` **unset** (the v2 endpoint answers 403). No other env change.

**STOP / roll back the app** (redeploy the previous Plesk branch `fix/2026-10-30-client-email-save` = `a056e854`) if the build fails or the app does not start.

## 5. Smoke tests (production, read-only)

- `/`, `/lv`, `/lv/catalog`, `/lv/cart`, `/lv/checkout` → 200; health → db ok; guest sees no prices (`/api/products`, `/api/search`).
- `/api/internal/hairshop-catalog-sync` without key → 401; `/api/internal/hairshop-catalog-sync/taxonomy` with key → 403 (write disabled), without key → 401.
- `/api/internal/hairshop-catalog-sync/storefront-revalidate` without key → 401.
- Admin: `/lv/admin/brand-lines` opens and is empty; `/lv/admin/marketing/discounts` and `/campaigns` open; existing promo codes and campaigns unchanged.
- Manager account: `/api/admin/brand-lines` → 403. Paysera webhook GET → 405. Next GrinS hourly run completes without errors.

**STOP / roll back the app** if any check fails. The new tables can stay (unused by the old code).

## 6. Controlled taxonomy snapshot load — CONDITIONS NOT MET YET

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
- Application rollback: redeploy the previous Plesk branch; the additive tables/column stay and are ignored by the old code.
- BrandLine data: never delete in a hurry. Promotions only use lines an administrator selects; to neutralise a mistake,
  archive the line or exclude products in `/admin/brand-lines`. A full data rollback (emptying the BrandLine tables) needs
  a separate owner decision and a fresh backup.
- Database recovery only from the step-1 restore point/PITR, never by ad-hoc destructive SQL.
