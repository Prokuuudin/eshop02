# Homepage Discount Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static "Весенние скидки" promo banner (`components/Promo.tsx`) on the homepage with two real sections: A) a live ribbon of actually-discounted products, and B) an email signup for future discounts with a required GDPR consent checkbox.

**Architecture:** Section A (`SaleSection.tsx`) mirrors the existing `BestsellersSection.tsx` pattern exactly — client component fetches from a new `GET /api/products/sale` route, renders the already-generic `BestsellersSlider`/`ProductCard`. Section B edits the existing, currently-unused `Newsletter.tsx` in place, adding a consent checkbox and wiring it to a new `POST /api/newsletter/subscribe` route that persists via the existing generic `KeyValueSetting` table — no Prisma migration.

**Tech Stack:** Next.js App Router (`app/api/**/route.ts`), Prisma (`@/generated/prisma/client`, adapter-neon), Vitest for route unit tests, existing `useTranslation()` / `data/translations.ts` i18n, shadcn `Checkbox`/`Button` components.

## Global Constraints

- No changes to the live Neon DB schema — no new Prisma models, no migrations. Persist via the existing generic `KeyValueSetting { key: String @id, value: Json }` table.
- Keep `'promo.title'` translation key untouched in all 3 languages — `components/Footer.tsx:18` reuses it as a footer nav-link label to `/catalog`, unrelated to the banner being removed.
- Translations must be added/updated in all 3 languages: `ru` (lines 5–1818 block), `en` (lines 1819–3612 block), `lv` (lines 3613–5405 block) in `data/translations.ts`.
- Section A must show **real** discounted products (confirmed: 163 active products currently have `oldPrice > price`), not a mock/banner.
- New API routes return the same lean response shape as sibling routes they mirror (`{ products: [...] }` for GET, matching `app/api/products/bestsellers/route.ts`; `{ ok: true }` / `{ ok: false, error }` for the subscribe POST).

---

### Task 1: Newsletter store + subscribe API route (TDD)

**Files:**
- Create: `lib/newsletter-store.ts`
- Create: `app/api/newsletter/subscribe/route.ts`
- Test: `app/api/newsletter/subscribe/route.test.ts`

**Interfaces:**
- Produces: `subscribeToNewsletter(email: string): Promise<void>` from `lib/newsletter-store.ts` — upserts one `KeyValueSetting` row per subscriber (key `newsletter:subscriber:<lowercased-email>`), so concurrent signups can't lose each other via a read-modify-write race on a shared array (unlike `lib/price-groups-server-store.ts`'s single-array-key pattern, which is fine for its low-concurrency admin use case but wrong here for a public endpoint).
- Produces: `POST` handler at `/api/newsletter/subscribe` accepting `{ email: string, consent: boolean }`, returning `{ ok: true }` (200) or `{ ok: false, error: 'invalid_email' | 'consent_required' | 'server_error' }` (400/500).
- Consumes (Task 2 will call this): the route via `fetch('/api/newsletter/subscribe', { method: 'POST', body: JSON.stringify({ email, consent }) })`.

- [ ] **Step 1: Write the failing test**

Create `app/api/newsletter/subscribe/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/newsletter-store', () => ({ subscribeToNewsletter: vi.fn() }))

import { POST } from './route'
import { subscribeToNewsletter } from '@/lib/newsletter-store'

const makePost = (body: Record<string, unknown>): NextRequest =>
  new NextRequest('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/newsletter/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(subscribeToNewsletter).mockResolvedValue(undefined)
  })

  it('rejects an invalid email', async () => {
    const res = await POST(makePost({ email: 'not-an-email', consent: true }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('invalid_email')
    expect(subscribeToNewsletter).not.toHaveBeenCalled()
  })

  it('rejects when consent is not true', async () => {
    const res = await POST(makePost({ email: 'a@b.com', consent: false }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('consent_required')
    expect(subscribeToNewsletter).not.toHaveBeenCalled()
  })

  it('subscribes with a valid email and consent', async () => {
    const res = await POST(makePost({ email: 'A@B.com', consent: true }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(subscribeToNewsletter).toHaveBeenCalledWith('A@B.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/newsletter/subscribe/route.test.ts`
Expected: FAIL — `./route` (and `@/lib/newsletter-store`) don't exist yet.

- [ ] **Step 3: Write `lib/newsletter-store.ts`**

