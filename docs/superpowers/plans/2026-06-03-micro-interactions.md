# Micro-Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 goal-oriented micro-interactions to improve perceived quality and guide users toward purchase.

**Architecture:** Pure CSS keyframes in `styles/globals.css` + React state (`useState` + `useRef`) in existing components. No new packages.

**Tech Stack:** Next.js, React 18, TypeScript, Tailwind CSS, tailwindcss-animate, Zustand, shadcn/ui Tooltip.

---

## Files Modified

| File | Change |
|------|--------|
| `styles/globals.css` | Add keyframes: `cartBump`, `wishlistPop`, `shake` |
| `data/translations.ts` | Add 9 new keys (ru/en/lv) for bulk pricing + tooltip |
| `components/HeaderActions.tsx` | Cart icon bump animation on count increase |
| `components/WishlistButton.tsx` | Heart pop animation on toggle |
| `components/CheckoutGuardButton.tsx` | Tooltip + shake when disabled |
| `components/AddToCartButton.tsx` | Bulk pricing progress bar |
| `components/ProductCard.tsx` | Hover lift + low-stock pulse |

---

### Task 1: Add CSS Keyframes to globals.css

**Files:**
- Modify: `styles/globals.css`

- [ ] **Step 1: Append keyframes to `styles/globals.css`**

Add at the end of the file:

```css
/* ── Micro-interaction keyframes ──────────────────────────────────────── */
@keyframes cartBump {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.4); }
  70%  { transform: scale(0.9); }
  100% { transform: scale(1); }
}

@keyframes wishlistPop {
  0%   { transform: scale(1) rotate(0deg); }
  30%  { transform: scale(1.4) rotate(-15deg); }
  60%  { transform: scale(0.9) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%  { transform: translateX(-5px); }
  40%  { transform: translateX(5px); }
  60%  { transform: translateX(-4px); }
  80%  { transform: translateX(4px); }
}

.animate-cart-bump {
  animation: cartBump 0.4s ease-out;
}

.animate-wishlist-pop {
  animation: wishlistPop 0.4s ease-out;
}

.animate-shake {
  animation: shake 0.35s ease-in-out;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles/globals.css
git commit -m "feat: add micro-interaction keyframes (cartBump, wishlistPop, shake)"
```

---

### Task 2: Add Translation Keys

**Files:**
- Modify: `data/translations.ts`

- [ ] **Step 1: Add keys to Russian section**

Find the `ru:` block. After the `'product.addToCart': 'В корзину',` line, add:

```typescript
'product.bulkProgressLabel': 'Ещё {remaining} шт. → {price}',
'product.bulkProgressUnlocked': 'Оптовая цена активна!',
'checkout.emptyCartTooltip': 'Добавьте товары в корзину',
```

- [ ] **Step 2: Add keys to English section**

Find the `en:` block. After `'product.addToCart': 'Add to Cart',`:

```typescript
'product.bulkProgressLabel': '{remaining} more pcs → {price}',
'product.bulkProgressUnlocked': 'Wholesale price active!',
'checkout.emptyCartTooltip': 'Add items to your cart',
```

- [ ] **Step 3: Add keys to Latvian section**

Find the `lv:` block. After `'product.addToCart': 'Pievienot grozam',`:

```typescript
'product.bulkProgressLabel': 'Vēl {remaining} gab. → {price}',
'product.bulkProgressUnlocked': 'Vairumtirdzniecības cena aktīva!',
'checkout.emptyCartTooltip': 'Pievienojiet preces grozam',
```

- [ ] **Step 4: Commit**

```bash
git add data/translations.ts
git commit -m "feat: add translation keys for micro-interactions"
```

---

### Task 3: Cart Icon Bump Animation (HeaderActions)

**Files:**
- Modify: `components/HeaderActions.tsx`

- [ ] **Step 1: Add `useRef` + `useState` for animation**

Replace the top of the component (after imports) with:

```typescript
'use client'

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import UserMenu from './UserMenu';
import LanguageSwitcher from './LanguageSwitcher';
import { useCart } from '@/lib/cart-store';
import { useWishlist } from '@/lib/wishlist-store';
import { useTranslation } from '@/lib/use-translation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
```

Note: add `'use client'` at top — `HeaderActions` is a client component but may be missing the directive. Check and add if absent.

- [ ] **Step 2: Add animation state inside component body**

After `const cartCount = items.reduce(...)` line, add:

