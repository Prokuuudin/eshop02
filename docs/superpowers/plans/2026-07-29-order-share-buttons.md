# Order Share Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an icon-only "share" control next to the invoice-download buttons on the order confirmation page, letting a customer send the order (via native OS share sheet, or a text-only fallback for Email/WhatsApp/Telegram) to someone else.

**Architecture:** A pure, unit-tested URL-builder lives in `lib/share-order.ts`. A thin client component `components/ShareOrderButton.tsx` renders two mutually exclusive trees — depending on whether the browser supports the Web Share API — so we never fight Radix's own pointerdown-to-open handling on a single trigger. It's wired into the existing invoice-buttons block in `app/[lang]/order/[id]/page.tsx`.

**Tech Stack:** Next.js client component, `lucide-react` icons, shadcn `Tooltip`/`DropdownMenu`/`Button`, existing `useTranslation()` i18n hook, `vitest` for the pure-logic unit test.

## Global Constraints

- No DB schema changes, no new backend endpoint — this is entirely client-side (per [[project_no_schema_changes]]).
- No brand SVGs for WhatsApp/Telegram — neutral `lucide-react` icons only (`Mail`, `MessageCircle`, `Send`), matching the rest of the site's `currentColor` icon treatment.
- Fallback dropdown items are icon-only with their own tooltip — no visible text labels.
- Share text template: store name + order number + total, no order-page link (the order page is access-gated to the owner/admin — a shared link would 404 for anyone else).
- Default invoice language for the native-share file attachment is `'lv'`, matching the primary (first) "Скачать счёт" button.
- New i18n keys go in all three `data/translations.ts` language blocks (ru/en/lv), following the existing `order.downloadInvoice` key style.
- This is a proven architecture: a near-identical `ProductShareButton` shipped on 2026-07-08 (commits `966bdf5`, `820e6d0`, `a30c990`) and worked correctly before being removed on 2026-07-15 for unrelated reasons (the whole specs/share block was dropped from the product page, not because the share button itself was broken — see commit `3bfc74e`). Mirror its hydration-safe two-tree pattern.

---

### Task 1: Pure share-URL builder (`lib/share-order.ts`)

**Files:**
- Create: `lib/share-order.ts`
- Test: `lib/share-order.test.ts`

**Interfaces:**
- Produces: `export type ShareChannel = 'email' | 'whatsapp' | 'telegram'` and `export function buildShareChannelUrl(channel: ShareChannel, text: string): string` — consumed by Task 2's `ShareOrderButton.tsx`.

- [ ] **Step 1: Write the failing test**

