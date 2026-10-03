# Competitor Pricing — continuation handoff

> Для следующей сессии: НЕ начинай заново. Прочитай файл целиком → `git status` → `git log -5` →
> сверь с разделом Git → продолжай с «Next exact step». Если handoff расходится с Git — истина Git;
> сначала поправь этот файл.

Последнее обновление: 2026-10-03, конец ЭТАПА 4 (JSON-LD adapter). Matching/services/UI/scheduler не начаты.
Миграция НЕ применена ни к одной БД. Реальных запросов к конкурентам не было.

## Goal

Админ-модуль «Мониторинг цен»: разрешённые админом сайты конкурентов → ручное/полуавтоматическое
сопоставление их товаров с нашими `Product` → периодический сбор публичных цен (вежливо, без обхода
защит) → история изменений → анализ рынка → детерминированная, объяснимая рекомендация цены →
решение админа (Apply / Ignore). В v1 никаких автоматических изменений цен.

## Audit findings (ЭТАП 1, проверено чтением кода)

### Жизненный цикл цены (критично)

```
GrinS ERP ──hourly full export.xml (FTPS)──► scripts/sync-products.ts --scheduled
   └─ lib/sync/scheduled-sync.ts → preflight → runSync → lib/sync/upsert-products.ts
        UPDATE "Product" SET price = price2 (если price2 > 0 и отличается), stock, erpPriceMissing …
        WHERE externalId = … (update-only, никаких insert/link)
                     │
                     ▼
            Product.price  Decimal(12,2)  ← ЕДИНСТВЕННАЯ цена, которую берёт checkout
                     │                     (lib/server-pricing.ts getCatalogPrices → PURCHASABLE_PRODUCT_WHERE)
                     ▼
   витрина: getDbProducts → applyProductOverride(KV 'product-overrides') → toStorefrontProduct
```

- `price2` (цена мастера с картой) = публичная цена Hairshop Pro. `price1` (розница hairshop.lv),
  price3 (партнёрская), price4 (выставки) лежат в KV `erp-extra-data` (многомегабайтный blob, только CLI/batch).
- **Себестоимости/закупочной цены в проекте нет.** price3 — не себестоимость (подтверждено владельцем GrinS 07-23).
  → `minimumMargin` в v1 не реализуем, не выдумываем.
- Синк перезаписывает `Product.price` у ERP-linked товаров (`externalId IS NOT NULL`) на каждом прогоне,
  если price2 > 0 и отличается. **Любая ручная правка Product.price у linked-товара откатится следующим синком.**
  Linked ≈ 15753 товаров (SYNC_FTPS_MIGRATION_HANDOFF.md) — подавляющее большинство каталога.
- `erpPriceMissing=true` (price2 ≤ 0): Product.price — локальная, продаётся только при
  `manualPriceApproved && manualApprovedPrice == price`. Любая смена цены через `applyProductChanges`
  вызывает `approvalAfterPriceChange` → одобрение снимается → товар становится непродаваемым.
- Админ-правка цены: `PUT /api/admin/products` → `lib/product-mutation.ts applyProductChanges`
  (optimistic `revision`, чистит KV-override товара) → `appendServerAudit('product.update', before/after)`
  → `notifyPriceChange` → `revalidateProductStorefront()`. Аудит-строки `product.update` автоматически
  попадают в `/api/admin/products/price-batches` (история + revert батчей по `requestId`).
- Расписание ERP-синка: Plesk Scheduled Task `7 * * * *`, `npx tsx scripts/sync-products.ts --scheduled`,
  kill switch `SYNC_PULL_ENABLED`, lease-lock в KV `sync-run-lock` (lib/sync/sync-lock.ts), история — `SyncRun`.
  Статус включения на проде: ждёт FTPS-переезда (см. SYNC_FTPS_MIGRATION_HANDOFF.md). Проектируем так,
  будто синк ежечасный.

### Инфраструктура

| Область | Что есть | Файл |
|---|---|---|
| БД | Prisma 7 + Neon (adapter-neon/WS), money = Decimal + `prisma-money-extension` | `lib/prisma.ts`, `lib/decimal.ts` |
| Миграции | `migrate dev` СЛОМАН; ручной путь `migrate diff → db execute → migrate resolve`. `npm run build` = `prisma migrate deploy` → любая папка в `prisma/migrations/` уезжает в прод при деплое. Отложенные миграции — `prisma/pending-migrations/` | memory: migration-workflow-broken |
| Env | **`.env.local` DATABASE_URL = прод Neon.** Локальный `npm run build` = прод-миграция. Проверка сборки: `npx tsc --noEmit`, `npx eslint`, `next build` без migrate | |
| Admin authz | Серверная граница в `app/[lang]/admin/layout.tsx` (`getServerUser`); API — `requireAdminPermission(perm)`; путь→право в `lib/admin-permissions.ts ADMIN_PATH_PERMISSIONS`; manager не имеет catalog.*/prices.* | `lib/server-auth.ts` |
| CSRF | Глобально в `proxy.ts` → `guardCookieAuthenticatedApiMutation` для всех `/api/*` мутаций | `lib/api-guard.ts` |
| Audit | `AuditLog` с hash-chain, `appendServerAudit(tx, req, actor, {...})` — требует NextRequest+actor (для scheduler нет системного варианта) | `lib/server-audit.ts` |
| Rate limit | `checkRateLimit(key, opts)` на таблице `RateLimit` | `lib/rate-limit.ts` |
| SSRF | `isPrivateIPv4/IPv6/isBlockedIp` + `ensureSafeWebhookUrl` (pre-flight DNS, без IP-pinning — сам код признаёт DNS-rebinding gap) — не экспортированы | `lib/webhook-sender.ts` |
| Логи | `logOperationalEvent({event, level, ...})` — JSON в stdout | `lib/observability.ts` |
| Конфиги | Паттерн KV `KeyValueSetting` + zod (bonus-config, shipping-settings, locale-config) | |
| Графики | Без chart-библиотек; кастомный SVG `RevenueBarChart.tsx` | `app/[lang]/admin/RevenueBarChart.tsx` |
| Admin i18n | ru/en/lv, `npm run check:admin-i18n:strict` ловит хардкод кириллицы в `app/[lang]/admin`, `components/admin` | `data/translations/*` |
| Тесты | Vitest unit (`*.test.ts` рядом с кодом), integration `tests/integration/*.integration.test.ts` (forks, без параллели), Playwright e2e | |
| HTTP-клиенты | Нет undici/axios; глобальный fetch + node:https | |

