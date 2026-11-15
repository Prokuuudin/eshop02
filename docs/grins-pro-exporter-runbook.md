# GrinS → Hairshop Pro exporter — runbook

Operator guide for `tools/grins-pro-exporter` (Python, standard library only). The exporter is a
**separate Windows installation** on a machine next to GrinS; it is not part of the Hairshop Pro web
deployment, and installing it changes nothing in production. Hairshop.lv keeps its own
`GrinsSyncService`. No secrets in this file or in Git.

```
GrinS live DB (read-only) → stable snapshot (A/B, SHA) → Paradox validation → Pro export.xml
→ preflight → local export.xml + export.manifest.json → [publish mode only] candidate FTPS (.part → SIZE → rename)
```

Rollout order (each step needs the previous one green): **manual shadow ×3 → Task Scheduler (shadow) →
probe-ftps → candidate publish (owner approval) → compare with primary → cutover (separate approval)**.

All paths, account names and hosts below are neutral examples; the real values of an installation are
kept outside Git.

## Business rules (owner decision 2026-10-05)

- Stock warehouses: **10000–10007 only** (explicit allowlist). Ignored: 10008, 10009, 10010 (Jelgava,
  closing), 2377, blank, any unknown code (reported in diagnostics).
- Per warehouse: `SUM(max(0, Kolvo))` over lots (+10, −3, +2 → 12).
- XML: `warehouse id 1..8 = 10000..10007`, `warehouse id 9 = 0`, `quantity = sum(id 1..8)`.
- vs Hairshop.lv, intentionally different: `quantity` (Hairshop.lv counts every warehouse), `warehouse 9`
  (Hairshop.lv writes 10009), `title` escaping (Hairshop.lv double-escapes). SKU, code, capacity,
  price1–4 and warehouse 1–8 are identical on the same snapshot (proven on 2026-10-05 data).
- **Stock quarantine (owner decision 2026-11-15, exporter 1.1.0).** A positive, finite but fractional
  `Kolvo` in an allowed warehouse (e.g. 7.99 in 10000) puts that **SKU** in quarantine: it stays
  in `export.xml` with `0` in every warehouse slot and `quantity` 0 (not orderable in Hairshop Pro), its
  integer lots are not exported either, and the value is never rounded. GrinS is not changed. The run logs
  `stock_quarantine` and the manifest carries `stockQuarantine` (`skus`, `lots`, `maxSkus`); the rest of the
  catalog is exported normally. The quarantine is recomputed from GrinS on every run and lifts on the first
  export after the lot is corrected in GrinS (one "cleared" alert).
- Still fail closed (exit 50, nothing published): **more than 5** quarantined SKUs (hard limit, not
  configurable), any `Kolvo` > 2 147 483 647 (`too_large`), infinite/NaN (`non_finite`) or non-numeric.
- In `publish` mode a quarantine needs a working alert channel (section 10): with `"type": "none"`, or
  when the alert for a new/changed SKU set cannot be delivered, the run fails at stage `quarantine_alert`
  (exit 50, nothing published, retried next run). A known set is not re-sent every hour; a reminder
  goes out every 24 h (best effort). De-duplication state: `state\quarantine-alert-state.json` — it
  only controls alerts and never lifts a quarantine.
- `Product.stock` in Hairshop Pro is not affected (10000/10001/10002/10005, `lib/sync/sync-rules.ts`).

## 1. Requirements (GrinS machine)

If the only available account can also modify the GrinS tables, the exporter still opens the live files
read-only; call Python by absolute path if the `py` launcher is not installed.

