# Admin TOTP MFA — design

Date: 2026-08-01
Status: approved for planning

## Problem

Third-party security audit (see conversation 2026-08-01, prior fixes in
commits `56ced41`/`255ec24`) flagged that `platformRole=admin` accounts are
protected by password alone. A leaked/guessed admin password is full account
takeover — no second factor. Admin session lifetime was already cut from 30
days to ~1 day (`lib/server-auth.ts`) as a partial mitigation, but that
doesn't address credential compromise itself.

## Goal

Add TOTP-based MFA (RFC 6238, compatible with Google/Microsoft
Authenticator) for `platformRole=admin` accounts. **Opt-in at launch** — a
banner in the admin dashboard nudges enrollment, nothing blocks admin-panel
access yet. ~2-3 admin accounts exist in prod today; mandatory enforcement
can follow once everyone's enrolled (separate future decision, not part of
this spec).

Out of scope (explicitly deferred, decided in conversation):
- WebAuthn/passkeys — stronger than TOTP but much larger scope; noted as a
  future upgrade path, not needed now since user picked TOTP directly.
- Admin-disables-another-admin's-MFA recovery UI — see Edge cases.
- Making MFA mandatory — separate decision once adoption is verified.

## Library choice

- **otplib** for TOTP generate/verify (actively maintained, RFC 6238/4226).
  `speakeasy` (the common alternative) hasn't been published since ~2017 —
  not used.
- **qrcode** to render the `otpauth://` enrollment URI as a data-URI PNG
  server-side — no external CDN, fits existing `img-src 'self' data:` CSP
  without changes.

## Schema change

```prisma
model User {
  // ...existing fields...
  mfaSecret      String?   // AES-256-GCM encrypted TOTP secret (base32), set on /setup, used once mfaEnabled=true
  mfaEnabled     Boolean   @default(false)
  mfaBackupCodes String[]  @default([]) // bcrypt hashes, single-use, consumed on login or disable
  mfaEnrolledAt  DateTime?
}

model MfaChallenge {
  id        String   @id @default(cuid())
  tokenHash String   @unique
  userId    String
  expiresAt DateTime
  attempts  Int      @default(0)
  createdAt DateTime @default(now())
}
```

Mirrors the existing `PasswordResetToken`/`InvitationToken` pattern
(opaque random token, only the sha256 hash stored, short TTL) rather than
introducing a new stateless-JWT convention — `jose` is in `package.json`
but unused anywhere in the codebase, so there's no precedent to build on.

`mfaSecret` is encrypted (not hashed) because the server must recover the
raw secret every login to compute the current code — unlike a password
hash, this can't be one-way. Encryption key comes from a new env var
`MFA_ENCRYPTION_KEY` (32 random bytes, AES-256-GCM), added to
`.env.example` and Vercel prod env as part of rollout. Without encryption,
a DB leak alone would be a full MFA bypass for every admin — bcrypt-hashed
passwords stay safe under the same leak, so plaintext TOTP secrets would be
the new weakest link.

## Flows

### 1. Enrollment (`/account`, admin already logged in via password)

- `POST /api/user/mfa/setup` — generates a new secret, encrypts it, writes
  to `User.mfaSecret` (`mfaEnabled` stays `false`). Returns
  `{ secret, qrCodeDataUrl }`. Re-calling this endpoint (abandoned setup)
  just overwrites the pending secret — harmless, since `mfaEnabled=false`
  means login ignores it.
- User scans the QR, enters the current 6-digit code:
  `POST /api/user/mfa/confirm { code }` — verifies against the pending
  secret. On success: `mfaEnabled=true`, `mfaEnrolledAt=now()`, generates 8
  backup codes, returns them **once** in plaintext (client must show a
  "save these, we won't show them again" screen). Only bcrypt hashes are
  persisted.

### 2. Login (admin, `mfaEnabled=true`)

- `POST /api/auth/login` verifies identifier+password exactly as today. If
  the matched user is an admin with `mfaEnabled`, it does **not** call
  `createSession()` — instead creates an `MfaChallenge` row (random token,
  hash stored, 5 min TTL) and responds `{ mfaRequired: true, challengeToken }`.