## User decisions (2026-10-03, приняты)

1. Реальные конкуренты НЕ подключаются. Разработка только на локальных HTML/JSON-LD fixtures и тестовых
   источниках. Никаких запросов к реальным сайтам конкурентов без отдельного подтверждения.
2. Цена сравнения = `Product.price` (price2). price1 — в будущем только справочно, НЕ в recommendation engine v1.
3. ERP-linked (`externalId != null`): прямой Apply запрещён; действие «Передать в ERP / Mark for ERP change»
   = статус `erp_pending`, без записи в Product. После синка → `erp_applied`, если Product.price == recommended
   (Decimal, точность до цента).
4. Production Neon не трогать; Neon-ветки не создавать; миграции только в `prisma/pending-migrations/`.
   Если для integration-тестов нужна отдельная ветка — остановиться и сообщить.
5. Логические локальные коммиты после этапов; push НЕ делать.
6. Чужие незакоммиченные изменения не трогать и не коммитить.

**OPEN BUSINESS QUESTION — VAT semantics:** включает ли price2 (а значит Product.price) НДС, и в какой
базе показывают цены конкуренты — НЕ доказано. Архитектура от этого не зависит: v1 сравнивает Product.price
с публичной ценой конкурента как есть, валюта явная (только EUR), без НДС-пересчётов. Не утверждать
обратного без подтверждения бизнеса.

## Architecture (принята)

### Принцип: рекомендация никогда не пишет в ERP-owned данные

```
ERP price2 ──sync──► Product.price (текущая цена Pro, read-only для модуля)
                          │ читается
CompetitorPriceObservation ─► analysis ─► PricingRecommendation (снимок входных данных)
                                                  │
                                         admin review UI
                                   ┌──────────────┼──────────────────────┐
                                Ignore     Apply (только externalId IS NULL   «Передать в ERP»
                                           и !erpPriceMissing):              (ERP-linked):
                                           applyProductChanges + audit       статус ERP_PENDING,
                                           (тот же путь, что PUT,           экспорт списка для GrinS,
                                            revert через price-batches)      авто-APPLIED_IN_ERP когда
                                                                              синк принёс эту цену
```

- v1 НЕ меняет `upsert-products.ts`, `sync-*`, checkout, sellability.
- «Цена-override, который синк уважает» — только отдельным этапом/спекой с явным одобрением
  (затрагивает sync SQL + checkout + sellability + price-batches).

### Prisma models (РЕАЛИЗОВАНО в ЭТАПЕ 2 — см. раздел Database)

Все 6 таблиц новые; в `Product` добавлены только back-relation поля (без колонок).
Pricing rules — KV `competitor-pricing-rules` + zod (`lib/competitor-pricing/settings.ts`).
`minimumMargin` в правилах ОТСУТСТВУЕТ (strict-схема его отклоняет): себестоимости нет, price3 ≠ cost.

### Fetch / security

РЕАЛИЗОВАНО в ЭТАПЕ 3 — подробности в разделе «Stage 3 — Safe networking».
- robots.txt соблюдается всегда (не настраивается админом; кэш на прогон); Disallow → BLOCKED.
- 401/403/CAPTCHA/challenge (cf-mitigated, известные маркеры) → BLOCKED, сбор с источника остановлен до
  ручного возобновления, без retry. 429 → стоп источника на этот прогон. Retry (≤2, exp backoff) только
  сетевые ошибки и 502/503/504 без признаков challenge.
- HTML конкурента — недоверенный: парсим в памяти, не храним, не рендерим; title/URL в UI только как текст,
  ссылки через `sanitizeStoredLink`, `rel="noopener noreferrer nofollow"`.

### Adapters

РЕАЛИЗОВАНО в ЭТАПЕ 4: `CompetitorAdapter { key; parse(html, url): ParsedListing | ParseFailure }` и первый
адаптер `jsonld-product` (schema.org Product/Offer/AggregateOffer из `<script type="application/ld+json">`).
Без DOM и исполнения JS; поддержаны корневые массивы, `@graph`, ссылки `@id`, массивы `@type`/offers,
`priceSpecification`, GTIN-варианты/SKU/MPN/brand/size и schema availability. Цена локаль-нормализуется,
затем обязательно проходит `normalizeObservation`: ≤0/NaN/нет цены/не-EUR → ParseFailure, НИКОГДА 0.
Сайт-специфичные адаптеры при необходимости должны быть отдельными файлами.

### Matching

v1: админ вставляет URL товара конкурента на карточке нашего товара → match MANUAL; при первом fetch
сверяем EAN/SKU страницы с нашим (`Product.barcode`/`sku`): совпало → CONFIRMED-кандидат (подтверждает
админ), расхождение → AMBIGUOUS + предупреждение. Авто-поиск по каталогу конкурента — позже, всегда как
LIKELY/AMBIGUOUS. В рекомендациях по умолчанию только CONFIRMED + MANUAL.

### Analysis / recommendation (детерминированно, целые центы)

