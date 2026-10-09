# GrinS manual import: независимый review Claude, 9 октября 2026

Проверяемый объект: `release/grins-manual-import` @ `3fc27d6edd69932d1d865cbe8ce16b02718cff7e` (diff от `c3aec771`). Рабочая копия: `.backups/grins-safety-release`, чистая на этом SHA. Код не менялся; push/merge/deploy/миграции/Neon не выполнялись.

## Вердикт: APPROVED WITH BLOCKERS

Транзакционная часть (A, B, D, F) сделана корректно и консервативно: в коде не найден сценарий частичного commit или ложного `completed`. Блокеры: одна ошибка валидации цены (код) и два вопроса остатков/доступности checkout, которые код сейчас не закрывает.

## Воспроизведённые проверки (Node 22.13.1, только синтетические локальные БД)

| Проверка | Результат | Evidence |
|---|---|---|
| vitest: manual-import, validation, routes, xml-parser | 91/91 PASS | — |
| PGlite SQL harness (`verify-grins-manual-import-pglite.ts`) | 40/40 PASS | `test-results/claude-review-2026-10-09/atomic-sql.log` |
| Crash harness (kill до/после commit) | 2/2 PASS | `.../atomic-crash.log` |
| Отдельная численная проба + SQL `buildUpsertQuery` на PGlite | **дефект B1** | `.../numeric-probe.log` |

Реального PostgreSQL/Docker на машине нет. Всё, что ниже касается взаимодействия нескольких backends, получено статическим анализом и семантикой блокировок PostgreSQL, а не измерено.

## Дефекты

### B1 — HIGH, BLOCKER (код): цена ниже 0.005 проходит строгую валидацию и записывается как 0.00 при `erpPriceMissing=false`
- `lib/sync/manual-import-validation.ts:11` отклоняет только underflow float (`number === 0`), а не округление до центов.
- `lib/sync/sync-preflight.ts:135` считает `toCents(0.004)=0` («нулевая цена, сохранить старую»).
- `lib/sync/upsert-products.ts:20,30` сравнивает сырое `incoming.price > 0` → `0.004 > 0` истинно → `price := 0.004` → `numeric(12,2)` = **0.00**, `erpPriceMissing=false`, ручное одобрение снято.
- Итог: товар с ценой 0.00 считается допустимым по B2B-цене (`lib/product-sellability.ts` `hasValidB2BPrice`). Отдельного запрета нулевой цены в модулях sellability/order не нашлось (checkout целиком не проверялся).
- Воспроизведение: `price2=0.004` → audit invalidPrices=0, preflight cents=0, после UPDATE `{"price":"0.00","stock":4,"erpPriceMissing":false}` (numeric-probe.log). То же для `0.0000001`.
- Минимальное исправление: в `manualDecimal` для цены отклонять `value > 0 && round-half-up-to-cents == 0` (сравнивать через `toCents`). Defense-in-depth: в SQL использовать `round(incoming.price, 2) > 0` во всех трёх местах. Плюс регрессионные тесты `0.004`, `0.0049`, `0.005` (→ 0.01).

### B2 — HIGH, BLOCKER (остатки): Apply перезаписывает stock абсолютным снимком и не учитывает продажи и резервирования после выгрузки
- `upsert-products.ts:21` `stock = incoming.stock`. Блокировка таблицы гарантирует только то, что **во время** транзакции ничего не вклинится. Продажи между vendor export → preview → Apply теряются. Preflight под блокировкой (`manual-import-atomic.ts`, `evaluateFeed(tx, …)`) проверяет только HARD-пороги, а не изменение stock после preview.
- Конкретный механизм пересчёта вверх, не зависящий от процесса ERP: заказ создан → `stock -= q` (`lib/orders-data-store.ts:92`), Apply ставит stock = значение из ERP (резервирование веб-магазина ERP не знает), затем резервирование истекает или оплата падает → `stock += q` (`orders-data-store.ts:229`). Итог: ERP+q, т.е. завышено на q до следующего импорта → риск overselling.
- В коде не найдено передачи веб-заказов в ERP; было ли ERP-количество уменьшено веб-продажами, решается бизнес-процессом, а не кодом.
- Минимальное исправление (код, под уже взятой блокировкой): HARD reject, если (а) есть Order с `stockReservationStatus='reserved'`, содержащий связанный с XML товар, или (б) stock любого связанного товара изменился после создания preview (хранить в preview `stock` по id или fingerprint `(id, stock, revision)` связанных строк и сравнивать при Apply → `catalog_changed_since_preview`, нужен новый preview).
- Обязательно для процедуры (код это не закроет): продажи закрыты от момента vendor export до Apply, либо владелец письменно подтверждает, что все веб-заказы после export уже внесены в GrinS до выгрузки.

