# Launch 25.10.2026 — P0 handoff (Claude Code ⇄ Codex)

Public launch: **Sunday, 25.10.2026**. The earlier target of 22.10.2026 is no longer valid.
Previously `docs/launch-2026-10-22-p0-handoff.md`; renamed 2026-10-23 when the date moved. Branch names, backup names and probe identifiers below keep their original `2026-10-22` / `20261022` form.

## Owner decision 2026-10-23

- Public launch moved from 22.10.2026 to **25.10.2026**.
- **The only open P0 is the Paysera E2E**, unless it has been completed. No document in the repo records a Paysera PASS: order 1079 (below) was a test-mode payment, and the deployed hotfix hides Paysera behind `PAYSERA_CHECKOUT_ENABLED`. Do not mark it PASS without actual confirmation.
- Admins without MFA do **not** block the launch.
- Ilona Žugra keeps the **Admin** role.
- **Super Admin** is held only by Aleksandrs Prokudins and Andrew Doronin.
- Completed checks are **not to be repeated**: GrinS, Stock Ledger, Omniva, bank transfer, and staff-account protection.
- The "Remaining launch blockers / decisions" list at the end of this document is the 21.10 snapshot. Where it conflicts with this decision, this decision wins.

---

Updated 2026-10-21 ~16:30 Europe/Riga. **Nothing pushed, nothing deployed, production/Neon/Plesk not changed.**
Every production step needs a separate explicit GO from the owner.

## Ground truth

- **Production** runs `8f43c907`, the tip of `origin/release/grins-manual-import`. Local `main` is a different line: never build release fixes on it.
- **Hotfix worktree:** `C:\Users\User\Desktop\eshop02-hotfix-p0`, with its own `npm ci`. `.next/` there is a local build artifact.
  - `hotfix/2026-10-22-p0` = `8f43c907` → `08625cc9` (Paysera) → `36a5aea1` (IP).
  - `hotfix/2026-10-22-paysera-only` = `8f43c907` → `08625cc9`.
- The 3 commits on `origin/release/2026-10-20` (`baa27235`, `40d78e7c`, `60fe254e`) are **excluded by owner decision**.
- **Hosting:** Plesk Windows, IIS 10 + iisnode, direct at 88.198.196.173. There is no proxy or CDN in front.
- **Read-only DB:** `.env.local` `DATABASE_URL` in the main tree = production Neon (max order id 1079). Always `BEGIN READ ONLY`.
- **TIMEZONE TRAP:** Prisma `DateTime` columns are `timestamp without time zone`, holding UTC. node-pg on this machine (Europe/Riga) parses them as local time, so JSON shows them **3 h too early**.
  - Always select `col::text` (raw UTC), or `col AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Riga'`.
  - The earlier "GrinS stopped after 08:20Z" and "order 1079 paid 3 h after creation" findings were artefacts of this. **Both are withdrawn.**

## Order 1079 (Paysera test E2E), corrected

- Created 12:04:32Z (15:04:32 Riga). Paysera "[TEST]" payment mail at 12:06:14Z, i.e. paid about 2 min later, well inside the 35-min reservation.
- DB: `paid`/`paysera`/`committed`, ledger invariant violations 0. Product 21358 is local, stock 10000→9999; **the ledger path was not exercised.**
- Closing test order 1079 is still an open owner decision. Paid orders cannot be cancelled in admin (`paid_order_requires_refund`). The only stock release is a single Returns approval: never toggle a return's status, because local products double-increment.

## Block 1: GrinS diagnosis (read-only)

`SyncRun` history converted to Riga time (stocks-only, cron):
- 19.10: 20:21, 20:51, 22:20.
- 20.10: hourly 08:20…22:20. 21:20 was `skipped` (`snapshot_replay`: the exporter had not produced a 21:00 run).
- 21.10: hourly 08:20…15:20 at the time of the check, each consuming the export from :00 of the same hour.

Conclusion:
- **No missed runs.** The night gap 22:20→08:20 is the `stock-sync-riga.mjs` working window (it exits without a `SyncRun` outside the window).
- The exporter is producing hourly; the manifest of each run is fresh, from :00 of that hour.
- The checkout gate is open. `sync-run-lock` is released between runs.

Not checked, because there is no access from the dev machine:
- the Plesk task configuration and logs, and the `stock-sync-riga.mjs` source (server-only, not in git);
- FTPS listing (no `GRINS_FTPS_*` locally).

