# Micro-Interactions Batch 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add count-up animation on cart total and confetti burst on promo code success.

**Architecture:** `AnimatedPrice` is a focused React component using `requestAnimationFrame` + lerp, mounted in place of a static price span. `burstConfetti` is a plain TS utility (no React) that imperatively creates and removes DOM particles. Both respect `prefers-reduced-motion`.

**Tech Stack:** React 18, TypeScript, `requestAnimationFrame` (native), CSS keyframes, Next.js App Router (`'use client'`).

---

## Files

| File | Change |
|------|--------|
| `components/AnimatedPrice.tsx` | New — rAF lerp animated number display |
| `app/cart/page.tsx` | Import `AnimatedPrice`, replace static `grandTotal` span |
| `lib/confetti.ts` | New — `burstConfetti(origin)` utility |
| `styles/globals.css` | `confettiBurst` keyframe + `.confetti-particle` class |
| `app/checkout/page.tsx` | `useRef` on Apply button, call `burstConfetti` on promo success |

---

### Task 1: AnimatedPrice component

**Files:**
- Create: `components/AnimatedPrice.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'

interface AnimatedPriceProps {
  value: number
  format: (n: number) => string
  duration?: number
}

export default function AnimatedPrice({ value, format, duration = 500 }: AnimatedPriceProps) {
  const [displayed, setDisplayed] = useState(value)
  const prevRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayed(value)
      prevRef.current = value
      return
    }

    const from = prevRef.current
    const to = value
    if (from === to) return

    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      setDisplayed(from + (to - from) * progress)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        prevRef.current = to
      }
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      prevRef.current = value
    }
  }, [value, duration])

  return <>{format(Math.round(displayed))}</>
}
```

- [ ] **Step 2: Commit**

```bash
git add components/AnimatedPrice.tsx
git commit -m "feat: AnimatedPrice component with rAF lerp"
```

---

### Task 2: Wire AnimatedPrice into cart page

**Files:**
- Modify: `app/cart/page.tsx`

The cart page is `'use client'` and already imports from `@/lib/utils`. The `grandTotal` value is a plain number computed at line ~105. It is rendered at line ~315:

```tsx
<span className="cart__summary-total-value text-indigo-600">
    {formatCurrency(grandTotal)}
</span>
```

- [ ] **Step 1: Add import after existing imports**

```typescript
import AnimatedPrice from '@/components/AnimatedPrice';
```

- [ ] **Step 2: Replace static render with AnimatedPrice**

Find:
```tsx
<span className="cart__summary-total-value text-indigo-600">
    {formatCurrency(grandTotal)}
</span>
```

Replace with:
```tsx
<span className="cart__summary-total-value text-indigo-600">
    <AnimatedPrice value={grandTotal} format={formatCurrency} />
</span>
```

- [ ] **Step 3: Commit**

```bash
git add app/cart/page.tsx
git commit -m "feat: animated count-up on cart total"
```

---

### Task 3: Confetti CSS keyframe

**Files:**
- Modify: `styles/globals.css`

- [ ] **Step 1: Append to end of `styles/globals.css`**

```css
/* ── Confetti burst ───────────────────────────────────────────────────── */
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

- [ ] **Step 2: Commit**

```bash
git add styles/globals.css
git commit -m "feat: confettiBurst keyframe and particle class"
```

---

### Task 4: burstConfetti utility

**Files:**
- Create: `lib/confetti.ts`

- [ ] **Step 1: Create the utility**

```typescript
const COLORS = ['#4f46e5', '#10b981', '#ec4899', '#f59e0b', '#f97316', '#14b8a6', '#e11d48']
const COUNT = 7

export function burstConfetti(originEl: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const rect = originEl.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * 360
    const rad = (angle * Math.PI) / 180
    const dist = 55 + Math.random() * 35
    const tx = Math.round(Math.cos(rad) * dist)
    const ty = Math.round(Math.sin(rad) * dist)
    const color = COLORS[i % COLORS.length]

    const span = document.createElement('span')
    span.className = 'confetti-particle'
    span.style.cssText = [
      `left:${cx - 4}px`,
      `top:${cy - 4}px`,
      `background:${color}`,
      `--tx:${tx}px`,
      `--ty:${ty}px`,
    ].join(';')
    document.body.appendChild(span)
    setTimeout(() => span.remove(), 700)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/confetti.ts
git commit -m "feat: burstConfetti utility"
```

---

### Task 5: Wire confetti into checkout page

**Files:**
- Modify: `app/checkout/page.tsx`

The checkout page has `handleApplyPromo` (line ~163) that calls `setAppliedPromo(promoCode)` on success (line ~180). The Apply button is at line ~746.

Current imports start with `import React, { useState } from 'react'`.

- [ ] **Step 1: Add `useRef` to React import**

Change:
```typescript
import React, { useState } from 'react';
```
To:
```typescript
import React, { useRef, useState } from 'react';
```

- [ ] **Step 2: Add confetti import** after existing imports:

```typescript
import { burstConfetti } from '@/lib/confetti';
```

- [ ] **Step 3: Add ref inside the component**

Inside the `CheckoutPage` component function, after existing `useState` declarations, add:
```typescript
const applyBtnRef = useRef<HTMLButtonElement>(null)
```

- [ ] **Step 4: Call burstConfetti after setAppliedPromo**

Find in `handleApplyPromo`:
```typescript
setAppliedPromo(promoCode);
```

Replace with:
```typescript
setAppliedPromo(promoCode);
if (applyBtnRef.current) burstConfetti(applyBtnRef.current);
```

- [ ] **Step 5: Attach ref to Apply button**

Find the Apply button (around line 746):
```tsx
<Button
    type="button"
    onClick={handleApplyPromo}
    disabled={!!appliedPromo}
    className="px-3 py-2 text-sm"
    variant={appliedPromo ? 'outline' : 'default'}
>
```

Add `ref={applyBtnRef}`:
```tsx
<Button
    ref={applyBtnRef}
    type="button"
    onClick={handleApplyPromo}
    disabled={!!appliedPromo}
    className="px-3 py-2 text-sm"
    variant={appliedPromo ? 'outline' : 'default'}
>
```

Note: `Button` in this project uses `React.forwardRef<HTMLButtonElement>` — ref works.

- [ ] **Step 6: Commit**

```bash
git add app/checkout/page.tsx
git commit -m "feat: confetti burst on promo code success"
```

---

## Self-Review

**Spec coverage:**
- ✅ `AnimatedPrice` rAF lerp 500ms → Task 1
- ✅ `prefers-reduced-motion` on AnimatedPrice → Task 1 (skips to final value)
- ✅ Wired into cart `grandTotal` → Task 2
- ✅ `confettiBurst` keyframe + `.confetti-particle` → Task 3
- ✅ `burstConfetti()` with 7 particles, random tx/ty, colors → Task 4
- ✅ `prefers-reduced-motion` on burstConfetti → Task 4 (early return)
- ✅ Ref on Apply button, call after `setAppliedPromo` → Task 5

**Placeholders:** None.

**Type consistency:**
- `AnimatedPrice` props: `value: number`, `format: (n: number) => string` — used as `<AnimatedPrice value={grandTotal} format={formatCurrency} />` where `grandTotal: number` and `formatCurrency: (value: number) => string` ✅
- `burstConfetti(originEl: HTMLElement)` — called as `burstConfetti(applyBtnRef.current)` where ref is `useRef<HTMLButtonElement>`. `HTMLButtonElement extends HTMLElement` ✅
- `--tx` / `--ty` CSS custom properties set as inline `style.cssText` strings, referenced in keyframe `var(--tx)` / `var(--ty)` ✅