### B3 — MEDIUM-HIGH, BLOCKER для эксплуатации: checkout блокируется на всё время транзакции и падает через 5 с
- `manual-import-atomic.ts:40` `SHARE ROW EXCLUSIVE` на Product конфликтует с любым UPDATE Product (ROW EXCLUSIVE). Транзакция держит блокировку на время разбора XML (`evaluateFeed` внутри tx), двух полнотабличных fingerprint (`:29`, `row_to_json` всех колонок, включая описания), 80 UPDATE-пакетов и записи многомегабайтного JSON в KVS. Лимит — до 240 с (`:165`).
- `createOrderWithSideEffects` (`orders-data-store.ts:46`) использует interactive transaction по умолчанию (timeout 5000 мс) → при импорте дольше ~5 с `updateMany` по stock ждёт блокировку, и checkout получает P2028/500. Данные откатываются (корректно), но заказ не создаётся. Так же ведут себя reservation release, returns, payment-failed webhook, admin edits.
- Риск исчерпания пула: Prisma по истечении timeout не отменяет запрос, ожидающий блокировку, и соединение Neon Pool занято до commit импорта. При ~10 одновременно заблокированных writers на процесс зависают и чтения.
- Это не порча данных, но потеря заказов/доступности. Минимальное требование: Apply только в окне обслуживания с закрытым checkout (совпадает с B2), либо длительность на реальном PG измерена и признана допустимой. Улучшение кода (можно отложить): вынести разбор XML и `auditManualXml` до блокировок; под блокировкой оставить только сравнение с БД.

### M1 — MEDIUM: scheduled runner забирает истёкшую manual lease, даже если manual run ещё `running`/`outcome_unknown`
- `lib/sync/sync-lock.ts:18` проверяет только `lockedUntil < now()`. Защита «не отбирать lease у running worker» (`manual-import-atomic.ts:57`) односторонняя. Утверждение handoff «lease остаётся до расследования» верно только для manual. Через 30 минут cron продолжит работу.
- Практически БД к этому моменту, скорее всего, в определённом состоянии (транзакция ограничена 240 с), поэтому это не потеря данных. Но это нарушает задекларированный инвариант расследования.
- Исправление: тот же предикат в `acquireSyncLock` либо подтверждение, что scheduled runner в production выключен. Если cron включён — исправить до production.

### M2 — MEDIUM (операционно): упавший scheduled run навсегда блокирует manual Apply
Если его SyncRun остался `running`, manual `acquire` вечно возвращает `sync_running`, а автоматического reaper нет. Нужен проверенный runbook-SQL: проверить, что worker мёртв → пометить run failed → только потом Apply.

### L1 — LOW: ошибки snapshot/`duplicate_claimants` отдаются как `backup_failed`
Сейчас в `stage='backup'` попадает всё после preflight. Диагностика неточна, но rollback корректен.

### L2 — LOW / ограничение: restore практически одноразовый
Fingerprint всей таблицы Product (все колонки, все строки, включая не-ERP) → любая продажа или правка после импорта даёт `restore_conflict`. Так задумано и безопасно для продаж, но фактически восстановление после открытия магазина = новый корректный XML + ручная сверка. Это надо явно записать в runbook.

### L3 — INFO: пробелы в тестах (не ложные PASS, а непокрытые случаи)
Нет теста на sub-cent цену (B1), на reservation release после Apply (B2), на checkout во время импорта (B3), на захват manual lease планировщиком (M1). «Concurrent» сценарии на PGlite выполняются на одном backend: они доказывают логическое исключение, но не ожидания блокировок. Тест «zero-price contract» покрывает только литерал `0`.

## Проверенные гарантии