- Client shows a "code from your app" field, posts
  `POST /api/auth/mfa/verify { challengeToken, code }`.
- Server: rate-limits via existing `checkRateLimit` keyed by both
  `mfa:token:${challengeToken}` and `mfa:ip:${ip}` (5 attempts), increments
  `MfaChallenge.attempts`. Re-checks **live** `platformRole==='admin' &&
  mfaEnabled` on the challenge's user (not just trusting the challenge's
  existence — covers the case where role/MFA state changed in the
  intervening minutes). Accepts either a valid TOTP code (±1 step / ±30s
  drift window) or an unused backup code (removed from the array on use).
  On success: deletes the `MfaChallenge`, calls `createSession(user.id)`
  (already admin-aware 1-day duration from the prior fix), sets the cookie.
  On failure: 401, challenge row is left alone until its own TTL expiry (no
  infinite retry via re-creating challenges from the same login).

### 3. Disable MFA

`POST /api/user/mfa/disable { currentPassword, code }` — requires **both**
the current password and a valid TOTP/backup code (defense in depth,
mirrors how password change requires the old password). Clears
`mfaSecret`, `mfaEnabled`, `mfaBackupCodes`. On success, rotates sessions
the same way `POST /api/user/password` already does: delete all sessions
for the user, issue a fresh one for the current request. Rationale: if an
attacker who stole the current session tries to strip MFA remotely, the
real admin's other sessions die and they'll notice; if it's the legitimate
admin, the only cost is re-login on other devices.

### 4. Regenerate backup codes

`POST /api/user/mfa/backup-codes/regenerate { code }` — TOTP code only,
issues 8 fresh codes, invalidates the old set.

## UI

New "Security" section in `AdminAccountDashboard` (`/account` for admins):
enrollment status, enable/disable button, regenerate-backup-codes button.
When `mfaEnabled=false`, a dismissible-but-recurring banner nudges setup
(opt-in per the rollout decision — never blocks admin panel access).

## Edge cases

- **Backup codes exhausted + device lost**: self-service dead end by
  design — not building an admin-disables-another-admin's-MFA flow for
  ~2-3 accounts. Fallback is a manual DB fix (`mfaEnabled=false`), same
  class of manual intervention already used for the card-303 ERP-duplicate
  case (`project_card_303_erp_duplicate` memory). Accepted limitation.
- **CSRF** on all `/api/user/mfa/*` POSTs: already covered by the global
  `guardCookieAuthenticatedApiMutation` in `middleware.ts` — no extra code
  needed.
- **`mustChangePassword` users**: can't reach `/api/user/mfa/setup` at all
  (needs a normal, non-restricted session) — no special-casing required.

## Testing plan

Mirrors existing route-test conventions (mocked `prisma`, mocked
`server-auth` where the route under test doesn't own that logic):

- `lib/mfa.test.ts` — secret generation, encrypt/decrypt round-trip, TOTP
  verify (valid code, expired-window code, wrong code), backup-code
  hash/verify/single-use-consumption.
- `app/api/user/mfa/setup/route.test.ts`, `confirm/route.test.ts`,
  `disable/route.test.ts`, `backup-codes/regenerate/route.test.ts` — auth
  gating (non-admin / unauthenticated rejected), happy path, wrong-code
  rejection.
- `app/api/auth/login/route.test.ts` — extend: admin with `mfaEnabled`
  gets `mfaRequired` response instead of a session cookie.
- `app/api/auth/mfa/verify/route.test.ts` — valid code, expired challenge,
  rate-limit trip, backup-code path, stale-role re-check.

## Rollout

1. Migration (`prisma migrate dev` is broken per `project_migration_workflow_broken`
   memory — use the manual `migrate diff` + `db execute` + `migrate resolve`
   workaround, not a fresh `migrate dev`).
2. Add `MFA_ENCRYPTION_KEY` to `.env.local` and Vercel prod env (separate
   step, after code review — Vercel CLI agent-mode quirks noted in
   `project_vercel_cli_agent_mode` memory apply here).
3. Ship opt-in; no forced enrollment in this pass.
