# Product Variant Options (цвет/комплектация) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore product variant selection (color/size dropdowns lost during the nopCommerce→Neon migration) end-to-end: DB field, storefront selector, cart line identity, order capture, admin editing, and a one-time data backfill from the SQL Server backup.

**Architecture:** Additive `Product.variantGroups: Json?` column (safe under ERP sync, which matches on `externalId`). A controlled selector in `ProductInfo` lifts `selectedVariants` state, recalculates displayed price, and feeds `AddToCartButton`. `lib/cart-store.ts` switches cart-row identity from plain `id` to a composite `lineKey` so two variants of the same product become two rows. A one-off script backfills 184 products from the still-live SQL Server backup (`hairshop_p34s`).

**Tech Stack:** Next.js (App Router), TypeScript, Prisma 7 + `@prisma/adapter-pg` (Neon), Zustand (cart-store), React Hook Form + Zod (admin form), Vitest, `tsx` for one-off scripts, `sqlcmd` for the SQL Server export.

## Global Constraints

- Additive only: no destructive Prisma migrations (per project rule — only `ADD COLUMN`, never `DROP`/rename existing columns).
- ERP sync (`lib/sync/upsert-products.ts`) matches `ON CONFLICT ("externalId")` — migrated legacy rows have `externalId = null`, so they're untouched by sync. Do not change that matching key.
- Variant `value` fields are opaque codes from the source data ("A-11", "111", "WHITE") — no hex/swatch mapping, no translation of group names.
- `ProductAttributeCombination` in the source DB is empty — variants share the product's stock; do not add per-variant stock/SKU.
- All new UI strings go through `data/translations.ts` (ru/en/lv) via `t()`, never hardcoded.
- Run `npx vitest run <file>` after every test-bearing task; do not move on with red tests.

---

### Task 1: Prisma schema — add `variantGroups` column

**Files:**
- Modify: `prisma/schema.prisma` (Product model, near `technicalSpecs`)
- Create: `prisma/migrations/20260624120000_add_product_variant_groups/migration.sql`

**Interfaces:**
- Produces: `Product.variantGroups` (Prisma `Json?` / Postgres `JSONB`, nullable) — consumed by Task 4 (`mapDbToProduct`/`mapProductToDbCreate`) and Task 13 (migration script).

- [ ] **Step 1: Add the field to the schema**

In `prisma/schema.prisma`, inside `model Product`, add a line right after `technicalSpecs Json?` (around line 245):

```prisma
  technicalSpecs      Json?
  variantGroups       Json?
  bulkPricingTiers    Json?
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260624120000_add_product_variant_groups/migration.sql`:

```sql
-- Restores variant data (color/size dropdowns) lost during the nopCommerce migration.
-- Additive only — nullable JSONB column.
ALTER TABLE "Product" ADD COLUMN "variantGroups" JSONB;
```

- [ ] **Step 3: Generate the Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client ... to .\generated\prisma`

- [ ] **Step 4: Apply the migration to Neon**

Run: `npx prisma migrate deploy`
Expected: output lists `20260624120000_add_product_variant_groups` as applied, ends with "All migrations have been successfully applied."

- [ ] **Step 5: Verify the column exists**

Run:
```bash
npx tsx -e "
import { config } from 'dotenv'; config({ path: '.env.local' });
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`SELECT column_name FROM information_schema.columns WHERE table_name='Product' AND column_name='variantGroups'\`)
  .then(r => { console.log(r.rows); return pool.end(); });
"
```
Expected: `[ { column_name: 'variantGroups' } ]`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260624120000_add_product_variant_groups
git commit -m "feat(db): add Product.variantGroups column"
```

---

### Task 2: TypeScript types for variants

**Files:**
- Modify: `data/products.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `VariantOption { value: string; priceAdjustment?: number }`, `VariantGroup { name: string; required: boolean; options: VariantOption[] }`, `SelectedVariant { groupName: string; value: string; priceAdjustment?: number }`, `Product.variantGroups?: VariantGroup[]` — consumed by every later task.

- [ ] **Step 1: Add the types and the field**

In `data/products.ts`, after the existing type aliases (after line 3, before `export interface Product`):

```ts
export type BadgeType = 'sale' | 'bestseller' | 'new';
export type CategoryType = 'hair' | 'face' | 'body' | 'nails' | 'equipment' | 'new';

export interface VariantOption {
  value: string // код как в исходнике: "A-11", "111", "WHITE" — не переводим, не маппим на hex
  priceAdjustment?: number
}

export interface VariantGroup {
  name: string // как в исходнике: "Krāsu numurs", "Izmērs"...
  required: boolean
  options: VariantOption[]
}

export interface SelectedVariant {
  groupName: string
  value: string
  priceAdjustment?: number
}

export interface Product {
```

Then inside `Product`, right after the `technicalSpecs?: Record<string, string>` line (line 37):

