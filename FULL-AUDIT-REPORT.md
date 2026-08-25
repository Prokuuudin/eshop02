# Full SEO Audit Report — HairShop.lv (hairshoppro.lv)

## Актуализация после коммита `f6df953`

**Дата актуализации:** 2026-07-19

**Коммит:** `f6df953 feat: localize routes and decompose checkout admin pages`

**Статус:** изменения находятся в `origin/main`
**Обновлённая оценка SEO:** **60 / 100** (исходная оценка от 2026-06-02: 40 / 100)

### Обновление: сокращение клиентского слоя

После отдельного прохода по границам React Server Components число файлов с директивой `use client` снижено с **204 до 191** (−13 файлов, −6,4%). Подсчёт выполнен по `app`, `components`, `hooks` и `lib` для файлов `.ts`/`.tsx`.

- Главная страница и её SEO-критичные секции `Hero`, `AboutSection`, `Benefits` и `FAQSection` переведены в RSC.
- Страницы магазинов, доставки и оплаты, privacy, terms, cookies и return policy теперь рендерят основной контент на сервере.
- Удалён клиентский агрегатор `HomeClient` и динамическая загрузка `AboutSection` с `ssr: false`.
- Переводы и CMS-overrides для серверных секций читает единый memoized server-only resolver; повторные секции одного рендера не дублируют загрузку данных.
- Интерактивность сохранена как небольшие islands: shadcn Accordion остаётся клиентским, а окружающий текст и schema формируются сервером.
- С `MetricCard` и `RatingDisplay` снята лишняя собственная client boundary. При импорте из клиентских экранов они по-прежнему корректно входят в соответствующий client graph.

БЭМ-структура существующих блоков и shadcn-компоненты сохранены. Оставшиеся крупные кандидаты следующего этапа: серверная начальная загрузка списков заказов account/admin и декомпозиция `ProductPageContent` на серверную товарную часть и клиентские gallery/cart islands. Механически снимать `use client` с форм, dialogs, Zustand consumers и event-driven таблиц нельзя: это не уменьшит реальный client graph и нарушит интерактивность.

### Обновление: toolchain и integration-тесты

Матрица frontend toolchain приведена к согласованным версиям:

- Next.js и `eslint-config-next`: **16.2.10**;
- React и React DOM: **19.2.7**;
- TypeScript: **5.9.3**;
- ESLint: **9.39.5**, typescript-eslint: **8.64.0**;
- React types: **19.2.x**.
- Node runtime закреплён через `engines` и `.nvmrc`: **22.13.1+**.

Legacy `.eslintrc.js` и `.eslintignore` заменены на ESLint 9 flat config `eslint.config.mjs`. Полный lint теперь завершается успешно: **0 ошибок**, при этом **865 предупреждений** сохранены как измеримый migration backlog (`any`, return types, React 19 compiler diagnostics и legacy CommonJS configs). Новые строгие React rules не отключены, а переведены в warning до поэтапного исправления существующих экранов.

Добавлен отдельный `npm run test:integration`, изолированный от быстрого unit suite. Он покрывает:

- построение Stripe Checkout из авторитетных серверных цен, а не клиентского `grandTotal`;
- переход completed webhook в `paid` и повторную доставку того же event;
- две конкурентные доставки одного Stripe event — side effects применяются ровно один раз;
- атомарное списание остатков при создании заказа;
- rollback заказа и уже выполненных списаний, если последующего товара недостаточно.

Stripe event ledger, payment state и canonical order status теперь обновляются в одной Prisma-транзакции под PostgreSQL advisory lock. Это устраняет гонку прежнего JSON read-modify-write при параллельных webhook deliveries.

Результаты проверок после обновления: TypeScript — успешно; unit — **63 файла / 523 теста**; integration — **3 файла / 5 тестов**; production build — успешно, **556 страниц**.

> Эта секция является актуальным состоянием аудита. Разделы ниже сохранены как исходный baseline от 2026-06-02 и могут содержать старые пути `app/...`, утверждения об отсутствии hreflang и прежние количественные оценки sitemap.

### Обновлённые оценки

