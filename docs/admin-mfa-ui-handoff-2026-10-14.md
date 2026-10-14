# Admin MFA UI: staff instructions and manager visibility — handoff (2026-10-14)

Status: implemented in a separate working copy, committed locally on `ui/admin-mfa-instructions`
(see `git log -1` there), **not pushed, not merged into the release, not deployed**.
Continue with Claude Code or Codex from this document; no further investigation is needed.

## Where the work is

- Working copy: `C:\Users\User\HairshopPro-Restored\worktrees\admin-mfa-ui`
- Branch: `ui/admin-mfa-instructions`, created from `release/2026-10-20` = `b6e6375f` (local only, not pushed).
- Changed files:
  - `components/admin/AdminMfaSection.tsx`
  - `app/[lang]/account/page.tsx`
  - `app/api/auth/login/route.ts`, `app/api/auth/login/route.test.ts` (second commit, staff email login)
  - this document
- Commits: `4769feb4` (MFA UI), then the staff email login fix on top. Integrate both together.
- `node_modules` and `generated` in this working copy are **junctions** to
  `%TEMP%\hairshop-final-review-b6e6375f\{node_modules,generated}` (same SHA, nothing installed).
  Before removing the working copy, delete the junctions first so the targets are not touched:
  `cmd /c rmdir node_modules` and `cmd /c rmdir generated` (inside the working copy), then `git worktree remove`.

## Findings (UI only)

| Date | Commit | What happened |
|---|---|---|
| 2026-08-02 | `91fbdbb2` | `AdminMfaSection` added inside `AdminAccountDashboard` (shown on `/account` for platform admins). |
| 2026-08-24 | `67300cc3` "feat: add unanswered customer requests dashboard" | `<AdminMfaSection />` and its import removed from `AdminAccountDashboard`, replaced by `UnansweredCustomerRequests`. No reason in the commit; looks accidental. Since then `main`/production has had no MFA UI. |
| 2026-10-07 | `2bc14c47` → release `e66c6e74` | Section re-mounted on `app/[lang]/account/page.tsx`, admin branch only (`platformRole === 'admin'`), next to `AdminStaffMfaReset`. |

State in `b6e6375f` before this change:
- Platform admins: section visible on `/account` (reachable from `/admin` via "Go to dashboard" and the user menu).
- Staff managers (`teamRole === 'manager'`): use the customer layout of `/account`, so they had **no** MFA section
  (no backup-code regeneration, no "change device"), although MFA is mandatory for them.
- No staff instructions; the "not enabled" text still said "recommended".

Relation to mandatory enrollment: setup happens in the sign-in flow (`components/auth/LoginForm.tsx`, QR + first code +
8 backup codes). A staff session only exists after MFA, so on `/account` the section normally shows "enabled".
The section was therefore **not** turned into a second setup flow; its existing "set up" button (legacy
`/api/user/mfa/setup` + `/confirm`) stays only for the rare not-enabled state.

## Change

1. `AdminMfaSection.tsx`
   - Heading "Двухфакторная защита входа" / "Divfaktoru pieslēgšanās aizsardzība" / "Two-factor sign-in protection".
   - Short "why" paragraph under the heading.
   - Not-enabled state: "required for staff" text, button "Настроить защиту" / "Iestatīt aizsardzību".
   - Collapsible "Как это работает" guide (`<details>`, open by default only when not set up): 5 steps + 4 notes
     (codes change every 30 s; backup codes are single-use and can be regenerated; new phone → "Change device";
     lost phone and codes → ask another administrator). No technical terms.
   - Explicit status badge next to the heading: "Включена" / "Не настроена" (LV "Ieslēgta" / "Nav iestatīta").
   - After "Change device" everyone (admin and manager) goes to `/auth/login?admin=1&redirect=/account`, the same
     staff sign-in entry `app/[lang]/admin/layout.tsx` uses for unauthenticated admins and managers.
     (An intermediate `cardLogin` prop that sent managers to the customer card form was removed on owner request.)
   - Strings use the existing `useAdminLocale().l(ru, en, lv)` pattern, like the rest of the component.
