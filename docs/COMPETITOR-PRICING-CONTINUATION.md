# Competitor Pricing — continuation handoff

> Для следующей сессии: НЕ начинай заново. Прочитай файл целиком → `git status` → `git log -5` →
> сверь с разделом Git → продолжай с «Next exact step». Если handoff расходится с Git — истина Git;
> сначала поправь этот файл.

Последнее обновление: 2026-10-03, конец ЭТАПА 2 (schema + domain model). Scraping/fetch/UI не начаты.
Миграция НЕ применена ни к одной БД.

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

- `lib/competitor-pricing/safe-fetch.ts`: node:https с кастомным `lookup`, валидирующим КАЖДЫЙ resolved IP
  (закрывает DNS rebinding — соединение идёт на проверенный адрес); только http/https, порт 80/443;
  host ∈ competitor.allowedHosts; запрет IP-литералов/localhost/private/link-local/metadata; ручные
  redirect ≤ 3 с повторной проверкой host+IP; timeout; потоковый лимит байт; gzip/br распаковка с лимитом
  на выходе (decompression bomb); content-type только text/html / application/(ld+)json; честный UA
  `HairshopProPriceMonitor/1.0 (+https://hairshoppro.lv)`; без прокси/ротации.
- IP-блок-лист извлечь из `lib/webhook-sender.ts` в общий `lib/net-ip-guard.ts` (webhook-тесты должны пройти).
- robots.txt соблюдается всегда (не настраивается админом; кэш на прогон); Disallow → BLOCKED.
- 401/403/CAPTCHA/challenge (cf-mitigated, известные маркеры) → BLOCKED, сбор с источника остановлен до
  ручного возобновления, без retry. 429 → стоп источника на этот прогон. Retry (≤2, exp backoff) только
  сетевые ошибки и 502/503/504 без признаков challenge.
- HTML конкурента — недоверенный: парсим в памяти, не храним, не рендерим; title/URL в UI только как текст,
  ссылки через `sanitizeStoredLink`, `rel="noopener noreferrer nofollow"`.

### Adapters

`CompetitorAdapter { key; parse(html, url): ParsedListing | ParseFailure }`. Первый — `jsonld-product`
(schema.org Product/Offer из `<script type="application/ld+json">`), сайт-специфичные — отдельными файлами
при необходимости. Цена: строка → целые центы → Decimal; ≤0/NaN/нет цены/не-EUR → ParseFailure, НИКОГДА 0.

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

ЭТАП 1 и ЭТАП 2 завершены. Есть: Prisma-схема 6 моделей, pending migration (не применена), чистый
domain-слой `lib/competitor-pricing/*` (без БД/сети) с unit-тестами. Нет: fetch, adapters, сервисов с
Prisma-запросами, API, UI, scheduler.

## Completed

- [x] ЭТАП 1: аудит цены, ERP-синка, override-слоя, checkout pricing, admin authz/CSRF/audit, scheduler,
      SSRF utils, тестов, миграций, графиков, i18n; архитектура.
- [x] ProductOverride pricing audit (read-only, см. отдельный раздел).
- [x] ЭТАП 2: schema + pending migration + rollback.sql + domain helpers + 107 unit-тестов.

## Remaining

- [ ] ЭТАП 3 safe-fetch + ip-guard + robots (тесты на локальном HTTP-сервере/моках, без внешней сети).
- [ ] ЭТАП 4 adapter jsonld-product + локальные HTML fixtures.
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

## Known issues (смежные, вне scope — не чинить без разрешения)

- ProductOverride price path — см. раздел «ProductOverride pricing audit» (Medium, латентный, 0 товаров сейчас).
- `lib/webhook-sender.ts`: SSRF pre-flight без IP-pinning (DNS rebinding) — признано в комментарии.

## Security

ЭТАП 2 (domain-level, протестировано): только http/https; запрет credentials в URL, нестандартных портов,
IP-литералов (v4/v6/hex/decimal), localhost/.local/.internal/…; allowedHosts только родственные hostname
(нет смешивания источников, lookalike `shop.lv.evil.com` отклонён); жёсткие пределы politeness-настроек
(delay ≥ 1 c, concurrency ≤ 2, poll ≥ 60 мин, ответ ≤ 5 МБ); поля credentials отклоняются strict-схемой.
Это логическая граница, НЕ сетевая SSRF-защита (ЭТАП 3).

Проверено: существующие authz/CSRF/audit/rate-limit/SSRF-утилиты (см. таблицу). Threat model модуля
(SSRF, redirect SSRF, DNS rebinding, XSS, malicious HTML, oversized/decompression bomb, CSRF, SQLi —
только Prisma/параметризованный SQL, scheduler abuse, log injection) — заложена в архитектуру,
проверка на коде — ЭТАП 10.

## Git

- Branch: `main`. HEAD на старте задачи: `67589105`.
- Коммиты задачи: `627c0b5d` (ЭТАП 1, docs), коммит ЭТАПА 2 `feat(pricing): competitor pricing schema and domain model`
  (хэш — `git log --oneline -3`).
- Чужие незакоммиченные изменения в дереве (НЕ трогать, не коммитить): `components/admin/products/AddProductForm.tsx`,
  `docs/deployment-checklist.md`, `lib/product-form-mapping*.ts`, корневые `*.json/*.md/*.csv` отчёты синка.
- Push не выполнялся (запрещён без отдельного разрешения).

## Next exact step

ЭТАП 3: создать `lib/net-ip-guard.ts`, вынеся `isBlockedIp` (+IPv4/IPv6 диапазоны) из `lib/webhook-sender.ts`
без изменения поведения (прогнать `lib/webhook-sender.test.ts`), затем `lib/competitor-pricing/safe-fetch.ts`
(node:https + кастомный `lookup` с проверкой каждого IP, ручные redirect ≤3 с перепроверкой host∈allowedHosts,
timeout, лимит байт до и после gzip/br, allowlist content-type, честный UA) и `robots.ts`; тесты — только на
локальном `http.createServer`/моках `dns.lookup`, без внешней сети и без реальных конкурентов.
