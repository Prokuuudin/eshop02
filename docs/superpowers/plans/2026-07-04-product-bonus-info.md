# Product Bonus Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Бонус-блок (баланс + правило начисления) над кнопкой «в корзину» на странице товара; единый расчёт начисления 0.5% от суммы заказа как fallback при пустом `Product.bonusRate` (сейчас NULL у всех 2231 активных товаров — начисляется 0).

**Architecture:** Новый модуль `lib/bonus-program.ts` (конфиг + чистый хелпер `calcOrderBonus`) без `server-only` — импортируется и клиентом, и сервером. `lib/admin-store.ts` реэкспортирует конфиг и мигрирует localStorage (там у старых браузеров `earnRatePercent: 5`). Хелпер применяется в 4 местах: cart, checkout, server-pricing (авторитетный), страница товара. UI — новый клиентский компонент `ProductBonusInfo` в `ProductActions`.

**Tech Stack:** Next.js (app router), zustand/persist, vitest, Tailwind + BEM.

## Global Constraints

- Схему Neon БД не менять; `Product.bonusRate` остаётся NULL.
- 1 балл = 1 €; баллы целые (`User.bonusPoints Int`); цены в БД в евро (медиана €15.40).
- Правило: **0.5% от суммы заказа** (`earnRatePercent: 0.5`); `bonusRate` товара приоритетнее процента.
- Округление `Math.round` один раз по сумме заказа, не по позициям.
- Новые ключи переводов не создавать — использовать существующие `account.bonus.balance`, `cart.bonus.unit`, `checkout.bonus.willEarn`, `bonus.section.earnRate`.
- Тесты: `npx vitest run <file>`; typecheck: `npx tsc --noEmit`.
- После каждого коммита — `git push origin main` (правило пользователя).

---

### Task 1: lib/bonus-program.ts — конфиг и calcOrderBonus

**Files:**
- Create: `lib/bonus-program.ts`
- Test: `lib/bonus-program.test.ts`

**Interfaces:**
- Consumes: ничего (чистый модуль, без импортов).
- Produces:
  - `interface BonusProgramConfig { enabled: boolean; earnRatePercent: number; maxSpendPercent: number; minOrderForEarn: number; pointsExpiryDays: number; minPointsToSpend: number; maxEarnPerOrder: number }`
  - `const DEFAULT_BONUS_PROGRAM_CONFIG: BonusProgramConfig` (earnRatePercent = 0.5)
  - `type BonusLineItem = { price: number; quantity: number; bonusRate?: number | null }`
  - `function calcOrderBonus(items: BonusLineItem[], ratePercent?: number): number` — целое ≥ 0.

- [ ] **Step 1: Write the failing test**

```ts
// lib/bonus-program.test.ts
import { describe, it, expect } from 'vitest'
import { calcOrderBonus, DEFAULT_BONUS_PROGRAM_CONFIG } from './bonus-program'

describe('DEFAULT_BONUS_PROGRAM_CONFIG', () => {
  it('earn rate is 0.5% per business rule', () => {
    expect(DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent).toBe(0.5)
  })
})

describe('calcOrderBonus', () => {
  it('returns 0 for an empty order', () => {
    expect(calcOrderBonus([])).toBe(0)
  })

  it('falls back to 0.5% of item subtotal when bonusRate is missing', () => {
    // 0.5% of 200 = 1
    expect(calcOrderBonus([{ price: 200, quantity: 1 }])).toBe(1)
  })

  it('rounds to 0 on small orders (€60 -> 0.3 points)', () => {
    expect(calcOrderBonus([{ price: 60, quantity: 1 }])).toBe(0)
  })

  it('rounds 0.5 up (€100 -> 1 point)', () => {
    expect(calcOrderBonus([{ price: 100, quantity: 1 }])).toBe(1)
  })

  it('rounds once per order, not per item', () => {
    // per-item rounding would give 0 + 0; order-level: 0.25 + 0.25 = 0.5 -> 1
    expect(calcOrderBonus([
      { price: 50, quantity: 1 },
      { price: 50, quantity: 1 },
    ])).toBe(1)
  })

  it('prefers explicit bonusRate (points per unit) over the percent', () => {
    expect(calcOrderBonus([{ price: 100, quantity: 3, bonusRate: 5 }])).toBe(15)
  })

  it('treats bonusRate null as missing', () => {
    expect(calcOrderBonus([{ price: 200, quantity: 1, bonusRate: null }])).toBe(1)
  })

  it('mixes bonusRate items with percent-fallback items', () => {
    expect(calcOrderBonus([
      { price: 100, quantity: 1, bonusRate: 10 },
      { price: 200, quantity: 1 },
    ])).toBe(11)
  })

  it('multiplies fallback by quantity', () => {
    // 15.40 * 10 = 154; 0.5% = 0.77 -> 1
    expect(calcOrderBonus([{ price: 15.4, quantity: 10 }])).toBe(1)
  })

  it('ignores negative price and quantity', () => {
    expect(calcOrderBonus([{ price: -100, quantity: 1 }])).toBe(0)
    expect(calcOrderBonus([{ price: 100, quantity: -1 }])).toBe(0)
  })

  it('accepts a custom rate percent', () => {
    expect(calcOrderBonus([{ price: 100, quantity: 1 }], 5)).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bonus-program.test.ts`
