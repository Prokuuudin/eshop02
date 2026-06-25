# Product Variant Options v2 (через technicalSpecs, без миграции схемы) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Восстановить выбор цвета/комплектации товара (потерянный при миграции nopCommerce→Neon) на странице товара, в корзине и в админке — без единой миграции Prisma и без изменения схемы Neon.

**Architecture:** Структурированные данные о вариантах (`VariantGroup[]`) хранятся как JSON-строка внутри уже существующего `Product.technicalSpecs Json?` под зарезервированным ключом `__variantGroupsJson`. Доступ — только через чистый хелпер `getVariantGroups()`, никогда напрямую. Корзина переходит на составной `lineKey` (id+вариант), чтобы два разных варианта одного товара были двумя разными строками корзины.

**Tech Stack:** Next.js App Router, TypeScript strict, Prisma 7 + `@prisma/adapter-pg` (только чтение/обычные UPDATE, без `prisma migrate`), Zustand (`persist`), React Hook Form + Zod, shadcn/ui, Vitest.

## Global Constraints

- **Никакой Prisma-миграции, никакого `ALTER TABLE`.** Хранилище — существующее поле `Product.technicalSpecs Json?`.
- Зарезервированный ключ `__variantGroupsJson` — JSON-строка `VariantGroup[]`. Никогда не показывается админу как обычная характеристика и не виден в общей таблице характеристик на странице товара.
- `VariantOption { value: string; priceAdjustment?: number }`, `VariantGroup { name: string; required: boolean; options: VariantOption[] }`, `SelectedVariant { groupName: string; value: string; priceAdjustment?: number }`.
- `priceAdjustment` сохраняется только когда truthy (не `0`, не `null`, не `undefined`).
- `buildLineKey(id, selectedVariants?)`: `id`, если вариантов нет; иначе `id + '::' + selectedVariants.map(v => \`${v.groupName}=${v.value}\`).join(',')`.
- Источник данных для бэкафилла — SQL Server бэкап `hairshop_p34s` (`Product_ProductAttribute_Mapping`/`ProductAttribute`/`ProductAttributeValue`, фильтр `Product.Deleted = 0`). Ожидаемое количество — **183** живых товара в Neon (не 184 — id 12660 отсутствует в Neon, подтверждено).
- Значения вариантов (`value`) не переводятся и не маппятся на hex/цвет — это технические коды.
- zustand `persist` storage key в `lib/cart-store.ts` — `'cart-store'`, менять нельзя (иначе все текущие корзины пользователей очистятся при деплое). Для миграции старых записей без `lineKey` — `version: 1` + `migrate`.
- Каталожные карточки (`components/ProductCard.tsx`, `components/ProductListRow.tsx`) не трогать — они уже корректно не передают `selectedVariants` в `AddToCartButton`.
- Stripe payload в `app/checkout/page.tsx` (маппинг `items: checkoutItems.map((item) => ({ id: item.id, ... }))`, строки ~310-316) не трогать — там `id` корректно означает id товара, не строку корзины.

---

### Task 1: Типы вариантов в `data/products.ts`

**Files:**
- Modify: `data/products.ts`

**Interfaces:**
- Produces: `VariantOption`, `VariantGroup`, `SelectedVariant` (экспортируемые интерфейсы). `Product` interface НЕ меняется (никакого нового поля `variantGroups` на `Product` — доступ только через хелпер в Task 2).

- [ ] **Step 1: Добавить типы**

В `data/products.ts`, после строки 3 (`export type CategoryType = ...`), перед `export interface Product {`, добавить:

```ts
export interface VariantOption {
  value: string            // код как в исходнике: "A-11", "111", "WHITE" — не переводим, не маппим на hex
  priceAdjustment?: number
}

export interface VariantGroup {
  name: string              // как в исходнике: "Krāsu numurs", "Izmērs"...
  required: boolean
  options: VariantOption[]
}

export interface SelectedVariant {
  groupName: string
  value: string
  priceAdjustment?: number
}

```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: только известная pre-existing ошибка `app/api/orders/route.test.ts(58,15)` про `ResolvedLineItem` — её не трогаем, она не связана с этой задачей.

- [ ] **Step 3: Commit**

```bash
git add data/products.ts
git commit -m "feat(types): add VariantGroup/VariantOption/SelectedVariant types"
```

---

### Task 2: Чистые хелперы — `lib/product-variants.ts`

**Files:**
- Create: `lib/product-variants.ts`
- Test: `lib/product-variants.test.ts`

**Interfaces:**
- Consumes: `VariantGroup`, `SelectedVariant` (Task 1)
- Produces: `getVariantGroups(product: { technicalSpecs?: Record<string, string> | null }): VariantGroup[] | undefined`, `getMissingRequiredGroups(groups: VariantGroup[] | undefined, selected: SelectedVariant[]): VariantGroup[]`, `sumPriceAdjustment(selected: SelectedVariant[]): number` — все три экспортируются, используются в Task 6 (UI), Task 7 (wiring), Task 10 (админка).

- [ ] **Step 1: Написать падающий тест**

Создать `lib/product-variants.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getVariantGroups, getMissingRequiredGroups, sumPriceAdjustment } from './product-variants'
import type { VariantGroup, SelectedVariant } from '@/data/products'

describe('getVariantGroups', () => {
  it('returns undefined when technicalSpecs is missing', () => {
    expect(getVariantGroups({})).toBeUndefined()
    expect(getVariantGroups({ technicalSpecs: undefined })).toBeUndefined()
    expect(getVariantGroups({ technicalSpecs: null })).toBeUndefined()
  })

  it('returns undefined when the reserved key is absent', () => {
    expect(getVariantGroups({ technicalSpecs: { 'Объём': '50 мл' } })).toBeUndefined()
  })

  it('parses valid JSON under the reserved key', () => {
    const groups: VariantGroup[] = [
      { name: 'Krāsu numurs', required: true, options: [{ value: 'A-11' }, { value: 'A-12', priceAdjustment: 1.5 }] },
    ]
    const result = getVariantGroups({ technicalSpecs: { __variantGroupsJson: JSON.stringify(groups) } })
    expect(result).toEqual(groups)
  })

  it('returns undefined on malformed JSON instead of throwing', () => {
    expect(getVariantGroups({ technicalSpecs: { __variantGroupsJson: '{not json' } })).toBeUndefined()
  })

  it('returns undefined when the parsed value is not an array', () => {
    expect(getVariantGroups({ technicalSpecs: { __variantGroupsJson: '{"a":1}' } })).toBeUndefined()
  })
})

describe('getMissingRequiredGroups', () => {
  const groups: VariantGroup[] = [
    { name: 'Krāsu numurs', required: true, options: [{ value: 'A-11' }] },
    { name: 'Izmērs', required: false, options: [{ value: 'M' }] },
  ]

  it('returns required groups with no matching selection', () => {
    const missing = getMissingRequiredGroups(groups, [])
    expect(missing).toEqual([groups[0]])
  })

  it('returns empty array when all required groups are selected', () => {
    const selected: SelectedVariant[] = [{ groupName: 'Krāsu numurs', value: 'A-11' }]
    expect(getMissingRequiredGroups(groups, selected)).toEqual([])
  })

  it('ignores optional groups entirely', () => {
    expect(getMissingRequiredGroups(groups, [{ groupName: 'Krāsu numurs', value: 'A-11' }])).toEqual([])
  })

  it('treats undefined groups as no groups', () => {
    expect(getMissingRequiredGroups(undefined, [])).toEqual([])
  })
})

describe('sumPriceAdjustment', () => {
  it('sums priceAdjustment across selected variants', () => {
    const selected: SelectedVariant[] = [
      { groupName: 'a', value: '1', priceAdjustment: 1.5 },
      { groupName: 'b', value: '2', priceAdjustment: 2.5 },
    ]
    expect(sumPriceAdjustment(selected)).toBe(4)
  })

  it('treats missing priceAdjustment as 0', () => {
    expect(sumPriceAdjustment([{ groupName: 'a', value: '1' }])).toBe(0)
  })

  it('returns 0 for an empty array', () => {
    expect(sumPriceAdjustment([])).toBe(0)
  })
})
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `npx vitest run lib/product-variants.test.ts`
Expected: FAIL — `Cannot find module './product-variants'`

- [ ] **Step 3: Реализовать**

Создать `lib/product-variants.ts`:

```ts
import type { VariantGroup, SelectedVariant } from '@/data/products'

const VARIANT_GROUPS_KEY = '__variantGroupsJson'

export function getVariantGroups(product: { technicalSpecs?: Record<string, string> | null }): VariantGroup[] | undefined {
  const raw = product.technicalSpecs?.[VARIANT_GROUPS_KEY]
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as VariantGroup[]) : undefined
  } catch {
    return undefined
  }
}

export function getMissingRequiredGroups(
  groups: VariantGroup[] | undefined,
  selected: SelectedVariant[]
): VariantGroup[] {
  if (!groups) return []
  return groups.filter(
    (g) => g.required && !selected.some((s) => s.groupName === g.name)
  )
}