```ts
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

const keyFor = (email: string) => `newsletter:subscriber:${email.toLowerCase()}`

export async function subscribeToNewsletter(email: string): Promise<void> {
  const value = { email: email.toLowerCase(), consentAt: new Date().toISOString() }
  await prisma.keyValueSetting.upsert({
    where: { key: keyFor(email) },
    create: { key: keyFor(email), value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  })
}
```

- [ ] **Step 4: Write `app/api/newsletter/subscribe/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { subscribeToNewsletter } from '@/lib/newsletter-store'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; consent?: boolean }
    const email = body.email?.trim() ?? ''

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })
    }
    if (body.consent !== true) {
      return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 400 })
    }

    await subscribeToNewsletter(email)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[newsletter/subscribe]', error)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/api/newsletter/subscribe/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/newsletter-store.ts app/api/newsletter/subscribe/route.ts app/api/newsletter/subscribe/route.test.ts
git commit -m "feat: add newsletter subscribe API backed by KeyValueSetting"
```

---

### Task 2: Sale products API route

**Files:**
- Create: `app/api/products/sale/route.ts`

**Interfaces:**
- Consumes: `mapDbToProduct(p: PrismaProduct): Product` from `lib/product-overrides-store.ts`; `isProductOnSale(product: Product): boolean` from `data/products.ts` (existing helper: `!!product.badges?.includes('sale') || (!!product.oldPrice && product.oldPrice > product.price)`).
- Produces: `GET /api/products/sale` → `{ products: Product[] }`, same shape as `app/api/products/bestsellers/route.ts`, consumed by `SaleSection.tsx` in Task 3.

No test for this route — matches the existing precedent that `app/api/products/bestsellers/route.ts` (its direct sibling/template) also has no route test; correctness here is a plain DB query + existing helper, verified manually in Task 5.

- [ ] **Step 1: Write `app/api/products/sale/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { mapDbToProduct } from '@/lib/product-overrides-store'
import { isProductOnSale } from '@/data/products'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const dbProducts = await prisma.product.findMany({
      where: { isActive: true, image: { not: null }, oldPrice: { not: null } },
    })

    const products = dbProducts
      .map(mapDbToProduct)
      .filter(isProductOnSale)
      .sort((a, b) => {
        const discountA = a.oldPrice ? (a.oldPrice - a.price) / a.oldPrice : 0
        const discountB = b.oldPrice ? (b.oldPrice - b.price) / b.oldPrice : 0
        return discountB - discountA
      })
      .slice(0, 24)

    return NextResponse.json({ products })
  } catch (err) {
    console.error('sale products error', err)
    return NextResponse.json({ products: [] })
  }
}
```

- [ ] **Step 2: Verify it compiles and returns data**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new type errors from this file.

Run (with dev server running, see Task 5 for how to start it): `curl http://localhost:3000/api/products/sale`
Expected: JSON body `{"products":[...]}` with up to 24 items, each having `oldPrice > price`.

- [ ] **Step 3: Commit**

```bash
git add app/api/products/sale/route.ts
git commit -m "feat: add /api/products/sale route for real discounted products"
```

---

### Task 3: Translations for both sections (ru/en/lv)

**Files:**
- Modify: `data/translations.ts:403-413` (ru block), `data/translations.ts:3548-3576` (en block), `data/translations.ts:5342-5370` (lv block)

**Interfaces:**
- Produces: translation keys consumed by Task 4 (`sale.title`, `sale.subtitle`) and Task 5 (`newsletter.title`, `newsletter.subtitle`, `newsletter.subscribe`, `newsletter.consentPrefix`, `newsletter.consentLinkLabel`, `newsletter.consentRequired`). `newsletter.placeholder`, `newsletter.emailAria`, `newsletter.subscribed` are unchanged (already fit). `promo.title` is untouched in all 3 languages (Footer dependency). `promo.discount` / `promo.shopNow` are removed in all 3 languages (dead once `Promo.tsx` is deleted in Task 6; `promo.code` is pre-existing dead code unrelated to this change and is left alone).

No test — this is static data; correctness is verified by the manual homepage check in Task 5's step and Task 6.

- [ ] **Step 1: Edit the `ru` block**

In `data/translations.ts`, replace:

```ts
    // Промо
    'promo.title': 'Весенние скидки — до 30% на избранные бренды',
    'promo.discount': 'Успейте приобрести профессиональную косметику по специальным ценам.',
    'promo.shopNow': 'К покупкам',

    // Newsletter
    'newsletter.title': 'Подпишитесь на новости и акции',
    'newsletter.subtitle': 'Получайте эксклюзивные предложения и советы по уходу за красотой.',
    'newsletter.placeholder': 'Ваш email',
    'newsletter.subscribe': 'Подписаться',
    'newsletter.subscribed': 'Спасибо за подписку!',
```