```ts
  technicalSpecs?: Record<string, string> // Technical characteristics
  variantGroups?: VariantGroup[] // Цвет/комплектация — выбор перед добавлением в корзину
  certificates?: string[] // URLs to certificate PDFs
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (file compiles; nothing else references the new types yet).

- [ ] **Step 3: Commit**

```bash
git add data/products.ts
git commit -m "feat(types): add VariantGroup/VariantOption/SelectedVariant types"
```

---

### Task 3: Pure variant-logic helpers (`lib/product-variants.ts`)

**Files:**
- Create: `lib/product-variants.ts`
- Create: `lib/product-variants.test.ts`

**Interfaces:**
- Consumes: `VariantGroup`, `SelectedVariant` from `@/data/products` (Task 2)
- Produces: `getMissingRequiredGroups(groups, selected): VariantGroup[]`, `sumPriceAdjustment(selected): number` — consumed by Task 5 (cart-store), Task 8 (AddToCartButton), Task 7 (ProductInfo price calc).

- [ ] **Step 1: Write the failing tests**

Create `lib/product-variants.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { VariantGroup, SelectedVariant } from '@/data/products'
import { getMissingRequiredGroups, sumPriceAdjustment } from './product-variants'

describe('getMissingRequiredGroups', () => {
  const groups: VariantGroup[] = [
    { name: 'Krāsu numurs', required: true, options: [{ value: 'A-11' }] },
    { name: 'Izmērs', required: false, options: [{ value: 'M' }] },
  ]

  it('returns required groups with no matching selection', () => {
    const result = getMissingRequiredGroups(groups, [])
    expect(result).toEqual([groups[0]])
  })

  it('returns empty when the required group is selected', () => {
    const selected: SelectedVariant[] = [{ groupName: 'Krāsu numurs', value: 'A-11' }]
    expect(getMissingRequiredGroups(groups, selected)).toEqual([])
  })

  it('ignores optional groups entirely', () => {
    expect(getMissingRequiredGroups(groups, []).some(g => g.name === 'Izmērs')).toBe(false)
  })

  it('returns empty for undefined groups', () => {
    expect(getMissingRequiredGroups(undefined, [])).toEqual([])
  })
})