| Категория | Было | Стало | Изменение |
|---|---:|---:|---|
| Technical SEO | 47 | 78 | Локализованные URL, hreflang, sitemap, robots и корректные 404 |
| Content Quality | 35 | 38 | Структурных изменений контента в коммите почти нет |
| On-Page SEO | 37 | 55 | Добавлены локализованные layouts и metadata для публичных разделов |
| Schema / Structured Data | 42 | 50 | URL стали языково согласованными; бренд и полнота schema ещё требуют работы |
| Performance (CWV, оценочно) | 55 | 58 | Декомпозиция улучшила поддерживаемость, но client footprint существенно не измерялся |
| AI Search Readiness | 31 | 43 | Языковые версии теперь доступны по стабильным URL; entity consistency не завершена |
| Images | 25 | 28 | Коммит почти не затрагивал изображения |
| Поддерживаемость UI | 45 | 58 | Начата feature-декомпозиция checkout и крупнейших admin pages |

### Что исправлено в `f6df953`

- Все пользовательские страницы перенесены под единое дерево `app/[lang]/...` для `ru`, `en` и `lv`.
- Русский язык использует единственный канонический URL без `/ru`; `/ru/*` перенаправляется с кодом 308.
- Английские и латышские версии доступны по стабильным путям `/en/*` и `/lv/*`.
- Добавлена централизованная маршрутизация в `lib/i18n-routing.ts` и middleware.
- Удалено недетерминированное определение языка по `Accept-Language` для индексируемых URL; выбор пользователя сохраняется cookie.
- `sitemap.xml` теперь включает статические страницы, продукты, публикации блога и бренды для всех языков.
- Каждая запись sitemap содержит `ru`, `en`, `lv` и `x-default` alternates.
- `robots.txt` содержит ссылку на sitemap и закрывает приватные области во всех языковых вариантах.
- Добавлены локализованные metadata layouts для contact, delivery/payment, blog, cart, checkout, stores и юридических страниц.
- Добавлен catch-all, возвращающий настоящий HTTP 404 для неизвестных локализованных маршрутов.
- Базовый layout выставляет `<html lang>` из сегмента URL.
- Выполнена первая стадия декомпозиции checkout/admin с сохранением БЭМ и shadcn:
  - `app/[lang]/checkout/CheckoutFormSections.tsx`;
  - `app/[lang]/admin/orders/order-config.ts`;
  - `app/[lang]/admin/content/banners/banner-model.ts`;
  - `app/[lang]/admin/content/banners/LocaleTextField.tsx`.

### Результаты проверки после коммита

| Проверка | Результат |
|---|---|
| TypeScript (`tsc --noEmit`) | Успешно |
| Unit tests | 63 файла, 523 теста — все прошли |
| Production build | Успешно, 556 статических страниц |
| Offline production dependency audit | 0 известных уязвимостей |
| ESLint всего проекта | Не проходит: 2 ошибки и 766 предупреждений на момент аудита |
| ESLint новых feature-модулей | 0 ошибок |

### Закрытые пункты исходного аудита

| Исходный пункт | Статус после `f6df953` |
|---|---|
| Sitemap покрывает только 20 URL | **Закрыто:** добавлены товары, бренды, блог и языковые версии |
| Нет hreflang | **Закрыто:** alternates добавлены в metadata и sitemap |
| `lang="en"` захардкожен | **Закрыто:** язык берётся из `[lang]` |
| `/contact` и `/stores` без metadata | **Закрыто:** добавлены локализованные layouts |
| В robots нет Sitemap | **Закрыто** |
| Неизвестный localized URL может стать soft 404 | **Закрыто:** catch-all вызывает `notFound()` до streaming body |
| Страницы разбросаны между root и языковыми деревьями | **Закрыто:** используется единое `[lang]`-дерево |
| Checkout/admin pages монолитны | **Частично закрыто:** вынесены первые UI/model/config-модули; крупные секции ещё остаются |

### Актуальные критические и высокие приоритеты

