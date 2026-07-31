# Card + personal-code registration — design

Date: 2026-07-31
Status: approved for planning

## Problem

Regular cardholders (10882 users imported from `Klienti 2026.xlsx`) can only
activate their account by waiting for a mailed invitation token — invites go
out in batches of 20/day, so the rollout of ~4660 cards is slow. The only
existing self-service card path (`RegisterForm` → `POST /api/auth/register-card`
individual branch) is dead in practice: it rejects any dormant imported user
because `import-client-cards.ts` sets `mustChangePassword: false` on creation,
and the route treats `mustChangePassword === false` as "already registered."

Separately, the route's *other* branch (B2B `Company` shared-card team
registration) uses one password (`FIRST_LOGIN_PASSWORD`) mailed to every
cardholder — anyone who knows or guesses a card number can hijack the
activation before the real owner does. That branch is out of scope for this
change (confirmed with user) but the same shared-secret weakness is why we're
not reusing that pattern for individual cards either.

## Goal

Let a cardholder self-register by entering their **card number** + the
**last 3 characters of their personal code** (`personas kods` for
individuals) or **company registration number** (for cards issued to a
legal entity) — sourced from the client database (`Klienti 2026.xlsx`, column
`pk`). On success, create/activate the account and force an immediate
password change (reusing the existing `mustChangePassword` flow). This
becomes the **primary** registration path; email invites remain as an
alternative (unchanged, not removed).

## Data findings (verified against `Klienti 2026.xlsx`)

- Sheet `Klienti 2026`, 10875 data rows. Column `pk` holds:
  - Individual cards (`Тип = "Физ"`, 10295 rows): Latvian personal code,
    e.g. `010570-10221`.
  - Legal-entity cards (`Тип = "Юр"`, 587 rows): company registration number,
    e.g. `LV40003578116` or `40103714999`.
  - 14 rows have no `Тип`.
- **3372 of 10875 rows (31%) have a blank `pk`** — 3258 "Физ", 102 "Юр", 12
  untyped. Checked all 4 sheets in the workbook (`Klienti 2026`, `Jelgava`,
  `SIA`, `Top 1000 mazākie`) — no other sheet recovers these values; `SIA` is
  the same export with the same gaps (0 recoverable). This data simply does
  not exist in the source file for these cards.
- Taking the **last 3 characters** of `pk` (after stripping non-alphanumeric
  characters) works uniformly for both formats — no need to branch on `Тип`
  in the verification logic.

## Schema change

Add to `User` in `prisma/schema.prisma`:

```prisma
pkLast3 String? @db.VarChar(3)
```

Nullable — `null` means "no personal code on file for this card" (the 31%
gap). We deliberately do **not** store the full personal code / registration
number: only the last 3 characters are ever needed for verification, and the
project is GDPR-scoped (controller: SIA MIKS PLUS) — storing full national ID
numbers for 10k+ users would meaningfully increase the sensitive-data
footprint for no functional benefit.

No changes to `Company`, `AccessRequest`, or any other model.

## Backfill (existing data)

**Post-implementation correction (fix round 1):** point 3 below (the
`mustChangePassword` flip) documents the originally-planned behavior only —
it was **removed entirely** during implementation. Task review found its
exclusion logic didn't account for the register-card + personal-code
activation path this feature introduces: a genuinely-activated register-card
user (who already changed their password) could incorrectly qualify as a
flip candidate on a future re-run of the script. Verified against the live
database that the flip logic had zero legitimate targets anyway — a separate
pre-existing script, `scripts/mark-dormant-cardholders.ts`, already sets
`mustChangePassword: true` for all current cardholders, and this feature's
own `import-client-cards.ts` fix makes all future dormant imports default to
`true` too. The shipped `scripts/backfill-pk-last3.ts` only ever writes
`pkLast3`; points 1, 2 and 4 below remain accurate. See
`docs/superpowers/plans/2026-07-31-card-pk-registration.md` (search for
"Post-implementation correction") for the equivalent plan-side note.

New one-off script `scripts/backfill-pk-last3.ts`, following the existing
convention in `scripts/import-client-cards.ts` (dry-run by default, `--apply`
to write, rollback report written to `C:/Temp/pk-last3-backfill-<ts>.json`):

1. Read `Klienti 2026.xlsx`, compute `pkLast3` for every row with a non-blank
   `pk` (strip non-alphanumeric chars, take last 3, uppercase).
