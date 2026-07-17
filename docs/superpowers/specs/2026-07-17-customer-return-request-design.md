# Customer-facing return request form — design

**Date:** 2026-07-17
**Status:** approved (user confirmed in session)

## Problem

The returns subsystem is one-sided. `POST /api/returns` is fully implemented and hardened
(order-ownership check, item-subset validation, quantity ceilings, server-computed
`refundAmount`), and admins manage requests at `/admin/returns`. But no customer-facing UI
calls it: `lib/returns-store.ts#addReturn()` is only invoked from the admin page, and
`components/account/AccountReturnsSection.tsx` is read-only. A customer can watch a return's
status but cannot initiate one.

Two adjacent bugs in the same component, found during design and approved for inclusion:

1. `AccountReturnsSection.tsx:87` renders `refundAmount / 100` — the field is stored in
   euros, not cents, so a €45 refund displays as €0.45.
2. The "Все заявки" link targets `/account/returns`, which does not exist (404). It was
   never noticed because no customer could create returns, so the >3-returns branch that
   shows the link never rendered.

## Decisions

- **Entry point:** button «Запросить возврат» on `/order/[id]`, in the actions block next
  to «Скачать счёт». Chosen over a standalone `/account/returns/new` flow because the order
  page is the natural context — the order is already loaded, and the server validates
  against exactly one order anyway. (User picked this option.)
- **Visibility gate:** button renders only when `order.paymentStatus === 'paid'`. The Order
  model has no delivery/fulfillment status field — `paymentStatus` is the only real signal
  available, and requesting a return for an unpaid order makes no sense.
- **Store hardening:** `addReturn()` currently applies an optimistic update and fires
  `POST /api/returns` with `.catch(() => {})` — the same silent-failure class as the RFQ
  store fixed earlier today (commit 07f5bce). It becomes async, returns success/failure,
  and rolls back the optimistic entry when the server rejects. Same pattern as
  `lib/rfq-store.ts`.
- **Adjacent fixes:** both bugs above fixed in the same change. `/account/returns` becomes
  a real minimal page listing all of the current user's returns, reusing the card markup
  already in `AccountReturnsSection`.

## Components

### `components/ReturnRequestDialog.tsx` (new)

Props: `order: Order`, `open`, `onOpenChange`.

- Per order line item: checkbox + quantity stepper (1 … that line's ordered quantity).
- Reason: `Select` over the existing `RETURN_REASON_LABELS` map from `lib/returns-store.ts`.
- Optional comment `Textarea`.
- Submit disabled until ≥1 item checked and a reason picked.
- On submit: build `ReturnRequest` fields from the order (name/email/phone come from the
  order; server recomputes `refundAmount` and assigns the id), `await addReturn(...)`.
  - Success → success toast, close dialog.
  - Failure → error toast naming the server's reason when available (e.g.
    `quantity_exceeds_order`), dialog stays open with the user's picks intact.

### `app/order/[id]/page.tsx` (edit)

Add the button + dialog mount in the actions `space-y-2` block (~line 686), gated on
`paymentStatus === 'paid'`.

### `lib/returns-store.ts` (edit)

`addReturn(r) => Promise<{ ok: boolean; error?: string }>`:
optimistic insert → `await POST /api/returns` → on non-ok/network error remove the
optimistic entry and return `{ ok: false, error }` (error = server's `error` field when
parseable). On success, keep entry and return `{ ok: true }`. The admin caller
(`app/admin/returns/page.tsx:166`) is updated to await and toast on failure.

### `components/account/AccountReturnsSection.tsx` (edit)

- Line 87: drop `/ 100`.
- No other behavior changes.

### `app/account/returns/page.tsx` (new)

Minimal authenticated page: fetch `GET /api/returns` (server already scopes non-admins to
their own email), render the full list with the same card layout as the widget, empty state
with a link back to `/account`. No pagination in v1 — server caps at 200, a customer with
200+ returns is not a realistic v1 concern.

## Error handling

- Network/500 on submit → generic error toast, dialog open, state intact.
- 400 family (`item_not_in_order`, `quantity_exceeds_order`, `invalid_reason`) → toast the
  code's human label; these indicate a stale page (e.g. return already filed) so also
  suggest refreshing.
- Unauthenticated users never see the button (order page already requires the order to be
  theirs to display meaningful data; server enforces ownership regardless).

## Testing

- `lib/returns-store.test.ts` (new, TDD): success keeps entry and resolves ok; server
  rejection rolls back; network error rolls back — mirroring `lib/rfq-store.test.ts`.
- Live check against dev server: create a return on a real paid order via the new dialog,
  confirm it appears in `/admin/returns` and in `/account/returns`, refund amount displayed
  in whole euros. Clean up the test return from Neon afterwards.

## Out of scope

- Return shipping labels, refund execution, email notifications.
- Delivery-status gating (no such field on Order yet — ERP Phase 2).
- Editing/cancelling a submitted return from the customer side.