1. **Исправить Stripe payment integrity.** Checkout должен строить Stripe line items только из сохранённого серверного заказа; webhook обязан сверять сумму, валюту и `payment_status` перед переводом всего заказа в `paid`.
2. **Закрыть SSRF в B2B webhooks.** Запретить private/loopback/link-local IP, разрешать только HTTPS, ограничить redirects и добавить timeout.
3. **Добавить production security headers.** Сейчас `next.config.js` не задаёт CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` и `Permissions-Policy` для production.
4. **Убрать `Float` из денежных полей Prisma.** Использовать integer cents или `Decimal` для цен, налогов, скидок, платежей и возвратов.
5. **Исправить бренд и root metadata.** В `app/[lang]/layout.tsx` всё ещё встречается `Eshop`; требуется единый HairShop.lv, реальный Organization/LocalBusiness и OG fallback.
6. **Настроить production domain.** `NEXT_PUBLIC_SITE_URL` должен быть обязательным; fallback `https://example.com` нельзя считать допустимым production-значением.
7. **Исправить sitemap lastModified.** Статические страницы и товары всё ещё получают текущую дату вместо реальной даты изменения.
8. **Завершить декомпозицию UI.** Вынести summary/delivery/payment из checkout, filters/table/editor из admin orders и CRUD forms/lists из banners в отдельные БЭМ-компоненты на shadcn.
9. **Выровнять toolchain и сделать lint зелёным.** Next 16 используется вместе с устаревшими ESLint/`eslint-config-next`; устранить 2 ошибки, hook warnings, `any` и сырые `<img>`.
10. **Добавить PR CI.** Обязательные typecheck, unit tests, lint, build и безопасные E2E с отдельной тестовой БД.

### Новая ближайшая дорожная карта

#### P0 — до production deployment

- Stripe: серверный источник состава и суммы заказа, webhook reconciliation и idempotency.
- SSRF-защита webhook endpoints и криптографические webhook secrets.
- Production security headers.
- Обязательный production `NEXT_PUBLIC_SITE_URL` и единый бренд HairShop.lv.

#### P1 — следующий спринт

- Миграция денежных полей `Float` на cents/Decimal.
- Завершение декомпозиции checkout/admin с БЭМ и shadcn.
- Исправление lint и синхронизация Next/React/TypeScript/ESLint toolchain.
- Реальные `lastModified`, OG images и расширенный Product schema.
- PR CI и Stripe/webhook integration tests.

#### P2 — последующие улучшения

- Расширение товарных описаний и E-E-A-T контента.
- Image sitemap, WebP/AVIF стратегия и оптимизация above-the-fold изображений.
- A11y-тесты через axe, visual regression и CWV budgets.
- Дальнейшее сокращение client components и legacy localStorage auth.

---

## Исходный аудит от 2026-06-02 (исторический baseline)

**Date:** 2026-06-02  
**URL:** http://localhost:3000 (Next.js dev server)  
**Business type:** E-commerce — Professional Cosmetics B2B + B2C  
**Market:** Latvia (ru/en/lv)  
**Stack:** Next.js App Router, React 18, TypeScript, Tailwind, Zustand

---

## Overall SEO Health Score: 40 / 100

| Category | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 22% | 47/100 | 10.3 |
| Content Quality | 23% | 35/100 | 8.1 |
| On-Page SEO | 20% | 37/100 | 7.4 |
| Schema / Structured Data | 10% | 42/100 | 4.2 |
| Performance (CWV) | 10% | 55/100 | 5.5 |
| AI Search Readiness | 10% | 31/100 | 3.1 |
| Images | 5% | 25/100 | 1.3 |
| **Total** | | | **39.9 → 40** |

> Note: Scores are development-environment penalized. Production with NEXT_PUBLIC_SITE_URL set and HTTPS would raise baseline to ~55 before structural fixes. Reaching 80+ requires the Critical and High fixes below.

---

## Top 5 Critical Issues

1. **All canonical/OG/schema URLs resolve to `localhost:3000`** — hard indexing blocker
2. **`og:image` missing on every page** — zero visual previews on social sharing
3. **Brand name "Eshop" in metadata ≠ real brand "HairShop.lv"** — AI models cannot build entity
4. **`/blog` page is `'use client'`** — blog content + schema invisible to crawlers without JS
5. **Sitemap covers only 20 of 64+ indexable URLs** — brand pages (35), blog posts (6), /contact, /stores all missing