export function sumPriceAdjustment(selected: SelectedVariant[]): number {
  return selected.reduce((sum, v) => sum + (v.priceAdjustment ?? 0), 0)
}
```

- [ ] **Step 4: Запустить, убедиться что проходит**

Run: `npx vitest run lib/product-variants.test.ts`
Expected: PASS — 12 tests passed

- [ ] **Step 5: Commit**

```bash
git add lib/product-variants.ts lib/product-variants.test.ts
git commit -m "feat: add pure variant helpers (getVariantGroups reads from technicalSpecs)"
```

---

### Task 3: Скрыть служебный ключ в общей таблице характеристик

**Files:**
- Modify: `components/TechnicalSpecs.tsx`

**Interfaces:**
- Consumes: ничего нового (просто фильтрует существующий `product.technicalSpecs`)

- [ ] **Step 1: Отфильтровать ключ**

В `components/TechnicalSpecs.tsx`, заменить:

```diff
-  if (!product.technicalSpecs || Object.keys(product.technicalSpecs).length === 0) {
-    return null
-  }
+  const visibleSpecs = Object.entries(product.technicalSpecs ?? {}).filter(
+    ([key]) => key !== '__variantGroupsJson'
+  )
+
+  if (visibleSpecs.length === 0) {
+    return null
+  }
```

(строки ~11-13)

```diff
       <div className="space-y-3">
