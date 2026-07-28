# Smooth UI Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace abrupt page/element appearance with smooth CSS-only entrance animations: route transitions, scroll-reveal grids, and toast enter/exit — while respecting `prefers-reduced-motion`.

**Architecture:** A shared `.reveal`/`.route-transition`/`.toast-item` CSS layer in `styles/globals.css`, one new reusable `components/ui/Reveal.tsx` (IntersectionObserver, one-shot) wired into every product/blog grid, one new `components/RouteTransition.tsx` wired into the root layout, and a two-phase removal change in `lib/toast-context.tsx`.

**Tech Stack:** Next.js App Router, React client components, plain CSS (no new npm dependencies).

**Design spec:** `docs/superpowers/specs/2026-07-28-smooth-ui-animations-design.md`

## Global Constraints

- No new dependencies — CSS only, per spec section "Approach".
- `.reveal.is-visible` MUST set `transform: none;` — **not** `translateY(0)`. `translateY(0)` is a non-`none` transform value and per the CSS spec still creates a new stacking context / containing block on the element, even though it looks visually identical to no transform. `ProductCard` (`components/ProductCard.tsx:43`) relies on being an unwrapped positioning/stacking participant for its `lg:hover:z-20` "lift above the row below" flyout behavior (see `product_card_hover_flyout` memory — this area is already fragile/tuned). If the Reveal wrapper permanently carries a non-`none` transform, that flyout will render behind the next grid row instead of over it. Same reasoning applies to `opacity: 1` (not `0.999...`) at rest — `opacity` values other than exactly `1` also create a stacking context.
- `RouteTransition`'s remount `key` is `pathname` only, never search params — catalog filter/sort changes go through `router.replace(...)` with the same pathname and must NOT retrigger the page-enter fade.
- Every new animation (`route-transition`, `reveal`, `toast-item`/`toast-item--leaving`) must be neutralized under `@media (prefers-reduced-motion: reduce)`, and `.reveal` must additionally force `opacity: 1; transform: none;` in that block (not just cancel the transition), otherwise a reduced-motion user could get content stuck at `opacity: 0` if the class toggle races the media query.
- Out of scope, do not touch: `components/ui/dialog.tsx`, `components/ui/dropdown-menu.tsx` (already animated via radix `data-state` + `tailwindcss-animate`), `components/CartDrawer.tsx` (already has its own transitions), `animate-cart-bump`/`animate-wishlist-pop`/confetti/shimmer keyframes in `styles/globals.css`, admin panel grids.

---

### Task 1: CSS foundation + `Reveal` component, wired into the catalog grid

**Files:**
- Modify: `styles/globals.css` (append after line 421, end of file)
- Create: `components/ui/Reveal.tsx`
- Modify: `components/Products.tsx:311-318` (grid view) and `components/Products.tsx:302-310` (list view)

**Interfaces:**
- Produces: `export default function Reveal({ children, index, className }: { children: React.ReactNode; index?: number; className?: string })` — a client component. Renders one wrapping `<div>` with class `reveal` (+ `is-visible` once its own IntersectionObserver first fires, +`h-full` so callers relying on CSS-grid stretch for equal-height cards keep working, + any caller-supplied `className`). `index` (default `0`) drives stagger via inline `transitionDelay: min(index*40, 240)ms`. This is the only interface every later task consumes — do not change its prop names or add required props in later tasks.
- Produces CSS classes consumed by later tasks: `.route-transition` (Task 7), `.toast-item` / `.toast-item--leaving` (Task 8).

- [ ] **Step 1: Append the animation CSS to `styles/globals.css`**

Add at the end of the file (after the existing `.terms-page__content a` rule at line 421):