Expected: FAIL — `Cannot find module './bonus-program'` (или equivalent resolve error).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/bonus-program.ts
// Бонусная программа: конфиг по умолчанию и единый расчёт начисления.
// Без 'server-only' — модуль импортируют и клиент (cart/checkout/страница товара),
// и сервер (lib/server-pricing.ts). Конфиг админки живёт в localStorage каждого
// браузера и на начисление не влияет — процент берётся из этого дефолта.

export interface BonusProgramConfig {
  enabled: boolean
  earnRatePercent: number
  maxSpendPercent: number
  minOrderForEarn: number
  pointsExpiryDays: number
  minPointsToSpend: number
  maxEarnPerOrder: number
}

export const DEFAULT_BONUS_PROGRAM_CONFIG: BonusProgramConfig = {
  enabled: true,
  earnRatePercent: 0.5,
  maxSpendPercent: 100,
  minOrderForEarn: 0,
  pointsExpiryDays: 0,
  minPointsToSpend: 0,
  maxEarnPerOrder: 0,
}

export type BonusLineItem = {
  price: number
  quantity: number
  /** Баллы за единицу товара; приоритетнее процента, если > 0. */
  bonusRate?: number | null
}

/**
 * Баллы за заказ: bonusRate * qty для товаров с явной ставкой, иначе
 * ratePercent от суммы позиции. Округление один раз по сумме заказа —
 * иначе при 0.5% каждая позиция по отдельности давала бы 0.
 */