## Top 5 Quick Wins

1. Set `NEXT_PUBLIC_SITE_URL=https://yourdomain.lv` in `.env.production` — fixes all URL issues at once
2. Fix `app/sitemap.ts` — add blog posts + brand pages in ~30 minutes, unlock all existing content
3. Add default `og:image` fallback in `app/layout.tsx` — immediate social sharing fix
4. Fix Organization schema: rename "Eshop" → real brand name, fix `sameAs` to real social URLs
5. Add security headers block in `next.config.js` — 30-minute copy-paste fix

---

## Technical SEO — Score: 47/100

### CRITICAL

**C-1. Canonical URLs point to localhost**  
File: `lib/site-url.ts`  
`getSiteUrl()` falls back to `http://localhost:3000` (dev) or `https://example.com` (prod fallback) if `NEXT_PUBLIC_SITE_URL` is not set. Every canonical, OG URL, and schema `url` field is wrong in production.  
Fix: `NEXT_PUBLIC_SITE_URL=https://yourdomain.lv` in `.env.production` and Vercel env vars.

**C-2. `/blog` page is fully CSR — not indexable**  
File: `app/blog/page.tsx` line 1 (`"use client"`)  
Blog listing fetches posts via `useEffect → fetch('/api/blog')`. Initial HTML has no post content, no links, no schema. Googlebot sees empty page without JS execution.  
Fix: Convert to RSC. Move fetch to server component body. Extract only interactive parts (subscribe form) to client island.

**C-3. `/stores` and `/contact` have no `generateMetadata`**  
Both pages are `'use client'` with no canonical, no page title (inherit root "Eshop - Professional Cosmetics"). Google sees duplicate titles.  
Fix: Add RSC wrapper layouts with `generateMetadata` emitting canonical + page-specific title.

**C-4. Sitemap covers only 31% of indexable URLs**  
File: `app/sitemap.ts`  
20 URLs present. Missing: `/blog` (6 posts), `/brand/[id]` (35 brands), `/contact`, `/stores`.  
Detailed fix: see Sitemap section below.

**C-5. Organization schema references non-existent `/about`**  
File: `app/layout.tsx` lines 48-50  
`sameAs` contains `${siteUrl}/about` — page does not exist (`app/about/` directory missing). Googlebot follows this to a 404. Schema violation.  
Fix: Remove `/about` from `sameAs`. Replace with real social URLs or create the page first.

### HIGH

**H-1. `lang="en"` hardcoded — content is Russian**  
File: `app/layout.tsx` line 67  
All 16 product titles in Russian. UI translations default to Russian. `lang="en"` conflicts with content language. Hurts RU/LV market rankings.  
Fix: Resolve language server-side from cookies/Accept-Language header, pass to `<html lang={lang}>`.

**H-2. No hreflang on trilingual site (ru/en/lv)**  
Zero `<link rel="alternate" hreflang>` tags anywhere. `x-default` not declared. Latvian/Russian users may be served wrong language version.  
Fix: Add `alternates.languages` to all `generateMetadata` calls or implement sitemap-based hreflang.

**H-3. All security headers absent in production**  
File: `next.config.js` — `headers()` returns `[]` when `NODE_ENV !== 'development'`.  
Missing: `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy`.  
Fix: Add production security headers block (see Action Plan).

**H-4. `Cache-Control: no-store` on public pages**  
Product and catalog pages have `revalidate: 3600` set but the header observed is `no-store`. CDN/middleware override prevents ISR edge caching and slows Googlebot.  
Fix: Audit middleware and hosting config. Public pages should emit `public, s-maxage=3600, stale-while-revalidate=86400`.

**H-5. Sitemap `lastModified` = `new Date()` on every request**  
File: `app/sitemap.ts` line 7 — `const now = new Date()`  
Every URL appears freshly modified on every crawl. Wastes Googlebot crawl budget.  
Fix: Use real dates — `product.updatedAt` for products, `post.createdAt` for blog posts, hardcoded deploy date for static pages.