Create `lib/share-order.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildShareChannelUrl } from './share-order'

describe('buildShareChannelUrl', () => {
  const text = 'hairshoppro.lv — заказ №1234, сумма 45,90 €'

  it('builds a mailto link with the text as both subject and body', () => {
    const url = buildShareChannelUrl('email', text)
    expect(url).toBe(
      `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(text)}`
    )
  })

  it('builds a wa.me link with the encoded text', () => {
    const url = buildShareChannelUrl('whatsapp', text)
    expect(url).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`)
  })

  it('builds a Telegram share link with an empty url param and the encoded text', () => {
    const url = buildShareChannelUrl('telegram', text)
    expect(url).toBe(`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`)
  })

  it('percent-encodes reserved characters (&, #, spaces) correctly', () => {
    const url = buildShareChannelUrl('whatsapp', 'Order #1 & Order #2')
    expect(url).toBe('https://wa.me/?text=Order%20%231%20%26%20Order%20%232')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/share-order.test.ts`
Expected: FAIL — `Cannot find module './share-order'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `lib/share-order.ts`:

```ts
export type ShareChannel = 'email' | 'whatsapp' | 'telegram'

export function buildShareChannelUrl(channel: ShareChannel, text: string): string {
  const encoded = encodeURIComponent(text)

  switch (channel) {
    case 'email':
      return `mailto:?subject=${encoded}&body=${encoded}`
    case 'whatsapp':
      return `https://wa.me/?text=${encoded}`
    case 'telegram':
      return `https://t.me/share/url?url=&text=${encoded}`
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/share-order.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/share-order.ts lib/share-order.test.ts
git commit -m "feat: add pure share-channel URL builder for order sharing"
```

---

### Task 2: i18n keys + `ShareOrderButton` component

**Files:**
- Modify: `data/translations.ts` (three insertion points — ru block near line 1015, en block near line 2510, lv block near line 4323)
- Create: `components/ShareOrderButton.tsx`

**Interfaces:**
- Consumes: `buildShareChannelUrl` from Task 1 (`@/lib/share-order`); `Order` type from `@/lib/orders-store`; `buildInvoiceHtml`, `fetchInvoiceTitles` from `@/lib/invoice-template`; `formatEuro`, `getLocaleFromLanguage` from `@/lib/utils`; `useTranslation` from `@/lib/use-translation`; `Button` from `@/components/ui/button`; `Tooltip`/`TooltipContent`/`TooltipProvider`/`TooltipTrigger` from `@/components/ui/tooltip`; `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` from `@/components/ui/dropdown-menu`.
- Produces: `export default function ShareOrderButton({ order }: { order: Order }): JSX.Element` — consumed by Task 3 in `app/[lang]/order/[id]/page.tsx`.

No automated test for this component — the project has no jsdom/React-Testing-Library setup (`vitest.config.ts` uses `environment: 'node'`, and no `.test.tsx` files exist anywhere in the repo). Verification is manual, via the dev server, in Task 3's final step.

- [ ] **Step 1: Add i18n keys to `data/translations.ts`**

In the `ru` block, right after line 1016 (`'order.downloadInvoiceEn': 'Скачать счёт (PDF) (EN)',`), add:

```ts
    'order.share': 'Поделиться',
    'order.shareText': 'hairshoppro.lv — заказ №{orderId}, сумма {total}',
    'order.shareEmail': 'Email',
    'order.shareWhatsapp': 'WhatsApp',
    'order.shareTelegram': 'Telegram',
```

In the `en` block, right after line 2511 (`'order.downloadInvoiceEn': 'Download invoice (PDF) (EN)',`), add:

```ts
    'order.share': 'Share',
    'order.shareText': 'hairshoppro.lv — order #{orderId}, total {total}',
    'order.shareEmail': 'Email',
    'order.shareWhatsapp': 'WhatsApp',
    'order.shareTelegram': 'Telegram',
```

In the `lv` block, right after line 4324 (`'order.downloadInvoiceEn': 'Lejupielādēt rēķinu (PDF) (EN)',`), add:

```ts
    'order.share': 'Kopīgot',
    'order.shareText': 'hairshoppro.lv — pasūtījums Nr.{orderId}, summa {total}',
    'order.shareEmail': 'E-pasts',
    'order.shareWhatsapp': 'WhatsApp',
    'order.shareTelegram': 'Telegram',
```

(Line numbers shift by 5 after each earlier insertion — insert ru first, then en, then lv, re-locating each anchor by searching for `'order.downloadInvoiceEn'` rather than trusting the original line number.)

- [ ] **Step 2: Verify translations file still compiles**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Create `components/ShareOrderButton.tsx`**

```tsx
'use client';

import React from 'react';
import { Share2, Mail, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import { buildInvoiceHtml, fetchInvoiceTitles } from '@/lib/invoice-template';
import { buildShareChannelUrl } from '@/lib/share-order';
import type { Order } from '@/lib/orders-store';

interface ShareOrderButtonProps {
    order: Order;
}

export default function ShareOrderButton({ order }: ShareOrderButtonProps) {
    const { t, language } = useTranslation();
    // Starts false to match SSR (no `navigator` on the server); a browser that
    // supports the Web Share API flips this after mount. Two distinct render
    // trees below (native-share button vs. dropdown) avoid ever fighting
    // Radix's own pointerdown-to-open handling on the trigger.
    const [supportsNativeShare, setSupportsNativeShare] = React.useState(false);

    React.useEffect(() => {
        setSupportsNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    }, []);

    const shareLabel = t('order.share', 'Share');
    const shareText = t(
        'order.shareText',
        'hairshoppro.lv — заказ №{orderId}, сумма {total}',
        { orderId: order.id, total: formatEuro(order.total, getLocaleFromLanguage(language)) }
    );

    if (supportsNativeShare) {
        const handleNativeShare = async () => {
            const shareData: ShareData = { title: shareText, text: shareText };

            try {
                const titles = await fetchInvoiceTitles(order.items, 'lv');
                const html = buildInvoiceHtml(order, titles, 'lv');
                const file = new File([html], `invoice-${order.id}.html`, { type: 'text/html' });
                if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                    await navigator.share({ ...shareData, files: [file] });
                    return;
                }
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return;
            }

            try {
                await navigator.share(shareData);
            } catch {
                // AbortError (user dismissed) or no-op — nothing to do either way
            }
        };

        return (
            <TooltipProvider delayDuration={150}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" aria-label={shareLabel} onClick={handleNativeShare}>
                            <Share2 className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{shareLabel}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    const emailLabel = t('order.shareEmail', 'Email');
    const whatsappLabel = t('order.shareWhatsapp', 'WhatsApp');
    const telegramLabel = t('order.shareTelegram', 'Telegram');

    return (
        <TooltipProvider delayDuration={150}>
            <DropdownMenu>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" aria-label={shareLabel}>
                                <Share2 className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{shareLabel}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuItem asChild>
                                <a
                                    href={buildShareChannelUrl('email', shareText)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={emailLabel}
                                >
                                    <Mail className="h-4 w-4" />
                                </a>
                            </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right">{emailLabel}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuItem asChild>
                                <a
                                    href={buildShareChannelUrl('whatsapp', shareText)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={whatsappLabel}
                                >
                                    <MessageCircle className="h-4 w-4" />
                                </a>
                            </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right">{whatsappLabel}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuItem asChild>
                                <a
                                    href={buildShareChannelUrl('telegram', shareText)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={telegramLabel}
                                >
                                    <Send className="h-4 w-4" />
                                </a>
                            </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right">{telegramLabel}</TooltipContent>
                    </Tooltip>
                </DropdownMenuContent>
            </DropdownMenu>
        </TooltipProvider>
    );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors in the new file.

- [ ] **Step 5: Commit**

```bash
git add data/translations.ts components/ShareOrderButton.tsx
git commit -m "feat: add ShareOrderButton with native-share and icon-only fallback"
```

---

### Task 3: Wire into the order confirmation page

**Files:**
- Modify: `app/[lang]/order/[id]/page.tsx:12-14` (import), `app/[lang]/order/[id]/page.tsx:687-690` (render)

**Interfaces:**
- Consumes: `ShareOrderButton` from Task 2 (`@/components/ShareOrderButton`), rendered with the page's existing `order` variable (already typed as `Order`, non-null at the render point — see the existing `order.subtotal`/`order.total` reads a few lines above).

- [ ] **Step 1: Add the import**

In `app/[lang]/order/[id]/page.tsx`, after line 14 (`import ReturnRequestDialog from '@/components/ReturnRequestDialog';`), add:

```tsx
import ShareOrderButton from '@/components/ShareOrderButton';
```

- [ ] **Step 2: Render the button next to the invoice buttons**

Find this block (currently lines 687-689):

```tsx
                            <div className="space-y-2">
                                <Button className="w-full" onClick={() => handleDownloadInvoice('lv')}>{t('order.downloadInvoice')}</Button>
                                <Button variant="outline" className="w-full" onClick={() => handleDownloadInvoice('en')}>{t('order.downloadInvoiceEn')}</Button>
```

Replace the two-button block with a flex row that adds the share button on the same line as the two invoice buttons:

```tsx
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <Button className="flex-1" onClick={() => handleDownloadInvoice('lv')}>{t('order.downloadInvoice')}</Button>
                                    <Button variant="outline" className="flex-1" onClick={() => handleDownloadInvoice('en')}>{t('order.downloadInvoiceEn')}</Button>
                                    <ShareOrderButton order={order} />
                                </div>
```

(The rest of the `space-y-2` block — the return-request button, the "continue shopping" link — is unchanged; only these two lines are replaced by the flex row above.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, then open `http://localhost:3000/ru/order/<any-existing-order-id>` (grab a real order id from the admin orders list or by placing a test order through checkout).

Check:
- The share icon button renders to the right of the two invoice buttons, no visible text.
- Hovering it shows the "Поделиться" tooltip (and "Share"/"Kopīgot" when switching site language via the language switcher).
- Clicking it: on a browser without `navigator.share` (desktop Chrome does have it in recent versions — Firefox desktop does not) it opens a small dropdown with 3 icon-only items (Mail/MessageCircle/Send), each showing its own tooltip on hover, each opening its respective `mailto:`/`wa.me`/`t.me` link in a new tab with the order number and total pre-filled.
- On a mobile device or emulated mobile viewport in Chrome DevTools with device toolbar (which still reports desktop `navigator.share` unless truly on a share-API-supporting engine) — if `navigator.share` is available, clicking invokes the OS share sheet instead of the dropdown.

- [ ] **Step 5: Run the full unit suite**

Run: `npm run test:unit`
Expected: all passing, including the new `lib/share-order.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add app/\[lang\]/order/\[id\]/page.tsx
git commit -m "feat: wire ShareOrderButton into order confirmation page"
```

---

## Self-Review Notes

- **Spec coverage:** icon (Share2, icon-only) ✓ Task 2/3; email+WhatsApp+Telegram channels ✓ Task 2; multilingual tooltip ✓ Task 2 (main button + each fallback item); native-share-first with text fallback ✓ Task 2; no schema/backend changes ✓ (client-only throughout); placement next to invoice buttons ✓ Task 3.
- **Type consistency:** `ShareOrderButton({ order }: { order: Order })` in Task 2 matches `<ShareOrderButton order={order} />` in Task 3, where `order` is the page's existing `Order`-typed variable. `buildShareChannelUrl(channel: ShareChannel, text: string)` signature matches all three call sites in Task 2.
- **No placeholders:** all code blocks are complete and copy-pasteable; no TBD/TODO markers.