```css

/* ── Smooth entrance animations (page/element mount) ──────────────────── */
@keyframes page-enter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.route-transition {
  animation: page-enter 0.28s ease-out both;
}

.reveal {
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 0.38s ease-out, transform 0.38s ease-out;
}

.reveal.is-visible {
  opacity: 1;
  transform: none;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes toast-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(8px); }
}

.toast-item {
  animation: toast-in 0.25s ease-out;
}

.toast-item--leaving {
  animation: toast-out 0.2s ease-in forwards;
}

@media (prefers-reduced-motion: reduce) {
  .route-transition,
  .reveal,
  .toast-item,
  .toast-item--leaving {
    animation: none !important;
    transition: none !important;
  }

  .reveal {
    opacity: 1 !important;
    transform: none !important;
  }
}
```

- [ ] **Step 2: Create `components/ui/Reveal.tsx`**

```tsx
'use client'

import React from 'react'

type RevealProps = {
  children: React.ReactNode
  index?: number
  className?: string
}

export default function Reveal({ children, index = 0, className = '' }: RevealProps) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = React.useState(false)

  React.useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true)
          observer.unobserve(node)
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal h-full ${isVisible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${Math.min(index * 40, 240)}ms` }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Wire `Reveal` into `components/Products.tsx` grid view**

Add the import near the other component imports (after `import ProductCardSkeleton from './ProductCardSkeleton'`):

```tsx
import Reveal from '@/components/ui/Reveal'
```

Replace (grid view, currently at `components/Products.tsx:311-317`):

```tsx
                    <div className="products__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {filtered.slice(0, visibleCount).map((p) => (
                        <ProductCard key={p.id} product={p} />
                      ))}
                      {loading && Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                    </div>
```

with:

```tsx
                    <div className="products__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {filtered.slice(0, visibleCount).map((p, i) => (
                        <Reveal key={p.id} index={i}>
                          <ProductCard product={p} />
                        </Reveal>
                      ))}
                      {loading && Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                    </div>
```

- [ ] **Step 4: Wire `Reveal` into `components/Products.tsx` list view**

Replace (list view, currently at `components/Products.tsx:303-310`):

```tsx
                    <div className="flex flex-col gap-3">
                      {filtered.slice(0, visibleCount).map((p) => (
                        <ProductListRow key={p.id} product={p} />
                      ))}
                      {loading && Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
                      ))}
                    </div>
```

with:

```tsx
                    <div className="flex flex-col gap-3">
                      {filtered.slice(0, visibleCount).map((p, i) => (
                        <Reveal key={p.id} index={i}>
                          <ProductListRow product={p} />
                        </Reveal>
                      ))}
                      {loading && Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
                      ))}
                    </div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `components/ui/Reveal.tsx` or `components/Products.tsx`.

- [ ] **Step 6: Manual verification (dev server)**

Run: `npm run dev`, open `/catalog`.
Expected:
- Cards fade+slide in shortly after load (above-the-fold cards almost immediately, a subtle stagger left-to-right/row-by-row).
- Scroll down: cards below the fold fade in as they cross into view, once each (scrolling back up and down again does not replay it).
- Switch to list view (toggle button): rows fade in the same way.
- **Stacking regression check (important — see Global Constraints):** on desktop width, hover a product card that is NOT in the last grid row. Confirm the "В корзину" flyout still renders on top of the row below it, not clipped behind it.
- Toggle OS-level "reduce motion" (Windows: Settings → Accessibility → Visual effects → Animation effects, off) and reload `/catalog` — cards must appear immediately at full opacity, never stuck invisible.

- [ ] **Step 7: Commit**

```bash
git add styles/globals.css components/ui/Reveal.tsx components/Products.tsx
git commit -m "feat: add scroll-reveal animation to catalog product grid/list"
```

---

### Task 2: Apply `Reveal` to the homepage "New arrivals" grid

**Files:**
- Modify: `components/NewArrivalsSection.tsx:37-41`

**Interfaces:**
- Consumes: `Reveal` from Task 1 (`components/ui/Reveal.tsx`), props `{ children, index }`.

- [ ] **Step 1: Add the import**

Add near the top of `components/NewArrivalsSection.tsx` (after `import ProductCard from './ProductCard'`):

```tsx
import Reveal from '@/components/ui/Reveal'
```

- [ ] **Step 2: Wrap the grid items**

Replace:

```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {newArrivals.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
```

with:

```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {newArrivals.map((p, i) => (
            <Reveal key={p.id} index={i}>
              <ProductCard product={p} />
            </Reveal>
          ))}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the homepage (`/`).
Expected: "New arrivals" cards fade+slide in as the section scrolls into view (this section is typically already near the fold, so verify by scrolling the homepage from the very top).

- [ ] **Step 5: Commit**

```bash
git add components/NewArrivalsSection.tsx
git commit -m "feat: add scroll-reveal to new-arrivals homepage grid"
```

---

### Task 3: Apply `Reveal` to related / often-bought-together product lists

**Files:**
- Modify: `components/ProductRelatedList.tsx`

**Interfaces:**
- Consumes: `Reveal` from Task 1.

- [ ] **Step 1: Add the import and wrap the list**

Replace the full contents of `components/ProductRelatedList.tsx`:

```tsx
import React from 'react';
import type { Product } from '@/data/products';
import ProductListRow from '@/components/ProductListRow';

interface ProductRelatedListProps {
    title: string;
    products: Product[];
}

export const ProductRelatedList: React.FC<ProductRelatedListProps> = ({ title, products }) => {
    if (!products || products.length === 0) return null;
    return (
        <section className="product-related mb-12">
            <h2 className="product-related__title text-2xl font-bold mb-6">{title}</h2>
            <div className="product-related__list flex flex-col gap-3">
                {products.map((p) => (
                    <ProductListRow key={p.id} product={p} />
                ))}
            </div>
        </section>
    );
};
```

with:

```tsx
import React from 'react';
import type { Product } from '@/data/products';
import ProductListRow from '@/components/ProductListRow';
import Reveal from '@/components/ui/Reveal';

interface ProductRelatedListProps {
    title: string;
    products: Product[];
}

export const ProductRelatedList: React.FC<ProductRelatedListProps> = ({ title, products }) => {
    if (!products || products.length === 0) return null;
    return (
        <section className="product-related mb-12">
            <h2 className="product-related__title text-2xl font-bold mb-6">{title}</h2>
            <div className="product-related__list flex flex-col gap-3">
                {products.map((p, i) => (
                    <Reveal key={p.id} index={i}>
                        <ProductListRow product={p} />
                    </Reveal>
                ))}
            </div>
        </section>
    );
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open any product page (`/product/<id>`) that has related products or "often bought together" items.
Expected: rows fade in as you scroll down to those sections.

- [ ] **Step 4: Commit**

```bash
git add components/ProductRelatedList.tsx
git commit -m "feat: add scroll-reveal to related/bought-together product lists"
```

---

### Task 4: Apply `Reveal` to the blog listing grids

**Files:**
- Modify: `app/[lang]/blog/page.tsx:147-151` (featured posts) and `app/[lang]/blog/page.tsx:161-165` (all posts)

**Interfaces:**
- Consumes: `Reveal` from Task 1.

- [ ] **Step 1: Add the import**

Add near the top of `app/[lang]/blog/page.tsx`, alongside the existing `BlogCard` import:

```tsx
import Reveal from '@/components/ui/Reveal'
```

- [ ] **Step 2: Wrap the featured-posts grid**

Replace:

```tsx
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {featuredPosts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
```

with:

```tsx
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {featuredPosts.map((post, i) => (
                <Reveal key={post.id} index={i}>
                  <BlogCard post={post} />
                </Reveal>
              ))}
            </div>
```

- [ ] **Step 3: Wrap the all-posts grid**

Replace:

```tsx
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {regularPosts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
```

with:

```tsx
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {regularPosts.map((post, i) => (
                <Reveal key={post.id} index={i}>
                  <BlogCard post={post} />
                </Reveal>
              ))}
            </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open `/blog`.
Expected: featured and regular post cards fade in on load/scroll, same one-shot behavior as the catalog grid.

- [ ] **Step 6: Commit**

```bash
git add "app/[lang]/blog/page.tsx"
git commit -m "feat: add scroll-reveal to blog listing grids"
```

---

### Task 5: Apply `Reveal` to the wishlist grid

**Files:**
- Modify: `app/[lang]/wishlist/page.tsx:71-75`

**Interfaces:**
- Consumes: `Reveal` from Task 1.

- [ ] **Step 1: Add the import**

Add near the top of `app/[lang]/wishlist/page.tsx`, after `import ProductCard from '@/components/ProductCard'`:

```tsx
import Reveal from '@/components/ui/Reveal'
```

- [ ] **Step 2: Wrap the grid items**

Replace:

```tsx
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                        {items.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
```

with:

```tsx
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                        {items.map((product, i) => (
                            <Reveal key={product.id} index={i}>
                                <ProductCard product={product} />
                            </Reveal>
                        ))}
                    </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, add an item to the wishlist, open `/wishlist`.
Expected: cards fade in on load.

- [ ] **Step 5: Commit**

```bash
git add "app/[lang]/wishlist/page.tsx"
git commit -m "feat: add scroll-reveal to wishlist grid"
```

---

### Task 6: Section-level reveal for the bestsellers slider

**Files:**
- Modify: `components/BestsellersSection.tsx`

**Interfaces:**
- Consumes: `Reveal` from Task 1. Wraps the whole `<BestsellersSlider>` call — not individual slides — per the Global Constraints/spec section 2 reasoning (Swiper owns per-slide `transform`; wrapping individual slides risks fighting Swiper's own positioning and the existing hover-flyout `overflow:visible`/`clip-path` setup).

- [ ] **Step 1: Add the import**

Add near the top of `components/BestsellersSection.tsx`, after the `BestsellersSlider` dynamic import:

```tsx
import Reveal from '@/components/ui/Reveal'
```

- [ ] **Step 2: Wrap the slider**

Replace:

```tsx
                <BestsellersSlider arrowsContainerId="bestsellers-slider-arrows" products={products} />
```

with:

```tsx
                <Reveal>
                    <BestsellersSlider arrowsContainerId="bestsellers-slider-arrows" products={products} />
                </Reveal>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the homepage, scroll to the "Bestsellers" section.
Expected: the whole slider block fades+slides in as one unit when it enters the viewport. Confirm the slider's own arrow navigation and slide hover flyouts still work exactly as before (this task only wraps the outer container, it must not alter Swiper's internal behavior).

- [ ] **Step 5: Commit**

```bash
git add components/BestsellersSection.tsx
git commit -m "feat: add scroll-reveal to bestsellers slider section"
```

---

### Task 7: Route transition fade on navigation

**Files:**
- Create: `components/RouteTransition.tsx`
- Modify: `app/[lang]/layout.tsx:96-104`

**Interfaces:**
- Produces: `export default function RouteTransition({ children }: { children: ReactNode })` — client component, remounts its wrapper `div` (class `route-transition`, animation from Task 1's CSS) whenever `usePathname()` changes.
- Consumes: `.route-transition` CSS class from Task 1.

- [ ] **Step 1: Create `components/RouteTransition.tsx`**

```tsx
'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export default function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="route-transition">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the root layout**

Add the import to `app/[lang]/layout.tsx`, after `import AppBreadcrumbs from '@/components/AppBreadcrumbs'`:

```tsx
import RouteTransition from '@/components/RouteTransition'
```

Replace (currently `app/[lang]/layout.tsx:96-103`):

```tsx
            <Header />
            <main id="main-content" className="w-full pb-6">
              <div className="mx-auto mt-2 w-full max-w-7xl px-4">
                <AppBreadcrumbs />
              </div>
              {children}
            </main>
            <Footer />
```

with:

```tsx
            <Header />
            <main id="main-content" className="w-full pb-6">
              <div className="mx-auto mt-2 w-full max-w-7xl px-4">
                <AppBreadcrumbs />
              </div>
              <RouteTransition>{children}</RouteTransition>
            </main>
            <Footer />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`.
Expected:
- Navigate `/catalog` → a product page → `/cart`: page content fades+slides in on each navigation; `Header`/`Footer` do not re-fade.
- On `/catalog`, change a filter or sort order (anything that only updates the query string): confirm the page content does NOT re-fade (only pathname changes should trigger it, not search params).
- Toggle OS "reduce motion" and repeat: content appears instantly, no fade, no flash of invisible content.

- [ ] **Step 5: Commit**

```bash
git add components/RouteTransition.tsx "app/[lang]/layout.tsx"
git commit -m "feat: add fade transition between page navigations"
```

---

### Task 8: Toast enter/exit animation

**Files:**
- Modify: `lib/toast-context.tsx`

**Interfaces:**
- Consumes: `.toast-item` / `.toast-item--leaving` CSS classes from Task 1.
- Internal type change: `ToastItem` gains `leaving?: boolean`. `removeToast(id: string)` signature is unchanged, but its behavior becomes two-phase (mark `leaving`, then actually remove 200ms later). `showToast`'s existing call site is unaffected — it already just calls `removeToast(id)` after its own 2600ms timer.

- [ ] **Step 1: Add the `leaving` field to `ToastItem`**

Replace:

```tsx
type ToastItem = {
  id: string
  message: string
  type: ToastType
}
```

with:

```tsx
type ToastItem = {
  id: string
  message: string
  type: ToastType
  leaving?: boolean
}
```

- [ ] **Step 2: Make `removeToast` two-phase**

Replace:

```tsx
  const removeToast = React.useCallback((id: string): void => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])
```

with:

```tsx
  const removeToast = React.useCallback((id: string): void => {
    setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)))
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 200)
  }, [])