### MEDIUM

**M-1. Hero component is `'use client'` — LCP element delayed**  
File: `components/Hero.tsx` line 1  
H1 and hero image rendered after hydration. No `priority` prop on hero `<Image>`. Most common cause of poor LCP on Next.js sites.  
Fix: Convert Hero to RSC (pass `t` prop from server). Add `priority` to hero image.

**M-2. Blog `[slug]` metadata hardcoded to `language = 'en'`**  
File: `app/blog/[slug]/page.tsx` line 31  
Metadata generated in English while page renders in user's detected language. Google indexes English meta for Russian-language pages.  
Fix: Resolve language from `cookies()` in `generateMetadata` matching page render logic.

**M-3. OG type `'website'` on product pages**  
File: `app/product/[id]/page.tsx` line 57  
Should be `type: 'product'` for correct social preview rendering.

**M-4. Three different brand names in structured data**  
- `app/layout.tsx`: "Eshop"  
- `app/contact/page.tsx`: "HairShop"  
- `app/blog/[slug]/page.tsx`: "BeautyShop"  
Google cannot build a consistent entity. Fix: Unify to one brand name everywhere.

### LOW

- No IndexNow protocol implementation (relevant for Bing/Yandex in Baltic market)
- No favicon / apple-touch-icon in `/public/`
- `delivery-payment/page.tsx` is `'use client'` — FAQ schema invisible without JS
- No `Sitemap:` directive in `robots.txt` (sitemap URL not declared)

---

## Content Quality — Score: 35/100

### Meta Description Quality

| Page | Description | Length | Issue |
|---|---|---|---|
| Homepage | "Online store of professional cosmetics and equipment" | 52 chars | Too short, no USP, no geo |
| Catalog | "Catalog of professional cosmetics and equipment" | 47 chars | Generic, no keyword |
| Blog | "Useful tips and trends" | 22 chars | Critically thin |
| Product (p1) | "sanctuaryspa - Крем для лица Revitaluxe 50ml" | 45 chars | Just brand + title, no benefit |
| Brand page | "Unique SPA brand - products with long-lasting fragrances…" | 116 chars | Only brand page with decent desc |

All descriptions need rewriting with: primary keyword + USP + call to action (120-160 chars target).

### Product Content Depth

All 16 products have `description: undefined` in data. The schema description is auto-generated as `"${brand} - ${title}"`. Rich data exists in the model (`technicalSpecs`, `certificates`, `bulkPricingTiers`, `purpose`, `compatibleEquipment`) but none is surfaced as prose content.

### E-E-A-T Signals

- No author attribution on blog posts (author field exists in data but not in Article schema — there is no Article schema)
- No expert credentials visible
- Real business identity (SIA Miks Plus, HairShop.lv, +371 27067730) in `/delivery-payment` source but not in Organization schema
- Physical stores exist (7 locations) — strong E-E-A-T signal but not surfaced in schema or meta
- EU distributor network present in product data — professional authority signal not used

### AI Citation Readiness

Optimal citation passage: 134-167 words, self-contained answer. Current content:
- Blog paragraphs: 40-90 words (below threshold)
- Product descriptions: 5-10 words (critically below)
- FAQ sections: CSR-rendered, invisible to AI crawlers

Fix priority: Rewrite product descriptions to 150+ words. Regroup blog paragraphs into longer thematic blocks. Convert FAQ to SSR.

---

## Schema / Structured Data — Score: 42/100

### Present (partial credit)

| Schema | Pages | Quality Issues |
|---|---|---|
| Organization | All (layout) | Name "Eshop" inconsistent; sameAs = localhost URLs; no legalName, contactPoint, address |
| WebSite + SearchAction | All | Functional ✓ |
| Product | Product pages | SKU wrong (p1 vs REVIT-50-001); description thin; fake review; reviewCount hardcoded 127 |
| BreadcrumbList | Most pages | Catalog version includes query params in URL (should use canonical path) |
| LocalBusiness | /contact | Name "HairShop" inconsistent; no canonical emitted from client component |
| FAQPage | /delivery-payment | Rendered CSR — not in initial HTML |