with:

```ts
    // Промо
    'promo.title': 'Весенние скидки — до 30% на избранные бренды',

    // Скидки на главной
    'sale.title': 'Актуальные скидки!',
    'sale.subtitle': 'Уже сейчас закупайся по супер ценам',

    // Newsletter
    'newsletter.title': 'Подпишись на свои будущие скидки!',
    'newsletter.subtitle': 'Получайте эксклюзивные скидки и выгодные предложения первыми...',
    'newsletter.placeholder': 'Ваш email',
    'newsletter.subscribe': 'Подтверждаю',
    'newsletter.subscribed': 'Спасибо за подписку!',
    'newsletter.consentPrefix': 'Я даю согласие на обработку моих данных в соответствии с ',
    'newsletter.consentLinkLabel': 'Политикой конфиденциальности',
    'newsletter.consentRequired': 'Подтвердите согласие на обработку данных',
```

- [ ] **Step 2: Edit the `en` block — Newsletter + new Sale keys**

Replace:

```ts
    // Newsletter
    'newsletter.title': 'Subscribe to Our Newsletter',
    'newsletter.subtitle': 'Get exclusive offers and beauty tips',
    'newsletter.placeholder': 'Enter your email',
    'newsletter.subscribe': 'Subscribe',
    'newsletter.subscribed': 'Thank you for subscribing!',
```

with:

```ts
    // Newsletter
    'newsletter.title': 'Subscribe to future discounts!',
    'newsletter.subtitle': 'Get exclusive discounts and deals first...',
    'newsletter.placeholder': 'Enter your email',
    'newsletter.subscribe': 'Confirm',
    'newsletter.subscribed': 'Thank you for subscribing!',
    'newsletter.consentPrefix': 'I agree to the processing of my data in accordance with the ',
    'newsletter.consentLinkLabel': 'Privacy Policy',
    'newsletter.consentRequired': 'Please confirm your consent to data processing',

    // Sale highlights
    'sale.title': 'Current Deals!',
    'sale.subtitle': 'Shop now at special prices',
```

- [ ] **Step 3: Edit the `en` block — Promo (remove dead keys)**

Replace:

```ts
    // Promo
    'promo.title': 'Special Offer',
    'promo.discount': '20% off your first order',
    'promo.code': 'Code: WELCOME20',
    'promo.shopNow': 'Shop Now',
```

with:

```ts
    // Promo
    'promo.title': 'Special Offer',
    'promo.code': 'Code: WELCOME20',
```

- [ ] **Step 4: Edit the `lv` block — Newsletter + new Sale keys**

Replace:

```ts
    // Newsletter
    'newsletter.title': 'Abonējiet mūsu biļetenu',
    'newsletter.subtitle': 'Saņemiet eksklusīvus piedāvājumus un skaistuma padomus',
    'newsletter.placeholder': 'Ievadiet savu e-pastu',
    'newsletter.subscribe': 'Abonēt',
    'newsletter.subscribed': 'Paldies par abonēšanu!',
```

with:

```ts
    // Newsletter
    'newsletter.title': 'Piesakies nākotnes atlaidēm!',
    'newsletter.subtitle': 'Saņem ekskluzīvas atlaides un izdevīgus piedāvājumus pirmais...',
    'newsletter.placeholder': 'Ievadiet savu e-pastu',
    'newsletter.subscribe': 'Apstiprinu',
    'newsletter.subscribed': 'Paldies par abonēšanu!',
    'newsletter.consentPrefix': 'Es piekrītu savu datu apstrādei saskaņā ar ',
    'newsletter.consentLinkLabel': 'Privātuma politiku',
    'newsletter.consentRequired': 'Lūdzu, apstipriniet piekrišanu datu apstrādei',

    // Sale highlights
    'sale.title': 'Aktuālās atlaides!',
    'sale.subtitle': 'Iepērcies tagad par īpašām cenām',
```

- [ ] **Step 5: Edit the `lv` block — Promo (remove dead keys)**

Replace:

```ts
    // Promo
    'promo.title': 'Īpašs piedāvājums',
    'promo.discount': '20% atlaide pirmajam pasūtījumam',
    'promo.code': 'Kods: WELCOME20',
    'promo.shopNow': 'Iepirkties tagad',
```

with:

```ts
    // Promo
    'promo.title': 'Īpašs piedāvājums',
    'promo.code': 'Kods: WELCOME20',
```