| Item | Requirement |
|---|---|
| Windows | Windows 10/11 or Server 2016+ for current Python. Windows 7/2008 R2: only Python 3.8 (last version for it; code is 3.8-compatible but has only been run on 3.12/3.13). |
| Python | python.org **classic** installer (`python-3.13.N-amd64.exe`), 3.8+ (tested 3.12/3.13), "Install for all users", **py launcher**. Not the Python install manager (MSIX): it does not support Server 2016. No pip packages, no Node.js, no IDE, no BDE. |
| Account | ONE dedicated Windows account (e.g. `DOMAIN\svc-grins-export`) used for everything below; right "Log on as a batch job". |
| GrinS data | Read on `C:\Grins\Sklad\DB` (local) or the share holding it (UNC path, e.g. `\\GRINS-PC\Sklad\DB`). Never write access. |
| Work folder | `C:\GrinsProExporter\` with inheritance disabled: Administrators + SYSTEM full; the account read & execute on `app\` (code, `config.json`) and modify on `data\` (`work`, `out`, `logs`, `state`). Snapshots contain prices and cost. |
| Credential Manager | Standard Windows component; the secret must be created **while logged on as the account** (credentials are per user). |
| Network | Outbound to the candidate FTPS (control port, usually 21, + the server's passive data port range), TLS certificate from a CA trusted by Windows. Only needed from the probe step on. |

## 2. Install

1. Install Python (see table). Check: `py -3 --version`.
2. Copy the package folder `exporter\` (or the repository folder `tools\grins-pro-exporter\`) to
   `C:\GrinsProExporter\app\` so that `C:\GrinsProExporter\app\grins_pro_exporter\__main__.py` and
   `C:\GrinsProExporter\app\run-exporter.cmd` exist. Create `C:\GrinsProExporter\data\{work,out,logs,state}`.
3. Optional self-test (needs no GrinS data): `cd /d C:\GrinsProExporter\app` →
   `py -3 -B -m unittest discover -s tests` → `OK`. The golden tests run only when
   `GRINS_GOLDEN_SNAPSHOT_DIR` and `GRINS_GOLDEN_REFERENCE_ZIP` are set (developer machine; never point them
   at a live GrinS folder).
4. Set NTFS permissions (see the table). Other users must not be able to create files in `app\`: Python
   imports from the working directory first, so a planted module would run with the account's rights.

Cleanup safety: the exporter prunes only directories whose name is exactly a run id
(`20261014T200000123456Z-1234`) inside `data\work\runs` and `data\out`; foreign files/folders, symlinks and
junctions are never deleted. `check-config` rejects overlapping or nested `workDir/outputDir/logDir/stateDir`,
paths inside the GrinS directory, and `keepRuns`/`keepOutputs` below 1.

## 3. Configure (no secrets)

Create `C:\GrinsProExporter\app\config.json` — for the shadow phase **without** a `publish` section, so even
a mistaken `run` cannot publish:

```json
{
  "mode": "shadow",
  "source": { "dbPath": "C:\\Grins\\Sklad\\DB" },
  "paths": {
    "workDir": "C:\\GrinsProExporter\\data\\work",
    "outputDir": "C:\\GrinsProExporter\\data\\out",
    "logDir": "C:\\GrinsProExporter\\data\\logs",
    "stateDir": "C:\\GrinsProExporter\\data\\state"
  },
  "snapshot": { "maxAttempts": 3, "pauseBetweenCopiesSeconds": 5, "retryDelaySeconds": 60, "keepRuns": 3 },
  "keepOutputs": 14,
  "preflight": { "minProducts": 14000, "maxDropRatio": 0.10, "maxGrowthRatio": 0.20,
                 "maxQuantityDropRatio": 0.30, "maxQuantityGrowthFactor": 3 },
  "alerts": { "type": "none" }
}
```

`dbPath` may be a UNC path. Paths must be absolute, must not be inside `dbPath` and must not overlap each
other (rejected).
`config.example.json` shows every key, including `publish`.

## 4. Credentials (only from the probe step on)

Logged on **as the task account**:

```
cmdkey /generic:GrinsProExporter/ftps /user:<candidate-ftps-user> /pass
```

`/pass` without a value prompts, so the password never reaches the command history. Never put
passwords in `config.json` (rejected) or in the repository. Never reuse the Hairshop.lv/primary FTPS
credentials or those of the legacy sync service.

## 5. Manual shadow run (first real run)

Weekdays after 19:00, weekends after 16:00 (GrinS idle), logged on as the task account:

```
cd /d C:\GrinsProExporter\app
py -3 -m grins_pro_exporter --config C:\GrinsProExporter\app\config.json check-config
py -3 -m grins_pro_exporter --config C:\GrinsProExporter\app\config.json run --dry-run
py -3 -m grins_pro_exporter --config C:\GrinsProExporter\app\config.json run --shadow
```

- `check-config`: source files present and plain files; credential targets present (only if configured).
- `run --dry-run`: snapshot + validation + XML + preflight; writes no XML/manifest/last-good state, but it
  **does copy** `CENIC.DB`/`OSTATOK.DB` twice into `work\runs\<runId>\` (kept, `keepRuns`), writes the log and
  `state\exporter.lock(.json)`. It is not a read-only step.
- `run --shadow`: the same plus `out\<runId>\export.xml` + `export.manifest.json` and `state\last-good-manifest.json`.

Does: reads the live DB read-only, copies `CENIC.DB` + `OSTATOK.DB` twice into `work\runs\<runId>\`, validates,
generates, checks. Does **not**: connect to any FTPS, write to GrinS, touch Hairshop Pro or its database.

**Acceptance per run**: exit code `0`; log contains `snapshot_completed`, `paradox_validation_completed`,
`export_preflight_completed`, `export_completed`; no `export_failed`. Repeat on **at least 3 different
evenings** (fresh snapshots). Day-to-day data differences are normal; any structural failure is not.

## 6. Inspect

- Logs: `C:\GrinsProExporter\data\logs\exporter-YYYY-MM-DD.log` (UTC date), one JSON object per line
  (`export_started … export_completed`, or `export_failed` with `stage`, `reason`, `runId`, `durationSeconds`).
- Outputs: `C:\GrinsProExporter\data\out\<runId>\export.xml` and `export.manifest.json`.
- Summary of all shadow runs (runId, start, snapshot time, products, XML SHA, total quantity, source SHAs):

```
py -3 -c "import json,glob;[print(m['runId'],m.get('runStartedAt'),m['sourceSnapshotAt'],m['productCount'],m['xmlSha256'][:12],m['stats']['totalQuantity'],m['sourceHashes']['CENIC.DB'][:12],m['sourceHashes']['OSTATOK.DB'][:12],m['stats']['stock']['ignoredPositiveQuantityByWarehouse']) for m in (json.load(open(f,encoding='utf-8')) for f in sorted(glob.glob(r'C:\GrinsProExporter\data\out\*\export.manifest.json')))]"
```

- Optional cross-check against the current Hairshop.lv export (`compare` reads two files, no network):
  `py -3 -m grins_pro_exporter compare --legacy <Hairshop.lv export.xml> --pro out\<runId>\export.xml`
  → expected `REVIEW`/`PASS` with intentional differences only (`quantity`, `title`, `warehouse9`) plus
  normal drift if the two files are from different times.

## 7. Task Scheduler (after 3 good manual shadow runs; still shadow)

```
schtasks /Create /TN "GrinsProExporter" /SC DAILY /ST 20:00 /RU DOMAIN\svc-grins-export /RP /TR "C:\GrinsProExporter\app\run-exporter.cmd"
```

- `/RP` prompts for the account password and stores it in Task Scheduler (not in any file). A task
  created with "Do not store password" (S4U) **cannot read Credential Manager** — do not use it.
- Task settings: "Do not start a new instance", "Stop the task if it runs longer than 1 hour".
- 20:00 daily satisfies "weekdays after 19:00, weekends after 16:00"; change the time only in Task Scheduler.
- `run-exporter.cmd` runs `run` with the mode from `config.json` (shadow until changed).
- Before scheduling, configure alerts (section 10) — an unattended run must notify a technical recipient.

## 8. Probe the candidate FTPS (before any publication)

Add the `publish` block to `config.json` (keep `"mode": "shadow"`):

```json
"publish": { "label": "candidate", "host": "<candidate host>", "port": 21, "remoteDir": "<dir>",
             "fileName": "export.xml", "manifestFileName": "export.manifest.json",
             "credentialTarget": "GrinsProExporter/ftps", "caFile": null,
             "timeoutSeconds": 60, "requireRemoteSize": true }