DB evidence is sufficient; there is nothing to fix. Optional owner checks: Plesk → Scheduled Tasks history; `npm run verify:ftps` (read-only).

Residual risk: overnight (22:20→08:20) stock is up to 10 h stale while checkout stays open; there is no staleness guard. This is a business decision, not a defect.

## Block 2: Paysera flag, commit `08625cc9`

`PAYSERA_CHECKOUT_ENABLED`, read per request, fail-closed (only `"true"` enables).
- `lib/paysera-checkout.ts` (+ test): `isPayseraCheckoutEnabled()`. It is a separate module because tests mock `@/lib/paysera` wholesale.
- `app/api/orders/route.ts`: when disabled, paysera returns 400 `payment_method_unavailable` before any order or gateway work. The duplicate-resubmit path does not mint a link when disabled.
- `app/api/orders/[id]/pay/route.ts`: 400 `payment_method_unavailable` (before the rate limit).
- `app/api/shipping/route.ts`: adds `payments: { paysera: boolean }` (route handlers are not cached: no `cacheComponents`).
- `lib/use-shipping-settings.ts`: `payseraCheckoutEnabled` (false until loaded or on fetch failure).
- `app/[lang]/checkout/page.tsx`: the Paysera radio renders only when enabled; the grid uses 2 columns otherwise.
- `.env.example`, `docs/deploy-plesk.md`: flag documented.
- **Untouched:** webhook `/api/webhooks/paysera`, bank/cash, Stock Ledger, PayPal.
- Known UX gap: the order page "pay now" button for an old unpaid Paysera order shows a generic error toast while disabled. Only #1073 exists, and its reservation is already released.

## Block 3: client IP, commit `36a5aea1` (separate; not auto-included)

- `server-client-ip.js` (CJS, required by `server.js`): strips `cf-connecting-ip`, `x-forwarded-for` and `x-real-ip`, then sets `x-forwarded-for` from `x-iisnode-remote_addr` only when it is a single valid IP (`net.isIP`). Comma-joined, malformed or missing values set nothing, which gives `unknown`.
- `server.js`: calls it before `handle()`. Next fills `x-forwarded-for` from the socket only when absent; on iisnode the named pipe has no address, so `unknown` stays.
- It is effective only with `web.config` `<iisnode promoteServerVars="REMOTE_ADDR" />` (server-only file). Without that attribute the behaviour equals today's, minus spoofing.
- Local proof:
  - `lib/server-client-ip.test.ts`: 11 tests, including a real Node HTTP server with raw headers and a duplicated `X-iisnode-REMOTE_ADDR`.
  - Real `server.js` + Next with a temporary echo route (not committed): spoofed XFF/CF/X-Real-IP were ignored, the promoted value was used, duplicates and garbage were rejected, IPv6 was accepted.
- **Unproven, server only:**
  - (a) that iisnode sets `x-iisnode-remote_addr` from `REMOTE_ADDR` with replace semantics;
  - (b) that the deploy copies the new root file `server-client-ip.js`.

  If iisnode appends a client copy, the value is comma-joined and rejected, so it is safe but ineffective.

## Verification (hotfix worktree, dummy `DATABASE_URL=postgresql://…@127.0.0.1:1/…`)

- Targeted vitest: 100/100 (orders, pay, shipping, webhook, paysera, flag) + 11/11 IP.
- `tsc --noEmit`: exit 0. eslint on changed files: 0 errors (warnings are `no-require-imports` in CJS `server*.js`, same as before).
- Full vitest: 2483 passed, 37 failed in 9 `lib/sync/*wave*/import` files, all `*_ALLOWLIST_SHA_MISMATCH`/hash expectations. Cause: `core.autocrlf=true` checks the committed allowlist JSON out as CRLF in a fresh worktree. None of those files are touched by the hotfix (`git diff --stat 8f43c907 HEAD`).
- Production build at `36a5aea1`: **PASS**. `node --import tsx scripts/verify-grins-build-pglite.ts <schema.sql>` (loopback PGlite, schema from `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`, strip the dotenv `◇` line), Node 22.23.2, `next build --webpack`, 620/620 static pages, `isolated_build_finished exitCode=0`. Only the old Tailwind `duration-[…]`/swiper warnings appeared.
  - `npm run build` with a dummy DB URL fails at `/[lang]/brand/[id]` page-data collection; do not point it at prod Neon.
  - The IP commit does not touch the Next bundle (`server.js`, `server-client-ip.js`, a test, docs), so this build also covers `paysera-only`.
