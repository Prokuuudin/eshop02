# Spec: Cookie Consent Banner + Admin Order Notification Email

Date: 2026-06-16

## Scope

Two independent features shipped together:

1. **Cookie consent banner** — GDPR-compliant, EU standard with granular categories
2. **Admin order notification email** — email to shop owner on every new order

---

## 1. Cookie Consent Banner

### Goal

Show a consent banner on first visit. Store user's choice. Expose consent state so future analytics/marketing scripts (Google Analytics, Meta Pixel, etc.) can check it before initialising.

### Architecture

**New file:** `components/CookieConsent.tsx`

Client component (`'use client'`). Reads `localStorage` key `cookie_consent` on mount. If no value → shows banner. If value exists → renders nothing.

**Mounted in:** `app/providers.tsx` alongside existing providers.

### Consent Storage

Key: `cookie_consent`
Value (JSON):
```json
{
  "necessary": true,
  "analytics": false,
  "marketing": false,
  "ts": 1718530000000
}
```

`necessary` is always `true` and cannot be changed. `ts` is `Date.now()` at time of choice.

### UI — Bottom Bar

Fixed to bottom of viewport. Appears above footer (z-50). Dismisses with animation after choice.

Layout:
```
[ ℹ text: "We use cookies..." ]  [ Accept all ] [ Configure ] [ Necessary only ]
```

On mobile: text on top, buttons stacked below.

### UI — Configure Dialog

Reuses `@radix-ui/react-dialog` (already installed). Three rows:

| Category      | Toggle | Default | Editable |
|---------------|--------|---------|----------|
| Necessary     | on     | true    | no (locked) |
| Analytics     | off    | false   | yes |
| Marketing     | off    | false   | yes |

Buttons in dialog footer: "Save selection" / "Accept all"

### Translations

New keys added to `data/translations.ts` for `ru`, `en`, `lv`:

```
cookie.banner.text
cookie.banner.acceptAll
cookie.banner.configure
cookie.banner.necessaryOnly
cookie.configure.title
cookie.configure.necessary
cookie.configure.necessaryDesc
cookie.configure.analytics
cookie.configure.analyticsDesc
cookie.configure.marketing
cookie.configure.marketingDesc
cookie.configure.save
cookie.configure.acceptAll
```

### Consent Access Helper

Export from `CookieConsent.tsx`:
```ts
export function getCookieConsent(): CookieConsent | null
```
Used by future analytics integrations to check `consent.analytics` before loading GA, etc.

### Behaviour Rules

- Banner not shown on server render (SSR-safe: reads localStorage only on mount)
- After choice: banner fades out, does not reappear until `cookie_consent` key is removed
- No external network requests

---

## 2. Admin Order Notification Email

### Goal

When a new order is saved (`POST /api/orders`), send an email to the shop admin so they know without checking the admin panel.

### Where

`app/api/orders/route.ts` — add `sendAdminOrderNotificationEmail(order)` after the existing `sendOrderConfirmationEmail` call.

Recipient: `process.env.CONTACT_TO`. If `CONTACT_TO` not set → skip silently (same pattern as existing mailer).

### Email Content (Russian, admin language)

Subject: `Новый заказ №{id} — {firstName} {lastName} — €{total}`

Body (HTML):
- Order number, date/time
- Customer: name, email, phone
- Delivery address + method
- Payment method + status
- Items table: title, quantity, price per unit, line total
- Subtotal, discount (if any), tax, delivery fee, **total**

### Error Handling

Fire-and-forget with `.catch(console.error)` — same pattern as customer email. A failed admin notification must never block the order response.

---

## What Is NOT in Scope

- `/privacy` and `/terms` pages (separate task)
- Consent synced to server/DB
- Cookie scanning / auto-categorisation
- Re-consent on policy update
- Google Analytics / Meta Pixel integration (future: check `getCookieConsent().analytics`)
