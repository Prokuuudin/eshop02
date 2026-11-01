# Dependency security handoff — 2026-11-02

## Scope and safety constraints

- Repository: `Prokuuudin/eshop02`
- Clean worktree: `C:\Users\User\Desktop\eshop02\.worktrees\dependency-security-2026-11-02`
- Branch: `security/dependency-updates-2026-11-02`
- Base: `origin/main` at `bdaa5c8b979c3ff9e89d9f7fccbbd2ecae527f64`
- No production DB access, migrations, deployment, configuration, secrets, Neon, or Plesk changes.
- The original working tree has unrelated unfinished changes and was not modified.

## Stage 1 — targeted dependency update

Status: **PASS (uncommitted at this checkpoint)**

Current HEAD: `bdaa5c8b979c3ff9e89d9f7fccbbd2ecae527f64`

| Package | Locked before | Pinned after | Confirmed vulnerable range |
| --- | ---: | ---: | --- |
| `next` | 16.3.3 | 16.4.1 | 16.0.0–16.4.0 (combined current advisories) |
| `sharp` | 0.35.4 | 0.35.5 | `<0.35.5` |
| `nodemailer` | 9.0.3 | 10.1.4 | `<=10.1.3` (combined current advisories) |
| `zod` | 4.3.6 | 4.6.6 | `<4.6.6` |
| `xlsx` | 0.18.5 | unchanged | npm package remains vulnerable; no registry fix |

Only `package.json` and `package-lock.json` were changed in this stage. The lockfile version changes are limited to the four direct packages and their Next/Sharp platform packages (`@next/env`, `@next/swc-*`, `@img/sharp-*`, `@img/sharp-libvips-*`). No application code was changed.

### Advisory and audit findings

- Baseline `npm audit --omit=dev`: 17 vulnerabilities — 0 low, 3 moderate, 12 high, 2 critical.
- After targeted update `npm audit --omit=dev`: 13 vulnerabilities — 0 low, 3 moderate, 9 high, 1 critical.
- The four scoped direct findings (`next`, `sharp`, `nodemailer`, `zod`) are absent after the update.
- Remaining production findings are out of this task's package scope: `basic-ftp`, Prisma/tooling dependency chains, `dompurify`, `fast-uri`, `fflate`, `postcss-selector-parser`, and `source-map-js`.
- Full baseline audit (including dev dependencies) confirms `xlsx` 0.18.5 has GHSA-4r6h-8v6p-xvw6 and GHSA-5pgg-2g8v-p4x9, and npm reports `fixAvailable: false` because the npm registry stops at 0.18.5.

### `xlsx` usage and proposed replacement

Actual imports exist only in six maintenance/import scripts, not in the storefront or request-time checkout path:

- `scripts/analyze-clients-xlsx.ts`
- `scripts/backfill-pk-last3.ts`
- `scripts/import-client-cards.ts`
- `scripts/import-client-types.ts`
- `scripts/repair-client-name-encoding.ts`
- `scripts/import-delivery-data.mjs`

Five scripts read a named XLSX worksheet and convert rows to objects. `import-delivery-data.mjs` also reads three XLSX files as row arrays and uses SheetJS to parse CSV files.

Recommended replacement: `read-excel-file@9.3.14` for XLSX input, plus a dedicated CSV parser (or a small standards-compliant parser already approved for the project) for the CSV branch. An isolated lockfile audit of `read-excel-file@9.3.14` and its seven-package tree reported **0 vulnerabilities** on 2026-11-02. This is not an automatic drop-in replacement: row typing, blank-cell/null behavior, selected-sheet behavior, dates/formulas, and Cyrillic/Latvian text must be compared against representative business fixtures before changing the six scripts. No replacement was made in this branch.

### Next concrete step

Run Stage 2 checks: TypeScript, ESLint, targeted unit tests for Sharp/Nodemailer/Zod plus cart/checkout/Paysera, then a migration-free production build using the direct build wrapper (never `npm run build`, because that script runs `prisma migrate deploy`).

## Stage 2 — verification

Status: **PASS**

Current HEAD: `bdaa5c8b979c3ff9e89d9f7fccbbd2ecae527f64` (changes still uncommitted at this checkpoint)