```typescript
const prevCartCountRef = useRef(cartCount)
const [cartBumping, setCartBumping] = useState(false)

useEffect(() => {
  if (cartCount > prevCartCountRef.current) {
    setCartBumping(true)
    const t = setTimeout(() => setCartBumping(false), 400)
    prevCartCountRef.current = cartCount
    return () => clearTimeout(t)
  }
  prevCartCountRef.current = cartCount
}, [cartCount])
```

- [ ] **Step 3: Apply animation class to cart SVG wrapper**

Find the cart `<svg>` element inside the `onCartOpen &&` block. Wrap the svg in a `<span>` with the animation class:

```tsx
<Button
  onClick={onCartOpen}
  variant="ghost"
  size="icon"
  className="header__cart relative text-foreground"
  aria-label={t('header.openCartAria')}
>
  <span className={cartBumping ? 'animate-cart-bump inline-flex' : 'inline-flex'}>
    <svg className="h-8 w-8 text-foreground" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6h15l-1.5 9h-12L6 6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="10" cy="20" r="1.2" fill="currentColor" />
      <circle cx="18" cy="20" r="1.2" fill="currentColor" />
    </svg>
  </span>
  {cartCount > 0 && (
    <Badge className={`header__cart-badge pointer-events-none absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white${cartBumping ? ' animate-cart-bump' : ''}`}>
      {cartCountLabel}
    </Badge>
  )}
</Button>
```

- [ ] **Step 4: Commit**

```bash
git add components/HeaderActions.tsx
git commit -m "feat: cart icon bump animation on item add"
```

---

### Task 4: WishlistButton Pop Animation

**Files:**
- Modify: `components/WishlistButton.tsx`

- [ ] **Step 1: Add animation state**

After the existing hook calls (`useWishlist`, `useToast`, etc.), add:

```typescript
const [popping, setPopping] = useState(false)
```

And add `useState` to the React import if not already there.

- [ ] **Step 2: Trigger animation in `handleClick`**

Replace `handleClick`:

```typescript
const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.preventDefault()
  event.stopPropagation()

  setPopping(true)
  setTimeout(() => setPopping(false), 400)

  const added = toggleItem(product)
  showToast(
    t(added ? 'toast.addedToWishlist' : 'toast.removedFromWishlist'),
    added ? 'success' : 'info'
  )
}
```

- [ ] **Step 3: Apply class to SVG in both render branches**

In the `asButton` branch, apply to the `<svg>`:

```tsx
<svg
  className={`h-5 w-5 mr-2${popping ? ' animate-wishlist-pop' : ''}`}
  ...
>
```

In the icon-only branch, apply to the `<svg>`:

```tsx
<svg
  className={`h-5 w-5${popping ? ' animate-wishlist-pop' : ''}`}
  ...
>
```

- [ ] **Step 4: Commit**

```bash
git add components/WishlistButton.tsx
git commit -m "feat: wishlist heart pop animation on toggle"
```

---

### Task 5: CheckoutGuardButton — Tooltip + Shake

**Files:**
- Modify: `components/CheckoutGuardButton.tsx`

- [ ] **Step 1: Rewrite component with tooltip + shake**

Replace entire file content:

```typescript
'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslation } from '@/lib/use-translation'

type CheckoutGuardButtonProps = {
  canCheckout: boolean
  label: string
  href?: string
  className?: string
  onNavigate?: () => void
}

export default function CheckoutGuardButton({
  canCheckout,
  label,
  href = '/checkout',
  className,
  onNavigate
}: CheckoutGuardButtonProps) {
  const { t } = useTranslation()
  const [shaking, setShaking] = useState(false)

  const handleDisabledClick = () => {
    if (shaking) return
    setShaking(true)
    setTimeout(() => setShaking(false), 350)
  }

  if (canCheckout) {
    return (
      <Link href={href} onClick={onNavigate} className="block">
        <Button className={className}>{label}</Button>
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block" onClick={handleDisabledClick}>
            <Button
              className={`${className ?? ''} ${shaking ? 'animate-shake' : ''} pointer-events-none`}
              disabled
              tabIndex={-1}
            >
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('checkout.emptyCartTooltip')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

Note: `<span>` wrapper is needed because `disabled` button doesn't fire mouse events — tooltip trigger must be on a non-disabled element.

- [ ] **Step 2: Commit**

```bash
git add components/CheckoutGuardButton.tsx
git commit -m "feat: checkout guard tooltip + shake animation when cart empty"
```

---

### Task 6: Bulk Pricing Progress Bar (AddToCartButton)

**Files:**
- Modify: `components/AddToCartButton.tsx`

- [ ] **Step 1: Add `formatEuro` import and progress state**

Add to existing imports:

```typescript
import { formatEuro } from '@/lib/utils'
import { calculatePrice } from '@/lib/customer-segmentation'
```

Add state after existing state declarations:

```typescript
const [tierFlash, setTierFlash] = useState(false)
const prevTierRef = useRef<number | null>(null)
```

Add `useRef` to React import.

- [ ] **Step 2: Compute next bulk pricing tier**

Add after `const maxQuantity = product.stock` line:

```typescript
const sortedTiers = (product.bulkPricingTiers ?? [])
  .slice()
  .sort((a, b) => a.quantity - b.quantity)

