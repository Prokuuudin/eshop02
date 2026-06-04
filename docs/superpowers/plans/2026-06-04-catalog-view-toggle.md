# Catalog View Toggle (Grid/List) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add grid/list view toggle to catalog with localStorage persistence.

**Architecture:** New `ProductListRow` component renders one product as a horizontal row. `Products.tsx` gains `viewMode` state (persisted in `localStorage('catalog-view-mode')`), two icon-toggle buttons, and conditionally renders grid or list. Translations added for aria-labels.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, lucide-react, Next.js App Router.

---

## Files

| File | Change |
|------|--------|
| `data/translations.ts` | Add `catalog.viewGrid` + `catalog.viewList` (ru/en/lv) |
| `components/ProductListRow.tsx` | New — horizontal list card |
| `components/Products.tsx` | viewMode state + toggle buttons + conditional render |

---

### Task 1: Translation keys

**Files:**
- Modify: `data/translations.ts`

Translation keys go into 3 language blocks. Russian block has `'catalog.search': 'Поиск'` at line ~154, English at ~1859, Latvian at ~3562.

- [ ] **Step 1: Add to `ru` block** — find `'catalog.search': 'Поиск',` and add after:

```typescript
'catalog.viewGrid': 'Сетка',
'catalog.viewList': 'Список',
```

- [ ] **Step 2: Add to `en` block** — find `'catalog.search': 'Search',` and add after:

```typescript
'catalog.viewGrid': 'Grid',
'catalog.viewList': 'List',
```

- [ ] **Step 3: Add to `lv` block** — find `'catalog.search': 'Meklēt',` and add after:

```typescript
'catalog.viewGrid': 'Režģis',
'catalog.viewList': 'Saraksts',
```

- [ ] **Step 4: Commit**

```bash
git add data/translations.ts
git commit -m "feat: add catalog view toggle translation keys"
```

---

### Task 2: ProductListRow component

**Files:**
- Create: `components/ProductListRow.tsx`

- [ ] **Step 1: Create the file**

```typescript
'use client';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Product } from '../data/products';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import { calculatePrice, getDisplayPrice } from '@/lib/customer-segmentation';
import { getCurrentUser } from '@/lib/auth';
import { Badge } from './ui/badge';
import AddToCartButton from './AddToCartButton';
import WishlistButton from './WishlistButton';
import { StockNotifyButton } from './StockNotifyButton';

type Props = { product: Product };

export default function ProductListRow({ product }: Props) {
  const { t, language } = useTranslation();
  const locale = getLocaleFromLanguage(language);
  const isOutOfStock = product.stock === 0;

  const localizedTitle =
    language === 'en' && product.titleEn
      ? product.titleEn
      : language === 'lv' && product.titleLv
      ? product.titleLv
      : t(product.titleKey ?? `products.${product.id}.title`, product.title);

  const displayPrice = getDisplayPrice(product.price);
  const displayOldPrice = product.oldPrice ? getDisplayPrice(product.oldPrice) : undefined;
  const firstTier = product.bulkPricingTiers?.slice().sort((a, b) => a.quantity - b.quantity)[0];
  const firstTierPrice = firstTier ? calculatePrice(product, firstTier.quantity) : null;

  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsAuthenticated(!!getCurrentUser());
      const handler = () => setIsAuthenticated(!!getCurrentUser());
      window.addEventListener('eshop-user-changed', handler);
      return () => window.removeEventListener('eshop-user-changed', handler);
    }
  }, []);

  return (
    <div className="product-list-row flex items-center gap-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:shadow-sm transition-shadow">
      {/* Image */}
      <Link href={`/product/${product.id}`} className="flex-shrink-0 relative w-20 h-20 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800">
        {product.image && product.image.trim() ? (
          <Image
            src={product.image}
            alt={localizedTitle}
            fill
            sizes="80px"
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
            {t('product.imageNotSet')}
          </div>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{t('product.outOfStock')}</span>
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400">{product.brand}</p>
        <Link href={`/product/${product.id}`} className="text-sm font-medium hover:text-indigo-600 line-clamp-2">
          {localizedTitle}
        </Link>
        {product.sku && (
          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">SKU: {product.sku}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-yellow-500">{product.rating.toFixed(1)} ★</span>
          {product.badges?.includes('sale') && (
            <Badge className="bg-red-600 text-white text-xs">{t('product.sale')}</Badge>
          )}
          {product.badges?.includes('new') && (
            <Badge className="bg-green-600 text-white text-xs">{t('product.new')}</Badge>
          )}
          {product.stock < 5 && product.stock > 0 && (
            <Badge className="bg-orange-600 text-white text-xs animate-pulse">
              {t('product.left')} {product.stock}
            </Badge>
          )}
        </div>
      </div>

      {/* Price + Action */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0 min-w-[140px]">
        {isAuthenticated ? (
          <div className="text-right">
            <div className="text-base font-semibold">{formatEuro(displayPrice, locale)}</div>
            {displayOldPrice && (
              <div className="text-xs line-through text-gray-400">{formatEuro(displayOldPrice, locale)}</div>
            )}
            {firstTier && firstTierPrice !== null && (
              <div className="text-xs text-emerald-700 dark:text-emerald-300">
                {t('product.bulkTierPrice', undefined, {
                  quantity: firstTier.quantity,
                  price: formatEuro(firstTierPrice, locale),
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-sm">{t('product.loginToSeePrice')}</div>
        )}
        <div className="flex items-center gap-1">
          {isOutOfStock ? (
            <StockNotifyButton productId={product.id} productTitle={localizedTitle} compact />
          ) : (
            <AddToCartButton product={product} />
          )}
          <WishlistButton product={product} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ProductListRow.tsx
git commit -m "feat: ProductListRow component for catalog list view"
```