- **A. Блокировки:** порядок Product → KVS → строка lease; владелец и срок проверяются под блокировкой; preflight, snapshot и Apply выполняются после блокировок. Writers из других процессов и экземпляров ждут на уровне PostgreSQL. Deadlock с транзакцией «KVS, затем Product» возможен (40P01), но откатывает одну из сторон целиком. Manual не отбирает lease у running worker. После crash SQL-блокировки снимает rollback; durable lease остаётся (но см. M1).
- **B. Атомарность:** UPDATE-пакеты, ERP metadata, backup v2, SHA ledger и `completed` — в одной транзакции, без retry/continue. `resolve()` ждёт строку lease и никогда не перезаписывает `completed`. Если исход не определён → `outcome_unknown`, lease остаётся. Ложного success не найдено.
- **C. Восстановление:** откат при любом изменении после импорта; заказы не трогает; legacy backup — только dry-run.
- **D. Идемпотентность:** ledger проверяется под блокировкой до consume и фиксируется в той же транзакции. Повтор после потерянного ответа → 409 с исходным runId. SHA подтверждается содержимым preview (`content_mismatch`). Ограничение: байтово иной файл = новый SHA (свежесть не доказывается).
- **E. Числа:** `0x10`, `1e3`, `+5`, `-0`, `5.`, `.5`, `1,5`, `1 000`, Infinity/NaN, полноширинные и арабские цифры, переполнение и `2147483648` отклоняются; `1.0` для stock = 1, `1.5` отклоняется; parser не приводит типы (`parseTagValue:false`). **Исключение — B1.**
- **F. Журнал:** actor/SHA/previewId записываются до критических действий; `completed` и backupKey фиксируются атомарно; сырые сообщения исключений не пишутся; failed audit → `catalog.grins_import_failed`.

## Риски для оформления заказов
1. Отказы checkout на время Apply (B3); возможное зависание пула.
2. Завышенный stock после импорта при открытых резервированиях или продажах после export (B2) → overselling.
3. Товар по 0.00 при sub-cent цене в XML (B1).

## Можно отложить
M2 (при наличии runbook), L1–L3, вынос разбора XML из-под блокировки (если Apply идёт в окне обслуживания), retention backups в KVS, лимиты body/CPU upload из R10.

## План проверки на реальном PostgreSQL (локальный PG той же major-версии, что Neon, или одноразовый отдельный Neon project; не staging/production)
1. Два и более backend: импорт с искусственной паузой после `LOCK TABLE`; одновременно `createServerOrder`, reservation release, returns, admin edit, scheduled `acquireSyncLock`. Зафиксировать время ожидания и коды ошибок, убедиться, что stock и Order не изменены частично.
2. `lock_timeout`: удерживать ROW EXCLUSIVE на Product больше 10 с → импорт падает 55P03, lease освобождена, preview сохранён.
3. Deadlock: writer «KVS, затем Product» (image-crop / restore-previous) против импорта → 40P01, без частичных записей.
4. Реальный `statement_timeout` (уменьшить для теста) → 57014, полный rollback.
5. `pg_terminate_backend` импорта во время UPDATE и во время COMMIT; разрыв сети/websocket при COMMIT → `completed` либо `outcome_unknown`, никогда ложный failed/success. Затем проверить M1 (cron через 30 минут).
6. Два отдельных Node-процесса одновременно Apply/restore.
7. Производительность: ~16 000 товаров с реалистичными описаниями и `erp-extra-data`; измерить длительность транзакции и удержания блокировки, WAL (`pg_current_wal_lsn` diff), размеры строк KVS, пиковый RSS Node, задержку Plesk↔Neon. Не меньше трёх прогонов.
8. 20 параллельных checkout во время импорта → поведение пула, восстановление после commit.
9. Сценарий B2: резервирование → Apply → истечение резервирования → проверить итоговый stock.

## Handoff для Codex
1. Исправить B1 (валидация + SQL `round(...,2)` + тесты).
2. Исправить B2 кодом: HARD gate на открытые резервирования по связанным товарам и на изменение stock/revision после preview. Тесты: заказ между preview и Apply → reject; резервирование → reject.
3. M1: выровнять предикат `acquireSyncLock` или письменно подтвердить, что cron выключен; добавить тест.
4. Обновить safety handoff: что B3 требует окна обслуживания, что restore одноразовый (L2), runbook для M2.
5. Отдельный локальный commit, затем передать Claude новый SHA и evidence. Запреты push/merge/deploy/Neon/реальных XML сохраняются.
