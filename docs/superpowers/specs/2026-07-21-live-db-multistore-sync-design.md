# ERP-синк с живой multi-store БД (hairshop_p34s) — дизайн

**Дата:** 2026-07-21
**Статус:** SUPERSEDED 2026-07-22 — см. `2026-07-22-live-db-sync-design-correction.md`. Топология здесь предполагала bidirectional REST (read-pull + синхронный write-back), реальный источник — one-way ежечасный XML-экспорт, write-back невозможен в принципе. Override-layer раздел («Модель данных») остаётся в силе без изменений — читать его отсюда, остальное (Read-path/Write-back/Rollout) считать замененным.
**Контекст:** [[project_live_db_multistore_audit_2026_07_21]] — полный аудит показал, что `lib/sync/adapters/rest-paginated.ts` (`fetchPage`) — throw-заглушка, ни разу не выполнялась против реальных данных, а весь дизайн Phase 1 ([[project_erp_sync]], `docs/superpowers/specs/2026-06-09-erp-product-sync-design.md`) сделан под допущение «один источник, один писатель, ERP always wins, голый last-write-wins upsert». Реальная топология другая: hairshop_p34s (SQL Server, nopCommerce, **native multi-store**) уже принимает синк-данные от 2 других живых магазинов в реальном времени. Этот документ проектирует интеграцию заново под эту топологию.

Найденная структурная коллизия, из-за которой прямое включение старого дизайна уничтожило бы данные: `lib/product-overrides-store.ts` (`upsertProductOverride`) пишет админ-правки цены/описания прямо в колонки `Product.price`/`Product.description` — те же колонки, которые `upsert-products.ts` перезаписывал бы через `ON CONFLICT DO UPDATE SET price=EXCLUDED.price, description=EXCLUDED.description`. Одна колонка на два источника правды.

## Scope

Спроектировать: топологию чтения/записи между hairshop-pro.lv и hairshop_p34s, механизм разделения «локальная правка админа» vs «значение из общей базы» без breaking-изменений живой Neon-схемы, контракт write-back при заказе, безопасный поэтапный rollout.

Вне scope этого документа (см. «Открытые внешние зависимости» и «Явно не делаем сейчас» ниже): точный REST-контракт живой БД, сетевой allowlist, central cost-basis price, backup/restore живой БД, работа других 2 магазинов.

## Топология

hairshop-pro.lv остаётся один магазин (не multi-tenant внутри себя — nopCommerce-мультистор существует на стороне живой БД, не у нас, заводить свой `storeId` по всей схеме hairshop-pro.lv не нужно, это over-engineering под несуществующую задачу).

Интеграция — **асимметрично bidirectional**, с двумя независимыми по риску и по rollout-гейту направлениями:

- **Read-pull** (раз в час, синхронно с интервалом синка самой живой БД) — читает stock и атрибуты товара. Низкий риск, тривиально обратим (флаг/cron off → Neon держит last-known-good кеш).
- **Write-back** (синхронно при оформлении заказа) — списывает остаток в живой БД. Высокий риск (деньги, чужой склад, конкурентная запись 3 магазинов), необратим постфактум.

Единая точка входа с обеих сторон — **один REST API** поверх живой БД (адаптер изначально так и назван — `rest-paginated.ts`), не прямой SQL Server-коннект. Это же снимает вопрос сетевых лимитов/allowlist для serverless Vercel: вызовы идут по HTTPS к API, а не голым TCP-коннектом к SQL Server — управление конкурентным доступом к самой БД (в т.ч. от 2 других магазинов) живёт на стороне API, не на нашей.

## Модель данных: override-layer поверх base-полей

**Никаких миграций Neon.** Используем то, что уже есть в схеме — включая мёртвый, но готовый к этому код.

В `lib/product-overrides-store.ts` уже существует ровно нужный примитив, сейчас никуда не подключённый:

```ts
export type ProductOverride = Partial<Omit<Product, 'id'>>
export const getProductOverrides = async (): Promise<Record<string, ProductOverride>> => {
  return {}
}
```

и таблица `KeyValueSetting { key String @id, value Json, updatedAt DateTime }` уже используется для похожей задачи (`getDeletedProductsArchive`/`writeDeletedProductsArchive`). Это тот же паттерн, просто не реализованный до конца — отсюда же и текущий баг: `resetProductOverride` сегодня ничего не сбрасывает (нет отдельного хранилища, из которого можно откатиться), просто возвращает текущий список товаров.

**Механизм:**

