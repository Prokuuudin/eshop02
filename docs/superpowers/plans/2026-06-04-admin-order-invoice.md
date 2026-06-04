# Admin Order Invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin generate a multilingual (RU/EN/LV) HTML invoice for any order, preview it, and send it to the client's email.

**Architecture:** `buildInvoiceHtml(order, lang)` in `lib/invoice-template.ts` is a pure function producing standalone HTML with inline styles. A Next.js API route `POST /api/admin/orders/send-invoice` uses it + `lib/mailer.ts` to send. `OrderInvoiceModal` provides the UI (language selector, email field, preview, send). A button in the expanded order row in `/admin/orders` opens the modal.

**Tech Stack:** React 18, TypeScript, Next.js App Router, Nodemailer (`lib/mailer.ts`), Tailwind CSS.

---

## Files

| File | Change |
|------|--------|
| `lib/invoice-template.ts` | New — `buildInvoiceHtml(order, lang)` pure function |
| `app/api/admin/orders/send-invoice/route.ts` | New — POST endpoint |
| `components/admin/OrderInvoiceModal.tsx` | New — modal UI |
| `app/admin/orders/page.tsx` | Add invoice button + modal |

---

### Task 1: `lib/invoice-template.ts`

**Files:**
- Create: `lib/invoice-template.ts`

- [ ] **Step 1: Create the file**