### Missing Schema (by page type)

| Page Type | Missing | Impact |
|---|---|---|
| Catalog `/catalog` | ItemList | Cannot generate product carousels; catalog grid not crawlable (CSR component) |
| Blog post `/blog/[slug]` | Article / BlogPosting | Zero E-E-A-T signals for blog content |
| Blog index `/blog` | CollectionPage | Entire page CSR |
| Brand pages `/brand/[id]` | Brand | Missed entity disambiguation |
| Category landing (none exist) | ItemList + BreadcrumbList | — |

### Critical Schema Bugs

**Bug 1: Fake review in Product schema**  
File: `app/product/[id]/page.tsx` lines 116-127  
Single hardcoded review with `author: "Eshop Customer"` and template review body. Violates Google Product review guidelines (October 2023 update). Risk of manual action.  
Fix: Remove `review` array entirely. Keep only `aggregateRating` (with real counts).

**Bug 2: SKU is internal ID not product SKU**  
`sku: product.id` sends "p1" to Google. Actual SKU `"REVIT-50-001"` exists in `product.sku`.  
Fix: `sku: product.sku ?? product.id`

**Bug 3: `reviewCount` hardcoded to 127 fallback**  
Products without `reviewCount` in data all show 127 in schema. Google cross-checks with visible reviews — mismatch suppresses rich results.  
Fix: Use real count from reviews store or omit the field.

**Bug 4: Offer missing Google Shopping required fields**  
Missing: `seller`, `priceValidUntil`, `shippingDetails`, `hasMerchantReturnPolicy`.  
Without `seller`: Google Shopping ineligible.  
p1 has sale price (`price: 2500, oldPrice: 3200`) but no `priceValidUntil` — sale badge won't show.

---

## Performance (CWV) — Score: 55/100 (estimated)

*Note: Playwright visual agent not run. Estimates based on code analysis.*

**LCP risks:**
- Hero is `'use client'` — primary H1 and image deferred until hydration
- Hero `<Image>` has no `priority` prop — no preload hint emitted
- `ProductCard` uses `loading="lazy"` on all cards including above-fold first 3-4

**CLS risks:**
- Multiple `'use client'` components replacing server-rendered shells with hydrated content
- No skeleton placeholders visible in initial HTML for dynamic sections

**INP risks:**
- 30+ Zustand stores initialized on client — potential main thread blocking
- Large RSC payload (product data for all 16 products sent in page.tsx RSC JSON)

**Positive signals:**
- Next.js RSC streaming active (seen in RSC payload)
- `revalidate: 3600` on product and catalog pages (ISR)
- `next/image` used in ProductGallery with `fill` + `sizes` (correct)
- Only 1 third-party script detected (Google Fonts via Inter)

---

## Images — Score: 25/100

### Critical

**og:image missing on all pages**  
`product.ogImage` is null on all 16 products. `product.image` is a relative path. Without `metadataBase` resolving correctly to production domain, all OG images are relative paths — social crawlers receive no image. Twitter card declares `summary_large_image` with no `twitter:image`.

**Secondary product images do not exist on disk**  
Data references `p1-2.jpg`, `p1-3.jpg`, `p1-4.jpg`, `p1-5.jpg` for all 16 products. Only `p1.jpg` through `p16.jpg` exist in `public/products/`. 64 referenced images return 404. Gallery shows broken thumbnails after first image.

**p13 has duplicate image in data**  
`data/products.ts`: p13 `images` array contains `p13-2.jpg` twice (positions 2 and 6). Should have 5 unique images.

### High

**No image sitemap**  
16 products × 5 images = 80 product images. None declared in sitemap. Google Image Search cannot discover them.

**JPEG only — no WebP**  
`public/products/` contains `.jpg` files only. `next/image` converts on-the-fly when images are served through `<Image>` component — verify no raw `<img>` tags in product gallery.

**`loading="lazy"` on all ProductCards including above-fold**  
File: `components/ProductCard.tsx` line ~80  
First 3-4 products in catalog grid are above fold and should use `loading="eager"` or `priority`.

