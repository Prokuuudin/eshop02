# Homepage discount sections (replace "Весенние скидки")

## Context

Homepage currently shows a static "Весенние скидки" promo banner (`components/Promo.tsx`, position: Brands → Promo → BonusSection in `app/page.tsx`). It's a mock: hardcoded countdown timer, no real products, no real CTA target beyond a generic button.

Replacing it with two real sections in the same slot:

- **A. Актуальные скидки** — real discounted products pulled from the DB.
- **B. Подпишись на свои будущие скидки** — email capture with required consent checkbox.

## A. SaleSection (real discounted products)

Mirrors the existing `BestsellersSection.tsx` pattern exactly (client component, fetch-on-mount, reuse `BestsellersSlider` + `ProductCard`, which already renders `oldPrice` as a strikethrough discount).

- New file `components/SaleSection.tsx`:
  - Fetches `/api/products/sale` on mount.
  - Renders nothing if the list is empty (same guard as Bestsellers).
  - Header: `t('sale.title')` ("Актуальные скидки!") + `t('sale.subtitle')` ("Уже сейчас закупайся по супер ценам") + CTA link to `/catalog` reusing existing `t('cart.goToCatalog')` key (same as Bestsellers — no new key needed).
  - Body: `<BestsellersSlider products={products} arrowsContainerId="sale-slider-arrows" />` (component is already generic, not tied to bestsellers data).

- New route `app/api/products/sale/route.ts`:
  - `prisma.product.findMany({ where: { isActive: true, image: { not: null }, oldPrice: { not: null } } })`.
  - Filter in JS for `oldPrice > price` (Prisma can't compare two columns in a `where` without raw SQL; row count is small enough — confirmed 163 active products currently qualify — that in-memory filtering is fine, matching the simplicity of the existing `bestsellers` route).
  - Sort by discount percentage `(oldPrice-price)/oldPrice` descending, `slice(0, 24)`.
  - Map via existing `mapDbToProduct`.
  - Same try/catch → `{ products: [] }` on error as the bestsellers route.

No schema changes. No new Prisma model.

## B. Newsletter (edit existing unused component)

`components/Newsletter.tsx` exists today but is never imported anywhere and doesn't persist data. Editing it in place rather than creating a new component.

- Copy changes (`data/translations.ts`, all 3 languages ru/en/lv):
  - `newsletter.title`: "Подпишись на свои будущие скидки!"
  - `newsletter.subtitle`: "Получайте эксклюзивные скидки и выгодные предложения первыми..."
  - `newsletter.subscribe`: "Подтверждаю" (was "Подписаться")
  - New keys: `newsletter.consentPrefix` ("Я даю согласие на обработку моих данных в соответствии с ") + `newsletter.consentLinkLabel` ("Политикой конфиденциальности") — rendered as text + inline `<Link href="/privacy">` + text, so the policy phrase stays a real link without HTML-in-translation-string.
  - New key: `newsletter.consentRequired` ("Подтвердите согласие на обработку данных") — client-side validation message when the checkbox is unchecked at submit time.
  - `newsletter.placeholder`, `newsletter.emailAria`, `newsletter.subscribed` stay as-is (already fit).

- Component changes:
  - Add `consent` boolean state + checkbox input, required.
  - `onSubmit`: validate email format (existing regex) and `consent === true` client-side first (existing UX pattern); then `POST /api/newsletter/subscribe` with `{ email, consent }`. On `{ ok: true }` → existing success state; on non-OK response → existing error state showing the server's error message (or a generic fallback).

- New route `app/api/newsletter/subscribe/route.ts`:
  - Validates `email` (regex) and `consent === true` server-side too (fail-closed if the client check is bypassed) → `400` otherwise.
  - Persists via **`KeyValueSetting`** (existing generic key/value table already in `schema.prisma`, unused elsewhere in app code) — **no migration needed**, consistent with the "no schema changes to the live Neon DB" constraint:
    - `prisma.keyValueSetting.upsert({ where: { key: `newsletter:subscriber:${email.toLowerCase()}` }, create: { key, value: { email, consentAt: new Date().toISOString() } }, update: { value: { email, consentAt: new Date().toISOString() } } })`.
    - Re-subscribing with the same email just refreshes `consentAt` (idempotent).
  - Returns `{ ok: true }` on success, `{ ok: false, error }` + appropriate status otherwise. try/catch → 500 on unexpected error, logged server-side (matches existing route conventions).

## Wiring

`app/page.tsx`: remove `Promo` import/usage, add `SaleSection` and `Newsletter` in its place, same position:

```
<Brands />
<SaleSection />
<Newsletter />
<BonusSection />
```

## Cleanup

- Delete `components/Promo.tsx`.
- Translation keys: `promo.title` **stays** — `components/Footer.tsx:18` reuses it as a footer nav-link label to `/catalog`, unrelated to the promo banner itself; removing it would break the footer. `promo.discount` and `promo.shopNow` are only referenced by `Promo.tsx` and become dead once it's deleted — remove them (all 3 languages). `promo.code` was already dead before this change (unrelated, out of scope — left alone).

## Testing

- Manual: run dev server, load homepage, confirm SaleSection renders real discounted products (163 currently qualify in the DB, so the section won't be empty) and the slider/CTA work.
- Manual: submit the subscribe form — reject without consent checked (client + server), accept with checkbox checked, confirm `KeyValueSetting` row is written (query via a throwaway script or `prisma studio`), confirm resubmission with same email doesn't error (upsert).
- No existing automated test covers `Promo.tsx`/`Newsletter.tsx` — check `e2e/critical-flows.spec.ts` isn't asserting on the removed banner before deleting it.