Последнее наблюдение каждого допустимого match не старше maxObservationAgeHours; out-of-stock исключаются
(requireAvailability) и показываются отдельно; effective = sale (если includeSalePrices) иначе regular;
выбросы — IQR при ≥4 точках. Нет рекомендации, если competitors < minimumCompetitors или
|отклонение от медианы| < minimumDifferencePercent. Цель = медиана, ограничение maxDecrease/maxIncrease
от текущей цены, округление до цента. Confidence HIGH/MEDIUM по числу/свежести/статусу match.

### Apply / stale protection

`POST /api/admin/pricing/recommendations/[id]/apply` (`prices.update`) с `expectedCurrentPrice` +
`productRevision`: в транзакции — рекомендация PENDING и не истекла; Product.price/revision совпадают;
пересчёт анализа даёт тот же fingerprint (иначе 409 STALE, статус STALE); externalId IS NULL и
!erpPriceMissing; `applyProductChanges` + `appendServerAudit('product.update')` +
`appendServerAudit('pricing.recommendation.apply')`; условный update статуса PENDING→APPLIED;
после транзакции `notifyPriceChange` + `revalidateProductStorefront` (как PUT).

### Scheduler

`scripts/competitor-pricing-monitor.ts --scheduled`, отдельная Plesk Scheduled Task (не в :07, напр.
`37 */6 * * *`), kill switch `COMPETITOR_MONITOR_ENABLED=true`, свой lease-lock KV
`competitor-pricing-run-lock` (копия паттерна sync-lock, ERP-код не трогаем), лимит страниц на источник
за прогон, последовательно внутри домена с requestDelay, ≤2 домена параллельно, ошибка источника не
роняет прогон, итог в `CompetitorMonitorRun` + `logOperationalEvent`. Из админки — только «проверить
одну ссылку сейчас» (rate-limited), полный прогон только из планировщика (iisnode HTTP timeouts).

### Routes / pages / API (план)

- Pages: `/admin/pricing` (дашборд + таблица + фильтры), `/admin/pricing/products/[id]`,
  `/admin/pricing/competitors`, `/admin/pricing/runs`, `/admin/pricing/settings`.
- Права (без новых permission): чтение `catalog.read`, конкуренты/match/rules `catalog.update`,
  Apply `prices.update`. Добавить `['/admin/pricing', 'catalog.read']` в ADMIN_PATH_PERMISSIONS.
- API `/api/admin/pricing/*`: competitors (GET/POST/PATCH/DELETE→disable), competitor-products
  (POST url, PATCH), matches (POST/PATCH status), products (GET list + filters), products/[id] (GET detail +
  history?range=7|30|90), recommendations (GET), recommendations/[id]/apply|ignore|erp-pending (POST),
  check-url (POST, rate-limited), runs (GET), rules (GET/PUT).
- Audit actions: `pricing.competitor.create|update|disable`, `pricing.match.*`, `pricing.rules.update`,
  `pricing.check_url`, `pricing.recommendation.apply|ignore|erp_pending`. Генерация рекомендаций и
  прогоны — в `CompetitorMonitorRun` (не в hash-chain AuditLog: объём).

## Current state

ЭТАПЫ 1–4 завершены. Есть: Prisma-схема 6 моделей, pending migration (не применена), domain-слой
`lib/competitor-pricing/*`, общий IP guard `lib/net-ip-guard.ts`, безопасный fetch `safe-fetch.ts` и
`robots.ts`, JSON-LD Product adapter и синтетические HTML fixtures (ничто из этого ещё не вызывается из
runtime-кода). Нет: matching workflow, сервисов с Prisma-запросами, API, UI, scheduler.

## Completed

- [x] ЭТАП 1: аудит цены, ERP-синка, override-слоя, checkout pricing, admin authz/CSRF/audit, scheduler,
      SSRF utils, тестов, миграций, графиков, i18n; архитектура.
- [x] ProductOverride pricing audit (read-only, см. отдельный раздел).
- [x] ЭТАП 2: schema + pending migration + rollback.sql + domain helpers + 107 unit-тестов.
- [x] ЭТАП 3: `lib/net-ip-guard.ts` (webhook-sender переведён на него), `safe-fetch.ts`, `robots.ts`,
      domain-валидация конкурента ужесточена до https-only; 212 новых тестов.
- [x] ЭТАП 4: `CompetitorAdapter` types + `jsonld-product`, только синтетические fixtures; 43 новых unit-теста.

## Remaining

- [ ] ЭТАП 5 matching. ЭТАП 6 observations. ЭТАП 7 analysis/recommendation. ЭТАП 8 UI.
- [ ] ЭТАП 9 scheduler. ЭТАП 10 threat-model review, tests, `docs/COMPETITOR-PRICING.md`.

## Important decisions

1. Модуль никогда не пишет в ERP-owned поля и не меняет sync/checkout/sellability код.
2. In-app Apply только для `externalId IS NULL && !erpPriceMissing`; для ERP-linked — ERP_PENDING.
3. Себестоимости нет → minimumMargin не применяется (не выдумывать).
4. Отдельные таблицы, не KV и не `SyncRun`; правила — KV + zod.
5. Change-only хранение наблюдений.
6. Без новых зависимостей (node:https/zlib, кастомный SVG-график).
7. Без новых admin-permissions.
8. (ЭТАП 2) Статусы — String-колонки + TS const-списки в `lib/competitor-pricing/constants.ts`: в схеме
   проекта нет ни одного Prisma enum (SyncRun.status, UserNotification.type и т.д. — строки).
9. (ЭТАП 2) Уникальность «одна открытая рекомендация на товар» и «один trusted match на competitor product»
   выражена через nullable `@unique` ключи (`openKey`, `exclusiveKey`), а НЕ partial index: Prisma не
   моделирует partial index, и следующий `migrate diff` по живой БД предложил бы его удалить.
