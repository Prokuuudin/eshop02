# ERP FTPS source migration (GrinS → Hairshop Pro)

Operational runbook. No secrets here — credentials live only in the server
`.env.local` (and Plesk panel), never in Git.

## Current

```
GrinS → Hairshop.lv / nopCommerce / Misc.Importer → export.xml on Hairshop FTPS → Hairshop Pro
```

Production source = `GRINS_FTPS_HOST/USER/PASSWORD/REMOTE_PATH` (+ optional `GRINS_FTPS_PORT`).

## Target

```
GrinS → independent Hairshop Pro export → separate FTPS → Hairshop Pro
```

Same XML contract (`<root><item>`, `sku`, `price1..4`, `quantity`, `warehouses/warehouse id=1..9`).
Only the transport changes. Parser, price/stock rules, `externalId = trim(sku)`,
preflight thresholds, lock and `runSync()` stay untouched.

## How the two sources are kept apart

| Variables | Read by | Purpose |
|---|---|---|
| `GRINS_FTPS_*` | scheduled sync, `--dry-run`, backfill, `verify --source primary` | **production** source |
| `GRINS_FTPS_CANDIDATE_*` | **only** `verify-ftps-source.ts --source candidate` | new source under verification |

The candidate set never falls back to primary values, and the scheduled sync
code has no path that reads it (unit-tested). Setting candidate variables
cannot switch production. Cutover = replacing the `GRINS_FTPS_*` values.

Transport: explicit TLS (`AUTH TLS`) with Node's normal certificate validation.
Implicit TLS (port 990) and self-signed/untrusted certificates are **not**
supported and are not bypassed — they fail verification with the TLS error.

## New source = Hairshop Pro exporter (tools/grins-pro-exporter)