---

## AI Search Readiness (GEO) — Score: 31/100

### Brand Identity Crisis (Score killer)

Real brand: **HairShop.lv** operated by **SIA Miks Plus**, Riga, Latvia.  
Code brand: "Eshop" (layout), "BeautyShop" (blog), "HairShop" (contact).  
AI models cannot build a reliable entity for a site with 3 different names in schema. This single issue accounts for most of the low authority score (12/100).

### Missing llms.txt

No `/llms.txt` found. AI assistants (Claude, ChatGPT with browsing, Perplexity) check this file for site structure guidance. High-value for B2B e-commerce explaining product catalog, B2B features, and service area.

### AI Crawler Rules

`robots.txt` has only `User-agent: * / Allow: /`. No explicit rules for GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Googlebot-Extended. No `Sitemap:` directive.

### CSR Content Invisible to AI Crawlers

| Content | Rendering | AI Risk |
|---|---|---|
| Blog posts | CSR body | High — article text not in initial HTML |
| FAQ (delivery) | CSR | High — FAQ schema + text not in initial HTML |
| Hero | CSR | Medium — primary H1 + value prop delayed |
| Products | SSR+ISR | Low — best pages on site |

### Platform Scores

| Platform | Score | Main blocker |
|---|---|---|
| Google AI Overviews | 22/100 | CSR blog, lang mismatch, no E-E-A-T |
| ChatGPT (GPTBot) | 28/100 | No entity in knowledge base, no llms.txt |
| Perplexity | 35/100 | SSR products accessible; blog/FAQ invisible |
| Bing Copilot | 25/100 | Same CSR issues + no hreflang |

---

## Sitemap Analysis — Score: 34/100

**Current sitemap coverage:**