| Check | Result |
| --- | --- |
| Installed direct versions | PASS — Next 16.4.1, Sharp 0.35.5/libvips 8.18.7, Nodemailer 10.1.4, Zod 4.6.6, XLSX unchanged at 0.18.5 |
| TypeScript | PASS — `npm run typecheck` after local `prisma generate` |
| ESLint | PASS — `npm run lint`, no findings |
| Targeted unit tests | PASS — 15 files, 260 tests |
| Production audit | PASS for scoped packages — `npm audit --omit=dev` reports 13 remaining out-of-scope findings; none of Next/Sharp/Nodemailer/Zod remain |
| Production build | PASS — Next 16.4.1 webpack build, 632/632 static pages, isolated loopback PGlite, exit 0 |
| Diff hygiene | PASS — `git diff --check` |

Final verification was repeated once after `npm ci --ignore-scripts` from the exact final lockfile. The accidental candidate-evaluation install was removed before this clean run; `read-excel-file` is not present in `package.json`, `package-lock.json`, or the final installed top-level tree. The repeated TypeScript, ESLint, 260 targeted tests, audit, and 632-page isolated build all passed.

Targeted tests covered:

- Sharp image crop/metadata pipeline.
- Nodemailer transport creation and send behavior through mocks (no SMTP delivery attempted).
- Zod product request/mapping schemas.
- Cart state and cart summary.
- Checkout validation, totals, promo and order API client behavior.
- Paysera client, feature gate, webhook, order creation and retry/payment routes.

Build safety details:

- `npm run build` was not used because it contains `prisma migrate deploy`.
- Prisma Client generation used a non-routable loopback URL; it did not query a database.
- The successful build used the repository's `scripts/verify-grins-build-pglite.ts` harness and a schema-only SQL diff loaded into a fresh in-memory PGlite server on `127.0.0.1`.
- The harness passes an allowlisted environment to the child build, with `NEXT_PUBLIC_SITE_URL=https://example.invalid`; production secrets and URLs were not inherited.
- No migration command, Neon access, SMTP delivery, Paysera call, Plesk operation, or deployment occurred.
- Existing non-blocking Tailwind/Swiper CSS warnings appeared during the build; there were no Next 16.4.1 compilation, App Router, SSR, or static-generation errors.

### Next concrete step

Stage 3: commit the three changed files, push `security/dependency-updates-2026-11-02`, open a PR to `main`, record the branch/commit/PR in this handoff, and stop before merge or deployment.

## Stage 3 — commit, push, PR

Status: **PASS** — PR #9 was created by the owner and merged (see Stage 4). The original note "PR creation BLOCKED" below is historical.

- Commit `8630ba5e` (Codex): `package.json`, `package-lock.json`, this handoff. Pushed to
  `origin/security/dependency-updates-2026-11-02`.
- Continued by Claude Code on 2026-11-02 (Codex message limit). Codex stages 1–2 were not repeated.
  Spot-verification instead:
  - Lockfile vs `origin/main`: 39 changed entries. 5 packages (`next`, `@next/env`, `nodemailer`, `sharp`, `zod`)
    plus 34 `@next/swc-*` / `@img/sharp-*` platform binaries. Nothing else changed.
  - Installed: next 16.4.1, sharp 0.35.5, nodemailer 10.1.4, zod 4.6.6, xlsx 0.18.5 (unchanged).
  - `npm audit --omit=dev`: 13 (3 moderate, 9 high, 1 critical). Baseline was 17. None of the scoped packages remain.
    Remaining packages: `@prisma/config`, `@prisma/dev`, `prisma`, `basic-ftp`, `deepmerge-ts`, `dompurify`,
    `fast-uri`, `fflate`, `find-my-way`, `mysql2`, `postcss-selector-parser`, `source-map-js`, `valibot`.
    All are out of scope for this task.
  - Nodemailer 9 → 10 (major): the only breaking change is Node.js ≥ 20; the project requires ≥ 22.13.
    `lib/mailer.ts` is the only importer and uses `import nodemailer from 'nodemailer'` with a host/port object
    (not affected by the URL-parsing changes). Offline runtime smoke with `streamTransport`:
    CJS `require` and ESM default import both build a UTF-8 (LV/RU) message correctly. No SMTP traffic.
    Real SMTP delivery is covered by the CI job `email-delivery-mailpit`.
  - Full unit suite (once; the earlier run covered only 260 targeted tests, and Next and Zod are used project-wide):
    355 files, **2841/2841 pass**.