-        {Object.entries(product.technicalSpecs).map(([key, value]) => (
+        {visibleSpecs.map(([key, value]) => (
           <div key={key} className="flex justify-between items-start gap-4 pb-3 border-b border-border last:border-0">
```

(строки ~19-21)

- [ ] **Step 2: Тест не пишем — нет конвенции**

В проекте нет ни одного файла `components/*.test.tsx` (проверено: `ls components/*.test.tsx` → "No such file or directory") — рендер-тестов React-компонентов в этой кодовой базе не существует, заводить такую конвенцию ради одной строки фильтрации — не в рамках этой задачи. Корректность проверяется тайпчеком (Step 3) и пунктом ручной проверки в финальном чеклисте плана ("общая таблица характеристик... не показывает `__variantGroupsJson`").

- [ ] **Step 3: Ручная проверка**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: только известная pre-existing ошибка (см. Task 1, Step 2)

- [ ] **Step 4: Commit**

```bash
git add components/TechnicalSpecs.tsx
git commit -m "fix: hide reserved __variantGroupsJson key from the technical specs table"
```

---

### Task 4: Составной `lineKey` в корзине + миграция персиста + смежные фиксы

**Files:**
- Modify: `lib/cart-store.ts`
- Test: `lib/cart-store.test.ts` (создать)
- Modify: `app/order/[id]/page.tsx` (инлайн-тип ответа API)
- Modify: `lib/orders-store.test.ts` (тест-фикстура)

**Interfaces:**
- Consumes: `SelectedVariant` (Task 1), `sumPriceAdjustment` (Task 2)
- Produces: `buildLineKey(id, selectedVariants?): string` (экспортируется), `CartItem.lineKey: string` (обязательное), `CartItem.selectedVariants?: SelectedVariant[]`, `CartItem.variantLabel?: string`, `addItem(product, quantity, selectedVariants?)`, `removeItem(lineKey)`, `updateQuantity(lineKey, quantity)`, `migrateCartState` (экспортируется для теста) — используется в Task 7 (wiring), Task 8 (cart UI), Task 9 (заказы).

**Важно:** превратив `CartItem.lineKey` в обязательное поле, мы ломаем typecheck в двух местах за пределами файлов из списка выше — это известно заранее (повторяет то, что уже было найдено и исправлено в прошлой реализации этой фичи), фиксы включены ниже в Step 6-7, не как отдельная задача.

- [ ] **Step 1: Написать падающий тест**

Создать `lib/cart-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildLineKey, migrateCartState } from './cart-store'

describe('buildLineKey', () => {
  it('returns the plain id when there are no variants', () => {
    expect(buildLineKey('p1')).toBe('p1')
    expect(buildLineKey('p1', [])).toBe('p1')
  })

  it('builds a composite key from selected variants', () => {
    expect(buildLineKey('p1', [{ groupName: 'Krāsu numurs', value: 'A-11' }]))
      .toBe('p1::Krāsu numurs=A-11')
  })

  it('produces different keys for different variants of the same product', () => {
    const keyA = buildLineKey('p1', [{ groupName: 'Krāsu numurs', value: 'A-11' }])
    const keyB = buildLineKey('p1', [{ groupName: 'Krāsu numurs', value: 'A-12' }])
    expect(keyA).not.toBe(keyB)
  })

  it('combines multiple groups deterministically', () => {
    const key = buildLineKey('p1', [
      { groupName: 'Krāsu numurs', value: 'A-11' },
      { groupName: 'Izmērs', value: 'M' },
    ])
    expect(key).toBe('p1::Krāsu numurs=A-11,Izmērs=M')
  })
})

describe('migrateCartState', () => {
  it('backfills lineKey for legacy items missing it', () => {
    const legacyState = { items: [{ id: 'p1', title: 'X', brand: 'B', price: 10, quantity: 1 }] }
    const migrated = migrateCartState(legacyState, 0) as { items: Array<{ id: string; lineKey: string }> }
    expect(migrated.items[0].lineKey).toBe('p1')
  })

  it('preserves selectedVariants when backfilling lineKey', () => {
    const legacyState = {
      items: [
        {
          id: 'p1',
          title: 'X',
          brand: 'B',
          price: 10,
          quantity: 1,
          selectedVariants: [{ groupName: 'Krāsu numurs', value: 'A-11' }],
        },
      ],
    }
    const migrated = migrateCartState(legacyState, 0) as { items: Array<{ lineKey: string }> }
    expect(migrated.items[0].lineKey).toBe('p1::Krāsu numurs=A-11')
  })

  it('leaves items that already have a lineKey untouched', () => {
    const state = { items: [{ id: 'p1', lineKey: 'p1::custom', title: 'X', brand: 'B', price: 10, quantity: 1 }] }
    const migrated = migrateCartState(state, 1) as { items: Array<{ lineKey: string }> }
    expect(migrated.items[0].lineKey).toBe('p1::custom')
  })

  it('passes through a state with no items array safely', () => {
    expect(migrateCartState({}, 0)).toEqual({})
  })
})
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `npx vitest run lib/cart-store.test.ts`
Expected: FAIL — `buildLineKey`/`migrateCartState` не экспортируются

- [ ] **Step 3: Реализовать**

Заменить полное содержимое `lib/cart-store.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SelectedVariant } from '@/data/products'
import { sumPriceAdjustment } from '@/lib/product-variants'

export type { SelectedVariant }

export function buildLineKey(id: string, selectedVariants?: SelectedVariant[]): string {
  if (!selectedVariants || selectedVariants.length === 0) return id
  return id + '::' + selectedVariants.map((v) => `${v.groupName}=${v.value}`).join(',')
}

type AddableProduct = {
  id: string
  title: string
  brand: string
  image?: string
  images?: string[]
  price: number
  bonusRate?: number
  bulkPricingTiers?: Array<{ quantity: number; pricePerUnit: number }>
  minOrderQuantities?: Record<string, number>
  category?: string
  sku?: string
}

export type CartItem = {
  id: string
  lineKey: string
  selectedVariants?: SelectedVariant[]
  title: string
  brand: string
  image?: string
  price: number
  quantity: number
  bonusRate?: number
  bulkPricingTiers?: Array<{ quantity: number; pricePerUnit: number }>
  minOrderQuantities?: Record<string, number>
  category?: string
  sku?: string
  variantLabel?: string
}

type CartStore = {
  items: CartItem[]
  addItem: (product: AddableProduct, quantity: number, selectedVariants?: SelectedVariant[]) => void
  removeItem: (lineKey: string) => void
  updateQuantity: (lineKey: string, quantity: number) => void
  replaceWithItems: (items: CartItem[]) => void
  clearCart: () => void
  total: () => number
}

// Бэкафилл lineKey для корзин, сохранённых в localStorage до введения составного ключа.
export function migrateCartState(persistedState: unknown, _version: number): unknown {
  if (
    !persistedState ||
    typeof persistedState !== 'object' ||
    !('items' in persistedState) ||
    !Array.isArray((persistedState as { items: unknown }).items)
  ) {
    return persistedState
  }
  const state = persistedState as { items: Array<Record<string, unknown>> }
  return {
    ...state,
    items: state.items.map((item) => {
      if (typeof item.lineKey === 'string' && item.lineKey.length > 0) return item
      const id = item.id as string
      const selectedVariants = item.selectedVariants as SelectedVariant[] | undefined
      return { ...item, lineKey: buildLineKey(id, selectedVariants) }
    }),
  }
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product: AddableProduct, quantity: number, selectedVariants?: SelectedVariant[]) => {
        const lineKey = buildLineKey(product.id, selectedVariants)
        const priceAdjustment = sumPriceAdjustment(selectedVariants ?? [])
        const variantLabel = selectedVariants?.length
          ? selectedVariants.map((v) => `${v.groupName}: ${v.value}`).join(', ')
          : undefined
        const slim: Omit<CartItem, 'quantity'> = {
          id: product.id,
          lineKey,
          selectedVariants,
          variantLabel,
          title: product.title,
          brand: product.brand,
          image: product.image || product.images?.[0],
          price: product.price + priceAdjustment,
          bonusRate: product.bonusRate,
          bulkPricingTiers: product.bulkPricingTiers,
          minOrderQuantities: product.minOrderQuantities,
          category: product.category,
          sku: product.sku,
        }
        set((state) => {
          const existing = state.items.find((i) => i.lineKey === lineKey)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.lineKey === lineKey ? { ...i, quantity: i.quantity + quantity } : i
              )
            }
          }
          return {
            items: [...state.items, { ...slim, quantity }]
          }
        })
      },
      removeItem: (lineKey: string) => {
        set((state) => ({
          items: state.items.filter((i) => i.lineKey !== lineKey)
        }))
      },
      updateQuantity: (lineKey: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(lineKey)
        } else {
          set((state) => ({
            items: state.items.map((i) => (i.lineKey === lineKey ? { ...i, quantity } : i))
          }))
        }
      },
      replaceWithItems: (items: CartItem[]) => {
        set({ items })
      },
      clearCart: () => {
        set({ items: [] })
      },
      total: () => {
        return get().items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      }
    }),
    { name: 'cart-store', version: 1, migrate: migrateCartState }
  )
)
```

- [ ] **Step 4: Запустить, убедиться что проходит**

Run: `npx vitest run lib/cart-store.test.ts`
Expected: PASS — 8 tests passed

- [ ] **Step 5: Typecheck — найти известные смежные ошибки**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: ошибки в `app/order/[id]/page.tsx` (`lineKey` отсутствует в инлайн-типе ответа API) и `lib/orders-store.test.ts` (`makeItem` не указывает `lineKey`), плюс известная pre-existing ошибка в `app/api/orders/route.test.ts`. Ошибки в `components/CartDrawer.tsx`/`app/cart/page.tsx`/`app/checkout/page.tsx`/`app/admin/orders/page.tsx` — ожидаемы, их фиксит Task 8/9, не эта задача.

- [ ] **Step 6: Фикс — `app/order/[id]/page.tsx`**

В инлайн-типе `payload.order.items` (строки ~47-57), добавить `lineKey: string;` сразу после `id: string;`:

```diff
                         items: Array<{
                             id: string;
+                            lineKey: string;
                             title: string;
```

- [ ] **Step 7: Фикс — `lib/orders-store.test.ts`**

В функции `makeItem` (строки ~45-58), добавить `lineKey: id,` в возвращаемый объект (вариантов у тестовых фикстур нет, поэтому `lineKey === id`, как и даёт `buildLineKey(id)` без вариантов):

```diff
function makeItem(id: string, price: number, quantity: number): CartItem {
  return {
    id,
+   lineKey: id,
    title: `Product ${id}`,
```

- [ ] **Step 8: Финальный typecheck этой задачи**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: только известная pre-existing ошибка в `app/api/orders/route.test.ts`, плюс ожидаемые ошибки в `CartDrawer.tsx`/`app/cart/page.tsx`/`app/checkout/page.tsx`/`app/admin/orders/page.tsx` (фиксятся в Task 8/9).

- [ ] **Step 9: Commit**

```bash
git add lib/cart-store.ts lib/cart-store.test.ts app/order/[id]/page.tsx lib/orders-store.test.ts
git commit -m "feat(cart): composite lineKey identity + persisted-cart migration"
```

---

### Task 5: Переводы для выбора варианта

**Files:**
- Modify: `data/translations.ts`

**Interfaces:**
- Produces: ключи `product.selectVariant`, `product.selectVariantRequired` в ru/en/lv — используются в Task 6/7.

- [ ] **Step 1: Добавить ключи**

В `data/translations.ts`, сразу после `'product.addToCart': 'В корзину',` (строка 763):

```diff
     'product.addToCart': 'В корзину',
+    'product.selectVariant': 'Выбрать вариант',
+    'product.selectVariantRequired': 'Выберите',
```

Сразу после `'product.addToCart': 'Add to Cart',` (строка 2221):

```diff
     'product.addToCart': 'Add to Cart',
+    'product.selectVariant': 'Select option',
+    'product.selectVariantRequired': 'Please select',
```

Сразу после `'product.addToCart': 'Pievienot grozam',` (строка 4003):

```diff
     'product.addToCart': 'Pievienot grozam',
+    'product.selectVariant': 'Izvēlēties variantu',
+    'product.selectVariantRequired': 'Izvēlieties',
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без изменений относительно конца Task 4

- [ ] **Step 3: Commit**

```bash
git add data/translations.ts
git commit -m "feat(i18n): add variant-selection strings (ru/en/lv)"
```

---

### Task 6: Компонент `ProductVariantSelector`

**Files:**
- Create: `components/ProductVariantSelector.tsx`

**Interfaces:**
- Consumes: `VariantGroup`, `SelectedVariant` (Task 1)
- Produces: `ProductVariantSelector({ groups, selected, onChange }: { groups: VariantGroup[]; selected: SelectedVariant[]; onChange: (next: SelectedVariant[]) => void })` — используется в Task 7.

Это standalone-компонент, не встроенный никуда в этой задаче (встраивание — Task 7). Следует шаблону shadcn `Select` из `components/Reviews.tsx` (контролируемый, `value`/`onValueChange`).

- [ ] **Step 1: Создать компонент**

Создать `components/ProductVariantSelector.tsx`:

```tsx
'use client'

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { VariantGroup, SelectedVariant } from '@/data/products'
import { useTranslation } from '@/lib/use-translation'

type ProductVariantSelectorProps = {
  groups: VariantGroup[]
  selected: SelectedVariant[]
  onChange: (next: SelectedVariant[]) => void
}

export function ProductVariantSelector({ groups, selected, onChange }: ProductVariantSelectorProps) {
  const { t } = useTranslation()

  const handleSelect = (group: VariantGroup, value: string) => {
    const option = group.options.find((o) => o.value === value)
    const next = selected.filter((s) => s.groupName !== group.name)
    next.push({ groupName: group.name, value, priceAdjustment: option?.priceAdjustment })
    onChange(next)
  }

  return (
    <div className="product-variant-selector flex flex-col gap-3 my-3">
      {groups.map((group) => {
        const currentValue = selected.find((s) => s.groupName === group.name)?.value
        return (
          <div key={group.name} className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">
              {group.name}
              {group.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <Select value={currentValue} onValueChange={(value) => handleSelect(group, value)}>
              <SelectTrigger className="w-full bg-card border-border text-foreground">
                <SelectValue placeholder={t('product.selectVariantRequired')} />
              </SelectTrigger>
              <SelectContent>
                {group.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок относительно конца Task 5 (компонент пока никуда не подключен)

- [ ] **Step 3: Commit**

```bash
git add components/ProductVariantSelector.tsx
git commit -m "feat: add ProductVariantSelector component"
```

---

### Task 7: Встроить селектор в страницу товара и add-to-cart

**Files:**
- Modify: `components/ProductInfo.tsx`
- Modify: `components/ProductActions.tsx`
- Modify: `components/AddToCartButton.tsx`

**Interfaces:**
- Consumes: `ProductVariantSelector` (Task 6), `getVariantGroups`, `getMissingRequiredGroups`, `sumPriceAdjustment` (Task 2), `SelectedVariant` (Task 1)
- Produces: `ProductActions` принимает `selectedVariants?: SelectedVariant[]`; `AddToCartButton` принимает `selectedVariants?: SelectedVariant[]` и рендерит ссылку-заглушку "выбрать вариант" вместо кнопки, если используется без селектора (карточка каталога) и у товара есть обязательная группа.

**Важно:** `ProductInfo.tsx` в текущем состоянии уже использует `stripBrandPrefix` из `@/lib/product-title` (строка 12, `<ProductTitle title={stripBrandPrefix(localizedTitle, product.brand)} />`, строка 40) — это посторонний, не относящийся к этой фиче код, который НЕ ТРОГАТЬ и сохранить как есть.

- [ ] **Step 1: `ProductInfo.tsx` — состояние выбора и пересчитанная цена**

Заменить полное содержимое `components/ProductInfo.tsx`:

```tsx
import { ProductFeatures } from '@/components/ProductFeatures';
import React, { useMemo, useState } from 'react';
import { ProductBrand } from '@/components/ProductBrand';
import { ProductTitle } from '@/components/ProductTitle';
import { ProductCodes } from '@/components/ProductCodes';
import { ProductBadges } from '@/components/ProductBadges';
import { ProductRating } from '@/components/ProductRating';
import { ProductPrices } from '@/components/ProductPrices';
import { ProductDescription } from '@/components/ProductDescription';
import { ProductActions } from '@/components/ProductActions';
import { ProductVariantSelector } from '@/components/ProductVariantSelector';
import { Product, SelectedVariant } from '@/data/products';
import { stripBrandPrefix } from '@/lib/product-title';
import { getVariantGroups, sumPriceAdjustment } from '@/lib/product-variants';

interface ProductInfoProps {
    product: Product;
    localizedTitle: string;
    ratingCount: number;
    displayPrice: number;
    displayOldPrice?: number;
    priceLocale: string;
    productDescription: string;
    productFeatures: string[];
    minOrderQuantity: number;
}

export const ProductInfo: React.FC<ProductInfoProps> = ({
    product,
    localizedTitle,
    ratingCount,
    displayPrice,
    displayOldPrice,
    priceLocale,
    productDescription,
    productFeatures,
    minOrderQuantity,
}) => {
    const variantGroups = useMemo(() => getVariantGroups(product), [product]);
    const [selectedVariants, setSelectedVariants] = useState<SelectedVariant[]>([]);
    const priceAdjustment = useMemo(() => sumPriceAdjustment(selectedVariants), [selectedVariants]);
    const adjustedPrice = displayPrice + priceAdjustment;
    const adjustedOldPrice = displayOldPrice !== undefined ? displayOldPrice + priceAdjustment : undefined;

    return (
        <div className="product-detail__info">
            <ProductBrand brand={product.brand} />
            <ProductTitle title={stripBrandPrefix(localizedTitle, product.brand)} />
            <ProductCodes sku={product.sku} barcode={product.barcode} />
            <ProductBadges badges={product.badges} />
            <ProductRating rating={product.rating} count={ratingCount} />
            {variantGroups && variantGroups.length > 0 && (
                <ProductVariantSelector
                    groups={variantGroups}
                    selected={selectedVariants}
                    onChange={setSelectedVariants}
                />
            )}
            <ProductPrices
                price={adjustedPrice}
                oldPrice={adjustedOldPrice}
                priceLocale={priceLocale}
                stock={product.stock}
                creditPrice={product.price}
                productId={product.id}
                productTitle={localizedTitle}
            />
            <ProductDescription description={productDescription} productId={product.id} />
            <ProductFeatures features={productFeatures} />
            <ProductActions
                product={product}
                minOrderQuantity={minOrderQuantity}
                displayPrice={adjustedPrice}
                selectedVariants={selectedVariants}
            />
        </div>
    );
};
```

- [ ] **Step 2: `ProductActions.tsx` — передать `selectedVariants` дальше**

Заменить полное содержимое `components/ProductActions.tsx`:

```tsx
import React from 'react';
import AddToCartButton from '@/components/AddToCartButton';
import WishlistButton from '@/components/WishlistButton';
import { SubscriptionWidget } from '@/components/SubscriptionWidget';
import { useTranslation } from '@/lib/use-translation';
import { Product, SelectedVariant } from '@/data/products';

interface ProductActionsProps {
    product: Product;
    minOrderQuantity: number;
    displayPrice: number;
    selectedVariants?: SelectedVariant[];
}

export const ProductActions: React.FC<ProductActionsProps> = ({
    product,
    minOrderQuantity,
    displayPrice,
    selectedVariants,
}) => {
    const { t } = useTranslation();
    return (
        <div className="product-detail__actions mt-8">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                    <AddToCartButton product={product} selectedVariants={selectedVariants} />
                </div>
                <WishlistButton product={product} asButton />
            </div>
            {minOrderQuantity > 1 && (
                <p className="text-xs text-muted-foreground mt-2">
                    {t('product.minimumOrder')}: {minOrderQuantity} {t('product.pcs')}
                </p>
            )}
            <SubscriptionWidget product={product} displayPrice={displayPrice} />
        </div>
    );
};
```

- [ ] **Step 3: `AddToCartButton.tsx` — gating по обязательным вариантам и fallback для карточек каталога**

В `components/AddToCartButton.tsx`, заменить блок импортов и сигнатуру (строки 1-18):

```diff
 'use client'
 import React, { useEffect, useMemo, useRef, useState } from 'react'
+import Link from 'next/link'
 import { useTranslation } from '@/lib/use-translation'
-import { Product } from '@/data/products'
+import { Product, SelectedVariant } from '@/data/products'
 import { Button } from './ui/button'
 import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
 import { useCart } from '@/lib/cart-store'
 import { useToast } from '@/lib/toast-context'
 import { useAuthStore } from '@/lib/auth-store'
 import { getMinimumOrderQuantity, calculatePrice } from '@/lib/customer-segmentation'
 import { formatEuro } from '@/lib/utils'
+import { getVariantGroups, getMissingRequiredGroups } from '@/lib/product-variants'
 import AuthGateDialog from '@/components/AuthGateDialog'

 type Props = {
   product: Product
+  /**
+   * undefined = в этом контексте нет селектора вариантов (карточка каталога).
+   * массив (возможно пустой) = селектор есть (страница товара), это его текущее значение.
+   */
+  selectedVariants?: SelectedVariant[]
 }

-export default function AddToCartButton({ product }: Props) {
+export default function AddToCartButton({ product, selectedVariants }: Props) {
```

Сразу после `const { addItem } = useCart()` (строка 26), добавить:

```ts
  const { addItem } = useCart()
  const hasVariantSelector = selectedVariants !== undefined
  const variantGroups = useMemo(() => getVariantGroups(product), [product])
  const missingRequired = useMemo(
    () => getMissingRequiredGroups(variantGroups, selectedVariants ?? []),
    [variantGroups, selectedVariants]
  )
  const needsVariantSelectionElsewhere = !hasVariantSelector && (variantGroups ?? []).some((g) => g.required)
```

В `handleAdd`, сразу после проверки `quantity < minOrderQuantity` и перед `addItem(product, quantity)` (строки ~73-78):

```diff
     if (quantity < minOrderQuantity) {
       showToast(`${t('product.minimumOrder')}: ${minOrderQuantity} ${t('product.pieces')}`, 'error')
       return
     }

-    addItem(product, quantity)
+    if (missingRequired.length > 0) {
+      showToast(`${t('product.selectVariantRequired')}: ${missingRequired.map((g) => g.name).join(', ')}`, 'error')
+      return
+    }
+
+    addItem(product, quantity, selectedVariants)
```

Прямо перед финальным `return (` (строка 93, начинающим JSX `<div className="add-to-cart ...">`):

```ts
  if (needsVariantSelectionElsewhere) {
    return (
      <Button asChild className="w-full add-to-cart__button">
        <Link href={`/product/${product.id}`}>{t('product.selectVariant')}</Link>
      </Button>
    )
  }

  return (
```

В финальной `<Button>` (строки ~175-184), добавить `missingRequired.length > 0` в `disabled`:

```diff
       <Button
         ref={buttonRef}
         onClick={handleAdd}
-        disabled={isOutOfStock || !isHydrated}
+        disabled={isOutOfStock || !isHydrated || missingRequired.length > 0}
         className={`w-full add-to-cart__button ${
           added ? 'bg-green-600 hover:bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
         } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
       >
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок в `ProductInfo.tsx`/`ProductActions.tsx`/`AddToCartButton.tsx` относительно конца Task 6

- [ ] **Step 5: Подтвердить, что карточки каталога не задеты**

Run: `grep -n "AddToCartButton" components/ProductCard.tsx components/ProductListRow.tsx`
Expected: оба вызова — `<AddToCartButton product={product} />`, без `selectedVariants` (это уже корректный сигнал "нет селектора"). Если строки отличаются — НЕ менять эти два файла, они вне скоупа этой задачи.

- [ ] **Step 6: Commit**

```bash
git add components/ProductInfo.tsx components/ProductActions.tsx components/AddToCartButton.tsx
git commit -m "feat: wire variant selector into product page and add-to-cart flow"
```

---

### Task 8: Корзина-UI и чекаут — переход с `id` на `lineKey`

**Files:**
- Modify: `components/CartDrawer.tsx`
- Modify: `app/cart/page.tsx`
- Modify: `app/checkout/page.tsx`

**Interfaces:**
- Consumes: `CartItem.lineKey`, `removeItem(lineKey)`, `updateQuantity(lineKey, quantity)` (Task 4)

- [ ] **Step 1: `components/CartDrawer.tsx`**

```diff
-            if (prev.length === 0 && !selectionTouched) {
-                return items.map((item) => item.id);
+            if (prev.length === 0 && !selectionTouched) {
+                return items.map((item) => item.lineKey);
```
(строка ~47)

```diff
-            const currentIds = new Set(items.map((item) => item.id));
+            const currentIds = new Set(items.map((item) => item.lineKey));
```
(строка ~50)

```diff
-            if (next.length === 0 && items.length > 0 && !selectionTouched) {
-                return items.map((item) => item.id);
+            if (next.length === 0 && items.length > 0 && !selectionTouched) {
+                return items.map((item) => item.lineKey);
```
(строка ~53-54)

```diff
-    const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));
+    const selectedItems = items.filter((item) => selectedItemIds.includes(item.lineKey));
```
(строка ~67)

```diff
-    const toggleSelected = (productId: string): void => {
+    const toggleSelected = (lineKey: string): void => {
         setSelectionTouched(true);
         setSelectedItemIds((prev) =>
-            prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
+            prev.includes(lineKey) ? prev.filter((id) => id !== lineKey) : [...prev, lineKey]
         );
     };
```
(строки 87-92)

```diff
-    const handleDecrease = (productId: string, quantity: number, minQuantity: number): void => {
+    const handleDecrease = (lineKey: string, quantity: number, minQuantity: number): void => {
         if (quantity <= minQuantity) {
             return;
         }
-        updateQuantity(productId, quantity - 1);
+        updateQuantity(lineKey, quantity - 1);
     };
```
(строки 111-116)

```diff
                                     setSelectionTouched(true);
-                                    setSelectedItemIds(items.map((item) => item.id));
+                                    setSelectedItemIds(items.map((item) => item.lineKey));
```
(строка ~190)

```diff
                             const minQuantity = getMinimumOrderQuantity(item);
                             const localizedTitle = t(`products.${item.id}.title`, item.title);
-                            const isSelected = selectedItemIds.includes(item.id);
+                            const isSelected = selectedItemIds.includes(item.lineKey);
                             return (
                                 <div
-                                    key={item.id}
+                                    key={item.lineKey}
                                     className="cart-drawer__item flex gap-3 border-b border-border pb-3"
                                 >
                                     <div className="pt-1">
                                         <Checkbox
                                             checked={isSelected}
-                                            onCheckedChange={() => toggleSelected(item.id)}
+                                            onCheckedChange={() => toggleSelected(item.lineKey)}
```
(строки ~215-226 — `item.id` в `t(\`products.${item.id}.title\`, ...)` НЕ меняем, это id товара для i18n-ключа, не идентификатор строки)

```diff
                                                 <button
                                                     onClick={() =>
                                                         handleDecrease(
-                                                            item.id,
+                                                            item.lineKey,
                                                             item.quantity,
                                                             minQuantity
                                                         )
```
(строки ~249-254)

```diff
                                                 <button
                                                     onClick={() =>
-                                                        updateQuantity(item.id, item.quantity + 1)
+                                                        updateQuantity(item.lineKey, item.quantity + 1)
                                                     }
```
(строки ~264-266)

```diff
                                                 onConfirm={() => {
-                                                    removeItem(item.id);
+                                                    removeItem(item.lineKey);
                                                     showToast(t('toast.removedFromCart'), 'info');
                                                 }}
```
(строка ~278)

- [ ] **Step 2: `app/cart/page.tsx`**

```diff
         setSelectedItemIds((prev) => {
             if (prev.length === 0 && !selectionTouched) {
-                return items.map((item) => item.id);
+                return items.map((item) => item.lineKey);
             }

-            const currentIds = new Set(items.map((item) => item.id));
+            const currentIds = new Set(items.map((item) => item.lineKey));
             const next = prev.filter((id) => currentIds.has(id));

             if (next.length === 0 && items.length > 0 && !selectionTouched) {
-                return items.map((item) => item.id);
+                return items.map((item) => item.lineKey);
             }

             return next;
         });
```
(строки ~46-59)

```diff
-    const handleDecrease = (productId: string, quantity: number, minQuantity: number): void => {
+    const handleDecrease = (lineKey: string, quantity: number, minQuantity: number): void => {
         if (quantity <= minQuantity) {
             return;
         }
-        updateQuantity(productId, quantity - 1);
+        updateQuantity(lineKey, quantity - 1);
     };

-    const toggleSelected = (productId: string): void => {
+    const toggleSelected = (lineKey: string): void => {
         setSelectionTouched(true);
         setSelectedItemIds((prev) =>
-            prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
+            prev.includes(lineKey) ? prev.filter((id) => id !== lineKey) : [...prev, lineKey]
         );
     };
```
(строки ~68-80)

```diff
-    const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));
+    const selectedItems = items.filter((item) => selectedItemIds.includes(item.lineKey));
```
(строка ~99 — `selectedIdsParam = selectedItemIds.join(',')` ниже не меняем, он теперь естественно собирает `lineKey`)

```diff
                     onClick={() => {
                         setSelectionTouched(true);
-                        setSelectedItemIds(items.map((item) => item.id));
+                        setSelectedItemIds(items.map((item) => item.lineKey));
                     }}
```
(строка ~135)

```diff
                         {items.map((item) => {
                             const minQuantity = getMinimumOrderQuantity(item);
                             const unitPrice = calculatePrice(item, item.quantity);
                             const localizedTitle = t(`products.${item.id}.title`, item.title);
-                            const isSelected = selectedItemIds.includes(item.id);
+                            const isSelected = selectedItemIds.includes(item.lineKey);
                             return (
                                 <div
-                                    key={item.id}
+                                    key={item.lineKey}
                                     className="cart__item p-4 bg-card rounded-lg border border-border flex gap-4"
                                 >
                                     <div className="cart__item-checkbox pt-1">
                                         <Checkbox
                                             checked={isSelected}
-                                            onCheckedChange={() => toggleSelected(item.id)}
+                                            onCheckedChange={() => toggleSelected(item.lineKey)}
```
(строки ~172-185 — `Link href={\`/product/${item.id}\`}` чуть ниже и `products.${item.id}.title` НЕ меняем, это id товара)

```diff
                                         <ConfirmActionDialog
                                             ...
                                             onConfirm={() => {
-                                                removeItem(item.id);
+                                                removeItem(item.lineKey);
                                                 showToast(t('toast.removedFromCart'), 'info');
                                             }}
```
(строка ~224)

```diff
                                         <div className="cart__item-qty flex items-center border border-border rounded">
                                             <button
                                                 onClick={() =>
                                                     handleDecrease(
-                                                        item.id,
+                                                        item.lineKey,
                                                         item.quantity,
                                                         minQuantity
                                                     )
                                                 }
                                                 className="cart__item-qty-btn px-2 py-1"
                                             >
                                                 −
                                             </button>
                                             <span className="cart__item-qty-value px-3 py-1 min-w-[2rem] text-center">
                                                 {item.quantity}
                                             </span>
                                             <button
                                                 onClick={() =>
-                                                    updateQuantity(item.id, item.quantity + 1)
+                                                    updateQuantity(item.lineKey, item.quantity + 1)
                                                 }
```
(строки ~234-257)

- [ ] **Step 3: `app/checkout/page.tsx`**

```diff
     const checkoutItems = React.useMemo(() => {
         if (!selectedItemIds) return items;

         const selectedSet = new Set(selectedItemIds);
-        return items.filter((item) => selectedSet.has(item.id));
+        return items.filter((item) => selectedSet.has(item.lineKey));
     }, [items, selectedItemIds]);
```
(строка ~84 — `selectedItemIds` приходит из query-параметра `items=`, который теперь заполняется `lineKey`-ами из Task 8 Step 1/2)

```diff
-        const selectedSet = new Set(checkoutItems.map((item) => item.id));
-        const remainingItems = items.filter((item) => !selectedSet.has(item.id));
+        const selectedSet = new Set(checkoutItems.map((item) => item.lineKey));
+        const remainingItems = items.filter((item) => !selectedSet.has(item.lineKey));
         replaceWithItems(remainingItems);
```
(строки ~397-398 — критично: без этого фикса оформление одного варианта товара удалит из корзины и другой вариант того же товара)

В блоке сводки заказа (строки ~730-740), заменить `key={item.id}` на `key={item.lineKey}` (та же причина — два варианта одного товара дадут дублирующийся React key):

```diff
                             {checkoutItems.map((item) => {
                                 const localizedTitle = t(`products.${item.id}.title`, item.title);
                                 const unitPrice = calculatePrice(item, item.quantity);
                                 return (
-                                    <div key={item.id} className="text-sm flex justify-between">
+                                    <div key={item.lineKey} className="text-sm flex justify-between">
```

НЕ менять: маппинг Stripe payload (`items: checkoutItems.map((item) => ({ id: item.id, ... }))`, строки ~310-316) — там `id` корректно означает id товара, отправляемый в Stripe, не строку корзины.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: только известная pre-existing ошибка (см. Task 1, Step 2) и ожидаемые ошибки в `app/admin/orders/page.tsx` (фиксится в Task 9)

- [ ] **Step 5: Запустить тесты корзины**

Run: `npx vitest run lib/cart-store.test.ts`
Expected: PASS — 8 tests passed (без регрессий)

- [ ] **Step 6: Commit**

```bash
git add components/CartDrawer.tsx app/cart/page.tsx app/checkout/page.tsx
git commit -m "fix(cart): use lineKey (not product id) for cart row identity"
```

---

### Task 9: Заказы — захват варианта, отображение и редактирование в админке

**Files:**
- Modify: `app/checkout/page.tsx` (только подтверждение, без изменений кода)
- Modify: `app/admin/orders/page.tsx`

**Interfaces:**
- Consumes: `CartItem.lineKey`/`selectedVariants`/`variantLabel` (Task 4)

**Важно (зафиксировано заранее, на основе опыта прошлой реализации этой же фичи):** редактор заказа в админке (`editUpdateQty`/`editAddProduct`/удаление позиции) должен матчить существующие позиции по `lineKey`, а не по `id` товара — иначе у заказа с двумя разными вариантами одного товара изменение количества одной позиции изменит обе, а удаление одной удалит обе сразу. Это явно входит в эту задачу, не отдельным фиксом.

- [ ] **Step 1: `app/checkout/page.tsx` — подтвердить, без изменений**

`variantLabel` уже есть на `CartItem` (Task 4) и уже течёт в `order.items` через существующий spread `items: checkoutItems.map((item) => ({ ...item, price: ... }))` (строки ~255-258). Прочитать этот блок и убедиться, что spread не урезает поля явным списком — если урезает, остановиться и сообщить, это будет признаком плана, написанного против другой версии файла. Никаких изменений в этот файл в рамках этой задачи не вносится.

- [ ] **Step 2: `app/admin/orders/page.tsx` — типы и состояние редактора**

Заменить тип `EditItem` (строка 59):

```diff
-type EditItem = { id: string; title: string; price: number; quantity: number; image?: string }
+type EditItem = { id: string; lineKey: string; title: string; price: number; quantity: number; image?: string; variantLabel?: string }
```

В `startEdit` (строка ~265), заменить маппинг:

```diff
-    setEditItems(order.items.map((i) => ({ id: i.id, title: i.title, price: i.price, quantity: i.quantity, image: i.image })))
+    setEditItems(order.items.map((i) => ({ id: i.id, lineKey: i.lineKey, title: i.title, price: i.price, quantity: i.quantity, image: i.image, variantLabel: i.variantLabel })))
```

- [ ] **Step 3: Идентичность строк редактора — `lineKey`, не `id`**

`editUpdateQty` (строки ~318-324):

```diff
-  const editUpdateQty = (itemId: string, qty: number) => {
+  const editUpdateQty = (lineKey: string, qty: number) => {
     if (qty <= 0) {
-      setEditItems((prev) => prev.filter((i) => i.id !== itemId))
+      setEditItems((prev) => prev.filter((i) => i.lineKey !== lineKey))
     } else {
-      setEditItems((prev) => prev.map((i) => i.id === itemId ? { ...i, quantity: qty } : i))
+      setEditItems((prev) => prev.map((i) => i.lineKey === lineKey ? { ...i, quantity: qty } : i))
     }
   }
```

`editAddProduct` (строки ~326-333) — добавление товара из каталога-поиска у нового товара (без выбранных вариантов, как и раньше) корректно дедуплицируется по `id` товара (это поиск по каталогу, не идентичность строки заказа), но новая строка должна получить `lineKey`:

```diff
   const editAddProduct = (p: CatalogProduct) => {
     setEditItems((prev) => {
-      const existing = prev.find((i) => i.id === p.id)
-      if (existing) return prev.map((i) => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i)
-      return [...prev, { id: p.id, title: p.title, price: p.price, quantity: 1, image: p.image }]
+      const existing = prev.find((i) => i.lineKey === p.id)
+      if (existing) return prev.map((i) => i.lineKey === p.id ? { ...i, quantity: i.quantity + 1 } : i)
+      return [...prev, { id: p.id, lineKey: p.id, title: p.title, price: p.price, quantity: 1, image: p.image }]
     })
     setEditProductSearch('')
   }
```

(`p.id` как `lineKey` для добавленной из каталога позиции — корректно, т.к. у неё нет вариантов, ровно как `buildLineKey(id)` без вариантов)

В JSX-списке позиций редактора (строки ~725-737), заменить `key`/обработчики и добавить отображение `variantLabel`:

```diff
                           {editItems.map((item) => (
-                            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
+                            <div key={item.lineKey} className="flex items-center gap-3 px-3 py-2.5">
                               {item.image && <img src={item.image} alt="" className="w-9 h-9 rounded object-cover shrink-0" />}
-                              <p className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 truncate">{item.title}</p>
+                              <div className="flex-1 min-w-0">
+                                <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{item.title}</p>
+                                {item.variantLabel && (
+                                  <p className="text-xs text-gray-400 truncate">{item.variantLabel}</p>
+                                )}
+                              </div>
                               <span className="text-xs text-gray-400 shrink-0">€{item.price.toFixed(2)}</span>
                               <div className="flex items-center gap-1 shrink-0">
-                                <button type="button" onClick={() => editUpdateQty(item.id, item.quantity - 1)} className="h-6 w-6 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-base leading-none">−</button>
+                                <button type="button" onClick={() => editUpdateQty(item.lineKey, item.quantity - 1)} className="h-6 w-6 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-base leading-none">−</button>
                                 <span className="w-7 text-center text-sm tabular-nums">{item.quantity}</span>
-                                <button type="button" onClick={() => editUpdateQty(item.id, item.quantity + 1)} className="h-6 w-6 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-base leading-none">+</button>
+                                <button type="button" onClick={() => editUpdateQty(item.lineKey, item.quantity + 1)} className="h-6 w-6 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-base leading-none">+</button>
                               </div>
                               <span className="text-sm font-medium text-foreground w-16 text-right tabular-nums shrink-0">€{(item.price * item.quantity).toFixed(2)}</span>
-                              <button type="button" onClick={() => editUpdateQty(item.id, 0)} className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none shrink-0">×</button>
+                              <button type="button" onClick={() => editUpdateQty(item.lineKey, 0)} className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none shrink-0">×</button>
                             </div>
                           ))}
```

- [ ] **Step 4: Отображение варианта в read-only списке "Состав заказа"**

Строки ~850-869:

```diff
                       {order.items.map((item) => (
-                        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
+                        <div key={item.lineKey} className="flex items-center gap-3 px-3 py-2.5">
                           {item.image && (
                             <img
                               src={item.image}
                               alt={item.title}
                               className="w-10 h-10 object-cover rounded-md shrink-0"
                             />
                           )}
-                          <p className="flex-1 min-w-0 text-sm text-foreground truncate">{item.title}</p>
+                          <div className="flex-1 min-w-0">
+                            <p className="text-sm text-foreground truncate">{item.title}</p>
+                            {item.variantLabel && (
+                              <p className="text-xs text-muted-foreground truncate">{item.variantLabel}</p>
+                            )}
+                          </div>
                           <div className="text-right shrink-0">
```

- [ ] **Step 5: Печать заказов — добавить вариант, эскейп уже есть**

В `printSelected` (строки ~209-219) — `escapeHtml` уже существует в текущем коде. Добавить `item.variantLabel` в строку позиции, тоже через `escapeHtml`:

```diff
       const items = order.items.map((item) =>
         `<div style="display:flex;justify-content:space-between;font-size:12px;margin:3px 0">
-          <span>${escapeHtml(item.title)} × ${item.quantity}</span>
+          <span>${escapeHtml(item.title)}${item.variantLabel ? ` <span style="color:#6b7280">(${escapeHtml(item.variantLabel)})</span>` : ''} × ${item.quantity}</span>
           <span>${formatEuro(item.price * item.quantity, locale)}</span>
         </div>`
       ).join('')
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: только известная pre-existing ошибка (см. Task 1, Step 2)

- [ ] **Step 7: Запустить полный набор тестов**

Run: `npx vitest run`
Expected: все тесты проходят кроме известного pre-existing `lib/search.test.ts` (autocomplete brand relevance) — он не связан ни с одной задачей этого плана

- [ ] **Step 8: Commit**

```bash
git add app/admin/orders/page.tsx
git commit -m "feat(admin): show and edit selected product variant on orders by lineKey"
```

---

### Task 10: Админка — редактирование `variantGroups` через `technicalSpecs`

**Files:**
- Modify: `components/admin/products/productFormSchema.ts`
- Create: `components/admin/products/ProductVariantGroupsFields.tsx`
- Modify: `components/admin/products/AddProductForm.tsx`
- Modify: `lib/product-form-mapping.ts`
- Test: `lib/product-form-mapping.test.ts` (создать)

**Interfaces:**
- Consumes: `VariantGroup` (Task 1), `getVariantGroups` (Task 2), шаблон `useFieldArray` из `ProductTechSpecsFields.tsx`
- Produces: админ может добавлять/редактировать/удалять группы вариантов и опции у товара. На диске данные хранятся как `technicalSpecs.__variantGroupsJson`, в форме — отдельное поле `variantGroups`, видимое отдельным UI-блоком, не пересекающееся с обычным редактором характеристик.

- [ ] **Step 1: Схема — `productFormSchema.ts`**

Добавить в `addProductSchema`, сразу после `technicalSpecs` (строка 51):

```diff
   // Технические характеристики (ключ-значение, как в Product.technicalSpecs)
   technicalSpecs: z.array(z.object({ key: z.string(), value: z.string() })),

+  // Варианты товара (цвет/комплектация) — на диске хранятся внутри technicalSpecs.__variantGroupsJson,
+  // в форме отдельное поле, см. lib/product-form-mapping.ts
+  variantGroups: z.array(z.object({
+    name: z.string().min(1, 'Название группы обязательно'),
+    required: z.boolean(),
+    options: z.array(z.object({
+      value: z.string().min(1, 'Значение обязательно'),
+      priceAdjustment: z.number().optional().catch(undefined),
+    })),
+  })),
+
   // Совместимость (как Product.compatibleEquipment)
   compatibleEquipment: z.array(z.string()),
```

(`.catch(undefined)` вместо `.optional()` — у `react-hook-form` с `valueAsNumber: true` пустое поле даёт `NaN`, а не `undefined`; голый `z.number().optional()` не считает `NaN` отсутствующим значением и блокирует сохранение всей формы. `.catch(undefined)` ловит и `NaN`, и реальный `undefined`, отдавая `undefined` в обоих случаях — поведение, проверенное на этой версии zod в этом проекте.)

- [ ] **Step 2: Дефолтные значения и встраивание в форму — `AddProductForm.tsx`**

В `emptyDefaults` (строка ~68), сразу после `technicalSpecs: [],`:

```diff
     badges: [],
     technicalSpecs: [],
+    variantGroups: [],
     compatibleEquipment: [],
```

В импортах (строка ~21):

```diff
 import ProductTechSpecsFields from './ProductTechSpecsFields';
+import ProductVariantGroupsFields from './ProductVariantGroupsFields';
 import ProductCertificatesFields from './ProductCertificatesFields';
```

В JSX (строка ~211), сразу после `<ProductTechSpecsFields />`:

```diff
                             <ProductTechSpecsFields />
+                            <ProductVariantGroupsFields />
                             <ProductCertificatesFields />
```

- [ ] **Step 3: Новый компонент — `ProductVariantGroupsFields.tsx`**

Создать `components/admin/products/ProductVariantGroupsFields.tsx`, по образцу `useFieldArray` из `ProductTechSpecsFields.tsx` (вложенный: группы, и массив опций внутри каждой группы):

```tsx
'use client';

import React from 'react';
import { useFormContext, useFieldArray, Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AddProductFormValues } from './productFormSchema';

const VariantOptionsFields: React.FC<{ groupIndex: number }> = ({ groupIndex }) => {
    const { control, register } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: `variantGroups.${groupIndex}.options`,
    });

    return (
        <div className="flex flex-col gap-2 mt-2 pl-4 border-l border-border">
            {fields.map((field, idx) => (
                <div key={field.id} className="flex gap-2">
                    <Input
                        placeholder="Значение (напр.: A-11)"
                        {...register(`variantGroups.${groupIndex}.options.${idx}.value`)}
                    />
                    <Input
                        type="number"
                        step="0.01"
                        placeholder="Надбавка к цене, €"
                        {...register(`variantGroups.${groupIndex}.options.${idx}.priceAdjustment`, { valueAsNumber: true })}
                    />
                    <Button type="button" variant="destructive" size="sm" onClick={() => remove(idx)}>
                        ✕
                    </Button>
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => append({ value: '', priceAdjustment: undefined })}
            >
                + Добавить значение
            </Button>
        </div>
    );
};

const ProductVariantGroupsFields: React.FC = () => {
    const { control, register } = useFormContext<AddProductFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: 'variantGroups' });

    return (
        <div className="add-product__section add-product__section--variants">
            <h2 className="add-product__section-title">Варианты (цвет / комплектация)</h2>
            <div className="flex flex-col gap-4">
                {fields.map((field, idx) => (
                    <div key={field.id} className="border border-border rounded-lg p-3">
                        <div className="flex gap-2 items-center">
                            <Input
                                placeholder="Название группы (напр.: Krāsu numurs)"
                                {...register(`variantGroups.${idx}.name`)}
                            />
                            <label className="flex items-center gap-2 cursor-pointer text-sm whitespace-nowrap">
                                <Controller
                                    control={control}
                                    name={`variantGroups.${idx}.required`}
                                    render={({ field: checkboxField }) => (
                                        <Checkbox
                                            checked={checkboxField.value}
                                            onCheckedChange={checkboxField.onChange}
                                        />
                                    )}
                                />
                                Обязательно
                            </label>
                            <Button type="button" variant="destructive" size="sm" onClick={() => remove(idx)}>
                                ✕ Удалить группу
                            </Button>
                        </div>
                        <VariantOptionsFields groupIndex={idx} />
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => append({ name: '', required: false, options: [] })}
                >
                    + Добавить группу вариантов
                </Button>
            </div>
        </div>
    );
};

export default ProductVariantGroupsFields;
```

- [ ] **Step 4: Маппинг — `lib/product-form-mapping.ts` (ключевая часть v2)**

В импортах (строка 1), добавить:

```diff
 import type { Product } from '@/data/products';
 import type { AddProductFormValues } from '@/components/admin/products/productFormSchema';
+import { getVariantGroups } from '@/lib/product-variants';
```

В `mapProductToFormValues`, заменить блок `technicalSpecs` (строки 36-39):

```diff
-        technicalSpecs: Object.entries(product.technicalSpecs ?? {}).map(([key, value]) => ({
-            key,
-            value,
-        })),
+        technicalSpecs: Object.entries(product.technicalSpecs ?? {})
+            .filter(([key]) => key !== '__variantGroupsJson')
+            .map(([key, value]) => ({ key, value })),
+        variantGroups: getVariantGroups(product) ?? [],
         compatibleEquipment: product.compatibleEquipment ?? [],
```

В `mapFormValuesToProductPatch`, заменить вычисление `techSpecs` (строки 86-91) и строку возврата `technicalSpecs` (строка 117):

```diff
     const techSpecs = values.technicalSpecs
         .filter((s) => s.key.trim())
         .reduce<Record<string, string>>((acc, { key, value }) => {
             acc[key] = value;
             return acc;
         }, {});
+    if (values.variantGroups.length > 0) {
+        techSpecs['__variantGroupsJson'] = JSON.stringify(values.variantGroups);
+    }
```

```diff
-        technicalSpecs: Object.keys(techSpecs).length > 0 ? techSpecs : undefined,
+        technicalSpecs: Object.keys(techSpecs).length > 0 ? techSpecs : undefined,
```

(сама строка возврата не меняется текстуально — она уже корректно подхватит добавленный выше ключ, раз `techSpecs` теперь может содержать `__variantGroupsJson`)

- [ ] **Step 5: Написать тест round-trip**

Создать `lib/product-form-mapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapProductToFormValues, mapFormValuesToProductPatch } from './product-form-mapping'
import type { Product, VariantGroup } from '@/data/products'

const baseProduct: Product = {
  id: 'p1',
  title: 'Test',
  brand: 'B',
  price: 10,
  rating: 0,
  category: 'hair',
  stock: 5,
}

describe('variantGroups round-trip through technicalSpecs', () => {
  it('mapProductToFormValues extracts variantGroups and hides the reserved key from technicalSpecs', () => {
    const groups: VariantGroup[] = [
      { name: 'Krāsu numurs', required: true, options: [{ value: 'A-11' }] },
    ]
    const product: Product = {
      ...baseProduct,
      technicalSpecs: { 'Объём': '50 мл', __variantGroupsJson: JSON.stringify(groups) },
    }
    const values = mapProductToFormValues(product)
    expect(values.variantGroups).toEqual(groups)
    expect(values.technicalSpecs).toEqual([{ key: 'Объём', value: '50 мл' }])
  })

  it('mapFormValuesToProductPatch serializes variantGroups back into technicalSpecs', () => {
    const groups: VariantGroup[] = [
      { name: 'Izmērs', required: false, options: [{ value: 'M' }, { value: 'L', priceAdjustment: 2 }] },
    ]
    const values = mapProductToFormValues({ ...baseProduct, technicalSpecs: { 'Тип': 'крем' } })
    values.variantGroups = groups
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({
      'Тип': 'крем',
      __variantGroupsJson: JSON.stringify(groups),
    })
  })

  it('does not create __variantGroupsJson when there are no variant groups', () => {
    const values = mapProductToFormValues({ ...baseProduct, technicalSpecs: { 'Тип': 'крем' } })
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({ 'Тип': 'крем' })
    expect(patch.technicalSpecs).not.toHaveProperty('__variantGroupsJson')
  })

  it('omits technicalSpecs entirely when there are neither specs nor variant groups', () => {
    const values = mapProductToFormValues({ ...baseProduct, technicalSpecs: undefined })
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toBeUndefined()
  })
})
```

- [ ] **Step 6: Запустить тест**

Run: `npx vitest run lib/product-form-mapping.test.ts`
Expected: PASS — 4 tests passed

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: только известная pre-existing ошибка (см. Task 1, Step 2)

- [ ] **Step 8: Commit**

```bash
git add components/admin/products/productFormSchema.ts components/admin/products/ProductVariantGroupsFields.tsx components/admin/products/AddProductForm.tsx lib/product-form-mapping.ts lib/product-form-mapping.test.ts
git commit -m "feat(admin): edit product variant groups, stored inside technicalSpecs"
```

---

### Task 11: Расширить SQL Server экспорт данными атрибутов

**Files:**
- Modify: `scripts/export-mssql-to-json.ps1`

**Interfaces:**
- Produces: `C:/Temp/migration/product_attributes.json` с строками `{ productId, attrName, isRequired, value, priceAdjustment, displayOrder }` — потребляется Task 12.

- [ ] **Step 1: Добавить запрос экспорта**

В `scripts/export-mssql-to-json.ps1`, сразу после блока `# ── Product images ──` (после строки 76, перед `# ── Users ──`):

```powershell
# ── Product variant attributes (color/size dropdowns, lost in the first migration pass) ──
Export-Query "product_attributes" @"
SELECT
  pam.ProductId      AS productId,
  pa.Name            AS attrName,
  pam.IsRequired     AS isRequired,
  pav.Name           AS value,
  pav.PriceAdjustment AS priceAdjustment,
  pav.DisplayOrder   AS displayOrder
FROM Product_ProductAttribute_Mapping pam
JOIN ProductAttribute pa ON pa.Id = pam.ProductAttributeId
JOIN ProductAttributeValue pav ON pav.ProductAttributeMappingId = pam.Id
JOIN Product p ON p.Id = pam.ProductId AND p.Deleted = 0
ORDER BY pam.ProductId, pam.Id, pav.DisplayOrder
"@
```

- [ ] **Step 2: Запустить экспорт**

Run: `powershell scripts/export-mssql-to-json.ps1`
Expected: среди строк вывода — `product_attributes... OK (<N> KB)`; проверить файл:

Run: `ls -la /c/Temp/migration/product_attributes.json` (или `Get-ChildItem C:\Temp\migration\product_attributes.json` в PowerShell)
Expected: файл существует, размер не нулевой

- [ ] **Step 3: Проверить количество строк**

Run (узел `.trim()` перед `JSON.parse` корректно убирает UTF-8 BOM, который `sqlcmd -f 65001` пишет в начало файла — проверено эмпирически):

```bash
node -e "
const raw = require('fs').readFileSync('C:/Temp/migration/product_attributes.json', 'utf8').trim()
const noWraps = raw.replace(/\r\n|\r|\n/g, '')
const parsed = JSON.parse(noWraps)
const rows = parsed.data ?? parsed
console.log('rows:', rows.length, 'distinct products:', new Set(rows.map(r => r.productId)).size)
"
```
Expected: `distinct products: 183` (НЕ 184 — товар id 12660 soft-deleted в nopCommerce с 2022, без живой замены в Neon; исключение `p.Deleted = 0` в запросе выше — корректный, ожидаемый результат)

- [ ] **Step 4: Commit**

```bash
git add scripts/export-mssql-to-json.ps1
git commit -m "feat(migration): export product attribute/variant data from nopCommerce"
```

---

### Task 12: Бэкафилл `technicalSpecs.__variantGroupsJson` для 183 товаров

**Files:**
- Create: `scripts/migrate-product-variants.ts`

**Interfaces:**
- Consumes: `C:/Temp/migration/product_attributes.json` (Task 11), `VariantGroup` (Task 1)
- Produces: 183 строки в живой Neon `Product.technicalSpecs` получают ключ `__variantGroupsJson`.

**Критично:** это пишет в живую базу Neon — единственный экземпляр БД проекта на сегодня. Запрос — `UPDATE ... SET technicalSpecs = COALESCE(technicalSpecs, '{}'::jsonb) || jsonb_build_object(...)` — **merge**, не перезапись поля целиком, чтобы не потерять уже существующие у товара характеристики.

- [ ] **Step 1: Реализовать скрипт**

Создать `scripts/migrate-product-variants.ts`:

```ts
/**
 * One-off backfill: restores variant data (color/size dropdowns) dropped
 * during the original nopCommerce -> Neon migration. Stored inside the
 * existing Product.technicalSpecs field (no schema change, no Prisma migration).
 *
 * Run scripts/export-mssql-to-json.ps1 first (produces product_attributes.json).
 * Then: npx tsx --env-file=.env.local scripts/migrate-product-variants.ts
 */

import { readFileSync } from 'fs'
import { Pool } from 'pg'
import type { VariantGroup } from '../data/products'

const DATA = 'C:/Temp/migration'

type AttrRow = {
  productId: number
  attrName: string
  isRequired: boolean | number
  value: string
  priceAdjustment: number | null
  displayOrder: number
}

function load(): AttrRow[] {
  const raw = readFileSync(`${DATA}/product_attributes.json`, 'utf8').trim()
  const noWraps = raw.replace(/\r\n|\r|\n/g, '')
  const parsed = JSON.parse(noWraps)
  return (parsed.data ?? parsed) as AttrRow[]
}

function groupByProduct(rows: AttrRow[]): Map<string, VariantGroup[]> {
  const byProduct = new Map<string, Map<string, VariantGroup>>()
  for (const r of rows) {
    const pid = String(r.productId)
    if (!byProduct.has(pid)) byProduct.set(pid, new Map())
    const groups = byProduct.get(pid)!
    if (!groups.has(r.attrName)) {
      groups.set(r.attrName, { name: r.attrName, required: Boolean(r.isRequired), options: [] })
    }
    const option: { value: string; priceAdjustment?: number } = { value: r.value }
    if (r.priceAdjustment) option.priceAdjustment = Number(r.priceAdjustment)
    groups.get(r.attrName)!.options.push(option)
  }
  const result = new Map<string, VariantGroup[]>()
  for (const [pid, groups] of byProduct) {
    result.set(pid, Array.from(groups.values()))
  }
  return result
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })

async function main() {
  const rows = load()
  const grouped = groupByProduct(rows)
  console.log(`Backfilling variantGroups for ${grouped.size} products (into technicalSpecs.__variantGroupsJson)...`)

  let updated = 0
  let notFound = 0
  for (const [productId, variantGroups] of grouped) {
    const result = await pool.query(
      `UPDATE "Product"
       SET "technicalSpecs" = COALESCE("technicalSpecs", '{}'::jsonb) || jsonb_build_object('__variantGroupsJson', $1::text)
       WHERE id = $2`,
      [JSON.stringify(variantGroups), productId]
    )
    if (result.rowCount && result.rowCount > 0) updated++
    else notFound++
  }
  console.log(`✓ updated ${updated}, not found in Neon ${notFound}`)
}

main().finally(() => pool.end())
```

- [ ] **Step 2: Контрольный прогон перед записью**

Run:
```bash
npx tsx --env-file=.env.local -e "
const raw = require('fs').readFileSync('C:/Temp/migration/product_attributes.json', 'utf8').trim().replace(/\r\n|\r|\n/g, '')
const rows = JSON.parse(raw).data ?? JSON.parse(raw)
console.log('total rows', rows.length, 'distinct products', new Set(rows.map((r) => r.productId)).size)
"
```
Expected: `total rows <N> distinct products 183` (совпадает с Task 11, Step 3)

- [ ] **Step 3: Запустить бэкафилл**

Run: `npx tsx --env-file=.env.local scripts/migrate-product-variants.ts`
Expected: `✓ updated 183, not found in Neon 0`

Если `notFound` больше 0 — остановиться и разобраться: значит id товара из бэкапа SQL Server больше не существует в Neon (помимо уже известного и исключённого 12660). Не продолжать без объяснения несовпадения.

- [ ] **Step 4: Проверить в Neon**

Run:
```bash
npx tsx --env-file=.env.local -e "
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
pool.query(\`SELECT count(*) FROM \"Product\" WHERE \"technicalSpecs\"->>'__variantGroupsJson' IS NOT NULL\`)
  .then((r) => { console.log(r.rows); return pool.end() })
"
```
Expected: `[ { count: '183' } ]`

- [ ] **Step 5: Точечная проверка одного активного товара**

Run:
```bash
npx tsx --env-file=.env.local -e "
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
pool.query(\`SELECT id, title, \"isActive\", \"technicalSpecs\"->>'__variantGroupsJson' AS variants FROM \"Product\" WHERE \"technicalSpecs\"->>'__variantGroupsJson' IS NOT NULL AND \"isActive\" = true LIMIT 1\`)
  .then((r) => { console.log(JSON.stringify(r.rows[0], null, 2)); return pool.end() })
"
```
Expected: реальный товар, `variants` — валидная JSON-строка вида `[{"name":...,"required":...,"options":[{"value":...,"priceAdjustment":...}]}]`. Открыть `/product/<этот id>` в запущенном dev-сервере и убедиться, что дропдаун(ы) рендерятся.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-product-variants.ts
git commit -m "feat(migration): backfill variant data for 183 products into technicalSpecs"
```

---

## Post-implementation checklist

- [ ] Полный набор тестов: `npx vitest run` — все проходят, кроме известного pre-existing `lib/search.test.ts`
- [ ] Полный typecheck: `npx tsc --noEmit -p tsconfig.json` — только известная pre-existing ошибка `app/api/orders/route.test.ts`
- [ ] `npm run build` (или `npx next build --webpack`, если `prisma migrate deploy` в `npm run build` падает на cold-start Neon — это окружение, не код) — успешно
- [ ] Ручная проверка: товар без `variantGroups` — страница рендерится точно как раньше (нет селектора, нет регрессий)
- [ ] Ручная проверка: товар с обязательной группой — кнопка "В корзину" заблокирована до выбора всех обязательных групп, цена меняется при выборе опции с `priceAdjustment`
- [ ] Ручная проверка: карточка каталога для товара с обязательной группой — клик ведёт на страницу товара, а не добавляет в корзину без выбора
- [ ] Ручная проверка: два варианта одного товара — две строки корзины, независимое удаление/изменение количества, переживают частичный чекаут и перезагрузку страницы (persist)
- [ ] Ручная проверка: админка — добавить группу вариантов товару без `priceAdjustment` (пустое поле) и сохранить — форма сохраняется без ошибки валидации
- [ ] Ручная проверка: общая таблица "Технические характеристики" на странице товара — не показывает `__variantGroupsJson` как строку