- GrinS re-check 16:22 Riga: the 16:20 run completed with the 16:00 export.

## Status 2026-10-21 evening

- Owner GO received for push + Vercel Preview only. **Production deploy is still forbidden.** The branch chosen is `hotfix/2026-10-22-p0`.
- Pushed: `origin/hotfix/2026-10-22-p0` = `36a5aea148d73fd5590297f29b7314d516d81a86`.
- Vercel (project `aleksandr-prokudins-projects/eshop02`, CLI via `npx -y vercel`, user `prokuuudin-7389`):
  - Added branch-scoped Preview env `SMTP_HOST=smtp.invalid` for `hotfix/2026-10-22-p0`, verified via pull. This copies the existing practice on `fix/staff-card-takeover`. Without it the shared Preview `SMTP_*` would send real mail.
  - There is no Preview-wide `DATABASE_URL`; only branch-scoped ones exist, and they are **sensitive** (unreadable, cannot be copied).
  - The auto-deploy of the push (`https://eshop02-mpn5c3e1f-aleksandr-prokudins-projects.vercel.app`) failed in 10 s with "No database URL found". Safe: nothing connected to any DB.
  - **Preview is blocked on the owner** adding a non-production `DATABASE_URL` (Sensitive, Preview, branch `hotfix/2026-10-22-p0`). Then redeploy with `npx -y vercel redeploy <url>` or an empty push.
- Preview checks to run once a DB is set:
  - `/api/shipping` returns `payments.paysera=false`;
  - checkout UI shows only bank and cash;
  - POST `/api/orders` with `paysera` → 400 `payment_method_unavailable`;
  - `/api/orders/<id>/pay` → 400 (or 404/409 for a foreign/released order);
  - a bank-transfer order succeeds (writes only to the preview DB; mail goes to `smtp.invalid`);
  - unsigned POST `/api/webhooks/paysera` → 401;
  - `/api/health` → 200.

## Vercel Preview result: PASS (2026-10-21 ~16:55 Riga)

- **Preview:** `https://eshop02-ejrgl5dkf-aleksandr-prokudins-projects.vercel.app` (protected; use `MSYS_NO_PATHCONV=1 npx -y vercel curl <path> --deployment <url> --yes <curl flags>`, with no `--` before the curl flags).
- **Commit:** `36a5aea148d73fd5590297f29b7314d516d81a86`, branch `hotfix/2026-10-22-p0`.
- **DB:** the owner created Neon branch `preview-hotfix-20261022` (`br-winter-boat-aq0bxnax`, project `lively-resonance-45595963`, parent = production, `default=false`).
  - Its endpoint is `ep-square-sun-aqnyfzkh`; production is `ep-long-glitter-aq88pk3t`.
  - The connection string was obtained with `neonctl connection-string … --pooled` (authorised as `prokuuudin`) and was never printed.
  - It is set in Vercel as a Sensitive `DATABASE_URL` for Preview + branch only.
- **Branch-scoped Preview env:** `DATABASE_URL` (sensitive), `SMTP_HOST=smtp.invalid`, `GRINS_STOCK_LEDGER_ENABLED=true`. The ledger flag mirrors prod: without it the DB trigger `erp_stock_write_requires_ledger` rejects orders for GrinS products with "Failed to persist order". This was an environment gap, not a code regression.
- **Checks:**
  - `/api/health` → 200 `db:ok`;
  - `/api/shipping` → `payments.paysera=false`;
  - POST `/api/orders` with paysera → 400 `payment_method_unavailable`, with and without Idempotency-Key;
  - bank order → 200 order **1080** (preview DB), `unpaid/manual`, `reserved`, no `paymentUrl`;
  - preview DB: allocation 1080/13683 qty 1 `reserved`, stock 25→24 (`grinsStock` 25), ledger violations 0;
  - webhook: unsigned POST → 401, GET → 405;
  - browser (Playwright, client-only fake user + seeded cart; no server session): radios `bank`, `cash`, grid `sm:grid-cols-2`. A control run with `/api/shipping` forced to `paysera:true` showed bank/cash/paysera with `sm:grid-cols-3`.
- **Not checkable on Vercel:**
  - `/api/orders/[id]/pay` with the flag off needs an owned unpaid Paysera order plus a session; covered by unit tests;
  - the IP fix: Vercel does not run `server.js`; verify on Plesk per the runbook.