1. `Product.<field>` — «base»-значение. Синк свободно перезаписывает его на каждом прогоне для всех полей из ERP-payload (title, brand, category, sku, images, stock, oldPrice, price, description, isActive) — никакого whitelist/заморозки. Адаптер перед записью применяет уже известные трансформации ([[project_erp_sync_overwrite_risk]]): ×1.21 VAT на price, HTML-entity-decode на description, tag→bucket словарь из `scripts/recategorize-products.ts` на category (не старый `mapCategory()`).
2. Правка в админке (`upsertProductOverride`) пишет **не** в `Product.<field>` напрямую, а в единую запись `KeyValueSetting` (ключ `product-overrides`, одна строка на весь каталог — тот же паттерн, что уже используется для `deleted-products-archive`) — JSON вида `Record<productId, ProductOverride>`, где обновляются только поля конкретного товара при каждой правке. Это ровно то, что уже обещает существующая сигнатура `getProductOverrides(): Promise<Record<string, ProductOverride>>` — сейчас она возвращает `{}` вместо реального чтения этой записи.
3. Единая точка чтения (`mapDbToProduct` / `getDbProducts` / `getDbProductsPaginated` / `getAdminProducts`) мёржит: `{ ...baseFromProduct, ...override[productId] }` — override, если поле в нём присутствует, побеждает; если поля там нет — показывается свежее base-значение из последнего синка.
4. «Reset override» перестаёт быть no-op: удаляет конкретное поле (или всю запись товара) из карты в `KeyValueSetting` → следующий рендер показывает текущее base-значение.
5. Для `isCustom`-товаров (`externalId IS NULL`, никогда не участвуют в синке) override-слой не нужен — их `Product`-строка одновременно и база, и то, что видит клиент, как сегодня.

Это отменяет более раннюю идею «default = локальное побеждает для нерешённых полей» — она была нужна только как защита от blanket-overwrite при отсутствии override-слоя. С override-слоем каждое поле для каждого товара независимо: тронул админ — заморожено до explicit reset; не тронул — всегда свежее из центра. Не нужно вручную решать судьбу title/brand/sku/images/oldPrice/isActive по отдельности — правило одно и то же для всех полей.

**Stock — исключение из override-слоя, не просто «на практике не используется».** В отличие от price/description, для stock нет требования «своё, отличное от общего» — весь смысл интеграции в том, что источник правды по остатку живёт в общей БД. Если бы stock проходил через override как любое другое поле, admin-правка на synced-товаре навсегда заморозила бы отображаемый остаток и разошлась бы с реальным складом — противоположность цели. Поэтому: `upsertProductOverride` для товаров с `externalId != null` не принимает `stock` в патч (валидируется на бэкенде, не только скрывается в UI) — на synced-товарах остаток всегда base-значение из последнего часового синка. Для `isCustom`-товаров (`externalId IS NULL`) ограничение не действует — там stock как обычное поле в `Product`, как сегодня.

## Read-path (pull sync)

- `RestPaginatedAdapter.fetchPage()` — реализовать против REST API (контракт — открытый вопрос, см. ниже): курсорная пагинация, маппинг ответа в `ErpProduct`, с применением VAT/decode/category-трансформаций перед возвратом.
- `SyncRunner`/`SyncRun`-lifecycle (Phase 1, уже реализован) не меняется по форме — `INIT → FETCH+UPSERT LOOP → DEACTIVATE MISSING → FINALIZE`. Меняется только `buildUpsertQuery` в `upsert-products.ts`: `SET` продолжает покрывать все поля (не whitelist, см. выше), но перестаёт трогать любые `KeyValueSetting`-overrides — они на другом уровне.
- Concurrent-run guard (`SyncRun.status==='running'`, stale >30 мин) продолжает защищать только от пересечения собственных прогонов hairshop-pro.lv. Он не видит и не может видеть синк-активность 2 других магазинов — это не проблема, т.к. наш путь чтения read-only относительно живой БД и идемпотентен.
- Периодичность — **раз в час** (не 6ч из исходного спека), синхронно с тем, как обновляется сама живая БД.
- Deactivate-missing (`isActive=false` для товаров, пропавших из фида) — оставляем как в Phase 1, это про существование товара, не про значение поля, override-слоя не касается.

## Write-back (списание остатка при заказе)

Новый модуль `lib/sync/writeback-stock.ts`, вызывается **синхронно** в checkout-flow до создания `Order` в Neon.

