# Admin Order Invoice — Design Spec

**Date:** 2026-06-04  
**Status:** Approved

---

## Feature

Admin selects a language (RU/EN/LV), generates an HTML invoice for an order, previews it, and sends it to the client's email.

---

## UI Flow

1. Admin expands an order in `/admin/orders`
2. Clicks **"Счёт"** button in the quick-actions row
3. `OrderInvoiceModal` opens:
   - Language selector: `[🇷🇺 RU] [🇺🇸 EN] [🇱🇻 LV]`
   - Email field (pre-filled from `order.email`, editable)
   - **"Предпросмотр"** button → opens `<iframe>` or new tab with invoice HTML
   - **"Отправить"** button → POST to API → success/error toast
4. Modal closes on success

---

## Invoice Document

Generated as HTML string. Content:

```
СЧЁТ / INVOICE / RĒĶINS                    Дата: DD.MM.YYYY
Номер: INV-{orderId}

Продавец:                   Покупатель:
Eshop                       {firstName} {lastName}
info@eshop.com              {email}
                            {phone}
                            {address}, {city}

┌─────────────────────────────────────────────────────────┐
│ Товар              │ Кол-во │ Цена    │ Сумма           │
├─────────────────────────────────────────────────────────┤
│ {item.title}       │ {qty}  │ {price} │ {total}         │
│ ...                │        │         │                  │
├─────────────────────────────────────────────────────────┤
│                          Подитог:  {subtotal}           │
│                          Доставка: {delivery}           │
│                          Скидка:   -{discount}          │
│                          НДС (21%): {tax}               │
│                          ИТОГО:    {total}              │
└─────────────────────────────────────────────────────────┘
```

Labels change by language. All money formatting uses Euro locale.

---

## Architecture

### `lib/invoice-template.ts` (new)

```typescript
export function buildInvoiceHtml(order: Order, lang: 'ru' | 'en' | 'lv'): string
```

- Hardcoded label maps for RU/EN/LV (no i18n dependency)
- Pure function → no side effects → easy to test/preview
- Returns full standalone HTML with inline styles (email-safe)

### `app/api/admin/orders/send-invoice/route.ts` (new)

```
POST { orderId: string, language: 'ru'|'en'|'lv', email: string }
→ builds HTML via buildInvoiceHtml
→ calls sendEmail(to, subject, html)
→ { ok: true } | { ok: false, code: string }
```

Uses existing `lib/mailer.ts`.

### `components/admin/OrderInvoiceModal.tsx` (new)

Props: `{ order: Order, open: boolean, onClose: () => void }`

State:
- `lang: 'ru'|'en'|'lv'` (default `'ru'`)
- `email: string` (init from `order.email`)
- `sending: boolean`
- `sent: boolean`

On "Предпросмотр": `window.open(URL.createObjectURL(new Blob([buildInvoiceHtml(order, lang)], {type:'text/html'})))`
On "Отправить": POST to `/api/admin/orders/send-invoice`, show success/error.

### `app/admin/orders/page.tsx` (modify)

- Import `OrderInvoiceModal`, `buildInvoiceHtml`
- State: `invoiceOrderId: string | null`
- Add **"Счёт"** button in quick-actions div (line ~617)
- Render `<OrderInvoiceModal>` at bottom of page

---

## Files

| File | Change |
|------|--------|
| `lib/invoice-template.ts` | New — HTML invoice builder |
| `app/api/admin/orders/send-invoice/route.ts` | New — send via email |
| `components/admin/OrderInvoiceModal.tsx` | New — modal UI |
| `app/admin/orders/page.tsx` | Add button + modal |