- **Leftover in the preview DB:** order 1080 holds 1 unit of 13683 until its 35-min reservation expires. Isolated branch; delete the Neon branch when done.
- **Security note:** a `vercel curl --debug` run printed the project's existing Protection Bypass for Automation secret into this local session log. Nothing was sent anywhere. Recommend regenerating it: Vercel → Project → Settings → Deployment Protection.

## Plesk runbook (manual: Git → Deploy Now → Restart App), only after production GO

Pre-checks (owner + read-only SQL):
1. Record the current Plesk Git branch (`release/grins-manual-import`) and SHA `8f43c907`.
2. In the File Manager, copy `web.config` → `web.config.bak-20261022`. Also check for `iisnode.yml` in the app root; if present, back it up too.
3. Read-only SQL: no `paymentMethod='paysera' AND stockReservationStatus='reserved'` orders. Note `RateLimit` keys `login:ip:%` (expect only `unknown`).
4. Deploy between GrinS runs, e.g. at :30–:10 Riga (runs at :20).

Deploy:
1. Websites & Domains → hairshoppro.lv → **Git** → repository settings:
   - change the branch to `hotfix/2026-10-22-p0`;
   - keep the deployment path;
   - check "additional deployment actions": they must not contain `prisma migrate` / `db:migrate:deploy`. The package `build` at this SHA is `prisma generate && node scripts/build-canonical-cwd.mjs`, with no migrations.
2. **Deploy Now.** Confirm the deployed SHA is `36a5aea1`, and that `server-client-ip.js` exists in the app root next to `server.js`.
3. Node.js → **NPM install** (dev deps needed: `tsx` for sync) → Run script **`build`**. Wait for success.
4. Do not set `PAYSERA_CHECKOUT_ENABLED`. Absent means Paysera is hidden. Do not touch `PAYSERA_*` credentials or the Paysera portal.
5. **Restart App.**
6. Smoke test before the web.config change:
   - `/api/health` → 200;
   - `/api/shipping` → `"payments":{"paysera":false}`;
   - checkout shows bank + cash only;
   - webhook unsigned POST → 401;
   - `curl -s -X POST https://hairshoppro.lv/api/orders -H 'content-type: application/json' -H 'Origin: https://hairshoppro.lv' --data '{"order":{"country":"LV","firstName":"Probe","lastName":"Probe","email":"probe@example.invalid","phone":"+37120000000","address":"-","city":"Riga","legalDetails":{"customerType":"individual"},"deliveryMethod":"pickup","pickupStoreId":"riga-office","paymentMethod":"paysera","items":[{"id":"13683","quantity":1}]}}'` → 400 `payment_method_unavailable`. It is rejected before rate limit and order creation. If it returns anything else, stop.
7. **web.config:** keep everything that is there (handlers, rewrite rules, other iisnode attributes). Only on the existing `<iisnode …/>` element:
   - add `promoteServerVars="REMOTE_ADDR"`;
   - if the attribute already exists, append `,REMOTE_ADDR`;
   - if there is no `<iisnode>` element, add `<iisnode promoteServerVars="REMOTE_ADDR" />` inside `<system.webServer>`.

   If `iisnode.yml` exists, it overrides web.config: add `promoteServerVars: REMOTE_ADDR` there instead or as well. Save, then **Restart App**. If the site returns HTTP 500.19 or another config error, restore the backup immediately.
8. Watch the next GrinS run at :20 complete, and iisnode stderr for new errors.

**IP verification on production (anti-spoof):**
1. Owner finds their public IP (`curl https://api.ipify.org`).
2. From the same machine, send three login probes with a non-existent account. Each must return 401 and creates rate-limit keys that expire in 15 min:
   - `P='{"identifier":"ip-probe-20261022@example.invalid","password":"wrong-password-probe"}'`
   - (1) `curl -s -X POST https://hairshoppro.lv/api/auth/login -H 'content-type: application/json' -H 'Origin: https://hairshoppro.lv' --data "$P"`
   - (2) same + `-H 'X-Forwarded-For: 198.51.100.77' -H 'CF-Connecting-IP: 198.51.100.78' -H 'X-Real-IP: 198.51.100.79'`
   - (3) same + `-H 'X-iisnode-REMOTE_ADDR: 198.51.100.88'`
