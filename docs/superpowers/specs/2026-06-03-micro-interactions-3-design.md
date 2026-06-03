# Micro-Interactions Batch 3 — Design Spec

**Date:** 2026-06-03  
**Status:** Approved

---

## Features

### 5. Count-up on Cart Total

**What:** When `grandTotal` changes in the cart (quantity updated, item removed/selected), the price animates smoothly from old to new value using `requestAnimationFrame` + lerp over 500ms.

**Architecture:**
- New `components/AnimatedPrice.tsx` — reusable component
- Props: `value: number`, `format: (n: number) => string`, `duration?: number` (default 500ms)
- Internally: `useRef` for previous value + rAF handle, `useState` for displayed value
- On `value` change: lerp loop `displayed = prev + (next - prev) * (elapsed / duration)`, updates `useState` each frame, stops at elapsed >= duration
- Cleanup: cancels rAF on unmount or new value change

**Usage in cart:** Replace `{formatCurrency(grandTotal)}` in `app/cart/page.tsx` with:
```tsx
<AnimatedPrice value={grandTotal} format={formatCurrency} />
```

`grandTotal` is already a plain number (euros * 100 cents, formatted via `formatEuro`).

**Files:**
- Create: `components/AnimatedPrice.tsx`
- Modify: `app/cart/page.tsx` (one line, add import + replace span content)

---

### 6. Promo Code Confetti Burst

**What:** When a valid promo code is applied in checkout, 7 coloured particles burst outward from the "Apply" button, fly in random directions, rotate 720°, and fade out over 650ms.

**Architecture:**
- New `lib/confetti.ts` — `burstConfetti(originEl: HTMLElement): void`
  - Gets origin center via `getBoundingClientRect()`
  - Creates 7 `<span>` elements appended to `document.body`
  - Each: `position: fixed`, `width: 8px`, `height: 8px`, `border-radius: 50%`
  - CSS custom properties per particle: `--tx` (random ±80px), `--ty` (random ±80px), `--color`
  - Class `confetti-particle` — animation `confettiBurst 0.65s ease-out forwards`
  - Colors: `['#4f46e5','#10b981','#ec4899','#f59e0b','#f97316','#14b8a6','#e11d48']`
  - `setTimeout(() => span.remove(), 700)` per particle

**CSS in `styles/globals.css`:**
```css
@keyframes confettiBurst {
  0%   { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translate(var(--tx), var(--ty)) rotate(720deg) scale(0); opacity: 0; }
}
.confetti-particle {
  position: fixed;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 9999;
  animation: confettiBurst 0.65s ease-out forwards;
}
```

**Wiring in checkout:**
- Add `useRef<HTMLButtonElement>(null)` for the Apply button (`applyBtnRef`)
- Call `burstConfetti(applyBtnRef.current)` after `setAppliedPromo(promoCode)` in `handleApplyPromo`
- Attach `ref={applyBtnRef}` to the Apply `<Button>`

**Files:**
- Create: `lib/confetti.ts`
- Modify: `styles/globals.css`
- Modify: `app/checkout/page.tsx`

---

## Shared Constraints

- No new npm packages
- `prefers-reduced-motion`: `AnimatedPrice` skips animation (jumps to final value); `burstConfetti` skips entirely
- SSR safe: all DOM access inside useEffect / called from event handler only
- `AnimatedPrice` is reusable — same component could be used on checkout summary later

## Files Touched

| File | Change |
|------|--------|
| `components/AnimatedPrice.tsx` | New — rAF lerp animated number display |
| `app/cart/page.tsx` | Replace `grandTotal` span with `<AnimatedPrice>` |
| `lib/confetti.ts` | New — `burstConfetti()` utility |
| `styles/globals.css` | `confettiBurst` keyframe + `.confetti-particle` class |
| `app/checkout/page.tsx` | Ref on Apply button, call `burstConfetti` on success |
