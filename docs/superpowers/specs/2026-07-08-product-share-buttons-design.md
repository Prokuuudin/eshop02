# Product page share button — design

## Goal
Add a share control to the right of the rating row on the product page (`app/product/[id]/page.tsx` → `ProductInfo` → `ProductRating`), letting a visitor share the product link via native OS share sheet (mobile) or a network dropdown (desktop).

## Component

New `components/ProductShareButton.tsx` (`'use client'`):

- Icon-only button, `lucide-react` `Share2` icon, same visual weight as other icon buttons in the product info column (ghost/outline, `h-8 w-8`).
- `aria-label` from translation key `product.share.label`.
- Props: `productUrl: string`, `productTitle: string`.

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

The branch between "native share" vs "dropdown" is decided once on mount via `useState(() => typeof navigator !== 'undefined' && !!navigator.share)` so SSR doesn't flash the wrong control (server renders the dropdown-trigger markup either way; the click handler differs).

## Integration point

`components/ProductRating.tsx` currently renders nothing when `ratingCount === 0` (conditionally skipped in `ProductInfo.tsx:47`). Per requirement, the share button must always be visible regardless of rating presence, so:

- `ProductInfo.tsx` renders a new wrapper row unconditionally:
  ```tsx
  <div className="flex items-center justify-between gap-3 mt-4">
      {ratingCount > 0 && <ProductRating rating={product.rating} count={ratingCount} />}
      <ProductShareButton productUrl={productUrl} productTitle={stripBrandPrefix(localizedTitle, product.brand)} />
  </div>
  ```
  (`ProductRating`'s own `mt-4` margin moves to the wrapper so spacing stays identical when the rating is present, and the button still sits at the row's right edge via `justify-between` when the rating is absent.)
- `ProductInfo` needs the current page URL. `ProductPageContent.tsx` (client) does not currently receive `siteUrl`/`productUrl` as a prop — simplest correct source in a client component is `window.location.href`, read once via `useState(() => typeof window !== 'undefined' ? window.location.href : '')`. This avoids threading `getSiteUrl()` down from the server component and always reflects the actual URL the visitor is on (including query params, which is fine for sharing).

## Translations

Add to `data/translations.ts` (ru/en/lv, matching existing `blog.share*` key style):
- `product.share.label` — "Поделиться" / "Share" / "Dalīties"
- `product.share.copied` — "Ссылка скопирована" / "Link copied" / "Saite nokopēta"

## Out of scope
- No share counters/analytics.
- No Pinterest/VK/other extra networks beyond the four agreed.
- No change to `RatingDisplay.tsx` internals.