export function calcOrderBonus(
  items: BonusLineItem[],
  ratePercent: number = DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent
): number {
  const base = items.reduce((sum, item) => {
    const quantity = Math.max(0, item.quantity)
    const rate = item.bonusRate ?? 0
    if (rate > 0) return sum + rate * quantity
    return sum + (Math.max(0, item.price) * quantity * ratePercent) / 100
  }, 0)
  return Math.max(0, Math.round(base))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/bonus-program.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit and push**

```bash
git add lib/bonus-program.ts lib/bonus-program.test.ts
git commit -m "feat(bonus): bonus-program module with 0.5% order earn fallback"
git push origin main
```

---

### Task 2: admin-store — реэкспорт конфига, миграция persist, step у инпута

**Files:**
- Modify: `lib/admin-store.ts:1-24` (импорт вместо локальных определений), `lib/admin-store.ts:119-122` (persist options)
- Modify: `app/admin/bonus/page.tsx:152` (step у инпута earnRate)

**Interfaces:**
- Consumes: `BonusProgramConfig`, `DEFAULT_BONUS_PROGRAM_CONFIG` из Task 1.
- Produces: `lib/admin-store.ts` продолжает экспортировать `BonusProgramConfig` и `DEFAULT_BONUS_PROGRAM_CONFIG` (реэкспорт) — существующие импортёры не ломаются.

- [ ] **Step 1: Заменить локальные определения на реэкспорт**

В `lib/admin-store.ts` удалить блок (строки 6–24):

```ts
export interface BonusProgramConfig {
  enabled: boolean
  earnRatePercent: number
  maxSpendPercent: number
  minOrderForEarn: number
  pointsExpiryDays: number
  minPointsToSpend: number
  maxEarnPerOrder: number
}

export const DEFAULT_BONUS_PROGRAM_CONFIG: BonusProgramConfig = {
  enabled: true,
  earnRatePercent: 5,
  maxSpendPercent: 100,
  minOrderForEarn: 0,
  pointsExpiryDays: 0,
  minPointsToSpend: 0,
  maxEarnPerOrder: 0,
}
```

и добавить после существующих import-строк:

```ts
import { DEFAULT_BONUS_PROGRAM_CONFIG, type BonusProgramConfig } from '@/lib/bonus-program'

export { DEFAULT_BONUS_PROGRAM_CONFIG }
export type { BonusProgramConfig }
```

- [ ] **Step 2: Добавить version + migrate в persist**

Заменить (строки 119–122):

```ts
    {
      name: 'admin-store'
    }
```

на:

```ts
    {
      name: 'admin-store',
      // v1: earnRatePercent 5 -> 0.5; в localStorage старых браузеров лежит 5,
      // и без миграции оно перекрывает новый дефолт.
      version: 1,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Record<string, unknown>
        if (version < 1) {
          return { ...state, bonusProgram: DEFAULT_BONUS_PROGRAM_CONFIG }
        }
        return state
      },
    }
```

- [ ] **Step 3: step у инпута earnRate в админке**

В `app/admin/bonus/page.tsx` строка 152, заменить:

```tsx
                  <Input type="number" min={0} max={100} value={draft.earnRatePercent}
```

на:

```tsx
                  <Input type="number" min={0} max={100} step={0.1} value={draft.earnRatePercent}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Commit and push**

```bash
git add lib/admin-store.ts app/admin/bonus/page.tsx
git commit -m "feat(bonus): move bonus config to lib/bonus-program, migrate persisted 5% to 0.5%"
git push origin main
```

---

### Task 3: server-pricing — fallback-начисление (авторитетный пересчёт)

**Files:**
- Modify: `lib/server-pricing.ts:1-5` (импорт), `lib/server-pricing.ts:151-157` (расчёт)
- Test: `lib/server-pricing.test.ts` (новые кейсы в `describe('recomputeOrderPricing')`)

**Interfaces:**
- Consumes: `calcOrderBonus(items, ratePercent?)` из Task 1; `ResolvedLineItem` имеет `price`, `quantity`, `bonusRate` — подходит под `BonusLineItem`.
- Produces: `recomputeOrderPricing` возвращает `bonusEarned` с fallback 0.5% — публичный контракт `/api/orders` не меняется.

- [ ] **Step 1: Write the failing tests**

Добавить в конец `describe('recomputeOrderPricing', ...)` в `lib/server-pricing.test.ts`:

```ts
  it('falls back to 0.5% of item subtotal when bonusRate is null', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', price: 200, bulkPricingTiers: null, bonusRate: null },
    ])
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      userBonusBalance: null,
    })
    expect(r.bonusEarned).toBe(1) // 0.5% of 200
  })

  it('earns 0 when 0.5% of the order rounds down', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', price: 60, bulkPricingTiers: null, bonusRate: null },
    ])
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      userBonusBalance: null,
    })
    expect(r.bonusEarned).toBe(0) // 0.5% of 60 = 0.3 -> 0
  })

  it('mixes explicit bonusRate items with percent-fallback items', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', price: 100, bulkPricingTiers: null, bonusRate: 10 },
      { id: 'p2', price: 200, bulkPricingTiers: null, bonusRate: null },
    ])
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [
        { id: 'p1', quantity: 1 },
        { id: 'p2', quantity: 1 },
      ],
      deliveryMethod: 'pickup',
      userBonusBalance: null,
    })
    expect(r.bonusEarned).toBe(11) // 10 + 0.5% of 200
  })

  it('scales fallback earn down when points are spent', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', price: 400, bulkPricingTiers: null, bonusRate: null },
    ])
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue(null)

    // base = 0.5% of 400 = 2; grandTotal 400 (pickup), spend 200 -> total 200
    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      bonusSpent: 200,
      userBonusBalance: 1000,
    })
    expect(r.bonusEarned).toBe(1) // round(2 * 200 / 400)
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run lib/server-pricing.test.ts`
Expected: 4 новых FAIL (`bonusEarned` = 0 вместо 1/11 и т.п.), старые PASS.

- [ ] **Step 3: Implement fallback via calcOrderBonus**

В `lib/server-pricing.ts` добавить импорт после строки 5:

```ts
import { calcOrderBonus } from '@/lib/bonus-program'
```

Заменить (строки 151–157):

```ts
  // Points earned = sum(catalog bonusRate * qty), scaled down proportionally when the customer
  // pays part of the order with points (mirrors the checkout: bonusToEarn * total / grandTotal).
  const bonusEarnedBase = items.reduce((sum, item) => sum + Math.max(0, item.bonusRate) * item.quantity, 0)
  const bonusEarned =
    bonusSpent > 0 && grandTotal > 0
      ? Math.max(0, Math.round((bonusEarnedBase * total) / grandTotal))
      : Math.round(bonusEarnedBase)