10. (ЭТАП 2) FK на `Product` — `onDelete: Cascade`: в проекте есть hard delete товара
    (`lib/product-overrides-store.ts` `prisma.product.delete`); Restrict сломал бы его. Решения по рекомендациям
    дублируются в AuditLog (ЭТАП 8), поэтому история решений не теряется. FK на `Competitor` — Restrict
    (конкурента выключают, не удаляют).
11. (ЭТАП 2) `effectivePrice` в наблюдении НЕ хранится: он зависит от правила includeSalePrices; хранение
    зашило бы правило в данные. Считается при анализе из regular/sale.
12. (ЭТАП 2) Parse failure → `normalizeObservation` возвращает `{ok:false, code}`; строка наблюдения не
    создаётся; плюс CHECK-constraints в БД (цены > 0, хотя бы одна цена, currency `^[A-Z]{3}$`).
13. (ЭТАП 2) Валюта: v1 только EUR, без FX.
14. (ЭТАП 2) `respectRobotsTxt` убран из модели: соблюдение robots.txt не отключаемо.
15. (ЭТАП 3) ProductOverride money path — признан technical debt, отдельная будущая задача; в рамках
    competitor-pricing НЕ исправлять. **Стоп-условие:** если новый код начинает создавать или читать денежные
    поля ProductOverride — остановиться. Модуль использует только `Product.price` и `applyProductChanges`.
16. (ЭТАП 3) Production fetch — только https; http возможен лишь через test-only транспорт
    (`createTestSafeFetch`, бросает вне Vitest). В Competitor нет и не будет опций allowHttp / TLS-off / proxy.
    Domain-валидация (baseUrl, URL товара) тоже https-only.
17. (ЭТАП 3) DNS: все ответы должны быть публичными, иначе хост отклоняется целиком (mixed public/private →
    `unsafe_address`); соединение — на IP-литерал из того же ответа, повторного lookup нет.
18. (ЭТАП 3) robots.txt fail-safe: недоступен/ошибка → запрет (кроме 404/410 → разрешено).
19. (ЭТАП 4) JSON-LD — недоверенный вход: максимум 32 блока, 256 КиБ на блок, 512 КиБ суммарно и 10 000
    узлов; парсинг только `JSON.parse` + обход объектов, без DOM/JS. Циклические `@id`-ссылки не рекурсируют
    бесконечно. Длинные (>200) идентификаторы отбрасываются, а не усекаются до возможного ложного совпадения.
20. (ЭТАП 4) `Offer.price`, `UnitPriceSpecification.price` и `AggregateOffer.lowPrice` трактуются как текущая
    публичная regularPrice. Sale/list price не угадывается из диапазона или нескольких offers. Среди offers
    выбирается первый валидный EUR-кандидат; отсутствие/ошибка/≤0/не-EUR возвращает типизированный ParseFailure.
21. (ЭТАП 4) Fixtures только синтетические; HTML реальных конкурентов не сохранялся и сеть не использовалась.

## Recommendation state machine (ЭТАП 2, `lib/competitor-pricing/recommendation-state.ts`)

```
pending ─ignore────────► ignored          (terminal)
pending ─apply─────────► applied          только priceAuthority=local (externalId null при расчёте)
pending ─mark_for_erp──► erp_pending      только priceAuthority=erp; Product НЕ пишется
pending ─invalidate────► stale            closedReason: newer_recommendation|inputs_changed|expired|product_unavailable
erp_pending ─erp_observed► erp_applied    Product.price == recommendedPrice (Decimal, до цента) и externalId != null
erp_pending ─ignore────► ignored
erp_pending ─invalidate► stale
```

Persist — только условным update `WHERE id=? AND status=<current>`; `openKey = productId` пока pending/erp_pending.
Apply на ЭТАПЕ 8 дополнительно перепроверяет externalId/erpPriceMissing текущего Product (authority в
рекомендации — снимок, а не разрешение).

## ProductOverride pricing audit (2026-10-03, READ-ONLY)

**Flow.** KV `KeyValueSetting['product-overrides']` = `Record<productId, Partial<Product>>`.
- Запись price-полей возможна в 2 местах:
  1. `POST /api/admin/import` (mode `update`, CSV/XLSX) → `upsertProductOverride(id, changes)` — сохраняет
     в override любые отличающиеся поля, включая `price`/`oldPrice`/`bulkPricingTiers`; Product.price НЕ меняется.
  2. `restoreDeletedProduct…` (`lib/product-overrides-store.ts` ~стр. 400–420) → `upsertProductOverride` с diff
     архивного снимка против текущей строки (может включать price).
  Остальные писатели (`image-crop`, `scripts/crop-product-image.ts`) пишут только image/images.
  `PUT /api/admin/products`, `restore-previous`, price-batch revert — записывают Product.price и УДАЛЯЮТ override товара.
- Чтение с ценой из override: `getDbProducts`/`getMergedProducts`/`getDbProductsPaginated` →
  `applyProductOverride` → витрина (`app/[lang]/product/[id]`, `/api/products`, `/api/products/[id]`,
  `/api/v1/products`, `lib/catalog-service.ts`, sitemap/blog), а также корзина: клиентский cart-store
  хранит цену, увиденную на витрине. Для `erpPriceMissing` товаров price/oldPrice/bulkPricingTiers из override
  отбрасываются (`ERP_PRICE_LOCKED_OVERRIDE_FIELDS`).
- Checkout/order: `POST /api/orders` и `/api/v1/orders` → `recomputeOrderPricing` → `resolveLineItems` →
  `getCatalogPrices` — читает **только `Product.price`/`oldPrice`/`bulkPricingTiers` из БД, override игнорирует**.
  Заказ, инвойс и сумма к оплате считаются от Product.price.

