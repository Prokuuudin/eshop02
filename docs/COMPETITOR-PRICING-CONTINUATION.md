# Competitor Pricing — continuation handoff

> Для следующей сессии: НЕ начинай заново. Прочитай файл целиком → `git status` → `git log -5` →
> сверь с разделом Git → продолжай с «Next exact step». Если handoff расходится с Git — истина Git;
> сначала поправь этот файл.

Последнее обновление: 2026-10-03, конец ЭТАПА 8 (application contracts + honest admin shell). Pricing Prisma
repository/DB-backed API/scheduler не начаты.
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

Аудит ЭТАПА 5 ужесточил price normalization: одиночные `1,234`/`1.234` неоднозначны (thousands или
3 decimal places) и теперь дают `invalid_price`. Поддержаны только однозначные `12.34`, `12,34`,
`1,234.56`, `1.234,56`, пробелы/NBSP/apostrophe как grouping и EUR/€ по краям.

### Matching

РЕАЛИЗОВАНО в ЭТАПЕ 5 как чистый domain layer без Prisma: adapter `ParsedListing` + переданный ограниченный
список Product candidates → объяснимый `protected | likely | ambiguous | no_match`. Автоматический matcher
выдаёт только `likely`/`ambiguous`, никогда `confirmed`/`manual`; trusted existing match защищён. Политики,
confidence mapping, conflicts и ограничения подробно описаны в «Stage 5 — Deterministic matching».

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

- Реализовано в ЭТАПЕ 8: только `/admin/pricing` — server-authorized shell, disconnected DTO, summary/product/source
  presentational components и честные empty states. DB-backed API routes и mutations отсутствуют.
- После разрешения DB-stage: `/admin/pricing/products/[id]`,
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

ЭТАПЫ 1–8 завершены. Есть: Prisma-схема 6 моделей, pending migration (не применена), domain-слой
`lib/competitor-pricing/*`, общий IP guard `lib/net-ip-guard.ts`, безопасный fetch `safe-fetch.ts` и
`robots.ts`, JSON-LD Product adapter, synthetic fixtures, deterministic matcher и pure ingestion service с
repository port/fake tests, pure integer market analysis/recommendation engine и semantic snapshot/hash
(ничто из этого ещё не вызывается из pricing runtime-кода), Prisma-free application DTO/query contracts и
`/admin/pricing` shell с disconnected state. Нет: pricing Prisma repository, DB-backed application services/API,
mutation actions, реальных monitoring data и scheduler.

## Completed

- [x] ЭТАП 1: аудит цены, ERP-синка, override-слоя, checkout pricing, admin authz/CSRF/audit, scheduler,
      SSRF utils, тестов, миграций, графиков, i18n; архитектура.
- [x] ProductOverride pricing audit (read-only, см. отдельный раздел).
- [x] ЭТАП 2: schema + pending migration + rollback.sql + domain helpers + 107 unit-тестов.
- [x] ЭТАП 3: `lib/net-ip-guard.ts` (webhook-sender переведён на него), `safe-fetch.ts`, `robots.ts`,
      domain-валидация конкурента ужесточена до https-only; 212 новых тестов.
- [x] ЭТАП 4: `CompetitorAdapter` types + `jsonld-product`, только синтетические fixtures; 43 новых unit-теста.
- [x] ЭТАП 5: pure deterministic matching + conservative normalization + Stage 4 price audit; 64 новых теста.
- [x] ЭТАП 6: pure observation ingestion + узкий atomic repository contract + test-only transactional fake;
      append/touch/failure/idempotency/concurrency semantics; 35 новых тестов.
- [x] ЭТАП 7: pure integer market statistics + deterministic median recommendation, trusted/fresh/available
      filtering, duplicate/outlier policies, clamps/action modes/snapshot; 64 новых теста.
- [x] ЭТАП 8: Prisma-free application/API DTO contracts, integer cents + ISO date boundary, centralized ru/en/lv
      reason/status presentation, server-authorized `/admin/pricing` shell, honest disconnected state; 31 новый тест.

## Remaining

- [ ] ЭТАП 9: только после явного решения по non-production DB — безопасно применить pending migration там,
      реализовать/test Prisma repositories + application services, затем DB-backed read API/UI и review actions.
- [ ] ЭТАП 10 scheduler. ЭТАП 11 threat-model review, tests, `docs/COMPETITOR-PRICING.md`.

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
22. (ЭТАП 5) `Product.barcode`/`sku` nullable, НЕ unique и без DB indexes; matcher всегда принимает уже
    ограниченный список candidates и сам проверяет дубли. `externalId @unique` — ERP identity Hairshop Pro,
    не competitor identifier и matching его игнорирует.
23. (ЭТАП 5) Только check-digit-valid GTIN-8/12/13/14 является exact identifier; leading zero сохраняется.
    Нестандартный/невалидный barcode классифицируется как legacy и не создаёт GTIN evidence.
24. (ЭТАП 5) SKU normalization минимальна: NFKC + trim/case/whitespace; punctuation значима (`AB-123 ≠ AB123`).
    SKU exact без exact-normalized brand недостаточен для `likely`; duplicate SKU всегда `ambiguous`.
25. (ЭТАП 5) Brand aliases отсутствуют: punctuation tokenized, но диакритика не снимается и fuzzy aliases не
    создаются (`L'Oréal ≠ Loreal`). Title similarity только ранжирует manual-review candidates.
26. (ЭТАП 5) Size хранится как integer milli-base units (`ml`/`g`) или count; l/kg конвертируются без float.
    Pack structure сохраняется: `2×250 ml ≠ 500 ml`; неоднозначный size снижает результат до manual review.