- [ ] **Step 6: Verify the only remaining references are in the file Task 6 deletes**

Run: `grep -rln "promo.discount\|promo.shopNow" components app data 2>/dev/null`
Expected: exactly one file, `components/Promo.tsx` — it still calls `t('promo.discount')`/`t('promo.shopNow')` until Task 6 deletes it. If any other file is listed, stop and investigate before continuing.

- [ ] **Step 7: Commit**

```bash
git add data/translations.ts
git commit -m "copy(home): translations for sale ribbon and future-discounts signup"
```

---

### Task 4: SaleSection component

**Files:**
- Create: `components/SaleSection.tsx`

**Interfaces:**
- Consumes: `GET /api/products/sale` (Task 2) → `{ products: Product[] }`; `BestsellersSlider` (existing, `components/BestsellersSlider.tsx`, props `{ arrowsContainerId?: string; products: Product[] }`); `useTranslation()` → `{ t }`; translation keys `sale.title`, `sale.subtitle`, `cart.goToCatalog` (Task 3).
- Produces: default-exported `SaleSection` component, consumed by `app/page.tsx` in Task 6.

No test — matches `BestsellersSection.tsx`, its template, which also has no unit test (client-fetch homepage sections are verified manually, per the existing convention and the spec's testing section).

- [ ] **Step 1: Write `components/SaleSection.tsx`**

```tsx
'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Product } from '../data/products';
import BestsellersSlider from './BestsellersSlider';
import { useTranslation } from '@/lib/use-translation';

export default function SaleSection() {
    const { t } = useTranslation();
    const [products, setProducts] = useState<Product[]>([]);

    useEffect(() => {
        fetch('/api/products/sale')
            .then((r) => r.json())
            .then((d) => { if (d.products?.length) setProducts(d.products) })
            .catch(() => {});
    }, []);

    if (!products.length) return null;

    return (
        <section className="sale-section py-8">
            <div className="w-full px-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <div>
                            <h2 className="text-2xl font-semibold text-foreground">
                                {t('sale.title')}
                            </h2>
                            <p className="text-sm text-muted-foreground">{t('sale.subtitle')}</p>
                        </div>
                        <Link
                            href="/catalog"
                            className="inline-flex w-full sm:w-auto justify-center items-center px-3 py-2 min-h-[44px] rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-100 transition-colors"
                            style={{ textDecoration: 'none', fontWeight: 500 }}
                        >
                            {t('cart.goToCatalog')}
                        </Link>
                    </div>
                    <div id="sale-slider-arrows" className="hidden sm:flex gap-2" />
                </div>
                <BestsellersSlider arrowsContainerId="sale-slider-arrows" products={products} />
            </div>
        </section>
    );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new type errors from this file.

- [ ] **Step 3: Commit**

```bash
git add components/SaleSection.tsx
git commit -m "feat: add SaleSection homepage component for real discounted products"
```

---

### Task 5: Edit Newsletter.tsx (consent checkbox + real submit)

**Files:**
- Modify: `components/Newsletter.tsx` (full rewrite of the 54-line file)

**Interfaces:**
- Consumes: `POST /api/newsletter/subscribe` (Task 1); `Checkbox` from `components/ui/checkbox.tsx` (props: `id`, `checked: boolean`, `onCheckedChange: (checked: boolean) => void`); `Button` from `components/ui/button.tsx`; translation keys from Task 3.
- Produces: default-exported `Newsletter` component (same export name/shape as before), consumed by `app/page.tsx` in Task 6.

No test — matches the existing convention (the original `Newsletter.tsx` had no test either; form-submit UX is verified manually in Task 6).

- [ ] **Step 1: Rewrite `components/Newsletter.tsx`**

```tsx
"use client";
import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { useTranslation } from '@/lib/use-translation'

export default function Newsletter() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function validateEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!validateEmail(email)) {
      setError('Введите корректный email')
      return
    }
    if (!consent) {
      setError(t('newsletter.consentRequired'))
      return
    }
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent }),
      })
      if (!res.ok) {
        setError('Введите корректный email')
        return
      }
      setSuccess(true)
      setEmail('')
      setConsent(false)
    } catch {
      setError('Ошибка сети, попробуйте ещё раз')
    }
  }

  return (
    <section className="newsletter py-8">
      <div className="w-full px-4">
        <div className="newsletter__inner bg-white rounded-lg p-6 border flex flex-col gap-4">
          <div className="newsletter__info">
            <h3 className="newsletter__title text-lg font-semibold text-gray-900">{t('newsletter.title')}</h3>
            <p className="newsletter__desc text-sm text-gray-600">{t('newsletter.subtitle')}</p>
          </div>

          <form onSubmit={onSubmit} className="newsletter__form flex flex-col gap-3">
            <div className="flex flex-col md:flex-row gap-2">
              <input
                className="newsletter__input rounded-md border px-3 py-2 flex-1"
                placeholder={t('newsletter.placeholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label={t('newsletter.emailAria')}
              />
              <Button type="submit">{t('newsletter.subscribe')}</Button>
            </div>

            <div className="newsletter__consent flex items-start gap-2">
              <Checkbox
                id="newsletter-consent"
                checked={consent}
                onCheckedChange={setConsent}
              />
              <label htmlFor="newsletter-consent" className="newsletter__consent-label text-sm text-gray-600">
                {t('newsletter.consentPrefix')}
                <Link href="/privacy" className="underline">{t('newsletter.consentLinkLabel')}</Link>
              </label>
            </div>
          </form>

          {error && <div className="newsletter__error text-red-600 text-sm">{error}</div>}
          {success && <div className="newsletter__success text-green-600 text-sm">{t('newsletter.subscribed')}</div>}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new type errors from this file.

- [ ] **Step 3: Commit**

```bash
git add components/Newsletter.tsx
git commit -m "feat: add consent checkbox and real subscribe wiring to Newsletter"
```

---

### Task 6: Wire into homepage, delete Promo.tsx, manual verification

**Files:**
- Modify: `app/page.tsx:8` (import), `app/page.tsx:62` (usage)
- Delete: `components/Promo.tsx`

**Interfaces:**
- Consumes: `SaleSection` (Task 4), `Newsletter` (Task 5).

- [ ] **Step 1: Update the import in `app/page.tsx`**

Replace:

```tsx
import Promo from '../components/Promo';
```

with:

```tsx
import SaleSection from '../components/SaleSection';
import Newsletter from '../components/Newsletter';
```

- [ ] **Step 2: Update the render in `app/page.tsx`**

Replace:

```tsx
            <Brands />
            <Promo />
            <BonusSection />
```

with:

```tsx
            <Brands />
            <SaleSection />
            <Newsletter />
            <BonusSection />
```

- [ ] **Step 3: Delete the old component**

```bash
git rm components/Promo.tsx
```

- [ ] **Step 4: Verify no dangling references**

Run: `grep -rn "components/Promo'" app components 2>/dev/null || echo "clean"`
Expected: `clean`

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Run the full unit test suite**

Run: `npx vitest run`
Expected: all tests pass, including the 3 new ones from Task 1.

- [ ] **Step 6: Manual verification — start the dev server**

Run (background): `npm run dev`
Wait for `Ready` in the output, then open `http://localhost:3000/` in a browser.

Expected:
- The old "Весенние скидки" countdown banner is gone.
- A new "Актуальные скидки!" section renders with a horizontally-scrollable row of real products (not empty — 163 active products currently qualify), each showing a struck-through old price. The "Перейти в каталог" link goes to `/catalog`.
- Below it, a "Подпишись на свои будущие скидки!" section renders with an email input, a "Подтверждаю" button, and an unchecked consent checkbox linking to `/privacy`.

- [ ] **Step 7: Manual verification — subscribe flow**

In the browser: type an email, leave the consent checkbox unchecked, click "Подтверждаю".
Expected: an inline error appears ("Подтвердите согласие на обработку данных"), no network request succeeds.

Check the checkbox, click "Подтверждаю" again.
Expected: success message "Спасибо за подписку!" appears, the email input clears.

- [ ] **Step 8: Manual verification — confirm persistence**

Create a throwaway script `scripts/_check-newsletter-subscribers.ts`:

```ts
import { prisma } from '../lib/prisma'

async function main() {
  const rows = await prisma.keyValueSetting.findMany({
    where: { key: { startsWith: 'newsletter:subscriber:' } },
  })
  console.log(rows)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
```

Run: `node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/_check-newsletter-subscribers.ts`

Expected: one row with the `key` matching the email you submitted in Step 7, and `value` containing `{ email, consentAt }`.

Resubmit the same email (checkbox checked) — expected: still exactly one row for that key (upsert refreshes `consentAt`, doesn't duplicate).

Delete the throwaway script: `rm scripts/_check-newsletter-subscribers.ts`

- [ ] **Step 9: Stop the dev server, commit the wiring change**

```bash
git add app/page.tsx
git commit -m "feat(home): replace spring-sale banner with real discounts + future-discounts signup"
```