---

### Task 3: View toggle in Products.tsx

**Files:**
- Modify: `components/Products.tsx`

- [ ] **Step 1: Add imports**

At the top of `components/Products.tsx`, add after existing imports:

```typescript
import { LayoutGrid, List } from 'lucide-react'
import ProductListRow from './ProductListRow'
```

- [ ] **Step 2: Add viewMode state**

Inside the `Products` component function, after the `filters` state declaration, add:

```typescript
const [viewMode, setViewMode] = React.useState<'grid' | 'list'>(() => {
  if (typeof window === 'undefined') return 'grid'
  return (localStorage.getItem('catalog-view-mode') as 'grid' | 'list') ?? 'grid'
})

const handleViewMode = (mode: 'grid' | 'list') => {
  setViewMode(mode)
  localStorage.setItem('catalog-view-mode', mode)
}
```

- [ ] **Step 3: Add toggle buttons to the heading row**

Find this line (around line 209):
```tsx
<h2 className="products__title text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">{t('nav.catalog', 'Catalog')}</h2>
```

Replace with:
```tsx
<div className="flex items-center justify-between mb-4">
  <h2 className="products__title text-2xl font-semibold text-gray-900 dark:text-gray-100">{t('nav.catalog', 'Catalog')}</h2>
  <div className="flex items-center gap-1">
    <button
      type="button"
      onClick={() => handleViewMode('grid')}
      aria-label={t('catalog.viewGrid')}
      className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
    >
      <LayoutGrid className="w-4 h-4" />
    </button>
    <button
      type="button"
      onClick={() => handleViewMode('list')}
      aria-label={t('catalog.viewList')}
      className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
    >
      <List className="w-4 h-4" />
    </button>
  </div>
</div>
```

- [ ] **Step 4: Update skeleton render to respect viewMode**

Find the skeleton block (around line 224-227):
```tsx
{productsLoading ? (
  <div className="products__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
  </div>
```

Replace with:
```tsx
{productsLoading ? (
  viewMode === 'list' ? (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-28 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
      ))}
    </div>
  ) : (
    <div className="products__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
    </div>
  )
```

- [ ] **Step 5: Update products render to respect viewMode**

Find (around line 234-240):
```tsx
<div className="products__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  {filtered.slice(0, visibleCount).map((p) => (
    <ProductCard key={p.id} product={p} />
  ))}
  {loading && Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
</div>
```

Replace with:
```tsx
{viewMode === 'list' ? (
  <div className="flex flex-col gap-3">
    {filtered.slice(0, visibleCount).map((p) => (
      <ProductListRow key={p.id} product={p} />
    ))}
    {loading && Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="h-28 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
    ))}
  </div>
) : (
  <div className="products__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {filtered.slice(0, visibleCount).map((p) => (
      <ProductCard key={p.id} product={p} />
    ))}
    {loading && Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
  </div>
)}
```

- [ ] **Step 6: Commit**

```bash
git add components/Products.tsx
git commit -m "feat: catalog grid/list view toggle with localStorage persistence"
```

---

## Self-Review

**Spec coverage:**
- ✅ Toggle buttons (LayoutGrid / List icons) → Task 3 Step 3
- ✅ Active state styling (indigo background) → Task 3 Step 3
- ✅ localStorage persistence → Task 3 Step 2
- ✅ Grid mode unchanged → Task 3 Step 5
- ✅ List mode with horizontal card → Task 2
- ✅ Skeleton for list mode → Task 3 Step 4
- ✅ Translation keys ru/en/lv → Task 1
- ✅ `ProductListRow` with image, brand, title, SKU, rating, badges, price, add-to-cart, wishlist → Task 2

**Placeholders:** None.

**Type consistency:**
- `viewMode: 'grid' | 'list'` used consistently in Task 3 Steps 2-5 ✅
- `handleViewMode(mode: 'grid' | 'list')` defined in Step 2, called in Step 3 ✅
- `ProductListRow` props: `{ product: Product }` matches usage in Step 5 ✅
- `localStorage.getItem('catalog-view-mode')` key matches `localStorage.setItem('catalog-view-mode', mode)` ✅