```

- [ ] **Step 3: Apply the animation classes to the rendered toast**

Replace:

```tsx
          <div
            key={toast.id}
            className={`pointer-events-auto min-w-[240px] max-w-sm rounded-md px-4 py-3 text-sm shadow-lg border ${
              toast.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/40 dark:border-green-700 dark:text-green-200'
                : toast.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/40 dark:border-red-700 dark:text-red-200'
                  : 'bg-primary/5 border-primary/30 text-primary dark:bg-primary/40 dark:border-primary/50 dark:text-primary/60'
            }`}
          >
            {toast.message}
          </div>
```

with:

```tsx
          <div
            key={toast.id}
            className={`toast-item ${toast.leaving ? 'toast-item--leaving' : ''} pointer-events-auto min-w-[240px] max-w-sm rounded-md px-4 py-3 text-sm shadow-lg border ${
              toast.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/40 dark:border-green-700 dark:text-green-200'
                : toast.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/40 dark:border-red-700 dark:text-red-200'
                  : 'bg-primary/5 border-primary/30 text-primary dark:bg-primary/40 dark:border-primary/50 dark:text-primary/60'
            }`}
          >
            {toast.message}
          </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, trigger a toast (e.g. add a product to the cart, or clear the wishlist).
Expected: toast slides/fades in on appearance, and fades out (not an abrupt disappearance) roughly 2.6s later. Trigger two toasts in quick succession to confirm each animates independently.

- [ ] **Step 6: Commit**

```bash
git add lib/toast-context.tsx
git commit -m "feat: add enter/exit animation to toast notifications"
```

---

## Final check

After Task 8, run the full type-check once more (`npx tsc --noEmit`) and, if time allows, use the `verify` skill to drive the app end-to-end (catalog, product page, cart, wishlist, blog, a toast trigger) with OS reduce-motion both off and on.