```typescript
import { Order } from '@/lib/orders-store'

type Lang = 'ru' | 'en' | 'lv'

const LABELS: Record<Lang, Record<string, string>> = {
  ru: {
    invoice: 'СЧЁТ',
    number: 'Номер счёта',
    date: 'Дата',
    seller: 'Продавец',
    buyer: 'Покупатель',
    product: 'Товар',
    qty: 'Кол-во',
    price: 'Цена',
    amount: 'Сумма',
    subtotal: 'Подитог',
    delivery: 'Доставка',
    discount: 'Скидка',
    tax: 'НДС (21%)',
    total: 'ИТОГО',
    phone: 'Тел.',
    sku: 'Арт.',
    thankyou: 'Спасибо за заказ!',
  },
  en: {
    invoice: 'INVOICE',
    number: 'Invoice No.',
    date: 'Date',
    seller: 'Seller',
    buyer: 'Buyer',
    product: 'Product',
    qty: 'Qty',
    price: 'Price',
    amount: 'Amount',
    subtotal: 'Subtotal',
    delivery: 'Delivery',
    discount: 'Discount',
    tax: 'VAT (21%)',
    total: 'TOTAL',
    phone: 'Phone',
    sku: 'SKU',
    thankyou: 'Thank you for your order!',
  },
  lv: {
    invoice: 'RĒĶINS',
    number: 'Rēķina Nr.',
    date: 'Datums',
    seller: 'Pārdevējs',
    buyer: 'Pircējs',
    product: 'Prece',
    qty: 'Daudzums',
    price: 'Cena',
    amount: 'Summa',
    subtotal: 'Starpsumma',
    delivery: 'Piegāde',
    discount: 'Atlaide',
    tax: 'PVN (21%)',
    total: 'KOPĀ',
    phone: 'Tālr.',
    sku: 'Art.',
    thankyou: 'Paldies par pasūtījumu!',
  },
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function buildInvoiceHtml(order: Order, lang: Lang): string {
  const L = LABELS[lang]
  const date = new Date(order.createdAt).toLocaleDateString('ru-RU')

  const itemRows = order.items
    .map((item) => {
      const unitPrice = eur(item.price)
      const lineTotal = eur(item.price * item.quantity)
      const sku = item.sku ? `<br/><small style="color:#888">${L.sku}: ${item.sku}</small>` : ''
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.title}${sku}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${unitPrice}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${lineTotal}</td>
        </tr>`
    })
    .join('')

  const discountRow = order.discount > 0
    ? `<tr><td colspan="3" style="padding:4px 12px;text-align:right;color:#555">${L.discount}</td><td style="padding:4px 12px;text-align:right;color:#dc2626">−${eur(order.discount)}</td></tr>`
    : ''

  const taxAmount = Math.round((order.subtotal - order.discount) * 0.21)

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${L.invoice} INV-${order.id}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;margin:0;padding:32px;background:#fff}
  table{border-collapse:collapse;width:100%}
  .header-table td{vertical-align:top;padding:0 0 24px}
  .meta{color:#555;font-size:12px;line-height:1.8}
  th{background:#f5f5f5;padding:8px 12px;text-align:left;font-size:12px;font-weight:600;border-bottom:2px solid #e5e5e5}
  th:last-child,td:last-child{text-align:right}
  th:nth-child(2),td:nth-child(2){text-align:center}
  .totals td{padding:4px 12px}
  .total-row td{font-weight:700;font-size:14px;border-top:2px solid #1a1a1a;padding-top:8px}
  .footer{margin-top:40px;font-size:11px;color:#999;text-align:center}
</style>
</head>
<body>
<table class="header-table">
  <tr>
    <td style="width:50%">
      <h1 style="margin:0 0 4px;font-size:22px;letter-spacing:2px">${L.invoice}</h1>
      <div class="meta">
        ${L.number}: <strong>INV-${order.id}</strong><br/>
        ${L.date}: ${date}
      </div>
    </td>
    <td style="text-align:right">
      <strong style="font-size:16px">Eshop</strong><br/>
      <span class="meta">info@eshop.lv<br/>eshop.lv</span>
    </td>
  </tr>
  <tr>
    <td>
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#888;margin-bottom:4px">${L.buyer}</div>
      <div>
        <strong>${order.firstName} ${order.lastName}</strong><br/>
        ${order.email}<br/>
        ${L.phone}: ${order.phone}<br/>
        ${order.address ? order.address + ', ' : ''}${order.city}${order.postalCode ? ' ' + order.postalCode : ''}
      </div>
    </td>
    <td></td>
  </tr>
</table>

<table>
  <thead>
    <tr>
      <th style="width:50%">${L.product}</th>
      <th style="width:10%">${L.qty}</th>
      <th style="width:20%">${L.price}</th>
      <th style="width:20%">${L.amount}</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<table class="totals" style="margin-top:0;width:320px;margin-left:auto">
  <tr><td style="color:#555">${L.subtotal}</td><td style="text-align:right">${eur(order.subtotal)}</td></tr>
  ${discountRow}
  <tr><td style="color:#555">${L.delivery}</td><td style="text-align:right">${eur(order.delivery)}</td></tr>
  <tr><td style="color:#555">${L.tax}</td><td style="text-align:right">${eur(taxAmount)}</td></tr>
  <tr class="total-row"><td>${L.total}</td><td style="text-align:right">${eur(order.total)}</td></tr>
</table>

<div class="footer">${L.thankyou}</div>
</body>
</html>`
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/invoice-template.ts
git commit -m "feat: buildInvoiceHtml — multilingual order invoice template (ru/en/lv)"
```

---

### Task 2: API route `send-invoice`

**Files:**
- Create: `app/api/admin/orders/send-invoice/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { buildInvoiceHtml } from '@/lib/invoice-template'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { order: unknown; language: string; email: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const { order, language, email } = body

  if (!order || !email || !language) {
    return NextResponse.json({ ok: false, code: 'missing_fields' }, { status: 422 })
  }

  if (!['ru', 'en', 'lv'].includes(language)) {
    return NextResponse.json({ ok: false, code: 'invalid_language' }, { status: 422 })
  }

  const lang = language as 'ru' | 'en' | 'lv'

  const subjects: Record<string, string> = {
    ru: `Счёт по заказу #${(order as { id: string }).id}`,
    en: `Invoice for order #${(order as { id: string }).id}`,
    lv: `Rēķins pasūtījumam #${(order as { id: string }).id}`,
  }

  const html = buildInvoiceHtml(order as Parameters<typeof buildInvoiceHtml>[0], lang)

  try {
    await sendEmail(email, subjects[lang], html)
  } catch (err) {
    console.error('[send-invoice] error:', err)
    return NextResponse.json({ ok: false, code: 'send_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/orders/send-invoice/route.ts
git commit -m "feat: POST /api/admin/orders/send-invoice endpoint"
```

---

### Task 3: `OrderInvoiceModal` component

**Files:**
- Create: `components/admin/OrderInvoiceModal.tsx`

- [ ] **Step 1: Create the file**

```typescript
'use client'

import React, { useState } from 'react'
import { Order } from '@/lib/orders-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildInvoiceHtml } from '@/lib/invoice-template'
import { useToast } from '@/lib/toast-context'

type Lang = 'ru' | 'en' | 'lv'

const LANG_LABELS: Record<Lang, string> = { ru: '🇷🇺 RU', en: '🇺🇸 EN', lv: '🇱🇻 LV' }

type Props = {
  order: Order
  open: boolean
  onClose: () => void
}

export default function OrderInvoiceModal({ order, open, onClose }: Props) {
  const [lang, setLang] = useState<Lang>('ru')
  const [email, setEmail] = useState(order.email)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const { showToast } = useToast()

  if (!open) return null

  const handlePreview = () => {
    const html = buildInvoiceHtml(order, lang)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const handleSend = async () => {
    if (!email.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/orders/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order, language: lang, email: email.trim() }),
      })
      if (res.ok) {
        setSent(true)
        showToast(`Счёт отправлен на ${email}`, 'success')
        setTimeout(onClose, 1500)
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(`Ошибка отправки: ${data.code ?? 'unknown'}`, 'error')
      }
    } catch {
      showToast('Ошибка сети', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Счёт по заказу #{order.id}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        {/* Language selector */}
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Язык счёта</p>
          <div className="flex gap-2">
            {(['ru', 'en', 'lv'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  lang === l
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        {/* Email field */}
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Email получателя</p>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlePreview}
          >
            Предпросмотр
          </Button>
          <Button
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={handleSend}
            disabled={sending || sent || !email.trim()}
          >
            {sent ? '✓ Отправлено' : sending ? 'Отправка...' : 'Отправить'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/OrderInvoiceModal.tsx
git commit -m "feat: OrderInvoiceModal — language select, preview, send"
```

---

### Task 4: Wire into admin orders page

**Files:**
- Modify: `app/admin/orders/page.tsx`

- [ ] **Step 1: Add import**

After the existing imports, add:
```typescript
import OrderInvoiceModal from '@/components/admin/OrderInvoiceModal'
```

- [ ] **Step 2: Add state for invoice modal**

Inside the `AdminOrdersPage` component, after existing state declarations (e.g., after `const [selectedIds, ...]`), add:
```typescript
const [invoiceOrder, setInvoiceOrder] = useState<import('@/lib/orders-store').Order | null>(null)
```

- [ ] **Step 3: Add "Счёт" button in quick actions**

Find the quick-actions div (around line 617). After the `"Написать клиенту"` anchor, add:
```tsx
<button
  type="button"
  onClick={() => setInvoiceOrder(order)}
  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-700 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
>
  📄 Счёт
</button>
```

- [ ] **Step 4: Render modal at bottom of return JSX**

Find the closing `</section>` or root `</div>` at the very end of the component's return. Before it, add:
```tsx
{invoiceOrder && (
  <OrderInvoiceModal
    order={invoiceOrder}
    open={true}
    onClose={() => setInvoiceOrder(null)}
  />
)}
```

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/page.tsx
git commit -m "feat: invoice button and modal wired into admin orders page"
```

---

## Self-Review

**Spec coverage:**
- ✅ Language selector RU/EN/LV → Task 3
- ✅ Email field pre-filled from order, editable → Task 3
- ✅ Preview opens invoice HTML in new tab → Task 3 `handlePreview`
- ✅ Send button → POST to API → toast → Task 3 `handleSend` + Task 2
- ✅ `buildInvoiceHtml(order, lang)` pure function → Task 1
- ✅ API route sends via `sendEmail` → Task 2
- ✅ Button in quick-actions of expanded order → Task 4
- ✅ Modal renders at page level → Task 4 Step 4

**Placeholders:** None.

**Type consistency:**
- `Lang = 'ru' | 'en' | 'lv'` defined in Task 1 and Task 3 independently (both files define it locally — no shared import needed since each is small and self-contained) ✅
- `buildInvoiceHtml(order: Order, lang: Lang)` signature used in Task 3 `handlePreview` and Task 2 API route via `Parameters<typeof buildInvoiceHtml>[0]` — type flows correctly ✅
- `order.items` is `CartItem[]` = `Product & { quantity }` — `item.title`, `item.price`, `item.quantity`, `item.sku` all valid Product fields ✅
- `invoiceOrder` state is `Order | null` — conditional render `{invoiceOrder && <OrderInvoiceModal order={invoiceOrder}...>}` correctly narrows to `Order` ✅
- `order.subtotal`, `order.delivery`, `order.discount`, `order.total` all exist on the `Order` interface in `lib/orders-store.ts` ✅
