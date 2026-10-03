# Competitor Pricing — continuation handoff

> Для следующей сессии: НЕ начинай заново. Прочитай файл целиком → `git status` → `git log -5` →
> сверь с разделом Git → продолжай с «Next exact step». Если handoff расходится с Git — истина Git;
> сначала поправь этот файл.

Последнее обновление: 2026-10-03, конец ЭТАПА 1 (аудит + архитектура). Код модуля НЕ написан.

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

## Architecture (предложена, ждёт подтверждения пользователя)

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

### Prisma models (все новые таблицы, Product не меняется кроме back-relation полей — без колонок)

- `Competitor` — name, baseUrl, allowedHosts String[], adapterKey, enabled, status
  (ACTIVE/PAUSED/BLOCKED/ERROR), blockedReason, pollIntervalMinutes, requestDelayMs, maxConcurrency,
  timeoutMs, maxResponseBytes, respectRobotsTxt, accessBasisNote (на каком основании мониторим),
  lastCheckedAt, lastSuccessAt, lastError, lastErrorAt, consecutiveFailures, createdBy, timestamps.
- `CompetitorProduct` — competitorId, url (unique per competitor), title, sku, ean, brand, sizeText,
  lastRegularPrice/lastSalePrice Decimal?, currency, lastAvailability, lastObservedAt, lastCheckStatus,
  lastError, enabled.
- `CompetitorProductMatch` — productId ↔ competitorProductId (unique pair), status
  enum CONFIRMED/LIKELY/MANUAL/AMBIGUOUS/REJECTED, method EAN/SKU/TITLE/MANUAL, score, decidedBy/At, note.
- `CompetitorPriceObservation` — competitorProductId, competitorId, regularPrice/salePrice Decimal?,
  currency, availability enum, observedAt (начало интервала), lastSeenAt, runId.
  **Change-only**: новая строка только при изменении regular/sale/availability/currency; иначе
  `lastSeenAt` обновляется. Ступенчатый ряд → графики 7/30/90 без дублей.
- `PricingRecommendation` — productId, status PENDING/APPLIED/IGNORED/STALE/SUPERSEDED/ERP_PENDING/
  APPLIED_IN_ERP, currentPrice, recommendedPrice, difference, differencePercent, marketMin/Median/Max,
  competitorCount, confidence, reasonCode + reasonParams Json (текст строится в UI из данных, 3 языка),
  inputFingerprint, productRevision, rulesSnapshot Json, expiresAt, decidedBy/At, decisionNote, appliedPrice.
- `CompetitorMonitorRun` — история прогонов (НЕ переиспользуем `SyncRun`: его читает ERP preflight).
- Pricing rules — KV `competitor-pricing-rules` + zod (существующий паттерн): minimumDifferencePercent,
  maxDecreasePercent, maxIncreasePercent, minimumCompetitors, maxObservationAgeHours, ignoreOutliers,
  includeSalePrices, requireAvailability, includeLikelyMatches(=false), recommendationTtlHours.
  minimumMargin — в схеме правил есть, но выключен до появления реальной себестоимости.

### Fetch / security

- `lib/competitor-pricing/safe-fetch.ts`: node:https с кастомным `lookup`, валидирующим КАЖДЫЙ resolved IP
  (закрывает DNS rebinding — соединение идёт на проверенный адрес); только http/https, порт 80/443;
  host ∈ competitor.allowedHosts; запрет IP-литералов/localhost/private/link-local/metadata; ручные
  redirect ≤ 3 с повторной проверкой host+IP; timeout; потоковый лимит байт; gzip/br распаковка с лимитом
  на выходе (decompression bomb); content-type только text/html / application/(ld+)json; честный UA
  `HairshopProPriceMonitor/1.0 (+https://hairshoppro.lv)`; без прокси/ротации.
- IP-блок-лист извлечь из `lib/webhook-sender.ts` в общий `lib/net-ip-guard.ts` (webhook-тесты должны пройти).
- robots.txt соблюдается (кэш на прогон); Disallow → BLOCKED.
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

ЭТАП 1 завершён (аудит + архитектура выше). Схема/код не начаты.

## Completed

- [x] Аудит: цена, ERP-синк, override-слой, checkout pricing, admin authz/CSRF/audit, scheduler, SSRF utils,
      тесты, миграции, графики, i18n.
- [x] Предложена архитектура, модели, роуты, риски.

## Remaining

- [ ] Решения пользователя (см. Open decisions) — блокирует ЭТАП 2.
- [ ] ЭТАП 2 schema + domain types (миграция в `prisma/pending-migrations/`, применять только на dev-ветку Neon).
- [ ] ЭТАП 3 safe-fetch + ip-guard + robots. ЭТАП 4 adapter jsonld-product + fixtures.
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

## Open decisions (ждут пользователя)

1. Список конкурентов (домены) и подтверждение, что мониторинг их публичных страниц разрешён/согласован.
2. База сравнения: Product.price = price2 (цена мастера). Конкуренты обычно показывают розницу с НДС.
   Сравнивать price2 с их публичной ценой, или показывать ещё price1 (наша розница из ERP)?
   (Предположение: price2 включает НДС — checkout делает extractVat из Product.price; подтвердить.)
3. Подтвердить, что для ERP-linked товаров Apply = «передать в ERP» (не override поверх синка).
4. Dev-БД: создать Neon-ветку для разработки (локальный `.env.local` смотрит в прод).
5. Разрешение на локальные коммиты по этапам (push — нет без отдельного разрешения).

## Database

Ничего не добавлено.

## Files changed

- `docs/COMPETITOR-PRICING-CONTINUATION.md` (этот файл).

## Tests

ЭТАП 1 — только чтение кода, тесты не запускались (кода нет).

## Known issues (смежные, вне scope — не чинить без разрешения)

- KV `product-overrides` может содержать `price` (пишется `app/api/admin/import/route.ts` через
  `upsertProductOverride`): витрина показывает override-цену, checkout (`getCatalogPrices`) берёт
  Product.price → возможное расхождение показанной и списанной цены. Не проверено, есть ли такие
  override в прод-данных.
- `lib/webhook-sender.ts`: SSRF pre-flight без IP-pinning (DNS rebinding) — признано в комментарии.

## Security

Проверено: существующие authz/CSRF/audit/rate-limit/SSRF-утилиты (см. таблицу). Threat model модуля
(SSRF, redirect SSRF, DNS rebinding, XSS, malicious HTML, oversized/decompression bomb, CSRF, SQLi —
только Prisma/параметризованный SQL, scheduler abuse, log injection) — заложена в архитектуру,
проверка на коде — ЭТАП 10.

## Git

- Branch: `main`. HEAD на старте: `67589105`.
- Коммиты задачи: коммит этого handoff-файла (docs only) — см. `git log -- docs/COMPETITOR-PRICING-CONTINUATION.md`.
- Чужие незакоммиченные изменения в дереве (НЕ трогать, не коммитить): `components/admin/products/AddProductForm.tsx`,
  `docs/deployment-checklist.md`, `lib/product-form-mapping*.ts`, корневые `*.json/*.md/*.csv` отчёты синка.
- Push не выполнялся.

## Next exact step

Получить от пользователя ответы на Open decisions 1–5; после этого — ЭТАП 2: добавить модели в
`prisma/schema.prisma`, сгенерировать SQL через `migrate diff` в `prisma/pending-migrations/<ts>_competitor_pricing/`
(НЕ в `prisma/migrations/`), domain-типы `lib/competitor-pricing/types.ts`, `npx prisma validate` + `tsc`.
