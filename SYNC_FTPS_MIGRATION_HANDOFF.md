# SYNC FTPS MIGRATION — HANDOFF

Last updated: 2026-10-03 (Claude Code session). No secrets in this file — keep it that way.

## Goal

Move Hairshop Pro's ERP feed from the Hairshop.lv-dependent FTPS to an independent
GrinS → Hairshop Pro export on a separate FTPS, without breaking or switching the
current production sync until the new source is verified and the owner approves.

- Current: GrinS → Hairshop.lv / nopCommerce / Misc.Importer → `export.xml` on Hairshop FTPS → Hairshop Pro
- Target:  GrinS → independent Hairshop Pro export → separate FTPS → Hairshop Pro

Runbook (commands, cutover, rollback): `docs/erp-ftps-source-migration.md`.

## Audit findings (stage 1)

Chain: `scripts/sync-products.ts --scheduled` → `lib/sync/scheduled-sync.ts runScheduledSync`
(kill switch `SYNC_PULL_ENABLED==='true'` → `isSyncLockHeld` → `downloadFtpsFileWithMetadata(getFtpsConfigFromEnv())`
→ `auditGrinsXml` + `parseGrinsXml` → `evaluatePreflight` (HARD/WARN, `lib/sync/sync-preflight.ts`)
→ `runSync` (`lib/sync/sync-runner.ts`, CAS lock, UPDATE-only price/stock by exact externalId) → `SyncRun`).
`--dry-run [--file]` = read-only report with catalog fingerprint. `--execute --file` = SHA-pinned
(`26c00136…`) + `assertBackfillDone` (18544/15754).

- No hard dependency on Hairshop.lv domain, nopCommerce, Misc.Importer, FTP host name or directory
  layout in code — only `GRINS_FTPS_*` env (mentions exist only in comments).
- Before this work: port not configurable (always 21); explicit TLS only; Node default cert validation.
- Price = `price2` (`SYNC_PRIMARY_PRICE_TIER` default), stock = warehouses idx 1,2,3,6 (ids 10000/10001/10002/10005).
- Real local `export.xml` (2026-09-26, SHA `26c00136…`, 16176 rows, 114 leading-zero SKUs, 944 price2=0) passes the new verification.

## Decisions

1. Production stays on `GRINS_FTPS_*`. Cutover = replace those values. No second production config system.
2. New source under test = separate `GRINS_FTPS_CANDIDATE_*`, read **only** by
   `scripts/verify-ftps-source.ts --source candidate`. Never falls back to / mixes with primary values.
   `getFtpsConfigFromEnv()` (scheduled, dry-run, backfill) reads primary only — unit-tested.
3. Compare/dry-run work on **saved local files** (exact SHA-identified bytes), not live downloads.
4. Dry-run reuses existing `sync-products.ts --dry-run --file`; added the same read-only
   `evaluatePreflight` the scheduled run uses (`scheduledPreflight` in report, HARD → `critical`, exit 2).
   No business logic duplicated.
5. No TLS bypass, no implicit-TLS support added (would need a code change + review if the sysadmin requires it).
6. Optional `GRINS_FTPS_PORT` / `GRINS_FTPS_CANDIDATE_PORT` added (empty → 21).
7. `npm run build` NOT run: it executes `prisma migrate deploy` against production. Changed modules are
   not imported by app code; `tsc --noEmit` covers types.

## Files

Changed:
- `lib/sync/ftps-client.ts` — `FtpsSource`, `getFtpsConfigForSource`, optional port, TLS diagnostics + remote SIZE in `FtpsDownload` (diagnostic only; scheduled path ignores them)
- `lib/sync/ftps-client.test.ts` — source separation, port, port passed to access
- `lib/sync/grins-xml-parser.ts` — exported `readGrinsXmlItems` (raw items via the same parser; parse logic unchanged)
- `scripts/sync-products.ts` — dry-run adds `scheduledPreflight`
- `.env.example`, `.gitignore` (`/.ftps-migration/`), `docs/deploy-plesk.md` (pointer + port)

New:
- `lib/sync/ftps-source-verification.ts` (+ `.test.ts`) — `verifyExport`, `checkFtpsSource`, `compareExports`, `summarizeComparison`, `parseVerifyTarget`, `sameSourceWarning`
- `scripts/verify-ftps-source.ts`, `scripts/compare-ftps-exports.ts`
- `docs/erp-ftps-source-migration.md`, this file

Not touched (do not change without reason): parser rules, `sync-rules.ts`, `sync-runner.ts`,
`upsert-products.ts`, preflight thresholds, `sync-lock.ts`, `scheduled-sync.ts`, `--execute` path.

## Commands