**Вывод: путь «цена на витрине/в корзине ≠ цена в заказе» существует в коде** (admin import update с
изменённой ценой, или восстановление удалённого товара с другой архивной ценой).

**Масштаб в текущей БД (read-only SELECT в транзакции `READ ONLY`, затем ROLLBACK; БД из `.env.local`):**
71 override всего; с `price` — **0**; с `oldPrice` — 0; с `bulkPricingTiers` — 0. Затронутых товаров сейчас **0**.

- Severity: **Medium (латентный дефект целостности цены)**. Сейчас не проявляется; проявится при первом
  admin-импорте цен в режиме update. Последствие — клиент видит одну цену, заказ создаётся по другой
  (сервер списывает Product.price, т.е. завысить/занизить оплату клиент не может; риск — расхождение
  ожидания/доверие, а для админа — «импорт цен не работает» для checkout).
- Что исправить отдельной задачей: import (update) и restore должны записывать денежные поля в Product через
  `applyProductChanges` (revision, audit, approvalAfterPriceChange, sync-guard для linked) и не класть
  price/oldPrice/bulkPricingTiers в override; затем добавить guard в `applyProductOverride`, игнорирующий
  денежные поля override для всех товаров. Плюс тест «storefront price == checkout price».
- Влияние на competitor pricing: **архитектуру не меняет**. Модуль сравнивает и применяет только
  `Product.price` (то, что реально списывает checkout); Apply идёт через `applyProductChanges`, который удаляет
  override товара. Единственное следствие: в UI модуля «наша цена» = Product.price, и при наличии price-override
  витрина могла бы показывать иное — сейчас таких 0. Можно в ЭТАПЕ 8 показывать предупреждение, если у
  товара есть price-override.

## Stage 3 — Safe networking

### Architecture

```
safeFetch({url, allowedHosts, contentPolicy:'html'|'robots', limits})
  └─ checkTargetUrl: https only · no credentials · no explicit port · public DNS hostname · exact ∈ allowedHosts
  └─ per hop (initial + each redirect, ≤ 3):
       resolve(hostname) ONCE → every answer must pass isBlockedIp → else unsafe_address
       net.connect({host: <validated IP literal>, lookup: refuseLookup})      ← нет второго DNS-запроса
       peer = socket.remoteAddress → must equal chosen IP and pass isBlockedIp ← до отправки первого байта
       https: tls.connect({socket, servername: hostname}) — проверка цепочки и имени, системные CA
       http.request({createConnection: () => socket, Host, honest UA, Accept, Accept-Encoding: gzip, br})
       3xx → resolveRedirectTarget (relative OK, no downgrade, same URL policy) · loop/too-many detection
       non-2xx / cf-mitigated → errorForStatus (challenge detection only on 403/429/503 sample ≤ 32 КБ)
       2xx → Content-Type allowlist → Content-Encoding allowlist → Content-Length precheck → streaming read
```

Production транспорт заморожен (`PRODUCTION_TRANSPORT`): `dns.lookup({all:true, verbatim:true})`, `isBlockedIp`,
https only, системные CA, без прокси/cookies. `createTestSafeFetch` (test-only, бросает вне `VITEST=true`)
позволяет подменить DNS/адресную политику (в тестах «публичен» только 127.0.0.1 тест-сервера), порт, http и
доп. CA для тестов.

### IP guard (`lib/net-ip-guard.ts`)

Числовой разбор (IPv6 полностью раскрывается: зоны, встроенный IPv4, некомпрессированные формы), не строковые
префиксы. Заблокировано: IPv4 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24,
192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4, 168.63.129.16 (Azure).
IPv6: всё вне 2000::/3 (::, ::1, ULA fc00::/7, link-local fe80::/10, site-local fec0::/10, multicast, 100::/64),
2001::/23 (Teredo…), 2001:db8::/32, 3fff::/20, 64:ff9b:1::/48; IPv4-mapped ::ffff:x, NAT64 64:ff9b::/96 и 6to4
2002::/16 — по встроенному IPv4. Неразборчивое → блок.

Совместимость с webhook-sender: всё, что старая реализация блокировала, блокируется (отдельный тест-список);
**усиления** (доказаны тестами): site-local fec0::/10, всё вне 2000::/3, Teredo/doc/NAT64-local, 6to4/NAT64 с
приватным IPv4, IPv4-compatible ::a.b.c.d, hex-форма mapped (::ffff:7f00:1), некомпрессированные формы,
168.63.129.16. Webhook-sender по-прежнему делает pre-flight DNS + fetch (без IP-pinning) — поведение не
менялось, известное ограничение (см. Known issues).

### DNS strategy

A и AAAA через `dns.lookup(all, verbatim)`; пусто → `dns_error`; любой заблокированный ответ → весь хост
`unsafe_address` (blocking); подключение к первому ответу как IP-литералу; поздний ответ DNS после
connect-timeout не открывает сокет (`hop.aborted`). ENOTFOUND → `dns_error` (не retry), EAI_AGAIN → retryable.

### Limits (жёсткие границы; конкурент может только ужесточить)

| limit | min | max | default |
|---|---|---|---|
| connectTimeoutMs (DNS+TCP+TLS, на hop) | 200 | 10 000 | 5 000 |
| headersTimeoutMs (на hop) | 200 | 20 000 | 10 000 |
| totalTimeoutMs (всё, вкл. редиректы и тело) | 500 | 30 000 | 20 000 |
| maxBodyBytes (на проводе) | 1 024 | 5 000 000 | 2 000 000 |
| maxDecodedBytes (после распаковки) | 1 024 | 5 000 000 | 5 000 000 |
| redirects | — | 3 | 3 |

Тело читается потоком; при превышении любого лимита поток уничтожается, накопленное отбрасывается.
Content-Length больше лимита → отказ до чтения.

### Decompression