```

на:

```ts
  // Points earned: catalog bonusRate per unit when set, otherwise the program percent of the
  // item subtotal (same calcOrderBonus as cart/checkout display). Scaled down proportionally
  // when the customer pays part of the order with points (bonusToEarn * total / grandTotal).
  const bonusEarnedBase = calcOrderBonus(items)
  const bonusEarned =
    bonusSpent > 0 && grandTotal > 0
      ? Math.max(0, Math.round((bonusEarnedBase * total) / grandTotal))
      : bonusEarnedBase
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run lib/server-pricing.test.ts`
Expected: PASS все (старые кейсы с bonusRate 5 и 10 не меняются: rate > 0 → приоритет ставки).

- [ ] **Step 5: Commit and push**

```bash
git add lib/server-pricing.ts lib/server-pricing.test.ts
git commit -m "feat(bonus): 0.5% order-subtotal earn fallback in authoritative server pricing"
git push origin main
```

---

### Task 4: cart + checkout — единый расчёт отображаемого начисления

**Files:**
- Modify: `app/cart/page.tsx:110-113` + import
- Modify: `app/checkout/page.tsx:468-471` + import

**Interfaces:**
- Consumes: `calcOrderBonus` из Task 1; `calculatePrice(item, quantity)` из `@/lib/customer-segmentation` (уже импортирован в обоих файлах) — даёт цену единицы с учётом bulk-тиров.
- Produces: `bonusToEarn` — целое, совпадает с серверным `bonusEarned` (без списания).

- [ ] **Step 1: cart/page.tsx**

Добавить в блок импортов:

```ts
import { calcOrderBonus } from '@/lib/bonus-program';
```

Заменить (строки 110–113):

```ts
    const bonusToEarn = selectedItems.reduce(
        (sum, item) => sum + (item.bonusRate ?? 0) * item.quantity,
        0
    );
```

на:

```ts
    const bonusToEarn = calcOrderBonus(
        selectedItems.map((item) => ({
            price: calculatePrice(item, item.quantity),
            quantity: item.quantity,
            bonusRate: item.bonusRate,
        }))
    );
```

- [ ] **Step 2: checkout/page.tsx**

Добавить в блок импортов:

```ts
import { calcOrderBonus } from '@/lib/bonus-program';
```

Заменить (строки 468–471):

```ts
    const bonusToEarn = checkoutItems.reduce(
        (sum, item) => sum + (item.bonusRate ?? 0) * item.quantity,
        0
    );
```

на:

```ts
    const bonusToEarn = calcOrderBonus(
        checkoutItems.map((item) => ({
            price: calculatePrice(item, item.quantity),
            quantity: item.quantity,
            bonusRate: item.bonusRate,
        }))
    );
