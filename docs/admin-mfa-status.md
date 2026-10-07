# Admin MFA — status & handoff

Last update: 2026-10-07, session 2 (Claude Code). Next AI (Claude or Codex): re-verify the
critical claims below against code/git/tests before relying on them.

## Goal

Mandatory TOTP MFA (password + authenticator code) for everyone with admin-panel access
(platform admins and staff managers), using the existing architecture. Customers are never
subject to MFA.

## Verdict

**READY FOR MERGE** into local `main` (fast-forward). Production deployment still requires the
operator steps below (`MFA_ENCRYPTION_KEY`, migration). Not pushed, not deployed.

## Git

Branch `feat/mandatory-admin-mfa`, based on local `main` `5600646d`:

| Commit | What |
|---|---|
| `2bc14c47` | feat(auth): make TOTP MFA mandatory for admin-panel access |
| `8d957da1` | fix(security): protect admin product page data — cherry-pick `-x` of `8580888b` (origin/main) |
| `d3cc7027` | fix(auth): allow promoting staff without pre-existing MFA |
| `7fa072a6` | fix(security): rate-limit window expiry must not depend on DB TimeZone |
| (this doc) | docs: MFA status/handoff |

Merge facts (checked with `git merge-tree`, nothing written):
- `main` → branch is a fast-forward.
- Against `origin/main` (`19d7fa2e`) the branch conflicts only in `components/admin/products/AddProductForm.tsx`,
  a pre-existing local-main vs origin divergence the branch does not touch. Local `main` alone additionally
  conflicts in `app/[lang]/admin/products/[id]/page.tsx`; the cherry-pick removes that conflict.
- The working tree contains the owner's unrelated WIP (GRINS docs, AddProductForm/BulkPricing/Gallery fields,
  deployment-checklist, runbook, untracked CSV/JSON/MD). Never stage it with MFA work.

## Model

"Admin-capable" = `getPermissionAccessLevel(user) !== 'none'` → `platformRole === 'admin'` or
`teamRole === 'manager'` (B2B company owners have `teamRole === 'admin'` and are customers).
Helper: `requiresAdminMfa()` in `lib/server-auth.ts`.

```
POST /api/auth/login (password OK)
  ├─ customer              → session cookie (unchanged)
  └─ admin-capable         → { mfaRequired, enrollmentRequired, challengeToken }  (NO cookie)
       ├─ MFA enabled      → POST /api/auth/mfa/verify {challengeToken, code|recoveryCode}
       └─ not enrolled     → POST /api/auth/mfa/enroll {challengeToken}        (QR + manual key)
                           → POST /api/auth/mfa/enroll/confirm {challengeToken, code}
                              (enables MFA, returns 8 recovery codes once)
  → createSession(userId, { mfaVerified: true }) + cookie
```

Security boundary: `Session.mfaVerified` (default false). `getServerUser()` returns `null` for an
admin-capable user whose session is not MFA-verified, whichever route created it — checked against the
live role, so a promoted customer's old sessions also stop working. All admin pages/layouts/APIs use
`getServerUser` (only session reader; no server actions exist; all `app/api/admin/**` routes guard via it).

Promotion: no prior MFA is required of the target any more (`target_mfa_required` removed from
`/api/admin/users` PATCH and `/api/admin/users/role-approvals`). Actor step-up (password + own TOTP) and
four-eyes approval are unchanged; approval revokes the target's sessions; next login forces enrollment.
Manager grant (`teamRole` change) also revokes sessions (`privilegesChanged`).

## Files

- `prisma/schema.prisma`, `prisma/migrations/20261007120000_session_mfa_verified/` — additive column.
- `lib/server-auth.ts` — `requiresAdminMfa`, `sessionCookieMaxAgeSeconds`, `createSession(id, {mfaVerified})`, check in `getServerUser`. Managers now get the 1-day session too.
- `lib/mfa-challenge.ts` — challenge create/lookup/atomic consume, rate limits, session cookie.
- `lib/mfa.ts` — `decryptSecret` pins 16-byte GCM tag, rejects malformed input.
- `lib/rate-limit.ts` — expiry compared with app clock (was DB `now()`; see below).
- `app/api/auth/{login,mfa/verify,mfa/enroll,mfa/enroll/confirm,sync,admin-setup}`, `app/api/user/{password,mfa/*}`,
  `app/api/admin/users/{route.ts,role-approvals,[id]/mfa-reset}`.
- `app/[lang]/admin/products/[id]/page.tsx` (+ test) — authorization before any product read.
- UI: `components/auth/LoginForm.tsx`, `components/admin/AdminMfaSection.tsx`, `components/admin/AdminStaffMfaReset.tsx`,
  `app/[lang]/account/page.tsx`, `app/[lang]/auth/admin-setup/page.tsx`, `data/translations/*/account.ts`.
- e2e: `e2e/global-setup.ts` enrolls admin/manager fixtures with test secret `E2E_TOTP_SECRET`; `e2e/helpers.ts` logs them in via login + TOTP.

## Rate limits (DB-backed `lib/rate-limit.ts`)

