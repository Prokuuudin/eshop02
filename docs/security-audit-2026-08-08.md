# Local security audit — 2026-08-08

Scope: order, invoice, company, user, wishlist and return authorization; checkout pricing; Stripe lifecycle; secrets and production logging.

## Findings and changes

- Existing ownership checks protect sequential order IDs, payment status, company invoices, returns and wishlist data from cross-user access.
- Checkout recomputes prices, discounts, delivery, tax and bonus usage from server-side data; client totals and prices do not determine the charge.
- Stripe `checkout.session.completed` now settles an order only when `payment_status` is `paid`; unpaid completions are acknowledged, alerted and left pending.
- Stripe signature verification and the atomic event ledger remain the idempotency boundary; paid is terminal and duplicate event IDs are ignored.
- Invoice updates now use explicit field allowlists and validate statuses.
- Invoice payments reject non-admin callers, non-positive/non-finite values and overpayments.
- Client telemetry redacts email addresses, Stripe-like secrets and sensitive query values before logging.
- `npm run audit:security` checks tracked secret-bearing files, private-key markers and dangerous `NEXT_PUBLIC_` secret names without printing secret values.

## Verification

- Security scan: pass, tracked and untracked non-ignored project files checked.
- ESLint: pass.
- Unit: 828/828 pass.
- Integration: 6/6 pass.
- Production build: pass, 585 static pages.
- Combined Chromium E2E smoke: 23/23 pass with one worker.