3. Read-only SQL: `SELECT key, count, "resetAt"::text FROM "RateLimit" WHERE key LIKE 'login:ip:%' ORDER BY "resetAt" DESC`.
   - **PASS:** `login:ip:<owner IP>` and **no** key containing `198.51.100.`. A single `login:ip:unknown` from probe (3) is acceptable: it means iisnode merged the client copy and the value was rejected.
   - **FAIL, spoofable:** any `198.51.100.x` key. Restore `web.config` immediately (IP back to `unknown`, no spoof).
   - **Not effective:** all probes → `unknown`. Check the iisnode.yml/web.config placement; the code is harmless as it stands.

**Rollback:**
- IP only (seconds): restore `web.config.bak-20261022` (+ `iisnode.yml` backup) and Restart App. IP returns to `unknown`, and spoofing stays blocked by the code.
- Code (about 5–10 min):
  - Git branch back to `release/grins-manual-import` (`8f43c907`) → Deploy Now → NPM install → `build` → Restart App;
  - restore the `web.config` backup.
  - **Warning:** the old code shows test-mode Paysera to customers again; prefer a forward fix.
- No DB schema or data changes are involved, so there is nothing to restore in Neon.

## Deploy plan (superseded by the Plesk runbook above)

0. Pre-checks:
   - record the current prod SHA (`8f43c907`);
   - back up `web.config` and `.env.local` on the server;
   - confirm there are no in-flight Paysera orders (read-only: `paymentMethod='paysera' AND paymentStatus<>'paid' AND stockReservationStatus='reserved'`).
1. Push the chosen branch (`hotfix/2026-10-22-paysera-only`, or `-p0` with IP) to origin (GO).
2. On the server:
   - fetch/checkout that SHA;
   - `npm ci` (with dev deps, `tsx` is needed by sync);
   - `npm run build`. No migrations in this release; do **not** run `db:migrate:deploy`.
3. Make sure `PAYSERA_CHECKOUT_ENABLED` is absent/`false` (the default hides Paysera).
4. Recycle the app (Plesk Node.js restart / app pool recycle).
5. Smoke test:
   - `/api/health` returns 200;
   - `/api/shipping` → `payments.paysera=false`;
   - checkout shows only bank + cash;
   - POST `/api/orders` with `paysera` → 400 `payment_method_unavailable` (a validation-only request, no order created);
   - webhook: unsigned POST → 401.
6. IP (only if the `-p0` branch was deployed):
   - add `promoteServerVars="REMOTE_ADDR"` to `<iisnode>` and recycle;
   - verify one wrong-password login creates a `login:ip:<real ip>` `RateLimit` key, not `unknown`;
   - verify a request with spoofed `X-iisnode-REMOTE_ADDR` does not change it.
7. Watch the next GrinS run (:20) completes and iisnode stderr shows no new errors.

**Rollback:**
- Code: checkout `8f43c907`, `npm ci`, `npm run build`, recycle. No schema or data changes are involved.
- Paysera: there is no flag to unset; on rollback, old code shows Paysera again (test mode). Prefer a forward fix.
- IP: remove `promoteServerVars` (or roll back `server.js`) and recycle.

## Remaining launch blockers / decisions

> Snapshot from 2026-10-21. Superseded by **Owner decision 2026-10-23** at the top of this document. The only open P0 is the Paysera E2E. The items below are kept for the record. Per the owner, none of them is a P0 blocker any more. Non-blocking follow-ups, such as closing test order 1079, stay open as owner decisions.

1. GO for push + deploy (choose paysera-only or with IP).
2. IP: the server-side proof of (a) and (b) above. Until then the shared `unknown` bucket remains: sitewide 3 guest / 10 customer order attempts per hour, plus login/MFA/reset. This is a launch-day 429 risk.
3. Owner: launch on overnight-stale stock (window 22:20→08:20) — accept or add a guard.
4. Ledger E2E (GrinS product 13683, bank, logged-in → `committed` allocation, then admin cancel → `released`/`cancelled`). Run after deploy, between sync runs; needs GO. Steps are unchanged from the previous handoff version:
   - baseline;
   - place the order;
   - verify allocation `committed` + `stock=grinsStock−1` + invariant 0;
   - cancel;
   - verify `released`/`cancelled` + `stock=grinsStock`;
   - never reopen the order or acknowledge stock.
5. Email check for order 1079: `<APP_ROOT>\iisnode\*stdout*` / `*stderr*` around 12:04:32Z, events `order_created`, `smtp_send_*`, `order_*_email_failed` (orderId 1079); mailboxes prokuuudina@gmail.com, `CONTACT_TO`, Sent of `SMTP_USER`.
6. Decision on closing test order 1079.
