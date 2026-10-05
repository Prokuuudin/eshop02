# GrinS → Hairshop Pro exporter — runbook

Operational guide for `tools/grins-pro-exporter` (Python, stdlib only). It replaces the Hairshop.lv
`GrinsSyncService.exe` **as a data source for Hairshop Pro only**; Hairshop.lv keeps its own
integration. No secrets in this file or in Git.

```
GrinS live DB (C:\Grins\Sklad\DB, read-only)
  → stable snapshot (copy A, pause, copy B, SHA-256 equal, source size/mtime unchanged)
  → Paradox validation (pinned schema fingerprint, file size, block chain, record counts)
  → Hairshop Pro export.xml (warehouse policy 10000–10007)
  → preflight (counts vs last good export, prices, warehouses, quantity == sum 1..8, XML round-trip)
  → local export.xml + export.manifest.json
  → [mode "publish" only] candidate FTPS: STOR *.part → SIZE → RNFR/RNTO (atomic replace)
  → existing Hairshop Pro scheduled sync (parser/preflight/runner unchanged)
```

## Business rules (owner decision 2026-10-05)

| | Hairshop.lv (legacy) | Hairshop Pro (this exporter) |
|---|---|---|
| SKU | `TovarKod` without spaces | same |
| price1..4 | `Cena1..Cena4` | same (identical text) |
| warehouse id 1..8 | 10000..10007, Σ positive integer `Kolvo` per lot | same values |
| warehouse id 9 | 10009 | **always 0** (slot kept for the parser) |
| quantity | positive `Kolvo` over **all** warehouses | **sum of id 1..8 only** |
| title | pre-escaped + escaped again (`&amp;quot;`) | escaped once (title is not used by the sync) |

Ignored: 10008, 10009, 10010 (Jelgava, closing), 2377, blank and any unknown warehouse code
(explicit allowlist, unknown codes are logged as `unknown_warehouse_codes`). The quantity
difference is an **INTENTIONAL BUSINESS DIFFERENCE**, not an incompatibility.

`Product.stock` in Hairshop Pro is unchanged: Σ max(0) of 10000/10001/10002/10005
(`lib/sync/sync-rules.ts`). XML `quantity` is not used by the sync (validation/diagnostics only).

A lot with a non-integer or > 2^31 `Kolvo` in an allowed warehouse stops the export (legacy
silently dropped such lots; none exist in the 2026-10-05 data).

## Prerequisites (GrinS LAN machine)

- Windows with read access to `C:\Grins\Sklad\DB` (local path or UNC share).
- Python 3.8+ from python.org (tested with 3.13), "Install for all users", `py` launcher. No pip packages.
- A dedicated Windows account for the task (log on as batch job), read-only on the GrinS directory,
  full control only on `C:\GrinsProExporter\`.
- Outbound TCP to the candidate FTPS (control port + passive data ports). The certificate must
  chain to a CA in the Windows trust store (or set `publish.caFile`). Self-signed/expired = failure.

## Install

1. Copy `tools/grins-pro-exporter/` to `C:\GrinsProExporter\` (folder with `grins_pro_exporter\`,
   `run-exporter.cmd`, `config.example.json`).
2. Restrict NTFS permissions on `C:\GrinsProExporter\` to the task account + administrators
   (snapshots contain prices and cost data).
3. `copy config.example.json config.json` and edit paths/host. Keep `"mode": "shadow"`.
   `work/out/logs/state` must not be inside the GrinS directory (enforced).
4. Secrets — logged in **as the task account** (Credential Manager is per user):
   `cmdkey /generic:GrinsProExporter/ftps /user:<ftps-user> /pass` (prompts for the password).
   Optional alerts: `cmdkey /generic:GrinsProExporter/smtp /user:<smtp-user> /pass`, or for a
   webhook store the https URL as the password of `GrinsProExporter/webhook`.
5. `py -3 -m grins_pro_exporter --config C:\GrinsProExporter\config.json check-config` → all checks `ok`/`present`.

## Commands

```
cd /d C:\GrinsProExporter
py -3 -m grins_pro_exporter --config config.json check-config
py -3 -m grins_pro_exporter --config config.json run --dry-run    # snapshot+validate+preflight, writes no outputs
py -3 -m grins_pro_exporter --config config.json run --shadow     # local export.xml + manifest, never FTPS
py -3 -m grins_pro_exporter --config config.json run              # mode from config.json
py -3 -m grins_pro_exporter --config config.json probe-ftps       # probe-* files only; must report atomicPublishSupported=true
py -3 -m grins_pro_exporter compare --legacy primary.xml --pro out\<run>\export.xml [--same-snapshot]
py -3 -m grins_pro_exporter build --snapshot-dir <dir with CENIC.DB/OSTATOK.DB> --out x.xml --manifest m.json
```

Exit codes: 0 ok · 10 skipped (another run holds the lock) · 20 config · 30 snapshot · 40 source
validation · 50 data/preflight · 60 publish · 70 internal. Any non-zero code = nothing was published.

Logs: `C:\GrinsProExporter\logs\exporter-YYYY-MM-DD.log` (UTC date), one JSON object per line:
`export_started, snapshot_started, snapshot_unstable, snapshot_completed, paradox_validation_completed,
export_generated, export_preflight_completed, local_output_written, upload_started, upload_completed,
publish_completed, export_completed, export_failed (stage, reason, runId, ts), export_skipped, alert_*`.

## Schedule (Task Scheduler)

Copy only after GrinS work ends (sysadmin: weekdays after 19:00, weekends after 16:00). One daily
run at 20:00 local time satisfies both:

```
schtasks /Create /TN "GrinsProExporter" /SC DAILY /ST 20:00 /RU <DOMAIN\task-user> /RP ^
  /TR "C:\GrinsProExporter\run-exporter.cmd"
