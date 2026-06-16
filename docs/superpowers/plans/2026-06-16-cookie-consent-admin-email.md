# Cookie Consent Banner + Admin Order Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GDPR-compliant cookie consent banner and admin email notification on every new order.

**Architecture:** Cookie consent is a standalone client component persisting choice to localStorage; mounted in `app/providers.tsx`. Admin email is a function added to `app/api/orders/route.ts` that fires after order is saved, reading recipient from `CONTACT_TO` env var. Customer confirmation email already exists — no changes needed.

**Tech Stack:** React 18, Radix UI Dialog + Switch (already installed), Vitest, Nodemailer (already wired via `lib/mailer.ts`), Tailwind CSS.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `components/CookieConsent.tsx` | Banner UI + configure dialog + `getCookieConsent()` helper |
| Modify | `app/providers.tsx` | Mount `<CookieConsent />` |
| Modify | `data/translations.ts` | Add `cookie.*` keys for ru/en/lv |
| Modify | `app/api/orders/route.ts` | Add `sendAdminOrderNotificationEmail()` |
| Create | `app/api/orders/route.test.ts` | Verify admin email fires with correct recipient and content |

---

## Task 1: Admin Order Notification Email (TDD)

**Files:**
- Create: `app/api/orders/route.test.ts`
- Modify: `app/api/orders/route.ts`

### Step 1.1: Write failing test

Create `app/api/orders/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({ createOrUpdateServerOrder: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))
vi.mock('@/lib/server-pricing', () => ({
  recomputeOrderPricing: vi.fn(),
}))

import { sendEmail } from '@/lib/mailer'
import { getServerUser } from '@/lib/server-auth'
import { createOrUpdateServerOrder } from '@/lib/orders-data-store'
import { getTemplates } from '@/lib/email-templates-server-store'
import { recomputeOrderPricing } from '@/lib/server-pricing'
import { POST } from './route'

const VALID_ORDER = {
  id: 'ORD-001',
  createdAt: '2026-06-16T10:00:00.000Z',
  firstName: 'Ivan',
  lastName: 'Petrov',
  email: 'ivan@example.com',
  phone: '+37126000000',
  address: 'Riga st 1',
  city: 'Riga',
  postalCode: '1001',
  deliveryMethod: 'courier',
  paymentMethod: 'card',
  items: [
    { id: 'p1', title: 'Shampoo Pro', brand: 'Brand', image: '', category: 'hair', price: 25, rating: 5, stock: 10, quantity: 2 },
  ],
  subtotal: 50,
  discount: 0,
  tax: 9,
  delivery: 5,
  total: 64,
  promoCode: undefined,
  language: 'ru',
}

function makeRequest(order = VALID_ORDER): NextRequest {
  return new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    body: JSON.stringify({ order }),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/orders — admin notification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue(null)
    vi.mocked(createOrUpdateServerOrder).mockResolvedValue(undefined as never)
    vi.mocked(getTemplates).mockResolvedValue([])
    vi.mocked(recomputeOrderPricing).mockResolvedValue({
      items: [{ id: 'p1', price: 25, quantity: 2 }],
      subtotal: 50,
      discount: 0,
      tax: 9,
      delivery: 5,
      bonusSpent: 0,
      bonusEarned: 0,
      total: 64,
      promoApplied: false,
    })
    vi.mocked(sendEmail).mockResolvedValue(undefined)
    process.env.CONTACT_TO = 'admin@shop.com'
  })

  it('sends email to CONTACT_TO with order id in subject', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    // Wait for fire-and-forget emails to flush
    await vi.waitFor(() => expect(vi.mocked(sendEmail).mock.calls.length).toBeGreaterThanOrEqual(1))

    const adminCall = vi.mocked(sendEmail).mock.calls.find(([to]) => to === 'admin@shop.com')
    expect(adminCall).toBeDefined()
    const [, subject, html] = adminCall!
    expect(subject).toContain('ORD-001')
    expect(html).toContain('ORD-001')
    expect(html).toContain('Ivan')
    expect(html).toContain('64')
  })

  it('does not send admin email when CONTACT_TO is not set', async () => {
    delete process.env.CONTACT_TO
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await vi.waitFor(() => vi.mocked(sendEmail).mock.calls.length >= 1, { timeout: 500 }).catch(() => {})
    const adminCall = vi.mocked(sendEmail).mock.calls.find(([to]) => to === 'admin@shop.com')
    expect(adminCall).toBeUndefined()
  })
})
```