describe('sumPriceAdjustment', () => {
  it('sums priceAdjustment across selections', () => {
    const selected: SelectedVariant[] = [
      { groupName: 'A', value: '1', priceAdjustment: 5 },
      { groupName: 'B', value: '2', priceAdjustment: 2.5 },
    ]
    expect(sumPriceAdjustment(selected)).toBe(7.5)
  })

  it('treats missing priceAdjustment as 0', () => {
    const selected: SelectedVariant[] = [{ groupName: 'A', value: '1' }]
    expect(sumPriceAdjustment(selected)).toBe(0)
  })

  it('returns 0 for an empty array', () => {
    expect(sumPriceAdjustment([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/product-variants.test.ts`
Expected: FAIL — `Cannot find module './product-variants'`

- [ ] **Step 3: Implement**

Create `lib/product-variants.ts`:

```ts
import type { VariantGroup, SelectedVariant } from '@/data/products'

export function getMissingRequiredGroups(
  groups: VariantGroup[] | undefined,
  selected: SelectedVariant[]
): VariantGroup[] {
  if (!groups) return []
  return groups.filter(
    (group) => group.required && !selected.some((s) => s.groupName === group.name)
  )
}

export function sumPriceAdjustment(selected: SelectedVariant[]): number {
  return selected.reduce((sum, v) => sum + (v.priceAdjustment ?? 0), 0)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/product-variants.test.ts`
Expected: PASS — 7 tests passed

- [ ] **Step 5: Commit**

```bash
git add lib/product-variants.ts lib/product-variants.test.ts
git commit -m "feat: add pure variant validation/price helpers"
```

---

### Task 4: Wire `variantGroups` through `lib/product-overrides-store.ts`

**Files:**
- Modify: `lib/product-overrides-store.ts`
- Create: `lib/product-overrides-store.test.ts`

**Interfaces:**
- Consumes: `Product.variantGroups` (Task 2), Prisma `Product.variantGroups` (Task 1)
- Produces: `mapDbToProduct`/`mapProductToDbCreate` round-trip `variantGroups`; `upsertProductOverride` accepts `variantGroups` patches — consumed by Task 11 (admin form save).

- [ ] **Step 1: Write the failing test**

Create `lib/product-overrides-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapDbToProduct } from './product-overrides-store'
import type { Product as PrismaProduct } from '@/generated/prisma/client'

function makeDbProduct(overrides: Partial<PrismaProduct> = {}): PrismaProduct {
  return {
    id: 'p1', title: 'Test', titleKey: null, titleEn: null, titleLv: null,
    description: null, brand: 'Brand', price: 10, oldPrice: null,
    rating: 0, ratingCount: 0, reviewCount: 0, image: null, images: [],
    metaTitle: null, metaDescription: null, ogImage: null, ogAlt: null,
    badges: [], category: 'hair', stock: 5, barcode: null,
    purpose: null, purposeEn: null, purposeLv: null,
    relatedProductIds: [], oftenBoughtTogether: [], minOrderQuantities: null,
    technicalSpecs: null, variantGroups: null, bulkPricingTiers: null, demoVideo: null,
    distributorName: null, distributorAddress: null, sku: null, unitOfMeasure: null,
    certificates: [], packagingSize: null, compatibleEquipment: [],
    manufacturerName: null, manufacturerAddress: null, manufacturerEmail: null,
    distributorEmail: null, bonusRate: null,
    feature1: null, feature1En: null, feature1Lv: null,
    feature2: null, feature2En: null, feature2Lv: null,
    feature3: null, feature3En: null, feature3Lv: null,
    feature4: null, feature4En: null, feature4Lv: null,
    specVolume: null, specType: null, specCountry: null,
    isCustom: false, isDeleted: false,
    createdAt: new Date(), updatedAt: new Date(),
    externalId: null, isActive: true, lastSyncRunId: null,
    ...overrides,
  } as PrismaProduct
}

describe('mapDbToProduct — variantGroups', () => {
  it('maps null to undefined', () => {
    const product = mapDbToProduct(makeDbProduct({ variantGroups: null }))
    expect(product.variantGroups).toBeUndefined()
  })

  it('passes through a populated variantGroups array', () => {
    const groups = [{ name: 'Krāsu numurs', required: true, options: [{ value: 'A-11' }] }]
    const product = mapDbToProduct(makeDbProduct({ variantGroups: groups as unknown as PrismaProduct['variantGroups'] }))
    expect(product.variantGroups).toEqual(groups)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: FAIL — `product.variantGroups` is `undefined` in the second test (field not mapped yet), or a TS error if strict — either way, red.

- [ ] **Step 3: Implement — `mapDbToProduct`**

In `lib/product-overrides-store.ts`, inside `mapDbToProduct` (around line 47), add right after `technicalSpecs`:

```ts
    technicalSpecs: (p.technicalSpecs ?? undefined) as Record<string, string> | undefined,
    variantGroups: (p.variantGroups ?? undefined) as Product['variantGroups'],
    bulkPricingTiers: (p.bulkPricingTiers ?? undefined) as Array<{ quantity: number; pricePerUnit: number }> | undefined,
```

- [ ] **Step 4: Implement — `mapProductToDbCreate`**

In the same file, inside `mapProductToDbCreate` (around line 111), add right after `technicalSpecs`:

```ts
    technicalSpecs: p.technicalSpecs ?? null,
    variantGroups: p.variantGroups ?? null,
    bulkPricingTiers: p.bulkPricingTiers ?? null,
```

- [ ] **Step 5: Implement — `upsertProductOverride` fieldMap**

In the same file, inside the `fieldMap` object in `upsertProductOverride` (around line 244), add:

```ts
    minOrderQuantities: 'minOrderQuantities', technicalSpecs: 'technicalSpecs',
    variantGroups: 'variantGroups',
    bulkPricingTiers: 'bulkPricingTiers', demoVideo: 'demoVideo',
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run lib/product-overrides-store.test.ts`
Expected: PASS — 2 tests passed

- [ ] **Step 7: Commit**

```bash
git add lib/product-overrides-store.ts lib/product-overrides-store.test.ts
git commit -m "feat: map Product.variantGroups through the overrides store"
```

---

### Task 5: Cart line identity — `lineKey` and `selectedVariants` in `lib/cart-store.ts`

**Files:**
- Modify: `lib/cart-store.ts`
- Create: `lib/cart-store.test.ts`

**Interfaces:**
- Consumes: `SelectedVariant` (Task 2), `sumPriceAdjustment` (Task 3)
- Produces: `buildLineKey(id, selectedVariants?): string` (exported, pure), `CartItem.lineKey: string`, `CartItem.selectedVariants?: SelectedVariant[]`, `addItem(product, quantity, selectedVariants?)`, `removeItem(lineKey)`, `updateQuantity(lineKey, quantity)` — consumed by Tasks 8, 9, 10.

- [ ] **Step 1: Write the failing test**

Create `lib/cart-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildLineKey } from './cart-store'

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/cart-store.test.ts`
Expected: FAIL — `buildLineKey` is not exported

- [ ] **Step 3: Implement**

In `lib/cart-store.ts`, replace the full file content with:

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
    { name: 'cart-store' }
  )
)
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/cart-store.test.ts`
Expected: PASS — 4 tests passed

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in every file that calls `removeItem`/`updateQuantity` with a product id and in files using `CartItem` — this is expected; Tasks 9 and 10 fix them. Confirm the errors are limited to `components/CartDrawer.tsx`, `app/cart/page.tsx`, `app/checkout/page.tsx`, `app/admin/orders/page.tsx` (or no errors at all if TS doesn't catch the semantic change — in that case the call sites still need fixing per Task 9/10, just without a compiler signal).

- [ ] **Step 6: Commit**

```bash
git add lib/cart-store.ts lib/cart-store.test.ts
git commit -m "feat(cart): composite lineKey identity for variant-aware cart rows"
```

---

### Task 6: Translation keys for variant selection

**Files:**
- Modify: `data/translations.ts`

**Interfaces:**
- Produces: `t('product.selectVariant')`, `t('product.selectVariantRequired')` — consumed by Task 8.

- [ ] **Step 1: Add the RU keys**

In `data/translations.ts`, find the line `'product.addToCart': 'В корзину',` (around line 763) and add right after it:

```ts
    'product.addToCart': 'В корзину',
    'product.selectVariant': 'Выбрать вариант',
    'product.selectVariantRequired': 'Выберите',
```

- [ ] **Step 2: Add the EN keys**

Find `'product.addToCart': 'Add to Cart',` (around line 2221) and add right after it:

```ts
    'product.addToCart': 'Add to Cart',
    'product.selectVariant': 'Select option',
    'product.selectVariantRequired': 'Please select',
```

- [ ] **Step 3: Add the LV keys**

Find `'product.addToCart': 'Pievienot grozam',` (around line 4003) and add right after it:

```ts
    'product.addToCart': 'Pievienot grozam',
    'product.selectVariant': 'Izvēlēties variantu',
    'product.selectVariantRequired': 'Izvēlieties',
```

- [ ] **Step 4: Verify the existing translations test still passes**

Run: `npx vitest run data/categories.test.ts lib/search.test.ts`
Expected: PASS (these don't touch translations, but confirms nothing else broke — translations.ts has no dedicated test file currently)

- [ ] **Step 5: Commit**

```bash
git add data/translations.ts
git commit -m "feat(i18n): add variant-selection strings (ru/en/lv)"
```

---

### Task 7: `ProductVariantSelector` component

**Files:**
- Create: `components/ProductVariantSelector.tsx`

**Interfaces:**
- Consumes: `VariantGroup`, `SelectedVariant` (Task 2); shadcn `Select` (`@/components/ui/select`)
- Produces: `<ProductVariantSelector groups selected onChange />` — consumed by Task 8 (`ProductInfo.tsx`).

- [ ] **Step 1: Implement**

Create `components/ProductVariantSelector.tsx`:

```tsx
'use client'

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTranslation } from '@/lib/use-translation'
import type { VariantGroup, SelectedVariant } from '@/data/products'

interface ProductVariantSelectorProps {
  groups: VariantGroup[]
  selected: SelectedVariant[]
  onChange: (next: SelectedVariant[]) => void
}

export const ProductVariantSelector: React.FC<ProductVariantSelectorProps> = ({
  groups,
  selected,
  onChange,
}) => {
  const { t } = useTranslation()

  const handleSelect = (group: VariantGroup, value: string): void => {
    const option = group.options.find((o) => o.value === value)
    const next = selected.filter((s) => s.groupName !== group.name)
    next.push({ groupName: group.name, value, priceAdjustment: option?.priceAdjustment })
    onChange(next)
  }

  return (
    <div className="product-detail__variants mt-4 space-y-3">
      {groups.map((group) => {
        const current = selected.find((s) => s.groupName === group.name)
        return (
          <div key={group.name}>
            <label className="block text-sm font-medium mb-1 text-foreground">
              {group.name}
              {group.required && <span className="text-red-500"> *</span>}
            </label>
            <Select value={current?.value ?? ''} onValueChange={(value) => handleSelect(group, value)}>
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

Run: `npx tsc --noEmit`
Expected: no new errors (component not wired up yet, but self-contained and type-correct)

- [ ] **Step 3: Commit**

```bash
git add components/ProductVariantSelector.tsx
git commit -m "feat: add ProductVariantSelector component"
```

---

### Task 8: Wire the selector into the product page and the add-to-cart flow

**Files:**
- Modify: `components/ProductInfo.tsx`
- Modify: `components/ProductActions.tsx`
- Modify: `components/AddToCartButton.tsx`

**Interfaces:**
- Consumes: `ProductVariantSelector` (Task 7), `getMissingRequiredGroups`, `sumPriceAdjustment` (Task 3), `SelectedVariant` (Task 2)
- Produces: `ProductActions` now accepts `selectedVariants?: SelectedVariant[]`; `AddToCartButton` now accepts `selectedVariants?: SelectedVariant[]` and falls back to a "select option" link when used without a selector (catalog cards) and the product has a required group.

- [ ] **Step 1: `ProductInfo.tsx` — own the selection state and adjusted price**

Replace the full content of `components/ProductInfo.tsx`:

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
import { sumPriceAdjustment } from '@/lib/product-variants';

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
            {product.variantGroups && product.variantGroups.length > 0 && (
                <ProductVariantSelector
                    groups={product.variantGroups}
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

- [ ] **Step 2: `ProductActions.tsx` — pass `selectedVariants` through**

Replace the full content of `components/ProductActions.tsx`:

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

- [ ] **Step 3: `AddToCartButton.tsx` — required-variant gating and catalog fallback**

In `components/AddToCartButton.tsx`:

1. Update imports (top of file) — add to the existing import block:

```ts
'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/use-translation'
import { Product, SelectedVariant } from '@/data/products'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { useCart } from '@/lib/cart-store'
import { useToast } from '@/lib/toast-context'
import { useAuthStore } from '@/lib/auth-store'
import { getMinimumOrderQuantity, calculatePrice } from '@/lib/customer-segmentation'
import { formatEuro } from '@/lib/utils'
import { getMissingRequiredGroups } from '@/lib/product-variants'
import AuthGateDialog from '@/components/AuthGateDialog'

type Props = {
  product: Product
  /**
   * undefined = no variant selector is present in this context (catalog card quick-add).
   * array (possibly empty) = a selector is present (product detail page) and this is its current value.
   */
  selectedVariants?: SelectedVariant[]
}

export default function AddToCartButton({ product, selectedVariants }: Props) {
```

2. Right after `const { addItem } = useCart()` (around line 26), add:

```ts
  const { addItem } = useCart()
  const hasVariantSelector = selectedVariants !== undefined
  const missingRequired = useMemo(
    () => getMissingRequiredGroups(product.variantGroups, selectedVariants ?? []),
    [product.variantGroups, selectedVariants]
  )
  const needsVariantSelectionElsewhere = !hasVariantSelector && (product.variantGroups ?? []).some((g) => g.required)
```

3. In `handleAdd`, right after the `quantity < minOrderQuantity` check and before `addItem(product, quantity)` (around line 73-78), add the required-variant guard and pass `selectedVariants` through:

```ts
    if (quantity < minOrderQuantity) {
      showToast(`${t('product.minimumOrder')}: ${minOrderQuantity} ${t('product.pieces')}`, 'error')
      return
    }

    if (missingRequired.length > 0) {
      showToast(`${t('product.selectVariantRequired')}: ${missingRequired.map((g) => g.name).join(', ')}`, 'error')
      return
    }

    addItem(product, quantity, selectedVariants)
```

4. Right before the final `return (` of the component (the one starting the `<div className="add-to-cart ...">` JSX, around line 93), insert the catalog fallback:

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

5. In the final `<Button>` JSX (around line 175-184), add `missingRequired.length > 0` to `disabled`:

```tsx
      <Button
        ref={buttonRef}
        onClick={handleAdd}
        disabled={isOutOfStock || !isHydrated || missingRequired.length > 0}
        className={`w-full add-to-cart__button ${
          added ? 'bg-green-600 hover:bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
        } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {added ? `✓ ${t('product.addedToCart')}` : t('product.addToCart')}
      </Button>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `ProductInfo.tsx`, `ProductActions.tsx`, `AddToCartButton.tsx`

- [ ] **Step 5: Manual check**

Run: `npm run dev`, open a product page for one of the 71 active products with variants (after Task 13 runs; before that, any product — the selector simply won't render). Confirm:
- No `variantGroups` on the product → page renders exactly as before.
- (After Task 13) A product with a required group → "В корзину" is disabled until a value is picked from every required dropdown, and the shown price updates with `priceAdjustment`.

- [ ] **Step 6: Commit**

```bash
git add components/ProductInfo.tsx components/ProductActions.tsx components/AddToCartButton.tsx
git commit -m "feat: wire variant selector into product page and add-to-cart flow"
```

---

### Task 9: Cart UI — switch row identity from `id` to `lineKey`

**Files:**
- Modify: `components/CartDrawer.tsx`
- Modify: `app/cart/page.tsx`
- Modify: `app/checkout/page.tsx`

**Interfaces:**
- Consumes: `CartItem.lineKey`, `removeItem(lineKey)`, `updateQuantity(lineKey, quantity)` (Task 5)

- [ ] **Step 1: `components/CartDrawer.tsx`**

Apply these exact replacements (all within the same file):

```diff
-            if (prev.length === 0 && !selectionTouched) {
-                return items.map((item) => item.id);
+            if (prev.length === 0 && !selectionTouched) {
+                return items.map((item) => item.lineKey);
```
(line ~47)

```diff
-            const currentIds = new Set(items.map((item) => item.id));
+            const currentIds = new Set(items.map((item) => item.lineKey));
```
(line ~50)

```diff
-            if (next.length === 0 && items.length > 0 && !selectionTouched) {
-                return items.map((item) => item.id);
+            if (next.length === 0 && items.length > 0 && !selectionTouched) {
+                return items.map((item) => item.lineKey);
```
(line ~54)

```diff
-    const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));
+    const selectedItems = items.filter((item) => selectedItemIds.includes(item.lineKey));
```
(line ~67)

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
(line ~111)

```diff
                                     setSelectionTouched(true);
-                                    setSelectedItemIds(items.map((item) => item.id));
+                                    setSelectedItemIds(items.map((item) => item.lineKey));
```
(line ~190)

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
(lines ~216-226)

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
(lines ~249-254)

```diff
                                                 <button
                                                     onClick={() =>
-                                                        updateQuantity(item.id, item.quantity + 1)
+                                                        updateQuantity(item.lineKey, item.quantity + 1)
                                                     }
```
(lines ~264-266)

```diff
                                                 onConfirm={() => {
-                                                    removeItem(item.id);
+                                                    removeItem(item.lineKey);
                                                     showToast(t('toast.removedFromCart'), 'info');
                                                 }}
```
(line ~278)

`toggleSelected` itself stays `(productId: string)` in signature but is now fed lineKeys — rename its param too for clarity:

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
(line ~87)

- [ ] **Step 2: `app/cart/page.tsx`**

Apply these exact replacements (all within the same file):

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
(lines ~46-59)

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
(lines ~68-80)

```diff
-    const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));
+    const selectedItems = items.filter((item) => selectedItemIds.includes(item.lineKey));
```
(line ~99 — `selectedIdsParam = selectedItemIds.join(',')` at line ~113 is unchanged, it now naturally joins lineKeys)

```diff
                     onClick={() => {
                         setSelectionTouched(true);
-                        setSelectedItemIds(items.map((item) => item.id));
+                        setSelectedItemIds(items.map((item) => item.lineKey));
                     }}
```
(line ~135)

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
(lines ~172-185)

```diff
                                         <ConfirmActionDialog
                                             ...
                                             onConfirm={() => {
-                                                removeItem(item.id);
+                                                removeItem(item.lineKey);
                                                 showToast(t('toast.removedFromCart'), 'info');
                                             }}
```
(line ~224)

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
                                                 className="cart__item-qty-btn px-2 py-1"
                                             >
```
(lines ~234-257)

Leave every other `item.id` usage untouched (e.g. `Link href={`/product/${item.id}`}` at line ~204, `products.${item.id}.title` i18n key at line ~175) — they're product-identity references and must keep meaning "product id", not "cart row".

- [ ] **Step 3: `app/checkout/page.tsx`**

```diff
     const checkoutItems = React.useMemo(() => {
         if (!selectedItemIds) return items;

         const selectedSet = new Set(selectedItemIds);
-        return items.filter((item) => selectedSet.has(item.id));
+        return items.filter((item) => selectedSet.has(item.lineKey));
     }, [items, selectedItemIds]);
```
(line ~84 — `selectedItemIds` itself already comes from the `items=` query param, which `CartDrawer`/`cart/page.tsx` now populate with lineKeys, see Step 1/2)

```diff
-        const selectedSet = new Set(checkoutItems.map((item) => item.id));
-        const remainingItems = items.filter((item) => !selectedSet.has(item.id));
+        const selectedSet = new Set(checkoutItems.map((item) => item.lineKey));
+        const remainingItems = items.filter((item) => !selectedSet.has(item.lineKey));
         replaceWithItems(remainingItems);
```
(lines ~397-398 — critical: without this fix, checking out one variant of a product would also drop the other variant lines of the same product from the cart)

Leave the Stripe payload mapping (`items: checkoutItems.map((item) => ({ id: item.id, ... }))`, around line 310-316) untouched — it's per-line metadata sent to Stripe, `id` there correctly still means product id.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Manual check**

Run: `npm run dev`. Add a product with two different required-variant selections as two separate add-to-cart actions (after Task 13's data is in). Open `/cart`: confirm two distinct rows, each removable/quantity-editable independently. Select only one for checkout via the per-row checkbox, proceed to `/checkout`, place the order, confirm the *other* row is still in the cart afterward (this exercises the Step 3 fix).

- [ ] **Step 6: Commit**

```bash
git add components/CartDrawer.tsx app/cart/page.tsx app/checkout/page.tsx
git commit -m "fix(cart): use lineKey (not product id) for cart row identity"
```

---

### Task 10: Capture the chosen variant on the order, show it in admin

**Files:**
- Modify: `app/checkout/page.tsx`
- Modify: `app/admin/orders/page.tsx`

**Interfaces:**
- Consumes: `CartItem.selectedVariants`/`variantLabel` (Task 5)

- [ ] **Step 1: `app/checkout/page.tsx` — carry `variantLabel` onto the order item**

The `variantLabel` field is already set on `CartItem` by `addItem` (Task 5), and `items: checkoutItems.map((item) => ({ ...item, price: ... }))` (around line 255-258) already spreads `item` — so `variantLabel` flows onto `order.items` with **no code change needed** here. Confirm this by reading the current block:

```ts
        const order = {
            id: orderId,
            createdAt: new Date(),
            items: checkoutItems.map((item) => ({
                ...item,
                price: calculatePrice(item, item.quantity),
            })),
```

No edit required — leave as is. (This step exists to document why Task 10 doesn't touch checkout's order-creation code, not to introduce a change.)

- [ ] **Step 2: `app/admin/orders/page.tsx` — extend `EditItem` and display the variant**

```diff
-type EditItem = { id: string; title: string; price: number; quantity: number; image?: string }
+type EditItem = { id: string; title: string; price: number; quantity: number; image?: string; variantLabel?: string }
```
(line ~59)

```diff
-    setEditItems(order.items.map((i) => ({ id: i.id, title: i.title, price: i.price, quantity: i.quantity, image: i.image })))
+    setEditItems(order.items.map((i) => ({ id: i.id, title: i.title, price: i.price, quantity: i.quantity, image: i.image, variantLabel: i.variantLabel })))
```
(line ~263)

```diff
                               {item.image && <img src={item.image} alt="" className="w-9 h-9 rounded object-cover shrink-0" />}
-                              <p className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 truncate">{item.title}</p>
+                              <div className="flex-1 min-w-0">
+                                <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{item.title}</p>
+                                {item.variantLabel && (
+                                  <p className="text-xs text-gray-400 truncate">{item.variantLabel}</p>
+                                )}
+                              </div>
                               <span className="text-xs text-gray-400 shrink-0">€{item.price.toFixed(2)}</span>
```
(lines ~725-727)

- [ ] **Step 3: `printSelected` — show the variant on the printed packing slip**

```diff
       const items = order.items.map((item) =>
         `<div style="display:flex;justify-content:space-between;font-size:12px;margin:3px 0">
-          <span>${item.title} × ${item.quantity}</span>
+          <span>${item.title}${item.variantLabel ? ` <span style="color:#6b7280">(${item.variantLabel})</span>` : ''} × ${item.quantity}</span>
           <span>${formatEuro(item.price * item.quantity, locale)}</span>
         </div>`
       ).join('')
```
(lines ~214-219)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/page.tsx
git commit -m "feat(admin): show selected product variant on orders"
```

---

### Task 11: Admin form — edit `variantGroups` on a product

**Files:**
- Modify: `components/admin/products/productFormSchema.ts`
- Create: `components/admin/products/ProductVariantGroupsFields.tsx`
- Modify: `components/admin/products/AddProductForm.tsx`
- Modify: `lib/product-form-mapping.ts`

**Interfaces:**
- Consumes: `VariantGroup` (Task 2), `useFieldArray` pattern from `ProductTechSpecsFields.tsx`
- Produces: admin can add/edit/remove variant groups and options per product.

- [ ] **Step 1: Schema — `productFormSchema.ts`**

Add to `addProductSchema` (after `technicalSpecs`, around line 51):

```ts
  // Технические характеристики (ключ-значение, как в Product.technicalSpecs)
  technicalSpecs: z.array(z.object({ key: z.string(), value: z.string() })),

  // Варианты товара (цвет/комплектация, как в Product.variantGroups)
  variantGroups: z.array(z.object({
    name: z.string().min(1, 'Название группы обязательно'),
    required: z.boolean(),
    options: z.array(z.object({
      value: z.string().min(1, 'Значение обязательно'),
      priceAdjustment: z.number().optional(),
    })),
  })),
```

- [ ] **Step 2: Default values — `AddProductForm.tsx`**

In `emptyDefaults` (around line 68), add right after `technicalSpecs: [],`:

```ts
    badges: [],
    technicalSpecs: [],
    variantGroups: [],
    compatibleEquipment: [],
```

Add the import (with the other field components, around line 21) and render it (around line 211, right after `ProductTechSpecsFields`):

```tsx
import ProductTechSpecsFields from './ProductTechSpecsFields';
import ProductVariantGroupsFields from './ProductVariantGroupsFields';
import ProductCertificatesFields from './ProductCertificatesFields';
```

```tsx
                            <ProductTechSpecsFields />
                            <ProductVariantGroupsFields />
                            <ProductCertificatesFields />
```

- [ ] **Step 3: New component — `ProductVariantGroupsFields.tsx`**

Create `components/admin/products/ProductVariantGroupsFields.tsx`, following the `useFieldArray` pattern from `ProductTechSpecsFields.tsx` (nested: groups, and an options array inside each group):

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
                            <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
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

- [ ] **Step 4: Mapping — `lib/product-form-mapping.ts`**

In `mapProductToFormValues` (around line 39), add right after `technicalSpecs`:

```ts
        technicalSpecs: Object.entries(product.technicalSpecs ?? {}).map(([key, value]) => ({
            key,
            value,
        })),
        variantGroups: product.variantGroups ?? [],
        compatibleEquipment: product.compatibleEquipment ?? [],
```

In `mapFormValuesToProductPatch` (around line 117), add right after the `technicalSpecs` line:

```ts
        technicalSpecs: Object.keys(techSpecs).length > 0 ? techSpecs : undefined,
        variantGroups: values.variantGroups.length > 0 ? values.variantGroups : undefined,
        compatibleEquipment:
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Manual check**

Run: `npm run dev`, open `/admin/products/<any-id>` (edit mode). Confirm the new "Варианты (цвет / комплектация)" section renders, lets you add a group with a required checkbox and nested option rows, and saving persists (`PUT /api/admin/products`) without errors — reload the page and confirm the group/options are still there.

- [ ] **Step 7: Commit**

```bash
git add components/admin/products/productFormSchema.ts components/admin/products/ProductVariantGroupsFields.tsx components/admin/products/AddProductForm.tsx lib/product-form-mapping.ts
git commit -m "feat(admin): edit product variant groups in the product form"
```

---

### Task 12: Extend the SQL Server export with attribute data

**Files:**
- Modify: `scripts/export-mssql-to-json.ps1`

**Interfaces:**
- Produces: `C:/Temp/migration/product_attributes.json` with rows `{ productId, attrName, isRequired, value, priceAdjustment, displayOrder }` — consumed by Task 13.

- [ ] **Step 1: Add the export query**

In `scripts/export-mssql-to-json.ps1`, right after the `# ── Product images ──` block (after line 76, before `# ── Users ──`), add:

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

- [ ] **Step 2: Run the export**

Run: `powershell scripts/export-mssql-to-json.ps1`
Expected: among the output lines, `product_attributes... OK (<some KB> KB)` — verify the file exists:

Run: `ls -la /c/Temp/migration/product_attributes.json` (or `Get-ChildItem C:\Temp\migration\product_attributes.json` in PowerShell)
Expected: file present, non-zero size

- [ ] **Step 3: Sanity-check the row count**

Run:
```bash
node -e "
const raw = require('fs').readFileSync('C:/Temp/migration/product_attributes.json', 'utf8');
const parsed = JSON.parse(raw.replace(/\r\n|\r|\n/g, ''));
const rows = parsed.data ?? parsed;
console.log('rows:', rows.length);
console.log('distinct products:', new Set(rows.map(r => r.productId)).size);
"
```
Expected: `distinct products: 184`

- [ ] **Step 4: Commit**

```bash
git add scripts/export-mssql-to-json.ps1
git commit -m "feat(migration): export product attribute/variant data from nopCommerce"
```

---

### Task 13: Backfill `variantGroups` on the 184 existing products

**Files:**
- Create: `scripts/migrate-product-variants.ts`

**Interfaces:**
- Consumes: `C:/Temp/migration/product_attributes.json` (Task 12), `VariantGroup` (Task 2), `Product.variantGroups` column (Task 1)
- Produces: 184 rows in Neon `Product.variantGroups` populated.

- [ ] **Step 1: Implement the script**

Create `scripts/migrate-product-variants.ts`:

```ts
/**
 * One-off backfill: restores variant data (color/size dropdowns) dropped
 * during the original nopCommerce -> Neon migration.
 *
 * Run scripts/export-mssql-to-json.ps1 first (produces product_attributes.json).
 * Then: npx tsx scripts/migrate-product-variants.ts
 */

import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
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

const dbPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
const prisma = new PrismaClient({ adapter: new PrismaPg(dbPool) })

async function main() {
  const rows = load()
  const grouped = groupByProduct(rows)
  console.log(`Backfilling variantGroups for ${grouped.size} products...`)

  let updated = 0
  let notFound = 0
  for (const [productId, variantGroups] of grouped) {
    const result = await prisma.product.updateMany({
      where: { id: productId },
      data: { variantGroups: variantGroups as object },
    })
    if (result.count > 0) updated++
    else notFound++
  }
  console.log(`✓ updated ${updated}, not found in Neon ${notFound}`)
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Dry-run check before writing**

Run:
```bash
npx tsx --env-file=.env.local -e "
import { readFileSync } from 'fs'
const raw = readFileSync('C:/Temp/migration/product_attributes.json', 'utf8').replace(/\r\n|\r|\n/g, '')
const rows = JSON.parse(raw).data ?? JSON.parse(raw)
console.log('total rows', rows.length, 'distinct products', new Set(rows.map((r:any)=>r.productId)).size)
"
```
Expected: `total rows <N> distinct products 184` (matches Task 12 Step 3)

- [ ] **Step 3: Run the backfill**

Run: `npx tsx scripts/migrate-product-variants.ts`
Expected: `✓ updated 184, not found in Neon 0`

If `notFound` is greater than 0, stop and investigate — it means a product id from the SQL Server backup no longer exists in Neon (e.g. previously hard-deleted); do not proceed without explaining the mismatch.

- [ ] **Step 4: Verify in Neon**

Run:
```bash
npx tsx --env-file=.env.local -e "
import { config } from 'dotenv'; config({ path: '.env.local' })
import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
pool.query(\`SELECT count(*) FROM \"Product\" WHERE \"variantGroups\" IS NOT NULL\`)
  .then(r => { console.log(r.rows); return pool.end() })
"
```
Expected: `[ { count: '184' } ]`

- [ ] **Step 5: Spot-check one active product end to end**

Run:
```bash
npx tsx --env-file=.env.local -e "
import { config } from 'dotenv'; config({ path: '.env.local' })
import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
pool.query(\`SELECT id, title, \"isActive\", \"variantGroups\" FROM \"Product\" WHERE \"variantGroups\" IS NOT NULL AND \"isActive\" = true LIMIT 1\`)
  .then(r => { console.log(JSON.stringify(r.rows[0], null, 2)); return pool.end() })
"
```
Expected: a real product with a non-empty `variantGroups` array shaped like `[{ name, required, options: [{ value, priceAdjustment? }] }]`. Open `/product/<that id>` in the running dev server and confirm the dropdown(s) render.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-product-variants.ts
git commit -m "feat(migration): backfill variantGroups for 184 products from the nopCommerce backup"
```

---

## Post-implementation checklist

- [ ] Full test suite: `npx vitest run`
- [ ] Full typecheck: `npx tsc --noEmit`
- [ ] `npm run build` succeeds locally
- [ ] Manual smoke test: catalog card quick-add on a required-variant product redirects to the product page instead of silently adding without a variant
- [ ] Manual smoke test: two variants of the same product end up as two cart rows, survive partial checkout, survive a page reload (persisted via `zustand/persist`)