const nextTier = sortedTiers.find(tier => tier.quantity > quantity) ?? null
const activeTier = sortedTiers.filter(t => t.quantity <= quantity).pop() ?? null
const progressPct = nextTier
  ? Math.min(100, Math.round((quantity / nextTier.quantity) * 100))
  : 100
```

- [ ] **Step 3: Detect tier unlock and flash**

Add `useEffect` after existing `useEffect`:

```typescript
useEffect(() => {
  const currentTierQty = activeTier?.quantity ?? null
  if (prevTierRef.current !== null && currentTierQty !== null && currentTierQty !== prevTierRef.current) {
    setTierFlash(true)
    const t = setTimeout(() => setTierFlash(false), 1000)
    prevTierRef.current = currentTierQty
    return () => clearTimeout(t)
  }
  prevTierRef.current = currentTierQty
}, [activeTier])
```

- [ ] **Step 4: Render progress bar below quantity stepper**

Add JSX block after the closing `</TooltipProvider>` of the quantity block, before the `{minOrderQuantity > 1 && ...}` line:

```tsx
{sortedTiers.length > 0 && !isOutOfStock && (
  <div className="add-to-cart__bulk-progress w-full">
    {nextTier ? (
      <>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>
            {t('product.bulkProgressLabel', undefined, {
              remaining: String(nextTier.quantity - quantity),
              price: formatEuro(calculatePrice(product, nextTier.quantity), 'en-US'),
            })}
          </span>
          <span className="font-mono">{progressPct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </>
    ) : (
      <p className={`text-xs font-medium text-center py-1 rounded transition-colors duration-500 ${
        tierFlash ? 'text-white bg-green-500' : 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30'
      }`}>
        {t('product.bulkProgressUnlocked')}
      </p>
    )}
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add components/AddToCartButton.tsx
git commit -m "feat: bulk pricing progress bar with tier unlock flash"
```

---

### Task 7: ProductCard Hover Lift + Low-Stock Pulse

**Files:**
- Modify: `components/ProductCard.tsx`

- [ ] **Step 1: Add hover lift to Card**

Find the `<Card` opening tag (line ~59):

```tsx
<Card
  className="product-card p-3 h-full min-h-[450px] flex flex-col relative cursor-pointer min-w-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
  onClick={handleCardClick}
>
```

Replace className value:

```tsx
<Card
  className="product-card p-3 h-full min-h-[450px] flex flex-col relative cursor-pointer min-w-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
  onClick={handleCardClick}
>
```

- [ ] **Step 2: Add `animate-pulse` to low-stock badge**

Find the low-stock badge block (~line 162):

```tsx
{product.stock < 5 && product.stock > 0 && (
  <Badge className="bg-orange-600 text-white max-w-[90%] truncate">
    {t('product.left')} {product.stock}
  </Badge>
)}
```

Replace:

```tsx
{product.stock < 5 && product.stock > 0 && (
  <Badge className="bg-orange-600 text-white max-w-[90%] truncate animate-pulse">
    {t('product.left')} {product.stock}
  </Badge>
)}
```

- [ ] **Step 3: Commit**

```bash
git add components/ProductCard.tsx
git commit -m "feat: product card hover lift + low-stock badge pulse"
```

---

## Self-Review

- **Spec coverage:** All 6 items covered: keyframes (T1), translations (T2), cart bump (T3), wishlist pop (T4), checkout guard (T5), bulk progress (T6), card lift + pulse (T7). ✓
- **No placeholders:** All steps have exact code. ✓
- **Type consistency:** `calculatePrice(product, quantity)` signature matches usage in `AddToCartButton` existing code. `formatEuro` already imported in `ProductCard`. Needs import in `AddToCartButton` — covered in T6 Step 1. ✓
- **`useRef` import:** Added to React import in T3 (HeaderActions) and T6 (AddToCartButton). WishlistButton only needs `useState`. ✓
- **`'use client'`:** `HeaderActions` is already client-side (uses hooks). `CheckoutGuardButton` adding `useState` + `useTranslation` → must have `'use client'` — covered in T5. ✓
