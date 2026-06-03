# Micro-Interactions Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fly-to-cart animation, shimmer on login price CTA, and magnetic checkout button to improve conversion and tactile feel.

**Architecture:** Fly-to-cart uses a singleton DOM overlay component mounted in providers, triggered by a custom browser event. Shimmer uses CSS `background-clip: text`. Magnetic button uses `mousemove` offset math in the existing `CheckoutGuardButton` component.

**Tech Stack:** React 18, TypeScript, Web Animations API (native browser), Tailwind CSS, Next.js App Router.

---

## Files

| File | Change |
|------|--------|
| `styles/globals.css` | Add `shimmerText` keyframe + `.shimmer-text` class |
| `components/FlyToCart.tsx` | New — singleton overlay, listens to `fly-to-cart` event |
| `components/AddToCartButton.tsx` | Fire `fly-to-cart` CustomEvent in `handleAdd` |
| `app/providers.tsx` | Mount `<FlyToCart />` |
| `components/ProductCard.tsx` | Wrap login price in Link + add `.shimmer-text` |
| `components/CheckoutGuardButton.tsx` | Magnetic mouse effect on active branch |

---

### Task 1: CSS — shimmerText keyframe

**Files:**
- Modify: `styles/globals.css`

- [ ] **Step 1: Append to end of `styles/globals.css`**