- [ ] **Step 1.2: Run test to confirm it fails**

```bash
npx vitest run app/api/orders/route.test.ts
```

Expected: FAIL — function `sendAdminOrderNotificationEmail` does not exist yet, or `sendEmail` called count is wrong.

- [ ] **Step 1.3: Add `sendAdminOrderNotificationEmail` to `app/api/orders/route.ts`**

Add this function after the existing `sendOrderConfirmationEmail` function (around line 43):

```typescript
async function sendAdminOrderNotificationEmail(order: ServerOrder): Promise<void> {
  const adminEmail = process.env.CONTACT_TO
  if (!adminEmail) return

  const date = new Date(order.createdAt ?? Date.now()).toLocaleString('ru-RU', { timeZone: 'Europe/Riga' })
  const items = Array.isArray(order.items) ? order.items : []

  const itemRows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:4px 8px">${item.title ?? '—'}</td>
          <td style="padding:4px 8px;text-align:center">${item.quantity ?? 1}</td>
          <td style="padding:4px 8px;text-align:right">€${(item.price ?? 0).toFixed(2)}</td>
          <td style="padding:4px 8px;text-align:right">€${((item.price ?? 0) * (item.quantity ?? 1)).toFixed(2)}</td>
        </tr>`
    )
    .join('')

  const discountRow =
    order.discount && order.discount > 0
      ? `<tr><td colspan="3" style="padding:4px 8px;text-align:right;color:#6b7280">Скидка</td><td style="padding:4px 8px;text-align:right">−€${order.discount.toFixed(2)}</td></tr>`
      : ''

  const html = `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px">
  <h2 style="margin-top:0">Новый заказ №${order.id}</h2>
  <p style="color:#6b7280;margin-top:-8px">${date}</p>

  <h3>Покупатель</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:4px 8px;color:#6b7280;width:120px">Имя</td><td style="padding:4px 8px">${order.firstName ?? ''} ${order.lastName ?? ''}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Email</td><td style="padding:4px 8px">${order.email ?? ''}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Телефон</td><td style="padding:4px 8px">${order.phone ?? '—'}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Адрес</td><td style="padding:4px 8px">${order.address ?? ''}, ${order.city ?? ''}${order.postalCode ? ', ' + order.postalCode : ''}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Доставка</td><td style="padding:4px 8px">${order.deliveryMethod ?? '—'}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Оплата</td><td style="padding:4px 8px">${order.paymentMethod ?? '—'}</td></tr>
  </table>

  <h3>Товары</h3>
  <table style="border-collapse:collapse;width:100%">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="padding:4px 8px;text-align:left;font-weight:600">Товар</th>
        <th style="padding:4px 8px;text-align:center;font-weight:600">Кол.</th>
        <th style="padding:4px 8px;text-align:right;font-weight:600">Цена</th>
        <th style="padding:4px 8px;text-align:right;font-weight:600">Итого</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr><td colspan="3" style="padding:4px 8px;text-align:right;color:#6b7280">Доставка</td><td style="padding:4px 8px;text-align:right">€${(order.delivery ?? 0).toFixed(2)}</td></tr>
      ${discountRow}
      <tr style="font-weight:bold;border-top:2px solid #e5e7eb">
        <td colspan="3" style="padding:8px 8px 4px;text-align:right">ИТОГО</td>
        <td style="padding:8px 8px 4px;text-align:right">€${(order.total ?? 0).toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
</div>`

  await sendEmail(
    adminEmail,
    `Новый заказ №${order.id} — ${order.firstName ?? ''} ${order.lastName ?? ''} — €${(order.total ?? 0).toFixed(2)}`,
    html
  )
}
```

Then add the call in `POST`, after the existing `sendOrderConfirmationEmail` call (around line 91):

```typescript
    sendOrderConfirmationEmail(normalizedOrder).catch(console.error)
    sendAdminOrderNotificationEmail(normalizedOrder).catch(console.error)