- `xlsx` decision: **not changed in this PR.**
  - It is a devDependency, imported only by 6 offline operator import scripts (no runtime, storefront or checkout path).
  - Exploitation needs an attacker-controlled spreadsheet opened by an operator.
  - Options for a separate task:
    (a) `read-excel-file` + a CSV parser, validated against representative business fixtures;
    (b) the SheetJS-hosted fixed build (0.20.x tarball from cdn.sheetjs.com, a non-npm source; needs owner approval).
- PR: not created. `gh auth status` reports "You are not logged into any GitHub hosts", and the stored git
  credential was intentionally not reused for API calls.
  Create via https://github.com/Prokuuudin/eshop02/compare/main...security/dependency-updates-2026-11-02

### Next concrete step

1. Open the PR (owner, or an agent after `gh auth login`) using the prepared description.
2. Wait for GitHub checks (`Quality Gates`, `check-encoding`, including `email-delivery-mailpit`).
3. Merge only after owner confirmation.
4. Plesk: a separate release decision. The new versions need `npm ci` and a rebuild on the server;
   no migrations.

## Stage 4 — PR #9 merged; Plesk release branch prepared

Status: **PASS — ready for manual Plesk deployment (not deployed)**

### PR #9

- https://github.com/Prokuuudin/eshop02/pull/9: head `8cbe6f3b`, base `bdaa5c8b`.
- All 9 checks passed: `static-and-unit`, `chromium-critical-smoke`, `firefox-smoke`, `accessibility-webkit`,
  `performance-smoke`, `email-delivery-mailpit`, `check-encoding`, GitGuardian, Vercel Preview Comments.
- In `email-delivery-mailpit` the `npm run test:email:delivery` step really ran against the Mailpit container
  (it was not skipped).
- Merged with a regular merge commit `572815b8d402954cca5e20c8fdba8343e6363113` on 2026-11-01T23:25Z (UTC)
  (`gh` is not authenticated: a `--no-ff` merge in a clean temporary worktree plus a normal non-force push;
  GitHub marked the PR merged).
- The push to `main` auto-triggers the Vercel deployment, which is not the production site. Plesk was not touched.

### Release branch for Plesk

- Branch: `release/2026-11-02-dependency-security` (pushed), worktree
  `C:\Users\User\eshop02-work\worktrees\eshop02-release-deps`.
- Base: `origin/release/2026-11-02-b2b-price-security` @ `45f2503e` (code = production `2256909f`; the commits
  after it are docs only).
- `5d5356e8` chore(deps): `package.json` + `package-lock.json` taken from `572815b8`. Before the change, the release's
  package files were byte-identical to `main` before PR #9 (`bdaa5c8b`), so the diff equals the PR #9 package diff exactly.
- Not merged from `main`. The release does not include image zoom, `main`-only commits, or application code,
  Prisma schema, migration or config changes. `git diff 2256909f HEAD` contains only `package.json`, `package-lock.json`
  and handoff docs.
- Consistency: `npm install --package-lock-only --ignore-scripts` leaves the lockfile byte-identical, and the root
  ranges in the lockfile match `package.json`. Locked: next 16.4.1, sharp 0.35.5, nodemailer 10.1.4, zod 4.6.6, xlsx 0.18.5.
- `build` = `prisma generate && node scripts/build-canonical-cwd.mjs` (no `migrate deploy`); `engines.node` >= 22.13.0.
- Not re-run on purpose (the same dependencies were verified on PR #9; the application code is unchanged): unit,
  E2E, audit and local build.

### Manual Plesk deployment (owner)

1. Check out `release/2026-11-02-dependency-security` at its HEAD (see `git log -1`; the dependency change is `5d5356e8`).
2. Confirm Node on the server is >= 22.13 (Next 16.4 and Nodemailer 10 need >= 20).
3. `npm ci`. The lockfile changed, so the Next/Sharp native binaries must be reinstalled. Do not reuse the old node_modules.
4. Build the same way as the current release (`prisma generate` + `node scripts/build-canonical-cwd.mjs`).
   No migrations.
5. Restart the app.
6. Post-deploy smoke:
   - `/api/health` → ok/db ok;
   - `/lv`, `/lv/catalog`, a product page: 200, product images load (Sharp/Image Optimization);
   - guest `POST /api/orders` `{}` → 401;
   - one real customer email path, if convenient (Nodemailer 10), e.g. the password-reset email for a test account.
7. Rollback: redeploy `release/2026-11-02-b2b-price-security` (code `2256909f`) followed by `npm ci`.

### Next concrete step

Owner: manual Plesk deployment of `release/2026-11-02-dependency-security`, following the steps above.

