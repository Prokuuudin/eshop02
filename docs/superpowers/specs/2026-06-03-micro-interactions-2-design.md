# Micro-Interactions Batch 2 — Design Spec

**Date:** 2026-06-03  
**Status:** Approved

---

## Features

### 1. Fly-to-cart Animation

**What:** On "В корзину" click, a small indigo dot flies from the button to the cart icon in the header along a parabolic arc.

**Architecture:**
- `AddToCartButton.tsx` fires `new CustomEvent('fly-to-cart', { detail: { x, y }, bubbles: true })` inside `handleAdd`, where `x/y` is the center of the button via `getBoundingClientRect()`
- New `components/FlyToCart.tsx` — singleton `null`-rendering component added to `app/providers.tsx`, listens to `fly-to-cart` on `document`
- On event: find cart icon target via `document.querySelector('.header__cart')`, get its center, create a `<div>` appended to `document.body` at `position: fixed`, animate with Web Animations API, remove on finish

**Dot style:** 12×12px, `border-radius: 50%`, `background: #4f46e5` (indigo-600), `z-index: 9999`

**Arc keyframes (Web Animations API):**
```js
[
  { transform: 'translate(0, 0) scale(1)',   opacity: 1,   offset: 0 },
  { transform: `translate(${dx*0.5}px, -80px) scale(0.9)`, opacity: 0.9, offset: 0.45 },
  { transform: `translate(${dx}px, ${dy}px) scale(0.3)`,   opacity: 0,   offset: 1 },
]
// duration: 650ms, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
```

Where `dx = targetCx - startCx`, `dy = targetCy - startCy`.

**Cart bump:** The existing `cartBumping` animation in `HeaderActions` fires naturally because cart count increases — no extra wiring needed.

**Edge case:** If `.header__cart` not found (mobile, hidden header) — skip animation silently.

**Files:**
- Create: `components/FlyToCart.tsx`
- Modify: `components/AddToCartButton.tsx` — fire event in `handleAdd` after `addItem`
- Modify: `app/providers.tsx` — mount `<FlyToCart />`

---

### 2. Shimmer on "Войдите, чтобы увидеть цену"

**What:** Animated shimmer gradient on the login-prompt text in `ProductCard`, making it look like a CTA rather than a dead label.

**Mechanic:** `background-clip: text` + animated `linear-gradient` scrolls left→right on infinite loop (2.5s).

**CSS (`styles/globals.css`):**
```css
@keyframes shimmerText {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}

.shimmer-text {
  background: linear-gradient(90deg, #9ca3af 0%, #e5e7eb 45%, #9ca3af 55%, #9ca3af 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmerText 2.5s linear infinite;
}

.dark .shimmer-text {
  background: linear-gradient(90deg, #6b7280 0%, #d1d5db 45%, #6b7280 55%, #6b7280 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
}
```

**JSX change in `ProductCard.tsx`:** Wrap the text in `<Link href="/auth/login">` with `cursor-pointer`, apply class `shimmer-text`:
```tsx
<Link href="/auth/login" className="block">
  <div className="shimmer-text text-sm font-medium cursor-pointer">
    {t('product.loginToSeePrice', 'Войдите, чтобы увидеть цену')}
  </div>
</Link>
```

**Files:**
- Modify: `styles/globals.css`
- Modify: `components/ProductCard.tsx`

---

### 3. Magnetic Checkout Button

**What:** When `canCheckout=true`, the checkout button follows the cursor slightly on hover (±6px max), creating a tactile "pull" feel.

**Mechanic:**
- `onMouseMove` on the `<Link>` wrapper: calculate `(mouseX - buttonCenterX) / (buttonWidth/2) * 6` for both axes, clamped to ±6px
- Apply via `style={{ transform: \`translate(${ox}px, ${oy}px)\` }}` on the inner `<Button>`
- `onMouseLeave`: reset offset to `{x: 0, y: 0}` — transition `0.3s ease` handles the spring-back
- Need `useRef` on the Link element for `getBoundingClientRect()`

**State:** `const [magOffset, setMagOffset] = useState({ x: 0, y: 0 })`

**Files:**
- Modify: `components/CheckoutGuardButton.tsx`

---

## Shared Constraints

- No new npm packages
- Web Animations API has full support in target browsers (Chrome/FF/Safari/Edge)
- `background-clip: text` requires `-webkit-` prefix for Safari — included
- Magnetic effect only on `canCheckout=true` branch — disabled branch already has shake

## Files Touched Summary

| File | Change |
|------|--------|
| `styles/globals.css` | `shimmerText` keyframe + `.shimmer-text` class |
| `components/FlyToCart.tsx` | New: fly-to-cart overlay logic |
| `components/AddToCartButton.tsx` | Fire `fly-to-cart` custom event |
| `app/providers.tsx` | Mount `<FlyToCart />` |
| `components/ProductCard.tsx` | Wrap login price in Link + shimmer class |
| `components/CheckoutGuardButton.tsx` | Magnetic mouse effect |