**Требуемый контракт от внешнего API** (см. открытые вопросы): эндпоинт атомарного conditional-decrement — `stock -= N` только если `stock >= N`, атомарность обеспечивает сторона источника (у неё же конкурентная запись от 2 других магазинов). Ответ: `{ success: true, remainingStock }` либо `{ success: false, reason: 'insufficient_stock' }`.

**Поведение checkout:**
- `success` → продолжаем как сейчас, создаём `Order`.
- `insufficient_stock` → заказ отклоняется до создания `Order`, пользователю — понятная ошибка (уменьшить количество / убрать позицию).
- timeout/сетевая ошибка → до 2 ретраев с коротким backoff, затем **fail-closed**: заказ не создаётся. Приоритет — корректность остатка/денег над доступностью checkout.
- Бюджет по времени на вызов — 3–5с, иначе явная ошибка пользователю, а не зависший checkout.

`Product.stock` в Neon — кеш для витрины, обновляемый read-pull раз в час, **не** источник истины для гейта на checkout. Поэтому optimistic-lock на нём не нужен: гонки между собственными заказами hairshop-pro.lv (и заказами двух других магазинов) разрешает атомарный decrement на стороне источника, не Neon.

## Rollout — 2 независимые фазы

**Фаза 1 (read-pull), флаг `SYNC_PULL_ENABLED`:**
1. Manual trigger на узком подмножестве (allowlist `externalId` в адаптере).
2. Проверка: override-значения (там, где админ правил) не тронуты; title/images/category выглядят разумно; stock не сплошь `10000`-заглушка (см. [[project_stock_placeholder]] — если это легитимное «склад не отслеживается» из самой живой БД, это не баг синка).
3. Несколько чистых manual-прогонов на всём каталоге.
4. Включаем cron (раз в час).

**Фаза 2 (write-back), флаг `SYNC_WRITEBACK_ENABLED`, дефолт off:**
- Включается отдельно, только после того как Фаза 1 стабильна на проде.
- Первый тест — на sandbox/тестовом товаре либо в окно, согласованное с владельцем живой БД (это чужой реальный склад и 2 живых магазина рядом, нельзя тестировать «в бою» без предупреждения).

## Monitoring, откат

- Email-алерт: `SyncRun.status='failed'`, `errorCount>0`.
- Отдельный, более приоритетный алерт: failure write-back в checkout (потенциально деньги уже списаны у клиента, а остаток в живой БД не списан/разошёлся).
- Read-путь откатывается тривиально (флаг/cron off, Neon держит последний хороший кеш).
- Write-путь после факта не откатить — поэтому весь упор на синхронный fail-closed гейт при заказе, не на rollback постфактум.

## Тестирование

- Unit: regression-тест ровно на найденную коллизию — прогон синка с payload, где `price`/`description` в base отличаются от override, не должен менять то, что видит клиент (merge-слой отдаёт override).
- Unit: `resetProductOverride` реально возвращает к текущему base-значению (закрывает существующий no-op баг).
- Unit: `buildUpsertQuery` пишет все поля payload в base-колонки, не трогая `KeyValueSetting`.
- Integration/manual QA: write-back гейтинг (успех/insufficient/timeout) — как только появится реальный контракт API, до этого — на моке.

## Открытые внешние зависимости

Не решаются этим документом, нужен ответ от владельца живой БД/API до реализации соответствующей части:

1. Точный REST-контракт: эндпоинты, авторизация, форма курсора пагинации, эндпоинт и форма ответа atomic-decrement.
2. Сетевая доступность: HTTPS + API-key (рабочее предположение) или всё же нужен IP-allowlist для Vercel egress.
3. Нужна ли central-price как cost-basis/референс отдельным полем для админки/аналитики — отложено, не в v1, поле не заводим, пока не появится явная потребность.
4. Backup/restore и мониторинг на стороне живой БД — предусловие перед go-live, вне кода hairshop-pro.lv.
5. Кто выдаёт креды/API-key и как они попадают в Vercel env.

## Явно не делаем сейчас (YAGNI)

- Свой `storeId`/tenant-scoping по схеме hairshop-pro.lv — multi-store не наша забота, она уже на стороне живой БД.
- Отдельный always-on сервис (Railway/Fly) под синк — оправдан только если выяснится, что REST API недостаточно и нужен прямой SQL Server-коннект с persistent-соединением; пока не тот случай.
- Central cost-basis price как отдельное поле — пункт 3 открытых вопросов, делать по явному запросу.
- Изменение периодичности cron динамически/конфигурируемо — фиксированный час, без параметризации, пока не появится причина.