```css
/* ── Shimmer text ─────────────────────────────────────────────────────── */
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

- [ ] **Step 2: Commit**

```bash
git add styles/globals.css
git commit -m "feat: add shimmerText keyframe and utility class"
```

---

### Task 2: Shimmer on login price CTA (ProductCard)

**Files:**
- Modify: `components/ProductCard.tsx`

The login price text is at the `: (` branch of the `isAuthenticated` ternary (around line 134). Currently:

```tsx
<div className="text-gray-400 text-sm font-medium">
    {t('product.loginToSeePrice', 'Войдите, чтобы увидеть цену')}
</div>
```

- [ ] **Step 1: Replace login price block**

Replace the above with:

```tsx
<Link href="/auth/login" className="block" onClick={(e) => e.stopPropagation()}>
    <div className="shimmer-text text-sm font-medium cursor-pointer">
        {t('product.loginToSeePrice', 'Войдите, чтобы увидеть цену')}
    </div>
</Link>
```

`e.stopPropagation()` is required because the parent `<Card>` has an `onClick` that routes to the product page — without stopping propagation, both would fire.

`Link` is already imported in `ProductCard.tsx` — no new import needed.

- [ ] **Step 2: Commit**

```bash
git add components/ProductCard.tsx
git commit -m "feat: shimmer animation on login price CTA"
```

---

### Task 3: FlyToCart component

**Files:**
- Create: `components/FlyToCart.tsx`

- [ ] **Step 1: Create `components/FlyToCart.tsx`**

```typescript
'use client'

import { useEffect } from 'react'

interface FlyToCartDetail {
  x: number
  y: number
}

export default function FlyToCart(): null {
  useEffect(() => {
    const handleFly = (e: Event) => {
      const { x: startX, y: startY } = (e as CustomEvent<FlyToCartDetail>).detail

      const cartEl = document.querySelector('.header__cart')
      if (!cartEl) return

      const cartRect = cartEl.getBoundingClientRect()
      const targetX = cartRect.left + cartRect.width / 2
      const targetY = cartRect.top + cartRect.height / 2

      const dx = targetX - startX
      const dy = targetY - startY

      const dot = document.createElement('div')
      dot.style.cssText = [
        'position:fixed',
        `left:${startX - 6}px`,
        `top:${startY - 6}px`,
        'width:12px',
        'height:12px',
        'border-radius:50%',
        'background:#4f46e5',
        'z-index:9999',
        'pointer-events:none',
      ].join(';')
      document.body.appendChild(dot)

      const anim = dot.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
          { transform: `translate(${dx * 0.5}px, -80px) scale(0.9)`, opacity: 0.9, offset: 0.45 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0, offset: 1 },
        ],
        { duration: 650, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
      )

      anim.onfinish = () => dot.remove()
    }

    document.addEventListener('fly-to-cart', handleFly)
    return () => document.removeEventListener('fly-to-cart', handleFly)
  }, [])

  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add components/FlyToCart.tsx
git commit -m "feat: FlyToCart overlay component"
```

---

### Task 4: Mount FlyToCart in providers

**Files:**
- Modify: `app/providers.tsx`

- [ ] **Step 1: Add import**

After the existing imports, add:
```typescript
import FlyToCart from '@/components/FlyToCart'
```

- [ ] **Step 2: Mount inside `<Providers>` JSX**

In the `Providers` function, add `<FlyToCart />` alongside the other null-rendering components:

```tsx
export function Providers({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <I18nProvider>
      <ToastProvider>
        <SeedAccounts />
        <WishlistScopeSync />
        <CartUserSync />
        <ChunkErrorRecovery />
        <FlyToCart />
        {children}
      </ToastProvider>
    </I18nProvider>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/providers.tsx
git commit -m "feat: mount FlyToCart in app providers"
```

---

### Task 5: Fire fly-to-cart event from AddToCartButton

**Files:**
- Modify: `components/AddToCartButton.tsx`

The `handleAdd` function currently calls `addItem(product, quantity)` then `showToast(...)`. The button itself needs a ref so we can get its position.

- [ ] **Step 1: Add button ref**

After the existing state declarations, add:
```typescript
const buttonRef = useRef<HTMLButtonElement>(null)
```

`useRef` is already imported in this file.

- [ ] **Step 2: Fire event in `handleAdd` after `addItem`**

Replace the `handleAdd` function body from:
```typescript
addItem(product, quantity)
showToast(t('toast.addedToCart'), 'success')
setAdded(true)
setTimeout(() => setAdded(false), 2000)
```

With:
```typescript
addItem(product, quantity)
showToast(t('toast.addedToCart'), 'success')
setAdded(true)
setTimeout(() => setAdded(false), 2000)

if (buttonRef.current) {
  const rect = buttonRef.current.getBoundingClientRect()
  document.dispatchEvent(
    new CustomEvent('fly-to-cart', {
      detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    })
  )
}
```

- [ ] **Step 3: Attach ref to the Button element**

Find the `<Button` near the bottom of the JSX:
```tsx
<Button
  onClick={handleAdd}
  disabled={isOutOfStock}
  className={...}
>
```

Add `ref={buttonRef}`:
```tsx
<Button
  ref={buttonRef}
  onClick={handleAdd}
  disabled={isOutOfStock}
  className={...}
>
```

Note: `components/ui/button.tsx` uses `React.forwardRef` — the `ref` prop is supported.

- [ ] **Step 4: Commit**

```bash
git add components/AddToCartButton.tsx
git commit -m "feat: fire fly-to-cart event on add to cart"
```

---

### Task 6: Magnetic checkout button

**Files:**
- Modify: `components/CheckoutGuardButton.tsx`

Currently the `canCheckout=true` branch is:
```tsx
if (canCheckout) {
  return (
    <Link href={href} onClick={onNavigate} className="block">
      <Button className={className}>{label}</Button>
    </Link>
  )
}
```

`useRef` and `useState` are already imported.

- [ ] **Step 1: Add magnetic state and ref**

After the existing `shakeTimerRef` declaration, add:
```typescript
const [magOffset, setMagOffset] = useState({ x: 0, y: 0 })
const linkRef = useRef<HTMLAnchorElement>(null)
```

- [ ] **Step 2: Add mouse handlers**

After `handleDisabledClick`, add:
```typescript
const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
  if (!linkRef.current) return
  const rect = linkRef.current.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const ox = Math.max(-6, Math.min(6, ((e.clientX - cx) / (rect.width / 2)) * 6))
  const oy = Math.max(-6, Math.min(6, ((e.clientY - cy) / (rect.height / 2)) * 6))
  setMagOffset({ x: ox, y: oy })
}

const handleMouseLeave = () => setMagOffset({ x: 0, y: 0 })
```

- [ ] **Step 3: Apply to `canCheckout=true` branch**

Replace the branch:
```tsx
if (canCheckout) {
  return (
    <Link
      ref={linkRef}
      href={href}
      onClick={onNavigate}
      className="block"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Button
        className={className}
        style={{ transform: `translate(${magOffset.x}px, ${magOffset.y}px)`, transition: 'transform 0.3s ease' }}
      >
        {label}
      </Button>
    </Link>
  )
}
```

Note: `Link` from `next/link` forwards refs when you pass `ref` directly in Next.js 13+. If TypeScript complains, cast: `ref={linkRef as React.Ref<HTMLAnchorElement>}`.

- [ ] **Step 4: Commit**

```bash
git add components/CheckoutGuardButton.tsx
git commit -m "feat: magnetic cursor effect on checkout button"
```

---

## Self-Review

**Spec coverage:**
- ✅ `shimmerText` keyframe → Task 1
- ✅ Shimmer on login price + Link wrapper → Task 2
- ✅ `FlyToCart` component with Web Animations API arc → Task 3
- ✅ Mounted in providers → Task 4
- ✅ Event fired from `AddToCartButton` with button center coords → Task 5
- ✅ Magnetic effect on checkout button → Task 6

**Placeholder scan:** None found. All steps have complete code.

**Type consistency:**
- `FlyToCartDetail` interface defined in Task 3, used only internally — no cross-task type dependency
- `buttonRef` typed as `useRef<HTMLButtonElement>(null)`, attached to `<Button ref={buttonRef}>` — `Button` uses `forwardRef<HTMLButtonElement>` → compatible ✅
- `linkRef` typed as `useRef<HTMLAnchorElement>(null)`, passed to `<Link ref={linkRef}>` — Next.js `Link` is a forward-ref anchor → compatible ✅
- `magOffset` typed as `{ x: number, y: number }` — used inline in `translate(${magOffset.x}px, ...)` → correct ✅
- `CustomEvent<FlyToCartDetail>` cast in handler matches `new CustomEvent('fly-to-cart', { detail: { x, y } })` in Task 5 → correct ✅