```

Settings: "Do not start a new instance" if running; stop after 1 hour. The schedule lives only here,
not in code. Timestamps in the manifest are UTC (`generatedAt` ends with `Z`) plus the host offset.

## Rollout (no cutover in this stage)

1. **Shadow** (`"mode": "shadow"`), several days: check logs, `out\<run>\export.xml`,
   `compare --legacy <Hairshop.lv export> --pro out\<run>\export.xml` → only intentional
   differences + time drift; consumer check on a dev machine:
   `npx tsx scripts/verify-ftps-source.ts --file export.xml --manifest-file export.manifest.json` → PASS.
2. **Candidate**: `probe-ftps` → `atomicPublishSupported: true`; then `"mode": "publish"` with the
   **candidate** FTPS location. On the Hairshop Pro server (`GRINS_FTPS_CANDIDATE_*`):
   `npx tsx scripts/verify-ftps-source.ts --source candidate --manifest` → PASS (SHA match + fresh),
   then `compare-ftps-exports.ts` and `sync-products.ts --dry-run --file` per
   `docs/erp-ftps-source-migration.md`.
3. **Cutover** — separate owner approval; procedure and rollback in `docs/erp-ftps-source-migration.md`.

## Failure behaviour

Every failure (unstable snapshot after 3 attempts, schema/size/chain error, threshold, invariant, XML,
TLS, login, upload, SIZE mismatch, rename refusal) ends the run before or without replacing the remote
`export.xml`; the last good export stays. If the server refuses to rename onto an existing file the
exporter does **not** fall back to delete+rename (that would create a window with no export) — choose a
server/config where `probe-ftps` passes. If the manifest upload fails after the XML rename, the
consumer's manifest check reports a SHA mismatch (= not fresh) instead of silently accepting it.

## Rollback

Shadow/candidate stages do not touch production: disable the task
(`schtasks /Change /TN "GrinsProExporter" /DISABLE`) and, if needed, set `"mode": "shadow"`.
Uninstall: delete the task, `cmdkey /delete:GrinsProExporter/ftps`, remove `C:\GrinsProExporter\`.
Hairshop.lv's own `GrinsSyncService` is independent and must stay untouched.

## Security notes

- Credentials only in Windows Credential Manager; config with `password/user` is rejected; logs redact
  secret-looking keys; FTPS error texts are scrubbed of the user name/password.
- TLS: system trust store, hostname check, TLS ≥ 1.2, no bypass option exists.
- The live GrinS directory is only opened read-only; links/reparse points are refused.
- The legacy `GrinsSyncService.exe` contains hard-coded Hairshop.lv credentials ([REDACTED]); this
  exporter never uses them. Recommend rotating them after the eventual cutover.