```

```
py -3 -m grins_pro_exporter --config C:\GrinsProExporter\app\config.json check-config
py -3 -m grins_pro_exporter --config C:\GrinsProExporter\app\config.json probe-ftps
```

The probe uses the production upload routine on `probe-<runId>.txt` only (never `export.xml`,
`export.manifest.json` or their `.part` files): step 1 publishes onto a free name, step 2 publishes a
longer file **onto the now existing name** and verifies by SIZE that the destination was replaced; then
deletes its files. **PASS** = exit `0` and log `probe_completed` with
`"verdict": "FTPS ATOMIC PUBLISH: PASS"` (`renameNew`, `renameOverExisting`, `sizeSupported` all true).
TLS/login errors or `FTPS ATOMIC PUBLISH: FAIL` (exit 60) = stop; do **not** work around it with
delete+rename — that leaves a moment without `export.xml`. Report to the owner instead.

### 8a. Layout `run-files` (server refuses rename onto an existing file)

Some FTPS servers (e.g. IIS with `allowReplaceOnRename=false`) cannot replace `export.xml`. Use
`"layout": "run-files"` in the `publish` block (optional `"keepRemoteRuns"`, default 24, range 3..1000;
`fileName`/`manifestFileName` are not used). Each run then publishes its own immutable pair:
`export-<runId>.xml` first, `export-<runId>.manifest.json` last (= completion marker), each as `.part` →
SIZE → rename onto a name that does not exist yet. A run refuses to start uploading if either name already
exists. After both files are complete it deletes its own older files only (pattern `export-<runId>.*`):
complete pairs beyond the newest `keepRemoteRuns` (manifest first, then XML) and older orphans/`.part`.
Other names (including a legacy `export.xml`) are never touched; a failed delete is a warning only.

`probe-ftps` follows the layout. For `run-files` it uploads `probe-<runId>-1.txt` and `probe-<runId>-2.txt`
onto new names, checks they are listed (NLST), deletes both and checks they are gone; it never overwrites.
**PASS** = exit `0` and `"verdict": "FTPS RUN-FILES PUBLISH: PASS"` (`renameNew`, `secondNewName`,
`sizeSupported`, `listSupported`, `deleteSupported` all true). The consumer must select the newest
complete pair (both files present) and verify it against its manifest.

## 9. Candidate publish — ONLY after explicit owner approval

Set `"mode": "publish"` in `config.json` (publish block pointing at the **candidate** location), then:

```
py -3 -m grins_pro_exporter --config C:\GrinsProExporter\app\config.json run
```

Order on the server: `export.xml.part` → SIZE → rename to `export.xml` → same for `export.manifest.json`
(layout `run-files`: `export-<runId>.xml`, then `export-<runId>.manifest.json`, then pruning — §8a).
Verification on the Hairshop Pro server (read-only, `GRINS_FTPS_CANDIDATE_*` set):
`npx tsx scripts/verify-ftps-source.ts --source candidate --manifest` → PASS (XML contract + manifest SHA/size/
count + fresh ≤ 36 h), then `compare-ftps-exports.ts` and `sync-products.ts --dry-run --file` per
`docs/erp-ftps-source-migration.md`. Production (`GRINS_FTPS_*`) is not changed by any of this.

## 10. Alerts (SMTP)

```json
"alerts": { "type": "smtp", "host": "<smtp host>", "port": 587, "from": "<sender>",
            "to": ["<technical recipient>"], "credentialTarget": "GrinsProExporter/smtp" }
