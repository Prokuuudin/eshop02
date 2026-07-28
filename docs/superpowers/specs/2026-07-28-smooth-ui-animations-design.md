# Smooth UI animations (page/element entrance)

## Problem

Pages and elements appear abruptly: no transition between routes, product/blog grids render fully-formed with no entrance animation, toasts pop in/out with no transition. Dialogs and dropdowns already animate (radix `data-state` + `tailwindcss-animate`) and are out of scope.

## Approach

Pure CSS. No new dependencies (framer-motion rejected — bundle cost not justified when CSS covers all four areas).

## 1. Route transitions

New client component `components/RouteTransition.tsx`, wraps `{children}` inside `app/[lang]/layout.tsx`'s `<main>`, around the page content only — not `Header`/`Footer`/`AppBreadcrumbs`, so persistent chrome never re-fades.

```tsx
'use client'
import { usePathname } from 'next/navigation'

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <div key={pathname} className="route-transition">{children}</div>
}
```

`key={pathname}` forces remount on path change — App Router already remounts the page-segment tree on navigation, so this adds no extra remount cost. Keyed on `pathname` only (not search params), so catalog filter changes (`router.replace` with `scroll:false`) do not retrigger the fade.

CSS (`styles/globals.css`):
```css
@keyframes page-enter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.route-transition { animation: page-enter 0.28s ease-out both; }
```

## 2. Scroll-reveal for grids/sections

New component `components/ui/Reveal.tsx`: IntersectionObserver-backed, one-shot (stays visible once triggered, does not hide again on scroll-out). Renders a wrapper `div` so it drops into existing CSS grids as one extra grid item per card (column count unaffected).

```tsx
'use client'
type RevealProps = { children: React.ReactNode; index?: number; className?: string }
```

- `threshold: 0.1`, `rootMargin: '0px 0px -10% 0px'`.
- Adds `is-visible` class when first intersecting, then `unobserve`s.
- Above-the-fold items intersect on first observer callback (near-immediate), so page-load appearance is a quick fade, not a delayed scroll-triggered one — same component naturally covers both "on scroll" and "on load".
- Optional `index` prop for stagger: inline `style={{ transitionDelay: \`${Math.min(index * 40, 240)}ms\` }}`.

CSS:
```css
.reveal { opacity: 0; transform: translateY(10px); transition: opacity 0.38s ease-out, transform 0.38s ease-out; }
.reveal.is-visible { opacity: 1; transform: translateY(0); }
```

**Applied at grid-item level** (wraps each card, not the grid container) in:
- `components/Products.tsx` — catalog grid view + list view (`ProductCard`, `ProductListRow`)
- `components/NewArrivalsSection.tsx`
- related/bought-together grid in `components/ProductPageContent.tsx`
- blog listing grid (wherever `BlogCard` is mapped)
- wishlist grid page

**Applied at section level** (wraps the whole block, not per-card) for Swiper-based sliders:
- `components/BestsellersSlider.tsx` / `components/BestsellersSection.tsx`

Reasoning: Swiper already drives per-slide `transform: translate3d(...)` for carousel positioning; adding our own transform/transition to individual slides risks fighting Swiper's own transform and the existing `overflow:visible` + `clip-path` hover-flyout hack (see card-hover-flyout memory). Revealing the section as one block sidesteps that entirely.

React reuses component instances by `key`, so re-sorting/re-filtering a grid (same `id` keys, reordered) does not replay the entrance animation — only genuinely new/remounted cards animate in.

## 3. Toasts (`lib/toast-context.tsx`)

Currently no enter/exit animation at all — array push/splice mounts/unmounts the toast `div` instantly.

Change: `ToastItem` gains `leaving?: boolean`. `removeToast` no longer removes immediately — it flags the toast `leaving: true`, then a second timeout (200ms, matching the exit animation duration) actually filters it out of state. `showToast`'s existing 2600ms auto-dismiss timer now calls this same two-phase `removeToast`.

```css
@keyframes toast-in  { from { opacity: 0; transform: translateY(8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes toast-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(8px); } }
.toast-item          { animation: toast-in 0.25s ease-out; }
.toast-item--leaving { animation: toast-out 0.2s ease-in forwards; }
```

## 4. Reduced motion

Single global rule in `styles/globals.css`, added after the new keyframes:
```css
@media (prefers-reduced-motion: reduce) {
  .route-transition,
  .reveal,
  .toast-item,
  .toast-item--leaving {
    animation: none !important;
    transition: none !important;
  }
  .reveal { opacity: 1 !important; transform: none !important; }
}
```
`.reveal` must be forced to `opacity: 1` here, otherwise a reduced-motion user with a disabled transition would get content stuck at `opacity: 0` (no transition means no way to reach the `is-visible` end-state visually — the class still gets added by the observer, but without a transition the jump is instant, which is exactly what reduced-motion wants — this rule just guarantees the pre-trigger state is never permanently invisible if JS/observer is slow or fails).

## Explicitly out of scope

- `components/ui/dialog.tsx`, `dropdown-menu.tsx` — already animated via radix `data-state` + `tailwindcss-animate`.
- `CartDrawer.tsx` — already has its own `transition-transform`/`transition-opacity`.
- Micro-interactions (`animate-cart-bump`, `animate-wishlist-pop`, confetti, shimmer) — separate existing system, untouched.
- Admin panel grids — not part of the customer-facing "resembles abrupt" complaint; left for a separate pass if requested.

## Testing

- Manual: navigate between catalog → product → cart, confirm fade, confirm filter/sort changes on catalog do NOT retrigger page-level fade.
- Manual: scroll catalog/related/blog grids, confirm cards fade in once and don't replay on scroll-up, confirm above-the-fold cards fade quickly on load rather than popping in.
- Manual: trigger a toast (e.g. add to cart), confirm slide/fade in and fade out before removal.
- Manual: OS-level "reduce motion" toggle, confirm all of the above render instantly with no stuck-invisible elements.
- No unit tests planned — this is CSS/visual behavior; existing e2e (if any touch these pages) should still pass since no DOM structure changes beyond added wrapper `div`s.