2. `app/[lang]/account/page.tsx`: renders `<AdminMfaSection />` at the top of the customer layout when
   `user.teamRole === 'manager'`.

Authorization: the change is client rendering only. Every API the section calls (`/api/user/mfa/{status,setup,
confirm,disable,backup-codes/regenerate}`) requires `getServerUser()` (401) and `requiresAdminMfa(user)` (403), i.e.
`platformRole === 'admin'` or `teamRole === 'manager'`. Managers get no new permission: `AdminStaffMfaReset`
(and `/api/admin/users/[id]/mfa-reset`, `users.manage`) stays platform-admin only.

3. Staff email login (second commit, owner rule: "managers sign in exactly like admins: email + password + MFA").
   `b6e6375f` `app/api/auth/login/route.ts` accepted an email identifier only for `platformRole === 'admin'`, so a
   manager on the staff form (`/auth/login?admin=1`, field "Email") was rejected with 401.
   Fix: `!(isEmail && user.platformRole !== 'admin')` → `!(isEmail && !requiresAdminMfa(user))`.
   - Admins and managers may now use email; both always get the MFA challenge (no session, no cookie before MFA).
   - Customers and B2B company owners (`teamRole === 'admin'`) are still rejected for email (timing-safe dummy bcrypt
     compare unchanged) and keep card-number login. Card login is unchanged for everyone, including managers who
     have a card (still MFA-gated). Disabling card login for managers would be a separate decision.
   - Permissions are unchanged: `getPermissionAccessLevel` decides access; the identifier type does not.
   - Tests added in `app/api/auth/login/route.test.ts`: manager by email → MFA challenge, no session/cookie;
     B2B owner by email → 401 with dummy hash.
   - Data precondition for launch: each manager's `User.email` must be a real address they know (read-only check
     by the owner; no data was queried here).

Untouched: MFA backend, crypto, Prisma, migrations, `LoginForm`, `AdminStaffMfaReset`, `data/translations`.
Step 2 of the owner's draft ("Нажмите «Настроить защиту»") was adapted: the setup screen opens automatically at the
first sign-in after the password; the button is mentioned only for the not-set-up state.

## Verification (2026-10-14, Node 22.23.2, no DB variables, no `.env*`)

- `tsc --noEmit --incremental false`: exit 0.
- `eslint components/admin/AdminMfaSection.tsx "app/[lang]/account/page.tsx"`: 0 problems.
- `node scripts/check-admin-i18n.mjs`: pass; the "1 potentially hardcoded Cyrillic string" notice is identical on `b6e6375f`.
- `node scripts/check-public-text-encoding.mjs`: pass.
- No component/UI tests exist for these files (vitest includes `lib|data|app|scripts/**/*.test.ts` only).
- Staff email login fix: `vitest run app/api/auth/login/route.test.ts` 12/12 pass (10 existing + 2 new);
  `tsc` exit 0; eslint on both files 0 problems.
- Not done: visual check in a browser (needs a running app with a DB). Do it on Vercel Preview after integration:
  platform admin `/lv/account` and `/ru/account`; manager `/lv/account`; guide text, collapse, "Change device" redirect.

## Safe integration into the release (owner decision; not done)

Adding this to `release/2026-10-20` changes the reviewed release SHA → needs a short re-review and a Preview redeploy.

1. Owner approves the text (RU/LV) and the manager placement.
2. Both commits already exist on `ui/admin-mfa-instructions` (base `b6e6375f`).
3. Review them (`git log -p b6e6375f..ui/admin-mfa-instructions`), then either
   - open a PR `ui/admin-mfa-instructions` → `release/2026-10-20`, or
   - in the clean release working copy: `git cherry-pick -x b6e6375f..ui/admin-mfa-instructions` (conflict-free).
4. Re-run only: `tsc --noEmit`, eslint on the changed files, `check:admin-i18n`,
   `vitest run app/api/auth/login/route.test.ts`; push the release branch only with
   the owner's approval; Vercel Preview redeploys `release/2026-10-20` (build does not run migrations).
5. Visual check on Preview (above). Production/Plesk only through the normal release process.

Alternative without touching the release SHA: ship after 20.10 in the next release.
