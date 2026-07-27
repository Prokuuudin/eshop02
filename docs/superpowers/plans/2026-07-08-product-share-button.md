# Product Share Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Icon-only share button to the right of the price block on the product page — native OS share sheet on capable browsers, network dropdown (Facebook/X/Telegram/WhatsApp + copy link) otherwise.

**Architecture:** Pure URL-building logic lives in `lib/share-links.ts` (tested with vitest, matches this repo's convention of testing pure `lib/*` helpers and verifying UI components manually — see `lib/bonus-program.ts` + `components/ProductBonusInfo.tsx` in `docs/superpowers/plans/2026-07-04-product-bonus-info.md`). The UI lives in a new client component `components/ProductShareButton.tsx`, wired into `components/ProductPrices.tsx`.

**Tech Stack:** Next.js (app router), React, `lucide-react` icons, Radix `DropdownMenu` (`components/ui/dropdown-menu.tsx`), `lib/toast-context` for the copy-link confirmation, vitest.

## Global Constraints

- No new translation keys beyond the 3 defined below; reuse existing `t()` / `useToast` / `Button` / `DropdownMenu*` primitives — do not add new UI libraries.
- Full design spec: `docs/superpowers/specs/2026-07-08-product-share-buttons-design.md`. Follow it exactly, including the hydration-safe native-share detection (two separate render trees, `useEffect`-driven flip — **not** a lazy `useState` initializer, which would risk a hydration mismatch).
- Share button must render regardless of auth state and regardless of whether the rating/reviews exist (`ratingCount === 0` still shows a price row + share button).
- Tests: `npx vitest run <file>`. Typecheck: `npx tsc --noEmit`.
- After each commit: `git push origin main` (standing project rule — push immediately, no need to ask).

---

### Task 1: `lib/share-links.ts` — pure share-URL builder

**Files:**
- Create: `lib/share-links.ts`
- Test: `lib/share-links.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces:
  - `interface ShareLinks { facebook: string; x: string; telegram: string; whatsapp: string }`
  - `function buildShareLinks(url: string, title: string): ShareLinks`

- [ ] **Step 1: Write the failing test**

```ts
// lib/share-links.test.ts
import { describe, it, expect } from 'vitest'
import { buildShareLinks } from './share-links'

describe('buildShareLinks', () => {
  const url = 'https://hairshop-pro.lv.vercel.app/product/13011'
  const title = 'Shampoo 250ml'
  // encodeURIComponent(url) -> 'https%3A%2F%2Fhairshop-pro.lv.vercel.app%2Fproduct%2F13011'
  // encodeURIComponent(title) -> 'Shampoo%20250ml'

  it('builds a Facebook sharer link with the encoded URL', () => {
    const links = buildShareLinks(url, title)
    expect(links.facebook).toBe(
      'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fhairshop-pro.lv.vercel.app%2Fproduct%2F13011'
    )
  })

  it('builds an X intent link with encoded URL and title', () => {
    const links = buildShareLinks(url, title)
    expect(links.x).toBe(
      'https://twitter.com/intent/tweet?url=https%3A%2F%2Fhairshop-pro.lv.vercel.app%2Fproduct%2F13011&text=Shampoo%20250ml'
    )
  })

  it('builds a Telegram share link with encoded URL and title', () => {
    const links = buildShareLinks(url, title)
    expect(links.telegram).toBe(
      'https://t.me/share/url?url=https%3A%2F%2Fhairshop-pro.lv.vercel.app%2Fproduct%2F13011&text=Shampoo%20250ml'
    )
  })

  it('builds a WhatsApp link combining title and URL in one encoded text param', () => {
    const links = buildShareLinks(url, title)
    expect(links.whatsapp).toBe(
      'https://wa.me/?text=Shampoo%20250ml%20https%3A%2F%2Fhairshop-pro.lv.vercel.app%2Fproduct%2F13011'
    )
  })

  it('percent-encodes reserved characters (&, spaces) in the title', () => {
    const links = buildShareLinks('https://x.test/p', 'Sale & Deals')
    expect(links.x).toBe(
      'https://twitter.com/intent/tweet?url=https%3A%2F%2Fx.test%2Fp&text=Sale%20%26%20Deals'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/share-links.test.ts`
Expected: FAIL — `Cannot find module './share-links'` (or equivalent resolve error).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/share-links.ts
export interface ShareLinks {
    facebook: string;
    x: string;
    telegram: string;
    whatsapp: string;
}

export function buildShareLinks(url: string, title: string): ShareLinks {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    return {
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        x: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
        telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/share-links.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit and push**

```bash
git add lib/share-links.ts lib/share-links.test.ts
git commit -m "feat(product): add pure share-link URL builder"
git push origin main
```

---

### Task 2: Translations — `product.share.*` keys (ru/en/lv)

**Files:**
- Modify: `data/translations.ts:853` (ru block, after `'product.savings'`)
- Modify: `data/translations.ts:2330` (en block, after `'product.savings'`)
- Modify: `data/translations.ts:4133` (lv block, after `'product.savings'`)

**Interfaces:**
- Produces: translation keys `product.share.label`, `product.share.copyLink`, `product.share.copied`, consumed by Task 3's `ProductShareButton`.

- [ ] **Step 1: Add the ru keys**

In the ru block, find:
```ts
    'product.savings': 'Экономия',
    'product.priceLabel': 'Цена',
```
Replace with:
```ts
    'product.savings': 'Экономия',
    'product.share.label': 'Поделиться',
    'product.share.copyLink': 'Копировать ссылку',
    'product.share.copied': 'Ссылка скопирована',
    'product.priceLabel': 'Цена',
```

- [ ] **Step 2: Add the en keys**

In the en block, find:
```ts
    'product.savings': 'Savings',
    'product.priceLabel': 'Price',
```
Replace with:
```ts
    'product.savings': 'Savings',
    'product.share.label': 'Share',
    'product.share.copyLink': 'Copy link',
    'product.share.copied': 'Link copied',
    'product.priceLabel': 'Price',
```

- [ ] **Step 3: Add the lv keys**

In the lv block, find:
```ts
    'product.savings': 'Ietaupījums',
    'product.priceLabel': 'Cena',
```
Replace with:
```ts
    'product.savings': 'Ietaupījums',
    'product.share.label': 'Dalīties',
    'product.share.copyLink': 'Kopēt saiti',
    'product.share.copied': 'Saite nokopēta',
    'product.priceLabel': 'Cena',
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit and push**

```bash
git add data/translations.ts
git commit -m "i18n: add product.share.* translation keys (ru/en/lv)"
git push origin main
```

---

### Task 3: `components/ProductShareButton.tsx`

**Files:**
- Create: `components/ProductShareButton.tsx`

**Interfaces:**
- Consumes: `buildShareLinks(url, title): ShareLinks` from Task 1 (`@/lib/share-links`); `useTranslation()` → `t(key, fallback?)` from `@/lib/use-translation`; `useToast()` → `showToast(message, type?)` from `@/lib/toast-context`; `Button` from `@/components/ui/button`; `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` from `@/components/ui/dropdown-menu`; `Share2`, `Copy` icons from `lucide-react`.
- Produces: `ProductShareButton({ productTitle }: { productTitle: string })` — default export. No other file depends on its internals beyond this one prop.

- [ ] **Step 1: Create the component**

```tsx
// components/ProductShareButton.tsx
'use client';

import React from 'react';
import { Share2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/lib/use-translation';
import { useToast } from '@/lib/toast-context';
import { buildShareLinks } from '@/lib/share-links';

interface ProductShareButtonProps {
    productTitle: string;
}

export default function ProductShareButton({ productTitle }: ProductShareButtonProps) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    // Starts false to match SSR (no `navigator` on the server); a browser that
    // supports the Web Share API flips this after mount. Two distinct render
    // trees below (native-share button vs. dropdown) avoid ever fighting
    // Radix's own pointerdown-to-open handling on the trigger.
    const [supportsNativeShare, setSupportsNativeShare] = React.useState(false);

    React.useEffect(() => {
        setSupportsNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    }, []);

    const shareLabel = t('product.share.label', 'Share');

    if (supportsNativeShare) {
        const handleNativeShare = async () => {
            try {
                await navigator.share({ title: productTitle, url: window.location.href });
            } catch {
                // AbortError when the user dismisses the native share sheet — nothing to do
            }
        };

        return (
            <Button variant="ghost" size="icon" aria-label={shareLabel} onClick={handleNativeShare}>
                <Share2 className="h-4 w-4" />
            </Button>
        );
    }

    const url = typeof window !== 'undefined' ? window.location.href : '';
    const shareLinks = buildShareLinks(url, productTitle);

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(url);
            showToast(t('product.share.copied', 'Link copied'), 'success');
        } catch {
            // clipboard blocked (insecure context/permissions) — network buttons above still work
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={shareLabel}>
                    <Share2 className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                    <a href={shareLinks.facebook} target="_blank" rel="noopener noreferrer">
                        📘 Facebook
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <a href={shareLinks.x} target="_blank" rel="noopener noreferrer">
                        𝕏 X
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <a href={shareLinks.telegram} target="_blank" rel="noopener noreferrer">
                        💬 Telegram
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <a href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer">
                        🟢 WhatsApp
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleCopyLink}>
                    <Copy className="h-4 w-4 mr-2" />
                    {t('product.share.copyLink', 'Copy link')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add components/ProductShareButton.tsx
git commit -m "feat(product): add ProductShareButton (native share + network dropdown)"
git push origin main
```

---

### Task 4: Wire `ProductShareButton` into `ProductPrices`

**Files:**
- Modify: `components/ProductPrices.tsx`

**Interfaces:**
- Consumes: `ProductShareButton` from Task 3 (`@/components/ProductShareButton`), reusing the existing `productTitle` prop already passed into `ProductPrices`.

- [ ] **Step 1: Replace the file contents**

Current `components/ProductPrices.tsx`:
```tsx
import React from 'react';
import { ProductPrice } from '@/components/ProductPrice';
import { ProductStock } from '@/components/ProductStock';

interface ProductPricesProps {
    price: number;
    oldPrice?: number;
    priceLocale: string;
    stock: number;
    productId: string;
    productTitle: string;
}

export const ProductPrices: React.FC<ProductPricesProps> = ({
    price,
    oldPrice,
    priceLocale,
    stock,
    productId,
    productTitle,
}) => {
    return (
        <div className="product-detail__prices mt-6">
            <ProductPrice
                price={price}
                oldPrice={oldPrice}
                priceLocale={priceLocale}
            />
            <ProductStock stock={stock} productId={productId} productTitle={productTitle} />
        </div>
    );
};
```

Replace with:
```tsx
import React from 'react';
import { ProductPrice } from '@/components/ProductPrice';
import { ProductStock } from '@/components/ProductStock';
import ProductShareButton from '@/components/ProductShareButton';

interface ProductPricesProps {
    price: number;
    oldPrice?: number;
    priceLocale: string;
    stock: number;
    productId: string;
    productTitle: string;
}

export const ProductPrices: React.FC<ProductPricesProps> = ({
    price,
    oldPrice,
    priceLocale,
    stock,
    productId,
    productTitle,
}) => {
    return (
        <div className="product-detail__prices mt-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <ProductPrice
                        price={price}
                        oldPrice={oldPrice}
                        priceLocale={priceLocale}
                    />
                </div>
                <ProductShareButton productTitle={productTitle} />
            </div>
            <ProductStock stock={stock} productId={productId} productTitle={productTitle} />
        </div>
    );
};
```

(The inner `<div>` around `ProductPrice` matters: `ProductPrice` returns a `Fragment` of stacked sibling `div`s — old price / price / savings lines, or the login placeholder. Without the wrapper, those siblings would become flex items of the outer row themselves and lose their vertical stacking.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add components/ProductPrices.tsx
git commit -m "feat(product): show share button to the right of the price block"
git push origin main
```

---

### Task 5: Final verification

**Files:** none new.

- [ ] **Step 1: Full unit test run**

Run: `npm run test:unit`
Expected: PASS, including the 5 new `lib/share-links.test.ts` cases.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual walkthrough in the running app**

`npm run dev`, open a product page (e.g. `/product/13011`):
- Desktop Chrome (no Web Share API): share icon sits to the right of the price block (top-aligned); clicking opens a dropdown with 📘 Facebook, 𝕏 X, 💬 Telegram, 🟢 WhatsApp, and "Copy link"/"Копировать ссылку".
  - Each network item opens the correct share URL in a new tab (verify the `url=`/`u=`/`text=` query params match the current page).
  - "Copy link" copies the current URL to the clipboard and shows a toast ("Link copied" / "Ссылка скопирована" depending on active language).
- Chrome DevTools → toggle device toolbar (mobile emulation) does **not** actually expose `navigator.share` in desktop Chrome, so the native-share branch can only be verified on a real mobile browser (Android Chrome / iOS Safari) or is accepted as reviewed-by-code if unavailable: tapping the icon should open the OS share sheet directly, no dropdown.
- Verify the button appears even on a product with `ratingCount === 0` (no reviews yet) — price row still shows the share icon.
- Verify the button appears for a logged-out visitor (price replaced by "Войдите, чтобы увидеть цену") — share icon still renders in the row.
- Switch site language (ru/en/lv) and confirm the `aria-label` and dropdown text switch accordingly.

- [ ] **Step 4: Report to user**

Summarize what was verified and any manual-only gaps (e.g. native Web Share API not exercised on desktop).
