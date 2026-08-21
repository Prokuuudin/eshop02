# Admin Content Coverage — Design

**Date:** 2026-08-05
**Status:** Approved by user, ready for implementation plan

## Context

Audit of `/admin/content` (2026-08-05) against the "любой текст/картинку менять из админки" goal from 2026-07-14 found:

1. **Dead admin surface** — `/admin/content/banners` lets an admin manage banner types `hero`/`promo`/`info` and all content-blocks (`announcement`/`feature`/`promo-strip`/`cta`), but the storefront only ever fetches `/api/banners?type=sale` (from `SaleSection.tsx` and `Footer.tsx`). The other 3 banner types and every content-block type render nowhere. Same for `/admin/marketing/showcases` — writes to `data/showcases.json`, nothing on the storefront reads that file.
2. **Untouched since 2026-07-14** — `app/[lang]/delivery-payment/page.tsx` (delivery/payment/requisites copy), `components/HeaderLogo.tsx` (site logo), `data/stores.ts` / `data/company.ts` (store info, legal requisites) are still hardcoded, outside `lib/content-registry.ts`, not editable from `/admin/content`.
3. **Bonus finding** — `components/DeliveryInfo.tsx` and `components/PaymentInfo.tsx` are dead code (never imported anywhere). The live route (`/delivery`, `/payment`) renders a near-duplicate of their text directly inside `app/[lang]/delivery-payment/page.tsx`.

This spec covers closing (1) by deletion and (2)/(3) by wiring into the existing `lib/content-registry.ts` + `useSiteContent()` override mechanism (Neon KV-backed, already powers the 7 registry sections shipped 2026-07-14).

## Decisions

| # | Question | Decision |
|---|---|---|
| A | Dead banner types / content-blocks / Showcases | **Delete**, not build renderers. No storefront placement was ever designed for them; building one is a new feature, not a fix. |
| B | Delivery/payment text granularity | **One registry key per semantic chunk** (bold label, description sentence, list item) — same granularity as existing `about.why.item1-5` / `faq.site.qN/aN`. |
| D | Store fields to expose | **Only `name`, `hours`, `phone`.** `address` and `geo` stay hardcoded constants — company requisites/addresses must stay fixed Latvian values per standing requirement (see `feedback_address_latvian` memory), not admin-editable free text. |

## A — Remove dead CMS surface

Delete, no replacement:

- `data/showcases.json`, `app/[lang]/admin/marketing/showcases/page.tsx`, `app/api/admin/showcases/route.ts`, `app/api/admin/showcases/[id]/route.ts`
- Nav entry for Showcases in `components/admin/AdminHeaderNav.tsx`
- `admin.*showcase*` translation keys (all 3 languages)
- `BlockType`, `ContentBlock` type + all block CRUD: `app/[lang]/admin/content/banners/ContentBlocksTab.tsx`, blocks branch in `useBannerContentManager.ts`, blocks branch in `app/api/admin/banners/route.ts` and `app/api/admin/banners/[id]/route.ts`, "Контентные блоки" tab in `banners/page.tsx`
- `components/DeliveryInfo.tsx`, `components/PaymentInfo.tsx` (dead, unrelated to the blocks/banner cleanup but same "delete confirmed-dead code" pass)

Narrow, keep working:

- `BannerType` narrows from `'hero' | 'promo' | 'sale' | 'info'` to `'sale'` in `banner-model.ts`. Drop the type `<Select>` from `BannersTab.tsx` (creation always writes `type: 'sale'`). `readBannersData`/`writeBannersData` and the public `/api/banners` route need no change — they were always type-agnostic.

No tests reference any of this code (checked — no `*banner*test*`, no showcase/block test files), so removal is pure deletion, no test updates required.

## B — Delivery/Payment page → registry

Target: `app/[lang]/delivery-payment/page.tsx` (the only live renderer — `/delivery` and `/payment` both route through it with a `section` param).

Every hardcoded Russian string becomes a `t('deliveryPayment.xxx')` call, key added to `data/translations/{ru,en,lv}/*.ts`. Naming follows the existing `deliveryPayment.deliveryTitle` / `.paymentTitle` keys already present (used today only for the invisible FAQ schema — this work makes them do double duty as the visible copy too).

Representative key scheme (full list produced during implementation, not enumerated here):

```
deliveryPayment.methods.title                       "Способы доставки"
deliveryPayment.methods.courierLatvia.label          "Доставка курьером по Латвии"
deliveryPayment.methods.courierLatvia.price          "Стоимость — от 10 €"
deliveryPayment.methods.courierLatvia.freeNote       "При заказе на сумму свыше 200 € ..."
deliveryPayment.methods.omniva.label                 "Доставка в пакоматы OMNIVA"
deliveryPayment.methods.omniva.price / .size / .weight
deliveryPayment.methods.pickup.label                 "Самовывоз из магазинов — бесплатно"
deliveryPayment.methods.pickup.intro                 "Оплаченный заказ можно получить ..."
deliveryPayment.rules.title                          "Правила курьерской доставки"
deliveryPayment.rules.item1 .. item9
deliveryPayment.return.title / .intro / .conditionsTitle / .condition1-3 / .refundNote / .exceptionNote
deliveryPayment.contacts.title / .intro
deliveryPayment.payment.methods.title
deliveryPayment.payment.card.label / .note
deliveryPayment.payment.cash.label / .note
deliveryPayment.payment.transfer.label / .note1 / .note2 / .requisitesTitle
deliveryPayment.payment.how.title / .step1-4
deliveryPayment.payment.security.title / .intro / .item1-3 / .note
deliveryPayment.payment.support.title / .intro
```

