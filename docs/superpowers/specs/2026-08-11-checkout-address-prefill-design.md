# Checkout address prefill + save-back

Date: 2026-08-11

## Problem

Checkout form (`app/[lang]/checkout/`) is stateless per visit: it only reads
initial values from URL query params (used by the "Use this address" link on
`/account/addresses` and by cart→checkout item-selection links). It never
reads the logged-in user's profile or saved addresses, and never writes the
address the customer just used back to their address book. Every order means
retyping name/phone/address from scratch, even though the `SavedAddress`
model and `/account/addresses` UI already exist for exactly this purpose —
checkout just isn't wired to them.

## Goals

- Prefill checkout fields by default from the user's profile / saved address
  when they land on `/checkout` with no explicit query params.
- After a successful order, silently persist the address used so it prefills
  next time — no schema changes to the live Neon DB.

## Non-goals

- No address picker/dropdown in checkout for users with multiple saved
  addresses (out of scope; single auto-selected address, editable inline).
- No consent checkbox for saving — save is silent, matching common
  e-commerce UX (confirmed with user).
- No new SavedAddress columns (e.g. `lastUsedAt`, `isDefault`). Live schema
  stays untouched per standing project rule.

## Design

### Precedence for populating `formData` on mount

1. **URL query params** (existing behavior, unchanged) — highest priority.
   Used by the explicit "Использовать" link on `/account/addresses` and by
   any future deep-link that pre-fills a specific address. If any of
   `firstName/lastName/email/phone/address/city/postalCode` is present in
   the query string, query wins for that field.
2. **Saved address, auto-selected** — if the user is logged in and a field
   is still empty after step 1, fetch `GET /api/user/addresses` (same call
   `/account/addresses` already makes via `hydrateSavedAddressesFromServer`)
   and look for an entry with id `checkout_default_<userId>`. If present,
   use its fields. If absent but other saved addresses exist, use the first
   one returned by the API.
3. **Profile fallback** — if no saved address exists at all, fill
   `firstName`/`lastName` by splitting `user.name` on the first space
   (first token → firstName, remainder → lastName, both may be empty),
   `phone` from `user.phone`, `email` from `user.email`. `address`/`city`/
   `postalCode` stay blank (profile doesn't carry them).
4. **Guest (no session)** — unchanged: fields start blank, no fetch.

Because the saved-address fetch is async and query params/local state are
synchronous, the merge happens in an effect after fetch resolves, and only
overwrites fields that are still empty at that point — so it never clobbers
something the user already typed while the fetch was in flight.

### Save-back on successful order

After `POST /api/orders` succeeds (existing success path in
`useCheckoutPage.tsx`, right where the order is confirmed), for logged-in
users only: upsert a `SavedAddress` via the existing
`useSavedAddresses().upsertForEmail` (which already POSTs to
`/api/user/addresses`), using a **fixed id** `checkout_default_<userId>`
and the fields from the just-submitted `formData`.

Using a fixed, deterministic id instead of a timestamp column means:
- First order creates the record.
- Every later order updates the same record in place (no duplicate rows
  piling up in the address book).
- The record's contents always reflect the most recently used checkout
  address — a proxy for "last used" without adding a DB column.

This id is distinct from the `addr_manual_<timestamp>` ids the
account-addresses page generates for manually-added entries (see
`hooks/useAccountAddresses.ts`), so it coexists cleanly as just another
row the user can see/edit/delete from `/account/addresses` like any other
saved address.

Guests (`currentUser === null`) are skipped — nothing to attach the address
to.

### Error handling

The upsert reuses `upsertForEmail`, which already fires-and-forgets the
POST and swallows failures (`.catch(() => {})`) — consistent with existing
behavior on `/account/addresses`. A failed save-back must never block or
delay order confirmation/redirect.

### Files touched (implementation detail, for planning)

- `app/[lang]/checkout/useCheckoutPage.tsx` — add saved-address fetch +
  merge effect; add save-back call in the success path.
- Possibly a small pure helper (e.g. in `lib/saved-addresses-store.ts` or
  inline) for the "merge empty fields only" logic and the
  `checkout_default_<userId>` id builder, so it's unit-testable without
  mounting the whole hook.

## Testing

- Unit test the merge-empty-fields-only logic: query params present → not
  overwritten by saved address; empty fields → filled; already-typed fields
  during in-flight fetch → not clobbered.
- Unit/integration test that a successful order submit triggers an
  `upsertForEmail` call with id `checkout_default_<userId>` and the
  submitted field values, for a logged-in user, and that it's skipped for a
  guest.
- Existing `useCheckoutPage` / checkout e2e coverage should still pass
  unchanged (query-param prefill path untouched).