```

- [ ] **Step 1.4: Run test to confirm it passes**

```bash
npx vitest run app/api/orders/route.test.ts
```

Expected: PASS — both tests green.

- [ ] **Step 1.5: Commit**

```bash
git add app/api/orders/route.ts app/api/orders/route.test.ts
git commit -m "feat: send admin order notification email on new order"
```

---

## Task 2: Cookie Consent Translations

**Files:**
- Modify: `data/translations.ts`

- [ ] **Step 2.1: Add `cookie.*` keys to all three languages**

In `data/translations.ts`, inside the `ru:` object, add:

```typescript
    'cookie.banner.text': 'Мы используем файлы cookie для работы сайта, анализа трафика и персонализации.',
    'cookie.banner.acceptAll': 'Принять все',
    'cookie.banner.configure': 'Настроить',
    'cookie.banner.necessaryOnly': 'Только обязательные',
    'cookie.configure.title': 'Настройки файлов cookie',
    'cookie.configure.necessary': 'Обязательные',
    'cookie.configure.necessaryDesc': 'Необходимы для работы сайта: авторизация, корзина. Нельзя отключить.',
    'cookie.configure.analytics': 'Аналитика',
    'cookie.configure.analyticsDesc': 'Помогают понять, как посетители используют сайт.',
    'cookie.configure.marketing': 'Маркетинг',
    'cookie.configure.marketingDesc': 'Используются для показа персональной рекламы.',
    'cookie.configure.save': 'Сохранить выбор',
    'cookie.configure.acceptAll': 'Принять все',
```

Inside the `en:` object, add:

```typescript
    'cookie.banner.text': 'We use cookies to keep the site working, analyse traffic and personalise content.',
    'cookie.banner.acceptAll': 'Accept all',
    'cookie.banner.configure': 'Configure',
    'cookie.banner.necessaryOnly': 'Necessary only',
    'cookie.configure.title': 'Cookie settings',
    'cookie.configure.necessary': 'Necessary',
    'cookie.configure.necessaryDesc': 'Required for the site to function: login, cart. Cannot be disabled.',
    'cookie.configure.analytics': 'Analytics',
    'cookie.configure.analyticsDesc': 'Help us understand how visitors use the site.',
    'cookie.configure.marketing': 'Marketing',
    'cookie.configure.marketingDesc': 'Used to show personalised advertisements.',
    'cookie.configure.save': 'Save selection',
    'cookie.configure.acceptAll': 'Accept all',
```

Inside the `lv:` object, add:

```typescript
    'cookie.banner.text': 'Mēs izmantojam sīkdatnes vietnes darbībai, apmeklētāju plūsmas analīzei un satura personalizācijai.',
    'cookie.banner.acceptAll': 'Pieņemt visas',
    'cookie.banner.configure': 'Konfigurēt',
    'cookie.banner.necessaryOnly': 'Tikai nepieciešamās',
    'cookie.configure.title': 'Sīkdatņu iestatījumi',
    'cookie.configure.necessary': 'Nepieciešamās',
    'cookie.configure.necessaryDesc': 'Nepieciešamas vietnes darbībai: pieteikšanās, grozs. Nevar atspējot.',
    'cookie.configure.analytics': 'Analītika',
    'cookie.configure.analyticsDesc': 'Palīdz saprast, kā apmeklētāji izmanto vietni.',
    'cookie.configure.marketing': 'Mārketings',
    'cookie.configure.marketingDesc': 'Izmanto personalizētu reklāmu rādīšanai.',
    'cookie.configure.save': 'Saglabāt izvēli',
    'cookie.configure.acceptAll': 'Pieņemt visas',
```

- [ ] **Step 2.2: Commit**

```bash
git add data/translations.ts
git commit -m "i18n: add cookie consent translation keys (ru/en/lv)"
```

---

## Task 3: Cookie Consent Component

**Files:**
- Create: `components/CookieConsent.tsx`

- [ ] **Step 3.1: Create `components/CookieConsent.tsx`**

```typescript
'use client'

import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

export type CookieConsentValue = {
  necessary: true
  analytics: boolean
  marketing: boolean
  ts: number
}

const CONSENT_KEY = 'cookie_consent'

export function getCookieConsent(): CookieConsentValue | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CookieConsentValue
  } catch {
    return null
  }
}

function saveConsent(analytics: boolean, marketing: boolean): void {
  const value: CookieConsentValue = { necessary: true, analytics, marketing, ts: Date.now() }
  localStorage.setItem(CONSENT_KEY, JSON.stringify(value))
}