```
npx tsx scripts/verify-ftps-source.ts --source candidate      # new FTPS
npx tsx scripts/verify-ftps-source.ts --source primary        # current FTPS
npx tsx scripts/verify-ftps-source.ts --file <xml>
npx tsx scripts/compare-ftps-exports.ts --old <primary xml> --new <candidate xml>
npx tsx scripts/sync-products.ts --dry-run --file <candidate xml>
```

## Verification done (2026-10-03)

- `vitest lib/sync/` — 34 files / 352 tests passed (incl. 35 new/updated FTPS tests).
- Full unit suite (`vitest run --config vitest.config.ts`) — 281 files / 1889 tests passed.
- `tsc --noEmit` — clean. `eslint` on changed files — clean.
- Offline: `verify --file export.xml` → PASS. Usage errors (no `--source`, missing candidate env) → exit 1, clear message.
- `compare` on real export vs mutated copy → FAIL on leading-zero loss `07P→7P`, lists missing SKUs and Pro-warehouse 10001 diffs; report in `.ftps-migration/` (gitignored, verified).
- `sync-products.ts --dry-run --file export.xml` against production DB → `databaseWrites 0`, `catalogUnchanged true`,
  matched 15753, updates 0, conflicts 0, `scheduledPreflight.hard []`, `critical []`.
- NOT tested: real FTPS network path (no `GRINS_FTPS_*` in local `.env.local`). First server run of
  `verify --source primary` exercises it.

## Known issues (not fixed, out of scope)

- DB has `externalIdCount=15753`, `assertBackfillDone` expects 15754 (drift from the 2026-09-28 19073↔BLK unlink).
  Affects only the manual `--execute` path, not scheduled sync.
- Exports downloaded at different times will differ in stock (and possibly prices) — compare verdict REVIEW is expected; explain the diffs.

## Status

- [x] Stage 1 audit
- [x] Stage 2 configurable source (candidate env)
- [x] Stage 3 verification command
- [x] Stage 4 comparison tool
- [x] Stage 5 dry-run (existing, + scheduled preflight)
- [x] Stage 6 safety gates (documented; enforced by verify/compare/dry-run verdicts)
- [x] Stage 7 tests
- [x] Stage 8 docs
- [ ] Waiting for sysadmin: new FTPS host, port, TLS mode, user, password, remote path, independence confirmation, export schedule, XML format confirmation, cert/firewall/IP restrictions
- [ ] Cutover steps 1–19 (owner approval required)

Branch: `main`. Git status / last task commit: see `git log --oneline -5` and `git status` — commit
is `feat(sync): verify and compare candidate FTPS export source` if it was made in this session.

## NEXT STEP

When the sysadmin provides the new FTPS: put the values into server `.env.local` as `GRINS_FTPS_CANDIDATE_*`, then run
`npx tsx scripts/verify-ftps-source.ts --source candidate` on the server (needs outbound FTPS to the new host),
then `--source primary`, then compare, then dry-run (see runbook). Report results to the owner. Stop.

## FORBIDDEN without the owner's explicit permission

- Changing production env (`GRINS_FTPS_*`, `SYNC_PULL_ENABLED`) or Plesk scheduled task
- Any write FULL sync (`--execute`, manual `runSync`)
- Disabling/removing the old FTPS or its credentials
- Relaxing preflight thresholds / parser / rules to fit the new export
- Destructive DB operations, migrations, `npm run build` (runs prod migrations)
- Committing XML exports, `.ftps-migration/` contents or any secret

## Cutover checklist (after approval)

1. verify candidate PASS (TLS authorized) · 2. verify primary PASS · 3. compare not FAIL, REVIEW explained ·
4. dry-run candidate file: `critical []`, `hard []`, `conflicts 0`, `catalogUnchanged` · 5. owner approval ·
6. record old `GRINS_FTPS_*` privately · 7. (optional) `SYNC_PULL_ENABLED=false` · 8. replace `GRINS_FTPS_*` in server `.env.local` ·
9. `verify --source primary` PASS on new values · 10. `--dry-run` (no file) `critical []` · 11. `SYNC_PULL_ENABLED=true` ·
12. next hourly `SyncRun` cron completed, errorCount 0, sha matches · 13. spot-check products · 14. second hourly run OK ·
15. remove `GRINS_FTPS_CANDIDATE_*` · 16. keep old FTPS until stable.

## Rollback checklist

1. `SYNC_PULL_ENABLED=false` · 2. restore old `GRINS_FTPS_*` · 3. `verify --source primary` PASS ·
4. `--dry-run` `critical []` · 5. `SYNC_PULL_ENABLED=true` · 6. check next `SyncRun`.