identity, gzip/x-gzip, br. deflate НЕ поддерживается (неоднозначный zlib/raw framing, нет необходимости);
любое другое/цепочки (`gzip, br`) → `unsupported_content_encoding`. Лимит считается по распакованным байтам
(gzip/br bomb 5 МБ нулей → `decompressed_too_large`); битый/обрезанный поток → `decode_error`.
Charset из Content-Type (`TextDecoder`, напр. windows-1257); неизвестная метка → UTF-8.

### Content-Type

html: `text/html`, `application/xhtml+xml`; robots: `text/plain`. Параметры (`; charset=…`) учитываются,
регистр не важен; отсутствие/иное → `unsupported_content_type`.

### robots policy (`lib/competitor-pricing/robots.ts`)

RFC 9309-минимум: группы User-agent (последовательные строки — одна группа), Allow/Disallow, `*`, `$`,
самое длинное правило побеждает, при равенстве Allow; группа нашего токена `HairshopProPriceMonitor`
(без учёта регистра/версии) перекрывает `*`; пустой Disallow ничего не запрещает; /robots.txt всегда разрешён;
glob-сопоставление O(n·m) без regex. Кэш — `RobotsCache` на прогон (один fetch на origin).

| ответ robots.txt | решение |
|---|---|
| 200 text/plain | парсить и соблюдать (нераспознанные строки игнорируются → мусор = нет правил) |
| 404 / 410 | allow (файла нет) |
| 401 / 403 / challenge | deny всё, blocking (код http_401/http_403/challenge) |
| 429 | deny на этот прогон (robots_unavailable, retryable) |
| 5xx, timeout, network, TLS, редирект вне allowlist, не text/plain, > 512 КБ, unsafe_address | deny на этот прогон (robots_unavailable) |

Сбой robots.txt никогда не означает «разрешено».

### Error taxonomy (`SafeFetchErrorCode`)

blocking (монитор переводит конкурента в blocked, без retry): `robots_disallowed`, `unsafe_address`,
`http_401`, `http_403`, `challenge`.
retryable (ограниченно, с backoff — реализует монитор): `timeout`, `network_error` (известные transient коды),
`http_server_error` (только 502/503/504), `dns_error` (только EAI_AGAIN), `robots_unavailable` (только из
transient причин).
Остальные (не retry, не blocking): `invalid_url`, `unsupported_scheme`, `credentials_in_url`,
`port_not_allowed`, `host_not_allowed`, `redirect_rejected`, `too_many_redirects`, `redirect_loop`,
`tls_error`, `rate_limited` (стоп источника на прогон, `retryAfterSeconds`), `not_found`, `http_error`,
`response_too_large`, `decompressed_too_large`, `unsupported_content_type`, `unsupported_content_encoding`,
`decode_error`. Parse-ошибки HTML — отдельный тип адаптера (ЭТАП 4).

Challenge-детект консервативный: заголовок `cf-mitigated: challenge` (любой статус) или маркеры
(cf-chl-, /cdn-cgi/challenge-platform, g-recaptcha, h-captcha, captcha-delivery.com, _incapsula_resource,
px-captcha) только в теле 403/429/503. 2xx-страницы на маркеры не проверяются (ложные срабатывания).

Логи: `SafeFetchError.message/toLogContext()` содержат только code/status/detail/URL без query
(`?[redacted]`) и без credentials; тела, заголовки, cookies не попадают никогда.

### Tests (ЭТАП 3)

`net-ip-guard.test.ts` 94 · `safe-fetch.test.ts` 86 (вкл. 4 реальных TLS-теста с self-signed сертификатом,
генерируемым openssl во временной папке и удаляемым; если openssl нет — эти 4 пропускаются) ·
`robots.test.ts` 29 · `competitor-config.test.ts` +3. Всего +212. Сети нет: production-транспорт в тестах с
замоканным DNS падает до подключения; остальное — loopback-серверы через test-транспорт.

### Known limitations

- Подключение к первому DNS-ответу; без Happy Eyeballs/перебора адресов (ошибка → retry монитором).
- Нет HTTP/2, keep-alive, conditional requests (ETag) — каждый hop новое соединение.
- Неизвестная charset-метка → UTF-8.
- Challenge-детект эвристический и консервативный: CAPTCHA, отданная с 200, не распознаётся (адаптер получит
  страницу без цены → parse-ошибка, не 0).
- robots: нет percent-decoding нормализации путей (RFC 9309 §2.2.2), Crawl-delay не читается (вежливость
  задаётся requestDelayMs конкурента).
- Webhook-sender не получил IP-pinning (вне scope).

## Database

Prisma schema (`prisma/schema.prisma`, +201 строка, только добавления):

| Model | Ключевое |
|---|---|
| `Competitor` | `hostname @unique`; `allowedHosts String[]`; `adapterKey`; `enabled=false` по умолчанию; `status` active/paused/blocked + `statusReason`; `accessBasisNote` обязателен; лимиты poll/delay/concurrency/timeout/maxResponseBytes/maxProductsPerRun; last* состояние; idx `(enabled,status)` |
| `CompetitorProduct` | FK Competitor Restrict; `@@unique(competitorId,url)`; sourceProductId/title/brand/ean/manufacturerSku/sizeText; lastAvailability; monitoringState; lastCheck*; idx `(competitorId,monitoringState)`, `ean`, `manufacturerSku` |
| `CompetitorProductMatch` | FK Product Cascade, CompetitorProduct Cascade; `@@unique(productId,competitorProductId)`; status/method; confidence Decimal(4,3); `exclusiveKey @unique`; decidedById/At; idx `competitorProductId`, `(productId,status)` |
| `CompetitorPriceObservation` | FK CompetitorProduct Cascade, Competitor Restrict; regular/sale Decimal(12,2)?; currency VarChar(3); availability; `stateHash`; observedAt/lastSeenAt/seenCount; first/lastRunId; idx `(competitorProductId,observedAt)`, `(competitorId,observedAt)`, `observedAt` |
| `PricingRecommendation` | FK Product Cascade; status; priceAuthority; currency; current/recommended/difference/marketMin/Median/Max Decimal(12,2); differencePercent Decimal(7,2); competitorCount; confidence; reasonCode/Params; `inputSnapshot` Json + `inputHash`; algorithmVersion; productRevision; calculatedAt/expiresAt; `openKey @unique`; closedReason; decided*; appliedPrice; resolvedAt; idx `(productId,calculatedAt)`, `(status,calculatedAt)` |
| `CompetitorMonitorRun` | status; triggeredBy scheduled/manual; triggeredById; started/finished; competitors attempted/succeeded/failed/blocked; productsChecked; observationsCreated/Unchanged; parse/fetchFailures; errorSample/summary Json (без HTML); idx `startedAt`, `status` |