| Type | In sitemap | Should be | Missing |
|---|---|---|---|
| Static pages | 4 | 6 | /contact, /stores |
| Products | 16 | 16 | 0 ✓ |
| Blog posts | 0 | 6 | All 6 posts |
| Brand pages | 0 | 35 | All 35 brands |
| /about | 0 | 0 (page doesn't exist) | — |
| **Total** | **20** | **~64** | **~44** |

**Other sitemap issues:**
- All URLs use `http://localhost:3000` (needs production domain)
- `lastModified: new Date()` for all entries (runtime timestamp — meaningless)
- No image sitemap (80+ product images)
- No hreflang sitemap (3 languages)
- No `Sitemap:` declaration in robots.txt

**Corrected `app/sitemap.ts` skeleton:**

```ts
import type { MetadataRoute } from 'next'
import { PRODUCTS } from '@/data/products'
import { getSiteUrl } from '@/lib/site-url'
import blogPosts from '@/data/blog-posts.json'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const deployDate = new Date('2026-06-01')

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`,                 lastModified: deployDate },
    { url: `${siteUrl}/catalog`,          lastModified: deployDate },
    { url: `${siteUrl}/delivery-payment`, lastModified: deployDate },
    { url: `${siteUrl}/request-quote`,    lastModified: deployDate },
    { url: `${siteUrl}/contact`,          lastModified: deployDate },
    { url: `${siteUrl}/stores`,           lastModified: deployDate },
    { url: `${siteUrl}/blog`,             lastModified: deployDate },
  ]

  const productRoutes: MetadataRoute.Sitemap = PRODUCTS.map((p) => ({
    url: `${siteUrl}/product/${p.id}`,
    lastModified: deployDate,
  }))

  const blogRoutes: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: new Date(post.createdAt),
  }))

  // Add brand routes from getBrandsConfigFromStore() similarly
  // const { brands } = await getBrandsConfigFromStore()
  // const brandRoutes = brands.map((b) => ({ url: `${siteUrl}/brand/${b.id}`, lastModified: deployDate }))

  return [...staticRoutes, ...productRoutes, ...blogRoutes]
}
```

---

## E-Commerce SEO — Score: 37/100

### Google Shopping Blockers

1. `sku: product.id` ("p1") instead of `product.sku` ("REVIT-50-001") — prevents product matching
2. Missing `seller` in Offer — Shopping ineligibility
3. Fake review in schema — risk of manual action
4. `og:image` missing — zero social sharing previews

### B2B-Specific SEO Gaps

| Feature | Status | Recommended fix |
|---|---|---|
| Bulk pricing tiers | Client-side UI only | Add `AggregateOffer` with `priceSpecification` in schema |
| Min order quantities | Not in schema | Add `eligibleQuantity` to Offer nodes |
| Certificate documents | PDF URLs in data | Add visible download links; add `certification` schema |
| B2B landing page | None | Create `/b2b` or `/wholesale` with dedicated schema |
| Distributor info | Visible on product page | Add `brand.manufacturer` to schema |

### Catalog Page

- Product grid is a `'use client'` component — rendered client-side, not crawlable
- No `ItemList` schema emitted
- Cannot generate product carousels from this page

---

## Content Cluster Architecture — Score: 2/10

4 clusters identified (face, hair, equipment, B2B wholesale). Currently 0 pillar pages, 0 cluster spokes, 0 internal blog→product links, 0 product→blog links.

### Recommended Hub-and-Spoke Structure

**Cluster 1: Professional Face Care**  
Pillar: `/blog/professional-face-care-guide` (3,200w)  
Spokes: professional-face-serums, retinol-vs-hyaluronic-acid, professional-face-masks-salon  
Products: p1, p3, p9, p14, p7, p16

**Cluster 2: Professional Hair Care**  
Pillar: `/blog/professional-hair-care-guide` (3,000w)  
Spokes: salon-shampoo-buying-guide, hair-oil-vs-serum, winter-hair-care-salon-protocol  
Products: p2, p4, p10, p15

**Cluster 3: Beauty Salon Equipment**  
Pillar: `/blog/beauty-salon-equipment-guide` (3,500w)  
Spokes: microdermabrasion-vs-ultrasonic-cleaner, microdermabrasion-machine-protocol, professional-hair-dryers-salon  
Products: p6, p8, p12

**Cluster 4: B2B Wholesale**  
Pillar: `/blog/b2b-wholesale-cosmetics-guide` (2,800w)  
Spokes: bulk-pricing-cosmetics-guide, cosmetics-supplier-europe-guide, eu-cosmetics-certification-guide  
Links to: /delivery-payment, /request-quote (converts orphan pages)

**Quickest win:** Add existing 6 blog posts to sitemap (30 min). They are published but Google cannot find them.

**Content to repurpose:**
- `skincare-routine-guide` → expand into Face Care pillar, redirect slug
- `ingredient-spotlight-retinol` → merge into retinol-vs-HA spoke, redirect
- `hair-care-winter` → expand into winter salon protocol spoke, redirect

---

## Files Referenced

| File | Issues |
|---|---|
| `lib/site-url.ts` | URL resolution fallback chain — needs NEXT_PUBLIC_SITE_URL |
| `app/layout.tsx` | lang="en" hardcoded; Organization schema name; sameAs localhost; no favicon |
| `app/sitemap.ts` | Missing 44 URLs; runtime lastmod; no image sitemap |
| `app/blog/page.tsx` | "use client" — entire page CSR |
| `app/blog/[slug]/page.tsx` | No Article schema; language hardcoded to 'en' in metadata |
| `app/product/[id]/page.tsx` | Fake review; wrong SKU; thin description; no og:image; OG type='website' |
| `app/catalog/page.tsx` | No ItemList schema; product grid is CSR |
| `app/contact/page.tsx` | "use client" — no generateMetadata; brand name "HairShop" |
| `app/stores/page.tsx` | No generateMetadata; no canonical |
| `app/delivery-payment/page.tsx` | "use client" — FAQ schema invisible without JS |
| `next.config.js` | No security headers in production |
| `components/Hero.tsx` | "use client" — LCP delayed; no priority on image |
| `components/ProductCard.tsx` | loading="lazy" on all cards including above-fold |
| `data/products.ts` | No descriptions; wrong SKUs (most products); p13 duplicate image |
| `public/products/` | Missing secondary images (p1-2 through p16-5); JPEG only |