2. Match to `User` by `cardNumber`, set `pkLast3` where currently `null`.
3. **Separately and conditionally**, flip `mustChangePassword: false → true`,
   but *only* for users where:
   - `companyId IS NULL` (excludes B2B `Company` team members — different
     branch, different semantics, not touched by this change), **and**
   - no `InvitationToken` row exists for that user with `status = 'accepted'`
     (excludes anyone who already activated via the email-invite flow and
     chose their own real password).

   This is the safety-critical part: flipping `mustChangePassword` to `true`
   for a user who has **already** set their own real password would let
   anyone who guesses their card + last-3-digits hijack a live account. The
   conditional excludes exactly that case. Users who are genuinely still
   dormant (created with a throwaway shared random password hash, never
   logged in, no accepted invite) are safe to flip — they cannot be reached
   by any other path today anyway.
4. Cards with blank `pk` (31%) get `pkLast3 = null` and are left as-is; they
   fall through to the manual-request path (see below).

This is a live-data write on the production Neon DB. Run dry-run first,
review the report, then `--apply` only with explicit go-ahead.

## Import script changes (going forward)

`scripts/import-client-cards.ts`:
- For newly-created dormant users (`toCreate` path): also compute and store
  `pkLast3` from the `pk` column; change `mustChangePassword` from `false` to
  `true` (matches the corrected eligibility semantics above — this is what
  makes new imports immediately self-registerable without waiting on an
  invite batch).
- For the `toUpdate` path (existing `User` matched by email, just gaining a
  `cardNumber`): also set `pkLast3` if available, but **do not** touch
  `mustChangePassword` — that user may already have a real chosen password
  from some other path, and flipping it would open the same hijack risk the
  backfill's conditional is designed to avoid.

## API change — `app/api/auth/register-card/route.ts`

Individual-user branch (`cardUser` found by `cardNumber`) replaces the
shared-password check with:

```
if (!cardUser.mustChangePassword) → 409 card_already_registered   (unchanged)
if (cardUser.pkLast3 === null)    → 422 no_personal_code_on_file  (new)
normalize submitted code (trim, strip non-alnum, uppercase)
if submitted !== cardUser.pkLast3 → 401 wrong_code                (new, replaces wrong_password for this branch)
else → create session as today (mustChangePassword stays true; the existing
        app/[lang]/layout.tsx redirect-to-change-password gate handles the rest)
```

The `Company` branch (shared card, no `User` row yet) is **unchanged** —
still checks `FIRST_LOGIN_PASSWORD`, still creates a `CompanyMember`. Out of
scope per user decision.

Rate limiting is reused as-is: existing per-IP and per-card
(`register-card:card:<cardNumber>`, 5 attempts/hour) limits in
`checkRateLimit` apply to the new code check without modification.

Request/response wire shape stays the same field names (`cardNumber`,
`password` — the meaning of `password` changes to "3-char code" for the
individual branch only; no field rename, to keep the change minimal since
this is a first-party endpoint not a public API).

`lib/auth.ts`: extend `RegisterCardErrorCode` with `'wrong_code'` and
`'no_personal_code_on_file'`.

## Frontend — `components/auth/RegisterForm.tsx`

- Relabel the password field: "Последние 3 цифры персонального кода / рег.
  номера" (translated per-language), placeholder `"123"`, `maxLength={3}`,
  drop the show/hide-password eye toggle (not a secret in the same sense,
  just 3 digits) and `autoComplete="current-password"`.
- Add a short hint distinguishing individual vs. company cards (which code to
  use).
- New error copy for `wrong_code` and `no_personal_code_on_file`. For
  `no_personal_code_on_file`, show an explanatory message plus a button that
  switches `RegisterSwitcher`'s `hasCard` state to `false`, routing the user
  into the existing `RegisterNoCardForm` → `AccessRequest` manual-approval
  flow (admin reviews and activates as today). `RegisterSwitcher` needs a new
  callback prop threaded down to `RegisterForm` for this switch.
- `card_already_registered` copy stays as-is (already communicates "log in
  instead").

## Out of scope (explicitly, per user decisions)

- B2B `Company` shared-card team-member registration (`FIRST_LOGIN_PASSWORD`
  branch) — untouched.
- Email-invite flow (`/api/auth/invite`, `InvitationToken`, admin "send
  invitations" UI) — kept as an alternative path, not removed.
- The 31% of cards with no `pk` on file — routed to the existing manual
  `AccessRequest` admin-approval flow; no attempt to source the missing data
  elsewhere (checked all 4 sheets in the source workbook, confirmed absent).

## Testing

Unit tests for `route.ts` (extending existing `register-card/route.test.ts`):
correct code activates and creates a session; wrong code → 401
`wrong_code`; `pkLast3 === null` → 422 `no_personal_code_on_file`; already
activated (`mustChangePassword === false`) → 409 `card_already_registered`;
`Company` branch behavior unchanged (existing tests must keep passing
untouched).

No automated test for the one-off backfill/import scripts, consistent with
existing repo convention (dry-run + manual review is the safety net for
these Neon-writing scripts, not unit tests).