Pending migration: `prisma/pending-migrations/20261003120000_competitor_pricing/migration.sql`
(сгенерирована офлайн `prisma migrate diff --from-schema <HEAD schema> --to-schema prisma/schema.prisma --script`
— без подключения к БД; + ручные CHECK-constraints) и `rollback.sql` (DROP 6 таблиц; никогда не класть в
`prisma/migrations/`). Только CREATE TABLE/INDEX/FK из новых таблиц; ни одной правки существующих таблиц.

Применение (НЕ выполнялось): только с явного разрешения и на не-прод БД:
`npx prisma db execute --file <migration.sql>` → `npx prisma migrate resolve --applied 20261003120000_competitor_pricing`
→ перенос папки в `prisma/migrations/`. ВНИМАНИЕ: `prisma.config.ts` берёт DATABASE_URL из `.env.local` = прод.

`npx prisma generate` выполнен локально (generated/ в .gitignore; к БД не подключается). Новые модели есть в
типах клиента, но таблиц в БД нет → ни один runtime-путь их пока не использует. Нельзя мержить код,
обращающийся к этим моделям, в деплой до применения миграции.

## Files changed

ЭТАП 1: `docs/COMPETITOR-PRICING-CONTINUATION.md`.
ЭТАП 2:
- `prisma/schema.prisma` (6 моделей + 2 back-relation поля в Product)
- `prisma/pending-migrations/20261003120000_competitor_pricing/{migration.sql,rollback.sql}`
- `lib/competitor-pricing/constants.ts` — допустимые значения статусов/методов/availability/currency
- `lib/competitor-pricing/money.ts` — Decimal/string ↔ целые центы, changeBasisPoints (BigInt), без float
- `lib/competitor-pricing/settings.ts` — zod pricing rules, defaults, resolveStoredPricingRules
- `lib/competitor-pricing/competitor-config.ts` — zod competitor input, нормализация hostname/allowedHosts,
  канонизация URL товара (host ∈ allowedHosts), isCompetitorFetchable
- `lib/competitor-pricing/match.ts` — trusted statuses, exclusiveKey, правила «авто ≠ confirmed»
- `lib/competitor-pricing/observation.ts` — normalizeObservation (никогда 0), stateHash, append/touch
- `lib/competitor-pricing/recommendation-state.ts` — state machine, openKey, priceAuthorityFor, actions
- `lib/competitor-pricing/recommendation-snapshot.ts` — snapshot type, canonical inputHash, ERP-fulfilment check
- `*.test.ts` рядом для каждого модуля (6 файлов)
ЭТАП 3:
- `lib/net-ip-guard.ts` + `.test.ts` — общий IP guard (новый)
- `lib/webhook-sender.ts` — инлайн-guard удалён, импорт `isBlockedIp` из `lib/net-ip-guard` (логика отправки не менялась)
- `lib/competitor-pricing/safe-fetch.ts` + `.test.ts` — безопасный fetch, лимиты, классификация ошибок
- `lib/competitor-pricing/robots.ts` + `.test.ts` — robots.txt парсер/политика/кэш
- `lib/competitor-pricing/competitor-config.ts` + `.test.ts` — baseUrl и URL товара только https
ЭТАП 4:
- `lib/competitor-pricing/adapters/types.ts` — `CompetitorAdapter`, `ParsedListing`, типизированные ParseFailure.
- `lib/competitor-pricing/adapters/jsonld-product.ts` + `.test.ts` — ограниченное извлечение/разбор JSON-LD,
  Product/Offer/AggregateOffer, локаль-нормализация цены → `normalizeObservation`, metadata/availability.
- `lib/competitor-pricing/adapters/__fixtures__/{basic-product,graph-aggregate,array-products}.html` — только
  синтетический HTML, включая root array, `@graph`/`@id`, AggregateOffer и UnitPriceSpecification.

## Tests

ЭТАП 2 (2026-10-03):
- `npx vitest run --config vitest.config.ts lib/competitor-pricing` → 6 files, 107 passed
  (поймал и исправил реальную ошибку: верхняя граница Decimal(12,2) в money.ts была завышена ×10).
- `npx vitest run --config vitest.config.ts` (весь unit) → 287 files, 2020 passed.
  Примечание: в дереве есть чужие незакоммиченные правки `lib/product-form-mapping*` — прогон включал их.
- `npx tsc --noEmit` → 0 ошибок. `npx eslint lib/competitor-pricing` → 0. `npx prisma validate` → valid.
- НЕ запускались: `npm run test:integration` (tests/integration ходят в БД из env = прод),
  `npm run build` (= `prisma migrate deploy` на прод), e2e. Для integration-тестов модуля понадобится
  отдельная не-прод БД/Neon-ветка — решение пользователя (на ЭТАП 2 не требовалось).