Installation/shadow/candidate steps: `docs/grins-pro-exporter-runbook.md`. Its export differs from
Hairshop.lv **intentionally** (owner decision 2026-10-05): `warehouse id="9"` is always 0 (legacy
wrote 10009 there — it was never Jelgava/10010) and `quantity` = sum of ids 1..8 instead of all
warehouses. Neither is used by `Product.stock`/`Product.price`, so `compare` below reports no
REVIEW reason for them; `python -m grins_pro_exporter compare --legacy ... --pro ...` classifies them
explicitly. Add `--manifest` to `verify --source candidate` to also check `export.manifest.json`
(SHA/size/count match the downloaded XML and `generatedAt` ≤ 36 h — distinguishes a fresh export
from yesterday's file downloaded again).

## 1. Verify the new source (read-only, no DB)

On the server, add to `.env.local` (values from the sysadmin):

```
GRINS_FTPS_CANDIDATE_HOST=<new host>
GRINS_FTPS_CANDIDATE_USER=<user>
GRINS_FTPS_CANDIDATE_PASSWORD=<password>
GRINS_FTPS_CANDIDATE_REMOTE_PATH=<path to export.xml>
GRINS_FTPS_CANDIDATE_PORT=          # empty = 21
```

```
npx tsx scripts/verify-ftps-source.ts --source candidate
npx tsx scripts/verify-ftps-source.ts --source primary
```

Each run: connects over explicit TLS, reports TLS protocol/cipher/certificate,
remote mtime/size, downloads the file to `.ftps-migration/<source>-export-<time>-<sha8>.xml`
(gitignored) plus `.verification.json`, and prints `RESULT: PASS|FAIL`.
Exit: `0` PASS, `2` contract FAIL, `1` connection/usage error.

Checked: XML validity, row count ≥ 14 000, size, SHA-256, unique/empty/duplicate
SKUs, leading-zero SKUs, invalid/negative prices and stocks, warehouse indexes
1–9 present, every item has `sku/price1-4/quantity/warehouses` and Pro
warehouses 1, 2, 3, 6, price2=0 ratio vs the scheduled HARD limit (15 %).
A warning is printed if the candidate points at the same host/port/path/user as primary.

Re-check an already downloaded file: `npx tsx scripts/verify-ftps-source.ts --file <xml>`.

## 2. Compare OLD vs NEW (read-only)

Download both close together in time (stock moves hourly), then:

```
npx tsx scripts/compare-ftps-exports.ts --old .ftps-migration/primary-export-<…>.xml --new .ftps-migration/candidate-export-<…>.xml
```

Prints a summary; the full diff goes to `.ftps-migration/compare-<time>.json`.
Verdict: `FAIL` (exit 2) — NEW invalid/structurally broken, required elements
missing, leading zeros lost, > 10 % of OLD SKUs missing; `REVIEW` (exit 0) — any
difference a human must explain (SKU sets, price1–4, price2=0 transitions, Pro
warehouse stock 10000/10001/10002/10005, Product.stock, non-Pro stock, element
set, format/type changes); `PASS` — identical content.

## 3. Dry-run NEW against the real catalog (read-only)

```
npx tsx scripts/sync-products.ts --dry-run --file .ftps-migration/candidate-export-<…>.xml
```

Same parser and matching as production. No writes: the report proves it with a
catalog fingerprint before/after (`databaseWrites: 0`, `catalogUnchanged: true`).
Shows matched / updates / unchanged / unlinkedXml / missing / wouldDeactivate /
conflicts / `PRICE_TIER_ZERO_SKIPPED`, and `scheduledPreflight` — the exact
HARD/WARNING gates the hourly run would apply. Any HARD failure is listed in
`critical` and the exit code is `2`.

`--execute` cannot be used with the new file (SHA-pinned to the old snapshot).

## Safety gates before cutover (all required)

1. `verify --source candidate` → PASS, TLS authorized.
2. Sysadmin confirmed the export is generated independently of Hairshop.lv and its schedule.
3. `compare` → not FAIL; every REVIEW reason explained (expected: small stock/price timing differences).
4. `dry-run --file <candidate xml>` → `critical: []`, `scheduledPreflight.hard: []`, `conflicts: 0`, `catalogUnchanged: true`.
5. Owner's explicit approval.

If NEW does not match the contract: stop and report. Do not adapt the parser or
relax thresholds to fit it.

## Production cutover (only after approval)

1. Record the current `GRINS_FTPS_HOST/USER/REMOTE_PATH/PORT` values somewhere
   private (password manager) — these are the rollback values. Do not put them in Git.
2. Optionally set `SYNC_PULL_ENABLED=false` for the edit window.
3. In the server `.env.local` (what the Scheduled Task reads; also the Plesk Node.js
   panel if set there) replace:
   `GRINS_FTPS_HOST`, `GRINS_FTPS_USER`, `GRINS_FTPS_PASSWORD`,
   `GRINS_FTPS_REMOTE_PATH`, `GRINS_FTPS_PORT` (if non-standard) with the new values.
4. `npx tsx scripts/verify-ftps-source.ts --source primary` → PASS (proves the new values are live).
5. `npx tsx scripts/sync-products.ts --dry-run` (no `--file`: downloads via the new primary) → `critical: []`.
6. `SYNC_PULL_ENABLED=true`. No app restart needed: the Scheduled Task starts a fresh
   process every hour and reads `.env.local` itself. (Restart iisnode only if `GRINS_FTPS_*`
   were changed in the Plesk panel and something in the web app uses them — currently nothing does.)
7. After the next hourly run: latest `SyncRun` is `triggeredBy='cron'`, `status='completed'`,
   `errorCount=0`; `errorSample.xmlSha256` matches a fresh `verify --source primary`.
8. Spot-check several products (price = price2, stock = warehouses 1+2+3+6, leading-zero SKUs).
9. Confirm the following hourly run also completes. Only then is the migration done.
10. Remove `GRINS_FTPS_CANDIDATE_*` from `.env.local`. Keep the old FTPS reachable until stable.

## Rollback

1. `SYNC_PULL_ENABLED=false` (stops the next hourly run immediately).
2. Restore the recorded old `GRINS_FTPS_*` values in `.env.local` (and Plesk panel if used).
3. `npx tsx scripts/verify-ftps-source.ts --source primary` → PASS against the old host.
4. `npx tsx scripts/sync-products.ts --dry-run` → `critical: []`.
5. `SYNC_PULL_ENABLED=true`; check the next `SyncRun`.

The sync is UPDATE-only for price/stock of linked products, so a run from either
source never creates, deletes or deactivates products; the next successful run
from the restored source overwrites price/stock again.
