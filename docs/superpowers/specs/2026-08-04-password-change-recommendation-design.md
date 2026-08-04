# Card+PK password change: forced → recommended — design

Date: 2026-08-04
Status: approved for planning

## Problem

`mustChangePassword` currently forces an immediate, blocking password change
and is enforced in three separate layers:

1. `lib/auth-store.ts:45` — client store sets `isAuthenticated: false` for
   the whole app while the flag is true.
2. `lib/server-auth.ts:124` — `getServerUser()` returns `null` (treated as
   logged out) for any API route that doesn't explicitly opt in with
   `allowPasswordChangeRequired`.
3. `components/account/AccountGuard.tsx` — renders a blocking
   `ForceChangePasswordModal` that covers the whole page.

This was the right call for the two cases where the credential that got the
user in is genuinely **shared with other people**:
- B2B `Company` team-member registration (`FIRST_LOGIN_PASSWORD`, one value
  mailed to every cardholder on the account).
- Access-request approval (`app/api/admin/access-requests/[id]/route.ts`),
  which mails everyone the same default password (`Welcome1!`).

It's the wrong call for the individual card+PK self-registration path
(`app/api/auth/register-card/route.ts`, `cardUser` branch, added in
[2026-07-31-card-pk-registration-design.md](2026-07-31-card-pk-registration-design.md)).
There, the "password" is the last 3 characters of that specific person's own
personal code (`pkLast3`) — not shared with anyone else, already
rate-limited per card (5/hour). Blocking the entire site until they pick a
new password is unnecessary friction; a dismissible recommendation is
enough.

## Goal

For the individual card+PK path only: grant full site access immediately
(cart, orders, prices, everything `isAuthenticated` currently gates) and
replace the blocking modal with a non-blocking, dismissible banner. All
other `mustChangePassword: true` cases (B2B shared card, access-request
`Welcome1!`, any future admin-forced reset) keep today's hard block
unchanged.

## Eligibility condition — the important part

The naive split ("`companyId === null` means individual, so soften it") is
**wrong**: access-request approval and admin-initiated resets also produce
`companyId === null` with `mustChangePassword: true`, and both hand out a
credential that isn't unique to one person (`Welcome1!`, or whatever an
admin sets). Softening those would reintroduce the shared-secret risk the
hard block exists for.

The precise signal for "this session was established via a verified,
per-person personal code" is `pkLast3 !== null`. That column is written
only by `scripts/backfill-pk-last3.ts` and is required (422 otherwise) by
the `register-card` individual branch — no other creation path in the
codebase sets it. Combined with `companyId === null` (excludes the B2B
branch, whose created users share the same `cardNumber` as their company and
could in principle also pick up a `pkLast3` backfill match on a legal-entity
row):

```
softMode = user.mustChangePassword && user.pkLast3 !== null && user.companyId === null
```

`softMode === false` (the B2B and access-request/admin cases) keeps every
existing behavior byte-for-byte.

No schema change — both fields already exist on `User`. `companyId` is
already mapped onto `ServerUser` (`lib/server-auth.ts`) and the client
`User` type (`lib/auth-types.ts`); `pkLast3` is not exposed anywhere in
`lib/` today and must be added to both:
- `ServerUser` type + `mapDbToServerUser()` in `lib/server-auth.ts`.
- The client `User` type in `lib/auth-types.ts`.

No other wiring needed — `app/api/auth/me/route.ts` returns
`mapDbToServerUser()`'s output verbatim, and `AuthHydrator.tsx` stores that
JSON response into `localStorage` as-is (no field allowlist), so adding the
field to the mapper alone makes it flow through automatically. The
`register-card` route's own response (`route.ts:118`) already reuses
`mapDbToServerUser` too, so no separate change needed there.

**Correction (found during implementation, before this section's approach
ever reached the server side):** a security review of the first
implementation task flagged that shipping the raw `pkLast3` value to the
client means it lands in `localStorage` (`lib/auth-storage.ts`'s
`normalizeUser()`) alongside `cardNumber`, which is already stored there.
Together those two values are exactly the input pair `register-card`
accepts — so any XSS able to read `localStorage` would obtain a portable,
session-independent credential for that card (usable from the attacker's
own browser, replayable, outliving the current session) for as long as
`mustChangePassword` stays true. That window is now long-lived by design
(soft mode is meant to persist across sessions until the user gets around
to it), which compounds the exposure relative to before this feature.

The client never actually needs the raw code — only the yes/no answer to
"is this soft or hard." Fix: compute `isPasswordChangeSoft()` **server-side
only** (it already lives there) and expose just the derived boolean,
`passwordChangeSoft`, on both `ServerUser` and the client `User` type,
instead of the raw `pkLast3`. `pkLast3` itself never leaves the server.
This changes the two bullet points above to:
- `ServerUser` gets `passwordChangeSoft: boolean` (not `pkLast3`),
  computed in `mapDbToServerUser()` via `isPasswordChangeSoft()` against the
  raw Prisma `User` row (which does have `pkLast3`, `companyId`,
  `mustChangePassword`).