export default function CookieConsent() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true)
  }, [])

  const acceptAll = () => {
    saveConsent(true, true)
    setVisible(false)
    setConfigOpen(false)
  }

  const necessaryOnly = () => {
    saveConsent(false, false)
    setVisible(false)
  }

  const saveSelection = () => {
    saveConsent(analytics, marketing)
    setVisible(false)
    setConfigOpen(false)
  }

  if (!visible) return null

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
          <p className="flex-1 text-sm text-muted-foreground">{t('cookie.banner.text')}</p>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button size="sm" onClick={acceptAll}>
              {t('cookie.banner.acceptAll')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
              {t('cookie.banner.configure')}
            </Button>
            <Button size="sm" variant="ghost" onClick={necessaryOnly}>
              {t('cookie.banner.necessaryOnly')}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('cookie.configure.title')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t('cookie.configure.necessary')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('cookie.configure.necessaryDesc')}</p>
              </div>
              <Switch checked disabled aria-label={t('cookie.configure.necessary')} />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t('cookie.configure.analytics')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('cookie.configure.analyticsDesc')}</p>
              </div>
              <Switch
                checked={analytics}
                onCheckedChange={setAnalytics}
                aria-label={t('cookie.configure.analytics')}
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t('cookie.configure.marketing')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('cookie.configure.marketingDesc')}</p>
              </div>
              <Switch
                checked={marketing}
                onCheckedChange={setMarketing}
                aria-label={t('cookie.configure.marketing')}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={saveSelection}>
              {t('cookie.configure.save')}
            </Button>
            <Button onClick={acceptAll}>
              {t('cookie.configure.acceptAll')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 3.2: Commit**

```bash
git add components/CookieConsent.tsx
git commit -m "feat: add CookieConsent component with GDPR-compliant configure dialog"
```

---

## Task 4: Mount CookieConsent in Providers

**Files:**
- Modify: `app/providers.tsx`

- [ ] **Step 4.1: Import and mount CookieConsent**

In `app/providers.tsx`, add the import at the top with other imports:

```typescript
import CookieConsent from '@/components/CookieConsent'
```

Then inside `<Providers>`, add `<CookieConsent />` after `<FlyToCart />` (last line before `{children}`):

```typescript
export function Providers({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <I18nProvider>
      <ToastProvider>
        <SeedAccounts />
        <AuthStoreProvider />
        <WishlistScopeSync />
        <CartUserSync />
        <ChunkErrorRecovery />
        <FlyToCart />
        <CookieConsent />
        {children}
      </ToastProvider>
    </I18nProvider>
  )
}
```

- [ ] **Step 4.2: Run the dev server and verify cookie banner appears**

```bash
npm run dev
```

Open `http://localhost:3000` in a browser where `cookie_consent` is not set in localStorage.

Verify:
1. Banner appears at bottom of page
2. "Accept all" → banner disappears, `localStorage.getItem('cookie_consent')` returns `{"necessary":true,"analytics":true,"marketing":true,...}`
3. "Necessary only" → banner disappears, `analytics` and `marketing` are `false`
4. "Configure" → dialog opens with 3 rows; Necessary switch is disabled; save selection closes dialog and banner
5. Refresh after consent → banner does not reappear
6. Clear localStorage → banner reappears on next visit

- [ ] **Step 4.3: Commit**

```bash
git add app/providers.tsx
git commit -m "feat: mount CookieConsent banner in app providers"
```

---

## Task 5: Run Full Test Suite

- [ ] **Step 5.1: Run unit tests**

```bash
npm run test:unit
```

Expected: all existing tests pass + new admin email tests pass.

- [ ] **Step 5.2: Run build to catch TypeScript errors**

```bash
npm run build
```

Expected: build succeeds with no type errors.

---

## Self-Review Checklist

**Spec coverage:**
- [x] Cookie banner — bottom bar with Accept / Configure / Necessary only → Task 3, 4
- [x] Configure dialog with 3 categories — Task 3
- [x] Consent persisted to localStorage as `cookie_consent` — Task 3 (`saveConsent`)
- [x] `getCookieConsent()` helper exported for future analytics — Task 3
- [x] Translations ru/en/lv — Task 2
- [x] Admin email on new order → Task 1
- [x] Recipient = `CONTACT_TO`, skip if not set → Task 1
- [x] Fire-and-forget, never blocks order response → Task 1 (`.catch(console.error)`)
- [x] Email contains order id, name, total, items — Task 1

**No placeholders:** All code is complete and runnable.

**Type consistency:** `CookieConsentValue`, `saveConsent`, `getCookieConsent` consistent across all usages. `ServerOrder` used as-is from `@/lib/orders-data-store`.
