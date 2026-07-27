# Micro-Interactions: Goal-Oriented UX — Design Spec

**Date:** 2026-06-03  
**Status:** Approved  

---

## Context

hairshop-pro.lv — Next.js B2B/B2C e-commerce. Stack: React 18, Tailwind CSS, Zustand, shadcn/ui.  
All animations via Tailwind utilities + inline CSS keyframes where needed. No new animation library.

---

## 6 Features

### 1. Cart Icon Animation (Header)

**File:** `components/HeaderActions.tsx`  
**Goal:** Confirm "add to cart" action visually in the global UI.

- Subscribe to `useCart` item count in `HeaderActions`
- On count increase → apply CSS keyframe `cartBump` (`scale 1→1.4→1`, duration 400ms) to cart icon
- Use `useEffect` with previous count comparison via `useRef`
- Badge (item count) gets same animation

**CSS:** New keyframe `@keyframes cartBump` added to `globals.css` or via `style` tag.

---

### 2. WishlistButton Pop Animation

**File:** `components/WishlistButton.tsx`  
**Goal:** Emotional confirmation when saving a product.

- On toggle → add class `wishlist-pop` for 400ms then remove
- Keyframe: `scale(1) → scale(1.4) → scale(0.9) → scale(1)` + `rotate(0) → rotate(-15deg) → rotate(0)`
- Use `useState<boolean>(animating)` + `setTimeout` cleanup
- Applied to the SVG heart element

---

### 3. CheckoutGuardButton — Disabled Feedback

**File:** `components/CheckoutGuardButton.tsx`  
**Goal:** Eliminate dead-end UX when cart is empty.

- When `canCheckout = false`: wrap in `TooltipProvider` → show tooltip "Добавьте товары в корзину" on hover
- On click of disabled button → trigger shake animation (`translateX(-4px 4px -4px 4px 0)`, 300ms)
- Use `useState<boolean>(shaking)` + `setTimeout` cleanup
- Tooltip uses existing `components/ui/tooltip.tsx`

---

### 4. Bulk Pricing Progress Bar

**File:** `components/AddToCartButton.tsx`  
**Goal:** Motivate user to add more items to unlock wholesale price.

- Read `product.bulkPricingTiers` — find next tier above current `quantity`
- If next tier exists: show thin progress bar below quantity stepper
  - Width = `(quantity / nextTier.quantity) * 100%`, capped at 100%
  - Label: "Ещё N шт. → цена X €" (using existing `useTranslation`)
  - Bar color: indigo → green at 100% (tier unlocked flash + label changes to "Оптовая цена активна!")
  - Flash: bg briefly `bg-green-500` for 1s when tier reached
- No tiers → render nothing

---

### 5. ProductCard Hover Lift

**File:** `components/ProductCard.tsx`  
**Goal:** Signal clickability, improve perceived quality.

- Add `transition-transform transition-shadow duration-200` + `hover:-translate-y-1 hover:shadow-md` to `Card` className
- One-line change, no state needed

---

### 6. Low-Stock Badge Pulse

**File:** `components/ProductCard.tsx`  
**Goal:** Create urgency when stock < 5.

- Find existing low-stock `Badge` render block (`product.stock < 5 && product.stock > 0`)
- Add `animate-pulse` to its className
- One-line change

---

## Shared Constraints

- No new npm packages
- All keyframes go to `app/globals.css`
- Translations: use existing `useTranslation` + add keys to `data/translations.ts` for `#3` and `#4` labels
- Dark mode: all colors use `dark:` variants where applicable

---

## Files Touched

| File | Change |
|------|--------|
| `components/HeaderActions.tsx` | Cart icon bump animation |
| `components/WishlistButton.tsx` | Heart pop animation |
| `components/CheckoutGuardButton.tsx` | Tooltip + shake on disabled |
| `components/AddToCartButton.tsx` | Bulk pricing progress bar |
| `components/ProductCard.tsx` | Hover lift + low-stock pulse |
| `app/globals.css` | Keyframes: `cartBump`, `wishlistPop`, `shake` |
| `data/translations.ts` | New keys for progress bar + tooltip |