```

Существующий `adjustedBonusToEarn` (строка 478) не трогать — он масштабирует уже целое значение.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit and push**

```bash
git add app/cart/page.tsx app/checkout/page.tsx
git commit -m "feat(bonus): cart/checkout show 0.5% fallback earn via calcOrderBonus"
git push origin main
```

---

### Task 5: ProductBonusInfo — блок над кнопкой «в корзину»

**Files:**
- Create: `components/ProductBonusInfo.tsx`
- Modify: `components/ProductActions.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (`user`, `isHydrated`) из `@/lib/auth-store`; `useAdminStore().bonusProgram.enabled`; `DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent` из Task 1; `t(key, fallback?, params?)` из `@/lib/use-translation`; тип `Product` из `@/data/products`.
- Produces: `ProductBonusInfo({ product })` — default export, рендерится первым элементом в `product-detail__actions`.

- [ ] **Step 1: Создать components/ProductBonusInfo.tsx**

```tsx
'use client';
import React from 'react';
import { Star } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useAdminStore } from '@/lib/admin-store';
import { useTranslation } from '@/lib/use-translation';
import { DEFAULT_BONUS_PROGRAM_CONFIG } from '@/lib/bonus-program';
import { Product } from '@/data/products';

interface ProductBonusInfoProps {
    product: Product;
}

/**
 * Бонусы клиента над кнопкой «в корзину»: баланс + правило начисления.
 * Гостям не показывается (они не видят и цен); процент — из DEFAULT-конфига,
 * тот же, что использует серверное начисление.
 */
export default function ProductBonusInfo({ product }: ProductBonusInfoProps) {
    const { t } = useTranslation();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const bonusProgramEnabled = useAdminStore((s) => s.bonusProgram.enabled);

    if (!isHydrated || !user || !bonusProgramEnabled) return null;

    const bonusRate = product.bonusRate ?? 0;

    return (
        <div className="product-detail__bonus mb-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-sm space-y-1">
            <div className="product-detail__bonus-balance flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                    <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
                    {t('account.bonus.balance')}
                </span>
                <span className="font-semibold text-amber-800 dark:text-amber-200">
                    {user.bonusPoints ?? 0} {t('cart.bonus.unit')}
                </span>
            </div>
            {bonusRate > 0 ? (
                <div className="product-detail__bonus-earn flex items-center justify-between gap-2 text-amber-700 dark:text-amber-400">
                    <span>{t('checkout.bonus.willEarn')}</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        +{bonusRate} {t('cart.bonus.unit')}
                    </span>
                </div>
            ) : (
                <p className="product-detail__bonus-earn text-xs text-amber-700 dark:text-amber-400">
                    {t('bonus.section.earnRate', undefined, {
                        rate: DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent,
                    })}
                </p>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Подключить в ProductActions.tsx**

Добавить импорт:

```tsx
import ProductBonusInfo from '@/components/ProductBonusInfo';
```

Заменить:

```tsx
        <div className="product-detail__actions mt-8">
            <div className="flex flex-wrap items-center gap-3">
```

на:

```tsx
        <div className="product-detail__actions mt-8">
            <ProductBonusInfo product={product} />
            <div className="flex flex-wrap items-center gap-3">
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit and push**

```bash
git add components/ProductBonusInfo.tsx components/ProductActions.tsx
git commit -m "feat(product): bonus balance and earn info above add-to-cart"
git push origin main
```

---

### Task 6: Финальная верификация

**Files:** нет новых.

- [ ] **Step 1: Все unit-тесты**

Run: `npm run test:unit`
Expected: PASS, включая lib/bonus-program.test.ts (12) и lib/server-pricing.test.ts (+4 новых).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Прогон в живом приложении**

`npm run dev`, залогиниться, открыть страницу товара (например `/product/13011`):
- залогиненный: янтарный блок над кнопкой — баланс + «Начисляется 0.5% от суммы каждого заказа»;
- гость: блока нет;
- корзина/чекаут: «Начислится после заказа» показывает 0.5% от суммы (целое);
- админка `/admin/bonus`: earnRate = 0.5 после миграции localStorage.

- [ ] **Step 4: Итоговый отчёт пользователю**
