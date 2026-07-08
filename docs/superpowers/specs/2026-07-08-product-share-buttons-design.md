# Product page share button — design

## Goal
Add a share control to the right of the price block on the product page (`app/product/[id]/page.tsx` → `ProductInfo` → `ProductPrices`), letting a visitor share the product link via native OS share sheet (mobile) or a network dropdown (desktop).

## Component

New `components/ProductShareButton.tsx` (`'use client'`):

- Icon-only button, `lucide-react` `Share2` icon, same visual weight as other icon buttons in the product info column (ghost/outline, `h-8 w-8`).
- `aria-label` from translation key `product.share.label`.
- Props: `productTitle: string`. `productUrl` is derived internally from `window.location.href`, not passed in.

### Click behavior
1. If `typeof navigator !== 'undefined' && navigator.share` exists (mobile / Web Share API support): call `navigator.share({ title: productTitle, url: productUrl })` directly on click, wrapped in `try/catch` — swallow `AbortError` (user cancelled), no toast on success (OS sheet is itself the confirmation).
2. Otherwise: button is a `DropdownMenuTrigger` (reuse `components/ui/dropdown-menu.tsx`) opening a menu with:
   - Facebook — `https://www.facebook.com/sharer/sharer.php?u=<encodedUrl>`
   - X — `https://twitter.com/intent/tweet?url=<encodedUrl>&text=<encodedTitle>`
   - Telegram — `https://t.me/share/url?url=<encodedUrl>&text=<encodedTitle>`
   - WhatsApp — `https://wa.me/?text=<encodedTitle + ' ' + url>`
   - Copy link — `navigator.clipboard.writeText(productUrl)`, then `showToast(t('product.share.copied'), 'success')` from `lib/toast-context`
   - Each network link opens in a new tab (`target="_blank" rel="noopener noreferrer"`), rendered as `DropdownMenuItem` with a small `lucide-react` glyph + text label (labels are fine inside the dropdown; only the trigger button is icon-only).
   - Facebook/X/Telegram icons: reuse the same emoji glyphs already used in `BlogPostContent.tsx` (📘/𝕏/💬) for visual consistency with the blog's share block; WhatsApp gets 💬-style native emoji (📱 or the WhatsApp emoji) — final glyph picked during implementation to match existing style.

The branch between "native share" vs "dropdown" renders two **different element trees**, not one tree with a conditional handler — mixing them under one `DropdownMenuTrigger` risks Radix's own pointerdown-to-open handling firing before a click-time capability check can intercept it. Instead: state defaults to `false` (`useState(false)`, matching what the server always sees), and a `useEffect(() => setSupportsNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), [])` flips it after mount on capable browsers. First client render always matches the server-rendered dropdown-button markup (no hydration mismatch); browsers with Web Share API swap to the plain native-share button on the next tick.

## Integration point

`components/ProductPrices.tsx` already receives `productTitle` (the full localized title, same string passed to `ProductStock` for its notify-me flow) — reuse it, no new props on `ProductPrices`. The button needs the current page URL, sourced client-side via `window.location.href` (read once via `useState(() => typeof window !== 'undefined' ? window.location.href : '')`) inside `ProductShareButton` itself — avoids threading `getSiteUrl()`/`productUrl` down from the server component and always reflects the actual URL the visitor is on.

`ProductPrice` returns a `Fragment` of stacked sibling `div`s (old price / price / savings line, or the login placeholder). Wrap it in its own `div` before making it a flex sibling of the share button — otherwise its fragment children would become flex items themselves and lose their vertical stacking:

```tsx
export const ProductPrices: React.FC<ProductPricesProps> = ({
    price, oldPrice, priceLocale, stock, productId, productTitle,
}) => (
    <div className="product-detail__prices mt-6">
        <div className="flex items-start justify-between gap-3">
            <div>
                <ProductPrice price={price} oldPrice={oldPrice} priceLocale={priceLocale} />
            </div>
            <ProductShareButton productTitle={productTitle} />
        </div>
        <ProductStock stock={stock} productId={productId} productTitle={productTitle} />
    </div>
);
```

The button renders regardless of auth state (even over the "Войдите, чтобы увидеть цену" placeholder) — sharing the product doesn't require seeing the price.

## Translations

Add to `data/translations.ts` (ru/en/lv, matching existing `blog.share*` key style):
- `product.share.label` — "Поделиться" / "Share" / "Dalīties" (button `aria-label`)
- `product.share.copyLink` — "Копировать ссылку" / "Copy link" / "Kopēt saiti" (dropdown item text)
- `product.share.copied` — "Ссылка скопирована" / "Link copied" / "Saite nokopēta" (toast after copy)

## Out of scope
- No share counters/analytics.
- No Pinterest/VK/other extra networks beyond the four agreed.
- No change to `RatingDisplay.tsx` internals.