27. (ЭТАП 5) Fixed confidence: unique GTIN 0.980, unique SKU+brand 0.900, exact brand+title+size 0.780;
    conflict/duplicate 0.500, SKU without brand 0.600. Это rule labels, не вероятностная модель.
28. (ЭТАП 5) Existing confirmed/manual всегда protected. Rejected candidate исключён при том же pair evidenceKey;
    legacy rejection без fingerprint исключён до ручной очистки; повторная оценка допустима только при новом
    нормализованном evidence.
29. (ЭТАП 6) Observation ingestion не зависит от match: история принадлежит `CompetitorProduct` и может
    собираться до подтверждения связи с Hairshop `Product`. Matcher/recommendation не вызываются автоматически.
30. (ЭТАП 6) `checkedAt` — server-controlled время фактической попытки и монотонный event key для одного
    `CompetitorProduct`: равное значение = replay/no-op, меньшее = stale/no-op, новая retry-попытка получает новое
    время. `observedAt` = первое появление последовательного состояния; `lastSeenAt` = последнее успешное
    подтверждение; `lastCheckAt` обновляется и при ошибке; `lastObservedAt` — только при успехе.
31. (ЭТАП 6) Read latest → append/touch → update operational state обязаны быть одной атомарной транзакцией,
    сериализованной на `CompetitorProduct` (или с эквивалентным row-lock/serializable retry). Touch условный по
    latest row id + stateHash; конфликт не превращается в append.
32. (ЭТАП 6) Цена не дублируется в `CompetitorProduct`: источник истины — последняя observation. Там остаются
    только `lastAvailability`, last check/success timestamps, status/error и `consecutiveFailures`. Существующая
    schema уже имеет first/last seen и `seenCount`, поэтому schema/pending migration не менялись.
33. (ЭТАП 7) Market evidence — только `confirmed`/`manual`; `likely` никогда не влияет на цену. Сохранённое для
    совместимости поле settings `includeLikelyMatches` теперь строго `false`; true делает rules invalid/fail-closed.
34. (ЭТАП 7) Единственная target strategy v1 — `match_median`, как было принято в архитектуре. Median/average
    округляют exact half-cent вверх; никаких `.99`, cost/margin, FX или VAT-преобразований нет.
35. (ЭТАП 7) Freshness использует `lastSeenAt`, boundary max age включительно; future timestamp = clock anomaly.
    Current operational error/blocked/paused исключает evidence из текущего анализа, но history не изменяет.
36. (ЭТАП 7) `out_of_stock` исключается всегда; при default `requireAvailability=true` также исключаются
    `preorder`/`unknown`. JSON-LD limited/online-only уже canonical `in_stock`, sold-out/discontinued —
    `out_of_stock`, backorder — `preorder`; неизвестное значение fail-closed.
37. (ЭТАП 7) Один Competitor имеет один вес: одинаковые цены нескольких trusted страниц collapse, разные цены
    исключают этого конкурента как conflicting. IQR — nearest-rank Q1/Q3, integer multiplier hundredths,
    Tukey fences; фильтр не включается ниже `minPointsForFiltering`/4 точек.
38. (ЭТАП 7) Percent clamps считаются BigInt: lower decrease bound округляется вверх, upper increase bound вниз,
    поэтому лимит никогда не превышается. Minimum difference проверяется exact integer ratio после clamp.
39. (ЭТАП 7) Action mode: ERP-linked → `erp_required`; local + !erpPriceMissing → `local_apply`; local +
    erpPriceMissing → `apply_blocked`. Engine ничего не применяет и одинаково считает market target для всех.
40. (ЭТАП 7) Snapshot содержит все raw evidence, operational/match state, effective price, semantic market role,
    exclusion reasons, included competitor groups и inclusive freshness boundary. Hash order-independent и не
    включает произвольный `now`; при переходе observation в stale меняются disposition/hash. `expiresAt` = min
    policy TTL и первого semantic freshness expiry (+1 ms для inclusive boundary).
41. (ЭТАП 8) Admin/API boundary — plain DTO, не Prisma records: money только branded integer cents, percent changes
    в integer basis points, date-time только canonical ISO с явной timezone. React ничего не пересчитывает и не
    использует `Date.now()` для freshness/stale decisions.
42. (ЭТАП 8) `/admin/pricing` обязан быть честно disconnected: неизвестные summary values = `null`/«—», products и
    sources пусты; production route не импортирует test fixtures и не показывает synthetic prices/competitors.
43. (ЭТАП 8) Права не расширены: route/read = `catalog.read`, будущие competitor/mapping writes = `catalog.update`,
    future local apply = `prices.update`. Shell имеет server permission boundary; disabled action previews не имеют
    mutation handler и не заменяют будущую server-side authorization.
