# Test account clean-up runbook

`npm run cleanup:test-accounts` (logic: `lib/test-account-cleanup.ts`) removes known test
accounts from a database. It touches only these exact ids and nothing else:

| Id | E-mail | Action |
|---|---|---|
| `seed_admin_001` | `admin@test.com` | **neutralize**: keep the user, its orders and audit history; replace the password with an unknown random bcrypt hash; clear the MFA secret, backup codes and enrolment; delete sessions, MFA challenges, reset and invitation tokens |
| `u_e2e_admin_fixture` | `e2e-admin@hairshoppro.lv.local` | **delete** |
| `u_e2e_manager_fixture` | `e2e-manager@hairshoppro.lv.local` | **delete** |
| `u_e2e_customer_fixture` | `e2e-customer@hairshoppro.lv.local` | **delete** |

Safety rules, re-evaluated inside the apply transaction with the target rows locked:

- The whole run is refused if a target id has a different e-mail, admin-panel access (admin or
  manager) or Super Admin, or if the user to neutralize is missing.
- A fixture is deleted only when its id, e-mail and name match the E2E fixture pattern and no
  business row references it (orders by id or e-mail, returns, bonus transactions, promo
  redemptions, company membership, account-manager messages, company activity,
  access/RFQ/role-change requests, or any other foreign key to `User`). Otherwise it is reported
  as `blocked` and left untouched.
- Exception: a fixture's own bonus history goes with it when every row is an `order_earn`
  credit with no order link and no actor, and its balance equals the last `balanceAfter`.
  Exactly the reviewed row ids are deleted; any other bonus row keeps the fixture `blocked`.
- The demo account is never deleted: its orders (including a real customer's order and paid
  Paysera orders) and bonus rows stay untouched.
- Inside the apply transaction, orders, invoices, returns, stock allocations, promo
  redemptions, every other bonus row, every other user and all earlier audit rows are hashed
  before and after the change; any difference rolls the whole transaction back.
- Sessions, tokens, wishlist items, saved addresses, notifications and product-news
  subscriptions of a deleted fixture are removed with it. `AuditLog` is never modified; each
  change appends one hash-chained audit row (`user.test_account_neutralized` /
  `user.test_account_deleted`) with the operator as actor.
- Apply runs only the reviewed plan: `--confirm` must equal the fingerprint of the current
  state, so any change after the review aborts with nothing written. Re-running is a no-op.

## Procedure

Run from a checkout of the merged code with dependencies installed. The database comes only
from `CLEANUP_DATABASE_URL`; `DATABASE_URL` and `.env.local` are never read. Keep `--out`
outside the repository. Output files hold credential-redacted rows only (password hashes as a
short sha256 fingerprint, secrets and tokens as `[redacted]`).

1. **Backup.** Confirm a fresh restorable backup (or create a Neon restore point) of the target
   database.
2. **Review (read-only transaction).**

   ```
   CLEANUP_DATABASE_URL=<target> npm run cleanup:test-accounts -- --out <dir>
   ```

   Read every line and the written JSON (`plan`, `states`, `snapshot`). Expected outcomes:
   `neutralize` for the demo account, `delete` or `blocked` (with reason) for each fixture.
   Stop if the plan is `refused`.
3. **Approval.** The owner approves the exact printed fingerprint.
4. **Apply** (Serializable transaction):

   ```
   CLEANUP_DATABASE_URL=<target> npm run cleanup:test-accounts -- --out <dir> --apply \
     --confirm <fingerprint> --expect-host <database host> \
     --operator-email <Super Admin with MFA> --reason "<approval reference>"
   ```

5. **Verify.** Run the review again: every target must be `noop` (or still `blocked`), and
   `changes: 0`. In the admin panel, the audit-log integrity check must stay green and the
   new audit rows must name the operator.

## Stale order links of the E2E customer fixture

`npm run repair:test-bonus-links` (logic: `lib/test-bonus-link-repair.ts`) clears `orderId` on
two exact bonus rows of `u_e2e_customer_fixture`. Their test orders were deleted outside the admin
delete route (which unlinks bonus rows), and because order ids are `max(id) + 1`, later real
orders of other customers received the same ids. Only `orderId` of those two rows changes; points,
balances, reasons, orders and every other customer's bonus rows stay untouched. Any other stale
link found by the review is only reported. Same protocol and flags as above (review, approve the
fingerprint, `--apply --confirm ... --expect-host ... --operator-email ... --reason ...`, review
again: both rows `noop`). Run it before the account clean-up, which then deletes the detached
rows together with the fixture.

Never delete production orders by hand: use the admin delete route, which unlinks dependent rows
and writes an audit entry.

## Rollback

- Neutralize cannot and should not restore the old credentials. If the account must be used
  again, an administrator issues a fresh password through the normal flows; MFA is enrolled again.
- A deleted fixture can be recreated from the apply report's `snapshot` without its old
  password (fixtures are recreated by `e2e/global-setup.ts` in test databases only).
- For anything else, restore from the backup taken in step 1.