ЭТАП 3 (2026-10-03):
- `npx vitest run --config vitest.config.ts lib/net-ip-guard.test.ts lib/webhook-sender.test.ts` → 97 passed
  (существующие 3 webhook-теста без изменений).
- `lib/competitor-pricing/*` → safe-fetch 86, robots 29, competitor-config 46 — все passed; TLS-тесты выполнены
  (не skipped).
- Весь unit → 290 files, 2232 passed (было 2020).
- `npx tsc --noEmit` → 0. `npx eslint` изменённых файлов → 0. `git diff --check` → чисто.
- prisma schema в ЭТАПЕ 3 не менялась (validate не требовался). Миграция всё ещё только в
  `prisma/pending-migrations/`, в `prisma/migrations/` её нет. Команд, подключающихся к БД, в ЭТАПЕ 3 не было.

ЭТАП 4 (2026-10-03):
- `npx vitest run --config vitest.config.ts lib/competitor-pricing/adapters/jsonld-product.test.ts` →
  1 файл, 43 passed.
- `npx vitest run --config vitest.config.ts lib/competitor-pricing` → 9 файлов, 264 passed, 4 skipped
  (TLS-тесты safe-fetch пропущены окружением из-за недоступного openssl; adapter-тесты не пропускались).
- `npm run test:unit` → 291 файл, 2271 passed, 4 skipped. Прогон включал чужие незакоммиченные правки
  `lib/product-form-mapping*`, как и в предыдущих этапах.
- `npx tsc --noEmit` → 0. `npx eslint lib/competitor-pricing/adapters` → 0. `git diff --check` → чисто.
- Prisma schema/migration не менялись; БД, integration/e2e/build и внешняя сеть не использовались.

## Known issues (смежные, вне scope — не чинить без разрешения)

- ProductOverride price path — см. раздел «ProductOverride pricing audit» (Medium, латентный, 0 товаров сейчас).
  Решение пользователя 10-03: technical debt, отдельная будущая задача; см. Important decisions №15 (стоп-условие).
- `lib/webhook-sender.ts`: SSRF pre-flight без IP-pinning (DNS rebinding) — признано в комментарии.

## Security

ЭТАП 3 (network-level, протестировано): SSRF (схемы, credentials, порты, IP-литералы, allowlist по точному
hostname, все DNS-ответы публичны), DNS rebinding (один resolve на hop → connect на IP-литерал → проверка
peer до отправки запроса), redirect SSRF (каждый hop заново, без downgrade, loop/limit), oversized/
decompression bomb, неизвестные encoding/content-type, TLS без отключения проверки, robots fail-safe,
log-safety (без тел/cookies/query). Детали — раздел «Stage 3 — Safe networking».

ЭТАП 2 (domain-level, протестировано; в ЭТАПЕ 3 ужесточено до https-only): запрет credentials в URL, нестандартных портов,
IP-литералов (v4/v6/hex/decimal), localhost/.local/.internal/…; allowedHosts только родственные hostname
(нет смешивания источников, lookalike `shop.lv.evil.com` отклонён); жёсткие пределы politeness-настроек
(delay ≥ 1 c, concurrency ≤ 2, poll ≥ 60 мин, ответ ≤ 5 МБ); поля credentials отклоняются strict-схемой.
Это логическая граница, НЕ сетевая SSRF-защита (ЭТАП 3).

ЭТАП 4 (parser-level, протестировано): JSON-LD ограничен по числу/размеру/числу узлов; JS не исполняется,
обычные `<script>` игнорируются, HTML/JSON-LD не сохраняется и не рендерится. Циклы `@id` прекращаются;
невалидная, нулевая и не-EUR цена не создаёт observation. Текстовые metadata остаются недоверенным текстом
и ограничиваются по длине; identifier >200 символов отбрасывается целиком.

Проверено: существующие authz/CSRF/audit/rate-limit/SSRF-утилиты (см. таблицу). Threat model модуля
(SSRF, redirect SSRF, DNS rebinding, XSS, malicious HTML, oversized/decompression bomb, CSRF, SQLi —
только Prisma/параметризованный SQL, scheduler abuse, log injection) — заложена в архитектуру,
проверка на коде — ЭТАП 10.

## Git

- Branch: `main`. HEAD на старте задачи: `67589105`.
- Коммиты задачи: `627c0b5d` (ЭТАП 1, docs), `fec60300` (ЭТАП 2), коммит ЭТАПА 3
  `b7afb2eb` (`feat(pricing): safe competitor fetch infrastructure`), коммит ЭТАПА 4
  `feat(pricing): parse JSON-LD competitor products` (хэш — `git log --oneline -5`).
- Чужие незакоммиченные изменения в дереве (НЕ трогать, не коммитить): `components/admin/products/AddProductForm.tsx`,
  `docs/deployment-checklist.md`, `lib/product-form-mapping*.ts`, корневые `*.json/*.md/*.csv` отчёты синка.
- Push не выполнялся (запрещён без отдельного разрешения).

## Next exact step

ЭТАП 5: реализовать чистый deterministic matching-слой поверх `ParsedListing` и нашего Product (без Prisma/API):
консервативная нормализация EAN/GTIN и SKU; точное сравнение parsed `ean`/`manufacturerSku` с
`Product.barcode`/`sku`; явный результат match/mismatch/missing/conflict с method/reason и без fuzzy title-match.
Автоматический код никогда не выдаёт trusted-статус: точное совпадение — кандидат `likely`, конфликт
идентификаторов — `ambiguous`; перевод в `confirmed` делает только админ через уже существующий
`assertMatchDecision`. Добавить unit-тесты на leading zero, пробелы/дефисы, регистр SKU, разные EAN/SKU,
совпадение одного при конфликте другого, отсутствующие/слишком длинные identifiers. Не обращаться к БД/сети;
не начинать persistence/API до отдельного этапа.
