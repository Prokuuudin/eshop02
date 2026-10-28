# Admin MFA — status & handoff

Last update: 2026-10-07 (Claude Code). Next AI (Claude or Codex): re-verify the critical claims
below against code/tests before relying on them.

## Goal

Mandatory TOTP MFA (password + authenticator code) for everyone with admin-panel access,
using the existing architecture. Customers are never subject to MFA.

## Verdict

- Before this work: **MFA PARTIALLY IMPLEMENTED** (optional, UI not mounted, bypass via `/api/auth/sync`).
- After: **READY WITH BLOCKERS** — code complete and tested; deployment prerequisites below.

## Model

"Admin-capable" = `getPermissionAccessLevel(user) !== 'none'` → `platformRole === 'admin'` or
`teamRole === 'manager'`. Helper: `requiresAdminMfa()` in `lib/server-auth.ts`.

Login flow:

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

Session-layer enforcement (the actual security boundary): `Session.mfaVerified` (new column,
default false). `getServerUser()` returns `null` for an admin-capable user whose session is not
MFA-verified — regardless of which route created it. Every admin page/layout/API/server code path
goes through `getServerUser` → `requireAdminPermission` / `getAdminAccessLevel`.

## Files

- `prisma/schema.prisma`, `prisma/migrations/20261007120000_session_mfa_verified/` — additive column.
- `lib/server-auth.ts` — `requiresAdminMfa`, `sessionCookieMaxAgeSeconds`, `createSession(id, {mfaVerified})`, check in `getServerUser`. Managers now also get the 1-day session.
- `lib/mfa-challenge.ts` (new) — challenge create/lookup/atomic consume, rate limits, cookie.
- `lib/mfa.ts` — `decryptSecret` pins 16-byte GCM tag, rejects malformed input.
- `app/api/auth/login` — challenge for every admin-capable user.
- `app/api/auth/mfa/verify` — per-account limit, atomic challenge + recovery-code consume.
- `app/api/auth/mfa/enroll`, `enroll/confirm` (new) — mandatory first enrollment via challenge token.
- `app/api/auth/sync` — rejects admin-capable accounts (was a full MFA bypass).
- `app/api/auth/admin-setup` — first admin bootstrap no longer issues a session.
- `app/api/user/password` — rotated session keeps MFA status.
- `app/api/user/mfa/*` — managers included; `disable` = "change device": revokes all sessions, no new session.
- `app/api/admin/users/[id]/mfa-reset` (new) — reset a colleague's MFA (users.manage + own password + own TOTP + reason, audited, not self).
- `app/api/admin/users` GET — optional `teamRole` filter (for the staff list).
- UI: `components/auth/LoginForm.tsx` (enrollment/QR/recovery screens), `components/admin/AdminMfaSection.tsx` (now mounted), `components/admin/AdminStaffMfaReset.tsx` (new), `app/[lang]/account/page.tsx`, `app/[lang]/auth/admin-setup/page.tsx`, translations `data/translations/*/account.ts`.
- e2e: admin/manager fixtures are MFA-enrolled in `e2e/global-setup.ts` and log in via login + TOTP (`e2e/helpers.ts`); manager fixture got card `E2E-MANAGER-FIXTURE`. Requires `MFA_ENCRYPTION_KEY` in `.env.local`.

## Rate limits (DB-backed `lib/rate-limit.ts`)

- password login: existing (IP + identifier, 10/15 min).
- MFA verify / enroll / enroll-confirm: 5/15 min per challenge token, 5/15 min per IP, 20/24 h per account (reset on success).
- Admin MFA reset: 5/15 min per actor.

## Tests run (2026-10-07, Node 22.13.1)

- `npx tsc --noEmit` — pass.
- eslint on changed files — 0 errors (2 pre-existing warnings in untouched lines).
- `vitest` unit — 312 files / 2818 tests pass. `npm run test:integration` — 6/6 pass.
- `audit:security`, `audit:architecture`, `check:encoding`, `check:admin-i18n`, `prisma validate` — pass.
- `next build --webpack` (via `scripts/build-canonical-cwd.mjs`, **without** `prisma migrate deploy`) — pass.
- Anonymous dev-server checks: admin APIs/MFA routes 401; `/lv/admin` redirects to login.
- Not run: Playwright e2e (needs `MFA_ENCRYPTION_KEY` locally and the migration on the e2e DB);
  no real login was performed against the shared Neon DB (migration not applied there).

## Blockers / open decisions

1. `MFA_ENCRYPTION_KEY` must be set on every runtime (Vercel, Plesk). Without it admin enrollment fails closed (503) — admins cannot log in. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Store as a server secret, never `NEXT_PUBLIC_*`. Do **not** rotate it later without re-enrolling everyone (old secrets become undecryptable; recovery codes still work).
2. Migration `20261007120000_session_mfa_verified` must be applied (the `build` script runs `prisma migrate deploy`). Deploying the code without it breaks session creation for everyone.
3. Pre-existing, not MFA: local `main` lacks `8580888b fix(security): protect admin product page data` (on origin/main and production). Anonymous `GET /lv/admin/products/<id>` on local main still streams editor data (sku, barcode). Cherry-pick it before releasing local `main`.
4. Pre-existing: promoting a new platform admin requires `target.mfaEnabled` (role-approvals / users PATCH), but a customer cannot enroll MFA, so promotion is impossible. With mandatory login-time enrollment, that check could be dropped — needs owner decision.
5. Manager card logins no longer write the `team_member_login` company activity entry (it was only on the password-only path).

## Next step

Set `MFA_ENCRYPTION_KEY` on the target environment, deploy (migration runs in build), then log in
as each admin → scan QR → save recovery codes; verify `/admin` works only after the TOTP step.