- password login: IP + identifier, 10 / 15 min (reset on correct password).
- MFA verify / enroll / enroll-confirm: 5 / 15 min per challenge token, 5 / 15 min per IP, 20 / 24 h per account (reset on success).
- Admin MFA reset: 5 / 15 min per actor.
- Bug fixed in `7fa072a6`: `resetAt` (timezone-less UTC from the app clock) was compared with the DB's `now()`.
  On a DB session whose TimeZone is not UTC every 15-minute window expired instantly → limits silently off.
  Neon defaults to GMT, so production was most likely unaffected, but it is no longer environment-dependent.

## Verification (2026-10-07, Node 22.13.1 — Git Bash default `node` is v20; use
`C:\Users\proku\AppData\Local\Programs\NodeJS\node-v22.13.1-win-x64`)

- `tsc --noEmit` pass; `npm run lint` 0 errors (76 pre-existing warnings; none in branch lines).
- `vitest` unit: 314 files / 2825 tests pass. `npm run test:integration`: 6/6.
- `audit:security`, `audit:architecture`, `check:encoding`, `check:admin-i18n`, `prisma validate` pass.
- `next build --webpack` via `node scripts/build-canonical-cwd.mjs` pass. **Do not use `npm run build` locally**:
  it runs `prisma migrate deploy` against the DB in `.env*` (shared Neon).
- Client bundle (`.next/static`): no `MFA_ENCRYPTION_KEY`, `aes-256-gcm`, `mfaSecret`, `mfaBackupCodes`.
- Anonymous dev-server check (no cookie → no session query): `/lv/admin/products/19073` and `/22272` HTML contain only
  the login redirect, no `initialValues`/sku/barcode/`erpPriceMissing`; RSC request → 307, empty body;
  `/api/admin/products` → 401; MFA routes with bogus tokens → 401.
- Isolated migration + flow check (one-off, files removed): in-memory PGlite (`@electric-sql/pglite`, transitive dep)
  + `pglite-socket`, pre-migration schema = `schema.prisma` of `5600646d` rendered by
  `prisma migrate diff --from-empty --to-schema` (the migration history has pre-existing drift: `ContactMessage`
  is never created by a migration, so a migrations-only replay fails). `prisma migrate diff` old→new schema =
  exactly the migration SQL. Real `lib/server-auth` + Prisma (PrismaPg, 1 connection) + real route handlers:
  - column `NOT NULL DEFAULT false`; existing sessions kept, all `false`;
  - pre-existing customer and B2B-owner sessions keep working; admin/manager sessions refused;
  - new customer sessions work; `mfaVerified:true` admin/manager sessions get admin access;
  - promoted customer's old session refused; rollback `DROP COLUMN` works;
  - full flow: wrong password 401; `/api/auth/sync` 401 for admin; login → enroll (secret stored as `iv.tag.ct`,
    not plaintext; MFA still off) → wrong first code 401 → right code → 8 codes (only bcrypt hashes stored) →
    verified session → challenge reuse 401 → next login requires TOTP, enroll refused → recovery code works once,
    reuse 401, 7 left → missing `MFA_ENCRYPTION_KEY` → 401 (no bypass) → 6 wrong codes → 429.
  - ran with DB TimeZone `Etc/GMT-2` and `UTC`: same result.
- Not run: Playwright e2e — `e2e/global-setup.ts` uses the Neon HTTP driver on `.env.local` (shared DB) and no local
  `MFA_ENCRYPTION_KEY` exists. Running it would write to the shared DB.

## ENV

`MFA_ENCRYPTION_KEY` — 32 random bytes, base64. Server-side only, never `NEXT_PUBLIC_*`, never committed.
Must be identical on every instance of one environment that reads the same DB (all Plesk/Vercel instances
of production), otherwise stored secrets cannot be decrypted. Missing/invalid → enrollment 503, TOTP check fails
(recovery codes still work) — fails closed, never a bypass. Rotating it requires every admin to re-enroll.
Operator generates it (do not let an AI generate production secrets):
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
Currently absent from local `.env` and `.env.local`.

## Operator steps before production

1. Set `MFA_ENCRYPTION_KEY` on the production runtime(s) (same value everywhere).
2. Merge `feat/mandatory-admin-mfa` into the release line; resolve the pre-existing `AddProductForm.tsx`
   local-main/origin divergence separately.
3. Deploy with the normal build (`prisma migrate deploy` applies `20261007120000_session_mfa_verified`).
   Code without the migration breaks session creation for everyone — deploy them together.
4. Immediately: every admin and manager logs in → scans QR → saves recovery codes. Existing admin sessions are
   invalid after deploy; customers stay logged in.
5. Verify: `/admin` only after TOTP; anonymous `/lv/admin/products/<id>` HTML/RSC without editor data.
6. For e2e: put a test-only `MFA_ENCRYPTION_KEY` in the e2e environment and run against an isolated DB.

## Remaining risks

1. First enrollment is trust-on-first-use: until an admin/manager enrolls, whoever knows their password can bind a
   device. Mitigation: enroll everyone right after deploy (step 4).
2. A TOTP code can be replayed within its ~60 s validity window (password still required). No used-step tracking.
3. Office NAT: the per-IP MFA limit (5 / 15 min) is shared by staff behind one IP.
4. Manager card logins no longer write the `team_member_login` company activity entry.
5. Manager grant via `teamRole` needs no step-up/four-eyes (pre-existing, unchanged); MFA still applies at login.
6. Migration history drift (`ContactMessage` not created by any migration) — pre-existing, unrelated.

## Next step

Owner: generate and set `MFA_ENCRYPTION_KEY` on production, then approve merge + deploy.