- The client `User` type gets `passwordChangeSoft?: boolean` (not
  `pkLast3`).

Every downstream consumer (`getServerUser`'s gate, `auth-store.ts`,
`AccountGuard.tsx`) reads this one boolean directly instead of recomputing
`isPasswordChangeSoft()` against three raw fields — simpler as well as
safer. `isPasswordChangeSoft()` itself is unchanged and still the single
source of truth; it just now only ever runs server-side, against the raw
Prisma row.

## Enforcement layer changes

1. **`lib/server-auth.ts`** (`mapDbToServerUser` + `getServerUser`) —
   `mapDbToServerUser()` computes `passwordChangeSoft: isPasswordChangeSoft(u)`
   from the raw Prisma row (never puts `pkLast3` on `ServerUser`). The gate
   at line 124 becomes conditional on that boolean instead of the flag
   alone:
   ```
   if (user.mustChangePassword && !user.passwordChangeSoft && !options.allowPasswordChangeRequired) return null
   ```
   All ~60 existing call sites (`app/api/**`) get the corrected behavior for
   free — no per-route changes.

2. **`lib/auth-store.ts`** — `isAuthenticated` becomes:
   ```
   isAuthenticated: !!user && !(user.mustChangePassword && !user.passwordChangeSoft)
   ```
   i.e. unauthenticated only when forced *and not* soft-eligible.

3. **`components/account/AccountGuard.tsx`** —
   ```
   {user?.mustChangePassword && !user.passwordChangeSoft && <ForceChangePasswordModal />}
   {user?.mustChangePassword && user.passwordChangeSoft && <PasswordChangeBanner />}
   ```
   `WelcomeModal`'s existing condition (`!user.mustChangePassword`) is left
   untouched — soft-mode users simply see it once they do change their
   password, same as today. Not worth adding a parallel welcome path for
   this.

## New component: `PasswordChangeBanner`

- Non-blocking bar, shown site-wide (same placement tier as `AccountGuard`
  today — above `<Header />`), dismissible with a close button.
- Dismiss state lives in `sessionStorage` (`pw-banner-dismissed:<userId>`),
  not `localStorage` and not component state — survives page reloads within
  the same browser session/tab, clears on new tab/browser restart, which is
  the closest approximation to "until next login" without adding a DB
  column or session-side field. Re-appears every fresh login.
- Clicking "change password" expands the same two fields as
  `ForceChangePasswordModal` (new password, confirm — no current-password
  field, matching what `/api/user/password` already accepts for
  `mustChangePassword` users) inline within the banner — it does not open
  `ForceChangePasswordModal` itself, since that would reintroduce a blocking
  overlay and defeat the point of this change. It must reuse
  `forceChangePassword()` from `lib/auth.ts` unchanged; no backend change
  needed since `/api/user/password` already skips the current-password
  check purely based on `mustChangePassword` (`route.ts:42`), independent of
  `passwordChangeSoft`.
- To avoid duplicating the field-pair + validation + submit logic between
  `ForceChangePasswordModal` and the banner, extract that into a shared
  small component/hook both use. `ForceChangePasswordModal` itself is
  otherwise unchanged (still used verbatim for the hard-block cases).

## Out of scope

- The B2B `Company` shared-card branch and access-request `Welcome1!`
  branch — behavior unchanged, still hard-blocked.
- `WelcomeModal` timing/interaction with soft-mode users.
- Any change to `/api/auth/register-card` claim-gate logic
  (`!cardUser.mustChangePassword → 409`) — untouched, still the sole
  security check for "is this card already claimed."
- i18n: `ForceChangePasswordModal` is hardcoded Russian today (no `t()`
  calls); the banner follows the same existing convention rather than
  introducing translation keys for this one flow.

## Testing

- `lib/server-auth.test.ts`: extend the existing `mustChangePassword`
  coverage with a case where `pkLast3` is set and `companyId` is null —
  `getServerUser()` must return the full user (not `null`) without
  `allowPasswordChangeRequired`, and its `passwordChangeSoft` must be
  `true` while `pkLast3` itself must NOT appear on the returned object.
  Existing "must be null" case stays as regression coverage for the still
  hard-blocked shape.
- `lib/auth-store.test.ts` (or add one if it doesn't exist): same
  soft/hard split for `isAuthenticated`.
- Component test or manual verification: `AccountGuard` renders
  `PasswordChangeBanner` (not the modal) for a soft-eligible user, and vice
  versa for a B2B/access-request-shaped one.
- Manual e2e per `verify` skill: log in as a card+PK-registered test user,
  confirm cart/orders/checkout work before changing password, confirm
  banner dismiss survives a reload and disappears after actually changing
  the password.