```

`cmdkey /generic:GrinsProExporter/smtp /user:<smtp-user> /pass` (as the task account). STARTTLS with
certificate verification. For an SMTPS server (port 465, TLS from the first byte — what Hairshop Pro
uses with `SMTP_SECURE=true`) add `"tls": "implicit"`; certificate and host name are verified the same way.
The recipient is chosen by the owner. Until it is chosen, keep `"type": "none"`: failures are still in the log and in the non-zero
exit code / Task Scheduler history, but nobody is notified — so set it before relying on the schedule.
From exporter 1.1.0 a configured channel is **required** for a quarantined export to be published
(section "Business rules").

## 11. Failure (non-zero exit)

| Exit | Stage | What to do |
|---|---|---|
| 10 | lock | another run is active; nothing to do |
| 20 | config | fix `config.json` / missing credential |
| 30 | snapshot | GrinS was writing (unstable after 3 attempts) or source unreadable; rerun later |
| 40 | source | Paradox table failed validation (schema/size/chain): stop, report — do not "repair" GrinS files |
| 50 | preflight/data | count/quantity jump, bad price, unusable Kolvo, > 5 quarantined SKUs, invariant: read `reason`, report |
| 50 | quarantine_alert | quarantine needs an alert: configure section 10 / fix SMTP; correct the lot in GrinS |
| 60 | publish | TLS/login/upload/SIZE/rename; previous remote `export.xml` is untouched |
| 70 | internal | report the log lines of the run |

Every failure leaves the last good remote export in place; nothing partial is ever published.

## 12. Rollback / stop

- Stop: `schtasks /Change /TN "GrinsProExporter" /DISABLE` (or `"mode": "shadow"` / remove `publish`).
- Remove: `schtasks /Delete /TN "GrinsProExporter" /F`, `cmdkey /delete:GrinsProExporter/ftps`,
  `cmdkey /delete:GrinsProExporter/smtp`, delete `C:\GrinsProExporter\`.
- None of this affects the running Hairshop Pro site or its scheduled sync (it reads only `GRINS_FTPS_*`),
  nor the Hairshop.lv `GrinsSyncService`.

## Security notes

Credentials only in Credential Manager; logs redact secret-like keys; FTPS errors are scrubbed of the
user/password. TLS: system trust store (or `caFile`), hostname check, TLS ≥ 1.2, no bypass. Live GrinS
files are opened read-only; links/reparse points refused; the local XML is re-hashed right before upload.
Credentials of the legacy sync service are not used by this exporter; rotate them only after the
eventual cutover (rotating earlier breaks Hairshop.lv).