44. (ЭТАП 8) В application/UI boundary нет cookies/headers/raw HTML/robots body/resolved IP/stack/secret query.
    External URL допускается только https hostname, без credentials/IP/internal hostname/query/hash; competitor
    text рендерится React как text. DB-backed routes остаются заблокированы до отдельного non-production DB stage.

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
Будущий DB-backed Apply дополнительно перепроверяет externalId/erpPriceMissing текущего Product (authority в
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

## Stage 5 — Deterministic matching

### Реальные Product fields (проверено по Prisma/code, без запроса к БД)

| Назначение | Поля | Политика v1 |
|---|---|---|
| Primary identity | `id` | Только candidate/result identity. |
| Barcode | `barcode String?` | Nullable, НЕ unique, без index. Только valid GTIN даёт exact evidence. |
| SKU | `sku String?` | Nullable, НЕ unique, без index. Exact требует brand context; дубли → ambiguous. |
| ERP identity | `externalId String? @unique` | Никогда не competitor identifier; matcher полностью игнорирует. |
| Название | `title`, `titleKey?`, `titleEn?`, `titleLv?` | v1 использует primary `title`; alternate titles пока не смешиваются. |
| Brand | `brand` | Exact-normalized only, без alias/fuzzy. |
| Size | `specVolume?`, также текст `title` | Используются вместе; противоречие источников → ambiguous. |
| Packaging | `packagingSize?`, `unitOfMeasure?` | Поля существуют, но их product-size семантика не доказана → matcher не синтезирует из них размер. |
| Context | `category`, `manufacturerName?`, `specType?` | Доступны, но не являются identity evidence в v1. `manufacturerName` — текст, не manufacturer id. |

Отдельных MPN/manufacturer-product-id полей у `Product` нет. `ParsedListing.manufacturerSku` сравнивается
только с `Product.sku`. Реальную уникальность/качество данных без production DB не утверждаем.

### Pure API и candidate generation

`matching-normalization.ts` не знает о Prisma. `matching-engine.ts` принимает `ParsedListing` и
`ProductMatchCandidate[]`, то есть уже ограниченный список. `candidateGenerationHints()` возвращает только
repository-friendly hints: valid GTIN, conservative exact SKU/brand, title tokens, size key. Будущий DB layer
может отдельно получать candidates по barcode/SKU и ограниченному search, но не должен fuzzy-сравнивать весь
каталог внутри domain matcher. Текущая схема не имеет indexes на barcode/SKU — это ограничение будущего слоя,
не повод считать их unique.

Структурированный `MatchResult`: `protected | likely | ambiguous | no_match`, допустимый proposedStatus,
candidate id (только когда один объяснимый candidate), method (`ean|sku|title`), fixed confidence, reason codes,
все candidate evaluations, positive evidence, conflicting evidence, normalized identity, excluded/reconsidered
rejections. Автоматический output никогда не содержит `confirmed`/`manual`.

### Normalization policies

- **GTIN:** NFKC/trim, удаляются только whitespace и `-`; leading zero сохраняется. Только digits длины
  8/12/13/14 + корректный check digit → `valid_gtin`. Остальное → `legacy_barcode` с reason и не участвует
  в exact GTIN. Internal barcode не объявляется EAN.
- **SKU:** NFKC, trim, case-fold, whitespace collapse. Punctuation не удаляется: `AB-123`, `AB123`, `AB.123`
  разные. Старые sync-specific leading-zero/dot/internal-space transforms намеренно НЕ переиспользованы.
- **Brand:** NFKC, case-fold, whitespace и punctuation tokenization. Диакритика не снимается, alias table нет:
  `L'Oréal` и `Loreal` несовместимы автоматически.
- **Title:** NFKC, case-fold, punctuation tokenization, order-independent exact token key + deterministic Dice
  для ranking. Распознанный size вырезается только из title identity tokens и сравнивается отдельным слоем;
  shade/model numbers сохраняются. Простая явная taxonomy ловит shampoo/conditioner, refill, set/kit и gender
  conflicts. Fuzzy title никогда сам не даёт likely/trusted match.
- **Size:** поддержаны ml/l, g/kg, pcs/gab/шт.; decimal разбирается в integer milli-base units через BigInt,
  без float. `0.25 l = 250 ml`, `0.5 kg = 500 g`. Multipack хранит `{count,item}`:
  `2×250 ml ≠ single 500 ml`; несколько размеров или size+count без ясной pack structure → ambiguous.

### Evidence hierarchy и conflicts

1. Unique valid GTIN exact → `likely/ean`, 0.980, но только если нет hard conflicts.
2. Exact SKU + exact-normalized brand → `likely/sku`, 0.900; exact SKU без brand → ambiguous 0.600.
3. Exact brand + order-independent exact title + exact size → `likely/title`, 0.780.
4. Brand+title, title+size, title-only или fuzzy title → только ambiguous/manual ranking (0.650/0.550/0.400/0.350).
5. Нет positive evidence → no_match.

Один exact identifier у нескольких Product не разрешается ranking-ом: duplicate GTIN/SKU → ambiguous 0.500,
candidate не выбирается. Hard conflicts: brand, size/pack, ambiguous size, product kind, shade/model number,
refill, set/kit, gender. Даже GTIN exact + size conflict → ambiguous 0.500 с обоими evidence в результате.
Confidence — стабильный label правил для Decimal(4,3), не статистическая вероятность.

### Existing/rejected behavior

- Existing `confirmed`/`manual` → `protected`; matcher не оценивает replacement candidates.
- Rejected candidate с тем же pair `evidenceKey` (competitor + конкретный Product identity) исключается.
- Legacy rejected без fingerprint исключается до явной очистки админом.
- Rejected candidate может снова оцениваться только при изменении evidence любой стороны; это явно возвращается в
  `reconsideredRejectedProductIds`.

### Stage 4 price-format audit

Обнаружено и исправлено опасное guessing: старая ветка трактовала одиночные `1,234`/`1.234` как 1234.00.
Теперь обе формы `invalid_price`. Доказано helper + full adapter tests:
`12.34`/`12,34` → 12.34; `1,234.56`/`1.234,56`/`1 NBSP 234,56 €` → 1234.56;
ambiguous single separator, malformed grouping, unknown currency text, NaN/Infinity → failure. Parser не был
расширен для guessing максимума локалей.

### Tests и known limitations

55 новых matching tests: GTIN 8/12/13/14/check digit/leading zero/duplicate/conflict; SKU/brand conservative
rules; exact/fuzzy title ranking; size/mass/count/multipack; kind/model/refill/set/gender conflicts; duplicate,
rejected/new-evidence и protected trusted match. Ещё 9 новых Stage 4 price-audit regressions, всего +64.

Known limitations: нет brand alias table; multilingual title aliases ограничены явными conflict markers;
поддержаны только ml/l/g/kg/pcs; oz и неоднозначные наборы не угадываются; `packagingSize/unitOfMeasure` не
используются; alternate Product titles не объединяются; matcher не выполняет DB candidate lookup и не знает
фактическое распределение дублей. Это сознательные fail-closed границы до persistence/UI и проверки бизнеса.

## Stage 6 — Observation ingestion

### Boundary

- Pure/domain остаётся в `observation.ts`: `normalizeObservation` превращает однозначные decimal strings в
  integer cents либо типизированный failure; `observationStateHash` канонизирует regular/sale/currency/
  availability; `observationWriteAction` сравнивает только с ПОСЛЕДНИМ state hash.
- `observation-ingestion.ts` — pure orchestration без Prisma/DB/env/network. Получает identity `Competitor` +
  `CompetitorProduct`, server-controlled event context, adapter/fetch outcome и repository port. Возвращает
  `success append|touch`, `parse_failure`, `fetch_failure`, `blocked`, `rate_limited` либо idempotent `no_op` с
  delta будущих run counters (`productsChecked`, observations created/unchanged, parse/fetch failures).
- `observation-repository.ts` — узкий use-case contract. Money пересекает boundary только как integer cents;
  будущий Prisma adapter сам конвертирует cents ↔ Decimal. Production implementation на ЭТАПЕ 6 отсутствует.
- Test-only fake находится внутри `observation-ingestion.test.ts`: отдельные истории, transactional copy/commit,
  rollback при throw и очередь, сериализующая concurrent calls одного competitor product.

### Append/touch, timestamps и identity

State hash включает canonical regular cents, sale cents, EUR и availability. Effective price отдельно не
хранится: это будущая проекция правил из regular/sale. Изменение любого поля hash создаёт APPEND; равенство
последней строки создаёт TOUCH. Поиск старой строки с тем же hash запрещён, поэтому €10→€12→€10 = три строки.
InStock→OutOfStock→InStock при неизменной цене также = три строки.

- APPEND: `observedAt = lastSeenAt = checkedAt`, `seenCount=1`, `firstRunId=lastRunId=runId`.
- TOUCH: `observedAt`/`firstRunId` неизменны; `lastSeenAt=checkedAt`, `seenCount += 1`, обновляется `lastRunId`.
- `CompetitorProduct.lastCheckAt` = последняя обработанная попытка (успех или failure).
- `CompetitorProduct.lastObservedAt` и `lastAvailability` меняются только после валидного observation;
  failure сохраняет последнюю известную цену/availability и не двигает observation.lastSeenAt.
- Деньги не копируются в `CompetitorProduct`: current price однозначно читается из latest observation.
- Observation всегда содержит оба ключа: `competitorProductId` и его `competitorId`; Hairshop `Product`/match
  не входят в ingestion identity.

### Idempotency, failures и transaction requirement

Для одного `CompetitorProduct` `checkedAt` должен строго расти между реальными polling attempts. Повтор с тем
же временем считается replay и не пишет ничего/не увеличивает counters; событие старше `lastCheckAt` считается
stale. Две конкурентные обработки одного event сериализуются: одна коммитит, вторая видит replay. Два отдельных
последовательных tick с тем же состоянием имеют разные `checkedAt`, поэтому второй корректно TOUCH-ит строку.
Retry после transient failure — новая фактическая попытка с новым server time; успех создаёт/touch-ит observation,
сбрасывает error и `consecutiveFailures`.

Adapter failures (включая invalid/zero/non-EUR price, missing currency, no/ambiguous Product/Offers и JSON-LD
limits), transient fetch, BLOCKED и 429 не создают и не touch-ят observation. Они возвращаются структурированно,
обновляют только operational status/error/`consecutiveFailures`; raw HTML/error text не сохраняются. Для
future adapters в `ParseFailureCode` добавлены fail-closed коды `ambiguous_product`/`ambiguous_offers`.

Будущий PostgreSQL adapter обязан выполнить snapshot/latest read, решение и conditional append/touch вместе с
operational update в одной транзакции для product row. `touchLatestObservation` обязан проверить latest id +
stateHash; race/conflict должен привести к transaction retry/error, а не к дублирующему append. Distributed lock
здесь не моделируется; scheduler lease остаётся ЭТАПОМ 9.

### Schema audit и known limitations

`CompetitorPriceObservation.observedAt/lastSeenAt/seenCount/firstRunId/lastRunId`, index
`(competitorProductId, observedAt)` и operational поля `CompetitorProduct` полностью покрывают контракт.
Schema и pending migration НЕ менялись. `updatedAt` для исторической семантики не используется.

Ограничение: monotonic event identity основана на millisecond `checkedAt`; будущий caller обязан выдавать
уникальное строго возрастающее время отдельным attempts одного product. Prisma adapter и DB race tests намеренно
отложены до явного разрешения non-production DB и применения pending migration; текущий fake доказывает service
semantics, но не PostgreSQL isolation/locking.

## Stage 7 — Market analysis and recommendations

### Pure input/output contract

`recommendPrice()` не получает данные и не импортирует DB repository/Prisma runtime. Чистые integer-money primitives
вынесены в `integer-money.ts`; Prisma Decimal conversions и ERP persistence comparison остаются за отдельными
adapter-модулями. Caller передаёт:

- Product identity/revision, current `Product.price` в integer cents, `externalId`, `erpPriceMissing`;
- server-controlled `now`;
- prepared evidence: observation/product/competitor ids, regular/sale cents, EUR currency, availability,
  observed/last-seen timestamps, match status/method/confidence и current competitor/product/check states;
- единственный Stage 2 `PricingRules` object.

Output — discriminated `recommendation | no_recommendation`: market stats, sorted included competitors, sorted
excluded evidence с stable reason codes, outlier details, target/action mode, snapshot/hash. Recommendation также
содержит raw target, final cents, signed difference cents/bps, applied safeguards, confidence и expiry. Engine не
пишет `PricingRecommendation`/`Product`, не вызывает match/apply/ERP handlers.

### Evidence policies

- Pricing trust: только `confirmed` и `manual`. `likely`/`ambiguous`/`rejected` → `untrusted_mapping`.
- Freshness: `lastSeenAt >= now - maxObservationAgeHours`; exact boundary usable. Future time →
  `clock_anomaly`; malformed/observed-after-last-seen → `invalid_timestamp`.
- Operational fail-closed: competitor/product должны быть active, latest check — `ok`; paused/gone, blocked и
  parse/fetch/not-found state видны отдельными exclusion reasons. Last known observation не удаляется.
- Currency: только EUR, без FX. Invalid/non-positive/out-of-Decimal-range price исключается; effective = sale,
  только когда `includeSalePrices=true` и sale есть, иначе regular.
- Availability: `out_of_stock` всегда excluded; default `requireAvailability=true` принимает только `in_stock`.
  При false также допускаются canonical `preorder`/`unknown`. Stage 4 adapter заранее сводит schema.org
  LimitedAvailability→in_stock, SoldOut/Discontinued→out_of_stock, BackOrder→preorder.
- Один competitor = один market point. Несколько usable страниц с одной ценой collapse; разные цены исключают
  весь competitor как `conflicting_competitor_evidence`.

### Statistics, outliers and target

`market-statistics.ts` считает count/min/max/median/average/spread и signed current-vs-min/median в cents.
Average и even median используют BigInt division, exact half-cent округляется вверх. Input order не влияет.

IQR включается только при `N >= max(4, minPointsForFiltering)`. Q1/Q3 — deterministic nearest-rank;
fences = Q1/Q3 ± multiplier×IQR, multiplier заранее переводится в integer hundredths. Extreme low и high
обрабатываются одинаково и попадают в explanation; при малом N фильтрации нет.

Target v1 только `match_median` (не «всегда самый дешёвый»). Median уже whole cents; дополнительного
маркетингового rounding нет. Confidence = high при ≥3 included competitors, каждый подтверждён не старше
половины freshness window; иначе medium.

### Safeguards and no-recommendation

Max decrease/increase применяются к current price в basis points через BigInt. Lower bound округляется ceiling,
upper — floor: half-cent никогда не позволяет превысить процентный cap. `minimumDifferencePercent` сравнивается
как exact integer ratio после target rounding/clamp; equality считается meaningful. Нулевой final delta даёт
`no_change`.

Primary no-recommendation codes: `invalid_own_price`, `invalid_policy`, `no_trusted_mappings`,
`unsupported_currency_or_data`, `no_fresh_observations`, `no_available_competitors`,
`conflicting_competitor_evidence`, `all_observations_excluded`, `insufficient_competitors`, `no_change`,
`difference_below_threshold`. Detailed per-evidence reasons не теряются даже при другом primary reason.

Никаких cost/margin/profitability checks: доказанного cost source нет, price3 — partner tier. Product.price
сравнивается с публичным EUR market как есть; VAT semantics по-прежнему open business question.

### Snapshot/staleness and schema audit

Расширенный `RecommendationInputSnapshot` хранит canonical money strings, raw evidence + operational/match
state, computed effective prices, roles `included|collapsed_duplicate|excluded`, reasons, final competitor groups
и `freshnessValidThrough`. Arrays canonical-sort перед SHA-256. Перестановка input не меняет output/hash;
произвольное движение `now` внутри той же freshness classification не меняет hash, но переход через boundary
меняет included/excluded role и hash. Future apply additionally compares current time with recommendation expiry.

Существующий `PricingRecommendation` уже имеет все обязательные persisted columns (market min/median/max/count,
current/recommended/difference/percent, confidence/reason/snapshot/hash/version/revision/expiry). Average/spread,
full evidence и safeguards помещаются в JSON snapshot/reason params, поэтому Prisma schema/pending migration не
менялись.

### Known limitations

- v1 target только median; match-lowest/below-lowest и `.99` rounding не добавлены без business decision.
- Operational policy намеренно strict: даже fresh last-known price временно не участвует после current fetch/
  parse error; UI всё равно сможет показать её как excluded evidence.
- `requireAvailability` — один conservative boolean, а не отдельная матрица по availability status.
- Confidence — fixed explainable rule, не вероятность/ML. Нет category/brand-specific policies.
- Engine не persist-ит recommendations; DB-backed repository/race/stale-apply tests всё ещё требуют разрешённую
  non-production DB после применения pending migration.

## Stage 8 — Application contracts and admin shell

### Boundary and DTOs

`application-contracts.ts` фиксирует однонаправленную границу будущего runtime:

```
PostgreSQL/Prisma repository (ещё нет) → application query service → plain admin/API DTO → React presentation
```

UI не получает Prisma records/Decimal, parser internals или repository entities. Определены DTO для dashboard
summary/product rows/source health, product detail, recommendation evidence/safeguards, competitor configuration,
mapping explanation, price history, rules и monitor runs. `PricingAdminQueryService` — только application-facing
port; production implementation/fake storage/API route намеренно отсутствуют. Decision request contract заранее
содержит expected current cents, product revision и input hash, но handler не реализован.

Money на boundary — JSON-safe integer cents (`CentsDto`); положительные prices и signed deltas валидируются против
Decimal(12,2) range. Percent changes — integer basis points. Formatting отдельно, без деления money на float:
`€0.01`, `€12.30`, grouping и signed delta строятся из целых major/minor частей. Pricing rules сериализуют percent
и IQR multiplier в integer hundredths/basis points.

Date-time — canonical UTC ISO string с явной timezone (`IsoDateTimeDto`). Ambiguous local date strings отклоняются.
UI formatting явно использует `Europe/Riga`, но freshness/stale уже приходит DTO state и в React не вычисляется.

External URL DTO принимает только https hostname без credentials, IP-literal/internal hostname, query и hash;
длина ограничена. DTO по дизайну не содержат cookies, auth/raw headers, fetched HTML/robots body, resolved IP,
stack trace или DB internals. Reason/conflict/status остаются typed codes, а не преждевременным свободным текстом.

### Presentation and permissions

`admin-presentation.ts` централизованно отображает все Stage 7 no-recommendation/exclusion codes, recommendation/
mapping/action/freshness states и все source health states (`ok|stale|transient_error|rate_limited|blocked|disabled`)
в ru/en/lv label + description. Domain не импортирует UI strings. Badges сопровождаются текстом; цвет не является
единственным носителем смысла.

Permission contract сохранён без новых прав: read route/data = `catalog.read`; будущие competitor/mapping mutations
= `catalog.update`; будущий local Apply = `prices.update`. `/admin/pricing` добавлен в path permission map и Catalog
navigation, а отдельный server layout использует существующий `AdminServerPermission('catalog.read')`. На этапе нет
mutation routes/actions, поэтому CSRF/audit/apply calls не создавались.

### Route and components

Создан только `/admin/pricing`. Route передаёт `createDisconnectedPricingDashboard()` и никогда не импортирует
synthetic fixtures. Администратор видит status notice без developer details, восемь summary fields как «—», section
cards, честные product/source empty states. Не созданы пустые product/competitor/mapping child pages.

`PricingDashboardShell`/`ProductPricingTable`/`CompetitorHealthTable` используют существующие Card/Badge/Button и
admin table conventions: semantic caption/thead/th scope, horizontal scroll на узком viewport, текстовые statuses.
Presentational product table принимает DTO rows; synthetic data существует только в server-render unit tests.
Для recommendation раздельно показываются current/market median+min/recommended/delta cents+bps/reason. Future
`Apply`/`Send to ERP`/blocked labels тестируются, но кнопки всегда disabled, без handler.

### Known limitations / hard stop

- Summary/table/source data в production shell пусты до реального application service; это намеренное truthful state.
- Product detail/competitors/mappings/runs/settings routes, filters/loading/error from pricing API и real actions ещё
  не создавались: без repository они были бы пустым или fake production behavior.
- Component tests используют `react-dom/server`, потому что unit config = Node и проекта нет jsdom/component-test
  dependency. Проверены semantic markup/empty/row/action labels/reason/health/XSS escaping; browser interaction не
  симулируется.
- Existing admin strict-i18n baseline имеет один unrelated hardcoded Cyrillic string в
  `app/[lang]/admin/notifications/send/page.tsx:434`; обычная dictionary check проходит, pricing files новых findings
  не добавили. Файл уведомлений не менялся.
- **DB-backed routes remain blocked until a non-production DB is explicitly configured and pending migration is safely applied there.**

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
- `lib/competitor-pricing/recommendation-snapshot.ts` — snapshot type, canonical inputHash
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
ЭТАП 5:
- `lib/competitor-pricing/matching-normalization.ts` + `.test.ts` — GTIN/check digit/legacy classification,
  conservative SKU/brand/title normalization, integer size/count/multipack parsing, 24 tests.
- `lib/competitor-pricing/matching-engine.ts` + `.test.ts` — candidate hints, evidence/conflicts, fixed confidence,
  duplicate/rejected/existing-match policies, 31 tests.
- `lib/competitor-pricing/adapters/jsonld-product.ts` + `.test.ts` — ambiguous single-separator prices теперь
  fail closed; 9 дополнительных price-format regressions (adapter suite теперь 52).
ЭТАП 6:
- `lib/competitor-pricing/observation-repository.ts` — persistence shapes в integer cents, atomic transaction port,
  append/conditional-touch/operational-state commands; без Prisma implementation.
- `lib/competitor-pricing/observation-ingestion.ts` — orchestration, typed outcomes/counter deltas,
  monotonic-event idempotency, append/touch и failure state transitions.
- `lib/competitor-pricing/observation-ingestion.test.ts` — test-only transactional in-memory fake и 35 тестов.
- `lib/competitor-pricing/adapters/types.ts` — parse failure codes `ambiguous_product`/`ambiguous_offers`.
ЭТАП 7:
- `lib/competitor-pricing/market-statistics.ts` + `.test.ts` — BigInt average/median, min/max/spread/deviations,
  nearest-rank IQR/Tukey filtering; 12 тестов.
- `lib/competitor-pricing/recommendation-engine.ts` + `.test.ts` — pure evidence classification, one-price-per-
  competitor, median target, safeguards/action modes/no-recommendation/snapshot expiry; 50 тестов.
- `lib/competitor-pricing/settings.ts` + `.test.ts` — likely pricing forbidden (`literal(false)`), deterministic
  2-decimal IQR multiplier; +2 tests.
- `lib/competitor-pricing/match.ts` + `.test.ts` — pricing helper now trusted-only regardless of automatic score.
- `lib/competitor-pricing/money.ts` + `.test.ts` — `isPositiveCents` also enforces Decimal(12,2) upper bound.
- `lib/competitor-pricing/integer-money.ts` — pure integer/BigInt money primitives without generated Prisma runtime;
  `money.ts` re-exports them and retains only Decimal persistence conversions.
- `lib/competitor-pricing/recommendation-snapshot.ts`, `recommendation-state.test.ts` — semantic analysis snapshot,
  nested array canonicalization и stronger order-independence coverage.
- `lib/competitor-pricing/recommendation-persistence-money.ts` — isolated Prisma Decimal snapshot/ERP-fulfilment
  helpers, deliberately outside the pure recommendation dependency graph.
ЭТАП 8:
- `lib/competitor-pricing/application-contracts.ts` + `.test.ts` — Prisma-free DTO/query/decision contracts,
  integer cents, canonical ISO, safe display URL, domain recommendation conversion and disconnected dashboard.
- `lib/competitor-pricing/admin-presentation.ts` + `.test.ts` — centralized ru/en/lv reason/status/health mapping,
  integer-safe EUR/basis-point formatting.
- `components/admin/pricing/PricingDashboardShell.tsx` + `lib/competitor-pricing/admin-components.test.ts` —
  summary/product/source shell, semantic responsive tables, honest empty states, disabled action previews.
- `app/[lang]/admin/pricing/{layout.tsx,page.tsx}` — server `catalog.read` boundary and disconnected production route.
- `lib/admin-permissions.ts` + `.test.ts`, `components/admin/{AdminHeaderNav,AdminPageNavigation}.tsx` — pricing path,
  Catalog navigation and parent navigation labels.

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

ЭТАП 5 (2026-10-03):
- Matching + Stage 4 price audit targeted → 3 файла, 107 passed (24 normalization + 31 matcher + 52 adapter).
- `npx vitest run --config vitest.config.ts lib/competitor-pricing` → 11 файлов, 328 passed, 4 skipped
  (те же openssl-dependent TLS tests; matching/adapter tests без skip).
- `npm run test:unit` → 293 файла, 2335 passed, 4 skipped. Прогон включал существующие чужие изменения
  `lib/product-form-mapping*` и другие текущие unit-файлы репозитория.
- `npx tsc --noEmit` → 0; ESLint всех изменённых TS-файлов → 0; `git diff --check` → чисто.
- `npm run audit:security` → passed, 1768 files; `npm run check:encoding` → passed, 1201 source files.
- Prisma schema/migration не менялись; production DB, integration/e2e/build и внешняя сеть не использовались.

ЭТАП 6 (2026-10-03):
- Ingestion + observation domain targeted → 2 файла, 51 passed (35 ingestion + 16 observation).
- Matching + adapter regressions → 3 файла, 107 passed.
- `lib/competitor-pricing` → 12 файлов, 363 passed, 4 skipped (те же openssl-dependent TLS tests;
  ingestion/matching/adapter tests без skip).
- `npm run test:unit` → 294 файла, 2370 passed, 4 skipped. Прогон включал существующие чужие изменения
  `lib/product-form-mapping*` и другие текущие unit-файлы репозитория.
- `npx tsc --noEmit` → 0; ESLint изменённых TS-файлов → 0; `git diff --check` → чисто.
- `npm run audit:security` → passed, 1771 project files; `npm run check:encoding` → passed, 1204 source files.
- Prisma schema/pending migration не менялись; production DB, integration/e2e/build, scheduler и внешняя сеть
  не использовались. `prisma validate/generate` не требовались и не запускались.

ЭТАП 7 (2026-10-03):
- New analysis/recommendation targeted → 2 файла, 62 passed (12 statistics + 50 engine).
- Settings/match/money/snapshot regression вместе с новыми → 6 файлов, 112 passed.
- Observation ingestion → 35 passed; matching → 55 passed; JSON-LD adapter → 52 passed.
- `lib/competitor-pricing` → 14 файлов, 427 passed, 4 skipped (те же openssl-dependent TLS tests;
  analysis/ingestion/matching/adapter tests без skip).
- `npm run test:unit` → 296 файлов, 2434 passed, 4 skipped. Прогон включал существующие чужие изменения
  `lib/product-form-mapping*` и другие текущие unit-файлы репозитория.
- Новых тестов ЭТАПА 7: 64 (62 новых engine/statistics + 2 settings validation cases).
- `npx tsc --noEmit` → 0; ESLint всех изменённых TS-файлов → 0; `git diff --check` → чисто.
- `npm run audit:security` → passed, 1777 project files; `npm run check:encoding` → passed, 1210 source files.
- Prisma schema/pending migration не менялись; production DB, Prisma runtime, integration/e2e/build, scheduler,
  external network и Product.price не использовались/не изменялись. `prisma validate/generate` не требовались.

ЭТАП 8 (2026-10-03):
- Новые contracts/presentation/server-render components + permission/navigation regressions → 5 файлов, 40 passed
  (13 contracts, 10 presentation, 8 component cases, 5 permission, 4 nav; в existing permission test добавлена
  pricing-path assertion). Новых test cases в трёх pricing test files: 31.
- Targeted Stage 8 + recommendation/ingestion/matching/adapter → 10 файлов, 232 passed: recommendation 50,
  ingestion 35, matching 24+31, JSON-LD adapter 52; без skip.
- `lib/competitor-pricing` → 17 файлов, 458 passed, 4 skipped (те же openssl-dependent TLS tests; Stage 8/domain/
  ingestion/matching/adapter tests без skip).
- `npm run test:unit` → 299 файлов, 2465 passed, 4 skipped. Прогон включал существующие чужие изменения
  `lib/product-form-mapping*` и другие текущие unit-файлы репозитория.
- `npx tsc --noEmit` → 0; ESLint изменённых TS/TSX-файлов → 0; `git diff --check` → чисто.
- `npm run check:admin-i18n` → dictionary check passed (423 keys, 70 used), один уже существующий audit finding.
  Strict mode ожидаемо non-zero только из-за committed baseline `notifications/send/page.tsx:434`; pricing files clean.
- `npm run audit:security` → passed, 1785 project files; `npm run check:encoding` → passed, 1218 source files.
- Prisma schema/pending migration не менялись; production DB, competitor Prisma runtime/repository, integration/e2e/
  build, scheduler, external network, `applyProductChanges`, ERP actions и Product.price не использовались/не менялись.

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

ЭТАП 5 (identity-integrity, протестировано): invalid/legacy barcode не становится GTIN; дубли не разрешаются
выбором первого; SKU punctuation и GTIN leading zero сохраняются; fuzzy title/brand не создаёт trusted match;
hard conflicts не скрываются сильным identifier; rejected/trusted decisions защищены. Matcher pure, не импортирует
Prisma, не читает env/DB/сеть и не пишет цены. Ambiguous JSON-LD price separators теперь fail closed.

ЭТАП 6 (persistence-boundary, протестировано): typed failures не создают и не подтверждают price rows; replay и
stale events fail closed без counters; competitor ownership проверяется; histories изолированы; money остаётся
integer cents; atomic contract требует conditional latest touch и сериализацию per product. Service/fake не
импортируют Prisma Client, не читают env/DB/сеть, не меняют Product.price/matches/recommendations.

ЭТАП 7 (recommendation-integrity, протестировано): только human-trusted mappings; stale/future/blocked/error/
unavailable/unsupported evidence fail closed с reason codes; один competitor имеет один вес; outliers объяснимы;
money/statistics/clamps integer/BigInt; input permutations canonical; snapshot hash отражает semantic composition
и freshness transition. Engine/snapshot hash dependency graph не загружает generated Prisma runtime; Decimal/ERP
persistence helpers изолированы отдельно. Engine не читает env/DB/network и не пишет
Product/recommendation/match/ERP state.

ЭТАП 8 (application/UI boundary, протестировано): plain DTO не импортируют Prisma/Decimal; money/date валидируются
до UI, recommendation conversion deterministic. Safe external URLs не переносят credentials/query/hash и не
принимают HTTP/IP/internal hostnames. Raw fetch data/network details/secrets/stacks отсутствуют в contracts.
React экранирует недоверенные titles, `dangerouslySetInnerHTML` отсутствует; production shell не содержит synthetic
data или mutation handlers. Read route защищён server-side существующим `catalog.read`; будущие write permissions
зафиксированы, но actions/API не реализованы.

Проверено: существующие authz/CSRF/audit/rate-limit/SSRF-утилиты (см. таблицу). Threat model модуля
(SSRF, redirect SSRF, DNS rebinding, XSS, malicious HTML, oversized/decompression bomb, CSRF, SQLi —
только Prisma/параметризованный SQL, scheduler abuse, log injection) — заложена в архитектуру,
проверка на коде — ЭТАП 11.

## Git

- Branch: `main`. HEAD на старте задачи: `67589105`.
- Коммиты задачи: `627c0b5d` (ЭТАП 1, docs), `fec60300` (ЭТАП 2), коммит ЭТАПА 3
  `b7afb2eb` (`feat(pricing): safe competitor fetch infrastructure`), коммит ЭТАПА 4
  `2b181078` (`feat(pricing): parse JSON-LD competitor products`), коммит ЭТАПА 5 `8f3f01a1`
  (`feat(pricing): add deterministic competitor matching`), коммит ЭТАПА 6
  `94083013` (`feat(pricing): add observation ingestion service`), коммит ЭТАПА 7
  `424ba7d4` (`feat(pricing): add deterministic price recommendations`), коммит ЭТАПА 8
  `feat(pricing): add admin pricing application shell` (хэш — `git log --oneline -9`).
- Чужие незакоммиченные изменения в дереве (НЕ трогать, не коммитить): `components/admin/products/AddProductForm.tsx`,
  `docs/deployment-checklist.md`, `lib/product-form-mapping*.ts`, корневые `*.json/*.md/*.csv` отчёты синка.
- Push не выполнялся (запрещён без отдельного разрешения).

## Next exact step

ЭТАП 9 — первый PostgreSQL integration stage, НЕ начинать автоматически. Сначала пользователь должен отдельно
решить/явно разрешить конфигурацию изолированной non-production DB и безопасное применение pending migration туда.
После этого: проверить migration/constraints/rollback на non-prod; реализовать Prisma repository adapters для
observation/recommendation/read models; доказать transaction/locking/idempotency/stale semantics integration-тестами;
затем подключить application query service, read-only admin API и реальные dashboard/product detail DTO. Только
после read path отдельно реализовывать review mutations с `catalog.update|prices.update`, CSRF/audit/rate-limit,
expected current price + revision + input hash и `applyProductChanges` только для допустимой local price.

**Hard stop:** `.env.local` указывает на production, pending migration не применена. До отдельного решения по
non-production DB нельзя создавать pricing Prisma runtime path, DB-backed routes, integration tests, scheduler или
реальные Apply/ERP actions. Production DB и `prisma/migrations/` не трогать.