~45 keys total (delivery ~25, payment ~20). Estimate, not a hard target — implementer chunks by what the JSX actually contains.

Dedup while touching this file:

- Both literal occurrences of `Rencēnu iela 10A, Rīga, LV-1073` (courier-pickup note, card/cash payment note) replace with `{COMPANY.officeAddress}` — already imported in this file, already used for the requisites block. Not a translation key: it's the same constant, shown twice.
- The 7-city pickup list under "Самовывоз из магазинов" stops being a hardcoded `<ul>` and instead maps over `stores` from `data/stores.ts` (`stores.map(s => \`${s.city[lang]} — ${s.address[lang]}\`)`), so it can never drift from the real store list again.

Registry additions to `lib/content-registry.ts`: two new sections, `delivery` ("Доставка") and `payment` ("Оплата"), one `ContentEntry` per key above, `multiline: true` on anything that's a full sentence rather than a short label.

## C — Logo → registry

`components/HeaderLogo.tsx`:

```tsx
const { resolveImageSrc } = useSiteContent()
...
<Image src={resolveImageSrc('/logo.svg')} ... />
<Image src={resolveImageSrc('/logo-white.svg')} ... />
```

`Header.tsx` (the only importer) is already `'use client'`, so the hook works with no new client boundary.

Registry addition: new section `header-logo` ("Логотип") with 2 image entries (`/logo.svg`, `/logo-white.svg`).

Constraint carried over from the 2026-07-14 uploads work: SVG uploads are rejected (XSS). The bundled SVGs remain the default; an admin override must be a raster replacement (PNG/JPG). No code change needed for this — it's the existing uploader behavior, just noting it applies here too.

## D — Stores → registry (name/hours/phone only)

`data/stores.ts` keeps `id`, `address` (all 3 languages, fixed LV text — unchanged), and `geo`; `name`, `hours`, and `phone` move to translations (see note below on `phone`).

New translation keys per store, `stores.<id>.name`, `stores.<id>.hours1`, `.hours2`, `.hours3`, `.phone` (8 stores × 5 keys = 40 keys × 3 languages).

`phone` is not actually language-dependent (it's a raw number, currently identical across `ru`/`en`/`lv` in `stores.ts`), but the registry's text-override mechanism is per-language only (`content-registry.test.ts` asserts every text key exists in all 3 languages) — building a language-agnostic override type is out of scope (no other part of the system needs one, not worth the new KV shape). `stores.<id>.phone` gets the identical value seeded in all 3 language dicts; editing it in the admin means repeating the edit on each language tab. Documented friction, not a bug.

Consumers to update — switch from reading `store.name[lang]` / `store.hours[lang]` / `store.phone` to `t(\`stores.${store.id}.name\`)` etc:

- `components/Stores.tsx` (the `/stores` page)
- `app/[lang]/contact/page.tsx`
- `app/[lang]/checkout/CheckoutFormSections.tsx` (pickup-point selector)
- `app/api/orders/route.ts`
- `lib/invoice-template.ts`
- `scripts/fix-pickup-order-addresses.ts` — one-off script, leave reading `data/stores.ts` directly (no `t()` available outside app runtime); if it needs display names, keep pulling from the old inline value or hardcode read from translations JSON — call at implementation time, not a storefront-facing path so low stakes.

Registry additions: 8 new sections (one per store, e.g. "Магазин — Рига Офис"), 5 text entries each, matching the accordion-per-section UI already in `/admin/content`.

## Testing

- `lib/content-registry.test.ts` (existing, currently 5/5 green) needs no changes to its logic — it will automatically validate every new key exists in all 3 languages, every image src resolves to a real file, and there are no ID/key collisions across the ~13 new sections.
- No other automated tests touch the deleted code (verified — no banner/block/showcase test files) or the migrated components (no `DeliveryInfo`/`PaymentInfo`/`HeaderLogo`/`Stores` test files found).
- Manual verification after implementation (dev server): `/delivery`, `/payment` render identically to today; `/admin/content` shows and saves the new sections; override applied on `/delivery`, `/payment`, `/stores`, header logo without a rebuild; `/admin/content/banners` only offers `sale` type and no longer has a blocks tab; `/admin/marketing/showcases` route 404s (or its nav entry is gone).

## Out of scope

- Building a real render slot for `hero`/`promo`/`info` banners or content-blocks (rejected in favor of deletion, see Decision A).
- Making `COMPANY` legal/bank fields or store `address`/`geo` admin-editable (fixed per standing Latvian-address requirement).
- Any Prisma schema change — everything here is JSON-blob KV overrides + translation-dict edits, same mechanism as the existing 7 registry sections.
