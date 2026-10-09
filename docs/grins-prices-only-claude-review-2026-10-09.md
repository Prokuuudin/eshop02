# GrinS prices-only: независимый review Claude, 9 октября 2026

Проверяемый объект: `release/grins-manual-import` @ `41923c0974caa701049795fc2ad85d5636c4f0e1`, diff от `3fc27d6`. Рабочая копия `.backups/grins-safety-release` чистая на этом SHA. Код не менялся. Push, merge, deploy, миграции, подключения к Neon и реальный импорт не выполнялись.

## Вердикт: APPROVED WITH BLOCKERS

Код prices-only безопасен в заявленном объёме:
- остатки, резервы, ERP-данные складов и признаки активности/удаления товара не записываются;
- B1 исправлен;
- для B3 добавлена настоящая техническая защита создания заказов.

Оставшиеся блокеры — эксплуатационные, а не логика импорта:
- **OB1:** без заранее созданной настройки gate магазин перестанет принимать заказы;
- **OB2:** нет проверки B3 на реальном PostgreSQL;
- **M1:** записи в Product, не связанные с checkout, во время Apply по-прежнему ждут блокировку.

## Воспроизведённые проверки (Node 22.13.1, только синтетические PGlite/in-memory)

| Проверка | Результат | Evidence (`test-results/claude-review-prices-2026-10-09/`) |
|---|---|---|
| 10 затронутых suites (manual-import, validation, price-query, maintenance, orders-data-store, grins routes, orders, v1 orders, UI, parser) | 141/141 в 9 suites; **`app/api/orders/route.test.ts` падает без `DATABASE_URL`** (L1). С фиктивным недоступным URL: 57/57 | `unit.log` |
| SQL harness prices (15 000 synthetic) | 37/37 PASS | `prices-sql.log` |
| Crash: kill до/после commit | 2/2 PASS, `stockChanged=0` в обеих фазах | `prices-crash.log` |
| Независимая проба округления: 20 000 случайных decimal + граничные случаи; JS-превью ↔ значение для SQL ↔ PG `round(numeric,2)` | 0 расхождений | `cents-probe.log` |
| SET targets `buildManualPriceQuery` + обход декодера сырым `0.004` | только `price, erpPriceMissing, manualPriceApproved, manualApprovedPrice, revision, updatedAt`; сырое `0.004` → round → 0 → цена сохранена, `erpPriceMissing=true`, stock не изменён | `cents-probe.log` |

## Подтверждённые гарантии (по коду)

- **Только цены.** Apply использует исключительно `buildManualPriceQuery` (`lib/sync/manual-price-query.ts`), в SET нет stock, isActive/isDeleted или складских полей. Нет INSERT Product. `erp-extra-data` не пишется. `buildUpsertQuery`, `runSync`, `upsertProducts` из manual-путей и grins API недостижимы. Триггеры в миграциях есть только на audit log (`20260802183000_harden_audit_log`), на Product/KVS нет. На Neon это ещё нужно проверить (вне репозитория). `erp-extra-data` вне sync читает только `lib/warehouse-availability.ts` (остатки по складам), поэтому устаревшие ценовые tiers на цены витрины не влияют.
- **Подмена API.** `apply/route.ts`: неизвестные ключи и любой `mode` ≠ `prices-only` → 400 до вызова. У внутренней функции нет параметра, который выбирал бы stock SQL. Старый preview без mode/fingerprint → `preview_mode_mismatch`.
- **Restore.** Выполняется только для backup v3 prices-only. SET содержит только ценовые поля. Restore защищён тем же gate, lease и транзакцией. Любое изменение Product после импорта (включая продажу) → `restore_conflict`.
- **Атомарность.** Без изменений относительно `3fc27d6`: одна транзакция, `resolve()` и `outcome_unknown` сохранены. Подтверждено SQL-harness (ошибки после первых statements, на backup и на финальном marker) и crash-harness.
- **SHA.** Новый ключ `grins-manual-import-applied:prices-only:<sha>` плюс проверка legacy-ключа. Проверка идёт под блокировками до consume, в одной транзакции с ценами.
- **Preview ↔ Apply.** Цена берётся из `manualDecimal` (BigInt half-up) и в preview, и в Apply (`Number(cents)/100` → `toFixed(2)` → SQL `round(...,2)`). Индексы `parseGrinsXml` и `readGrinsXmlItems` совпадают (один parser). Fingerprint каталога: id/externalId, ценовые поля, revision, isActive, isDeleted. Он фиксируется в preview на сервере и повторно проверяется под блокировкой (`catalog_changed_since_preview`). Подменить его клиент не может, preview хранится в KVS.
- **B1.** `0.004`, `0.0049`, `0.0049999` → HARD; `0.005` → 0.01; `1.005` → 1.01; `2.675` → 2.68; `0` остаётся по прежней политике; `0x10`, `1e2`, `-1`, `3.`, `.5`, `1,5`, `10000000000` отклоняются.

## B3: анализ

**Что держит Apply.** `SHARE ROW EXCLUSIVE` на Product и KVS плюс `FOR UPDATE` строки lease на всё время транзакции (lock_timeout 10 с, statement_timeout 180 с, Prisma timeout 240 с). Это без изменений.

**Новый gate — технически корректная защита создания заказов:**
1. Все создатели заказов (customer, v1, admin) идут через единственный `createOrderWithSideEffects`. Других `order.create` в `lib/` и `app/` нет.
2. Быстрая проверка до транзакции (обычный SELECT совместим с SRE) плюс первой операцией в транзакции `SELECT … FOR SHARE` строки gate. ROW SHARE совместим с SRE, поэтому во время Apply новый заказ получает 503 **сразу**, без ожидания блокировки Product и без удержания соединения из пула.
3. Сливание очереди: UPDATE gate false→true ждёт всех держателей FOR SHARE, то есть все уже допущенные заказы. Заказ, проверивший gate до UPDATE, но начавший транзакцию после, в READ COMMITTED увидит true и будет отклонён.
4. Apply требует true вне транзакции и ещё раз под блокировками. Открыть gate во время Apply нельзя: UPDATE ждёт KVS SRE.
5. Fail-closed при отсутствии строки нужен для корректности: без строки FOR SHARE ничего не блокирует, и INSERT true не дождался бы заказов. Раз при отсутствии строки заказы запрещены, такой INSERT безопасен.
6. В customer route до gate нет записей в Product/KVS. Очистка просроченных резервов (`releaseExpiredStockReservations`) вызывается только после gate, поэтому в окне её нет.

**B3 для создания заказов закрыт в коде.** Для production он не принят без OB2.

## Дефекты и блокеры

### OB1 — HIGH, BLOCKER эксплуатации: без строки gate checkout полностью закрыт
`lib/grins-import-maintenance.ts`: отсутствие строки = закрыто. Миграции или seed нет. Если выложить `41923c0` на staging или production до вставки `{"checkoutClosed":false}`, все новые заказы получат 503. Требуется:
- идемпотентный проверенный SQL `INSERT … VALUES ('grins-prices-only-maintenance','{"checkoutClosed":false}'::jsonb, now()) ON CONFLICT (key) DO NOTHING`, выполненный **до** перезапуска workers на новом SHA;
- после выкладки smoke-тест создания заказа;
- шаг в deploy-чеклисте.

### OB2 — BLOCKER до production: нет доказательства на реальном PostgreSQL
Нужен план ниже. PGlite работает с одним backend и не подтверждает ожидания блокировок, сливание FOR SHARE и пул.

### M1 — MEDIUM: записи в Product вне checkout не защищены gate
Payment-failed release (`updateServerOrderPayment` → `releaseReservation`), returns (`app/api/returns/[id]/route.ts`), admin-редактирование заказа (`lib/orders-data-store.ts`, delta stock), cancel, admin-правки товаров и bulk. Во время Apply они ждут блокировку Product. Через 5 с Prisma возвращает ошибку (P2028, данные откатываются), но соединение остаётся занятым до commit Apply. Данные это не портит.

Минимум на 20 октября:
- измерить длительность Apply на реальном PG;
- в окне обслуживания приостановить admin-операции;
- подтвердить, что Paysera повторяет webhook после 5xx.

Код можно отложить, если Apply < ~5 с; иначе распространить gate на эти пути (вернуть 503 до транзакции).

### L1 — LOW: `app/api/orders/route.test.ts` зависит от окружения
`app/api/orders/route.ts` теперь импортирует `prisma` напрямую. В тесте нет `vi.mock('@/lib/prisma')`, поэтому без `DATABASE_URL` suite падает при импорте (`No DATABASE_URL set`). Заявленные Codex 215/215, вероятно, получены с заданной переменной. Исправление: добавить мок prisma.

### L2 — LOW (UX): клиент не обрабатывает `checkout_maintenance`
Строки или обработчика в storefront нет (grep по app/components/lib), покупатель увидит общую ошибку. Нужно сообщение RU/LV/EN «оформление временно недоступно».

### L3 — LOW: возможное голодание UPDATE оператора
Новые FOR SHARE совместимы с существующими share-блокировками и могут обходить ожидающий UPDATE. При трафике B2B это маловероятно. Оператору стоит задать `SET lock_timeout` и повторить. Проверить на реальном PG.

### INFO
- Цены `9999999999.994` и подобные отклоняются, хотя округлились бы до допустимого значения. Это консервативно и приемлемо.
- M1 и M2 из предыдущего review (cron и lease) приняты при подтверждённо выключенном cron.
- Каждый импорт требует ручного SQL оператора на production. Рекомендуется (не блокер) admin-переключатель gate с правом settings, audit и тем же UPDATE-сливанием.

## Минимальное решение B3 к 20 октября

1. Код как в `41923c0`: gate + FOR SHARE + 503 + проверка в Apply и restore.
2. OB1: строка gate=false до выкладки и smoke-тест заказа.
3. Процедура окна:
   - закрыть gate через UPDATE с `lock_timeout`, дождаться commit;
   - проверить, что новый заказ получает 503;
   - приостановить admin-операции с заказами и товарами;
   - preview → Apply;
   - сверка;
   - gate=false.
4. OB2: измерения на реальном PG; если Apply дольше 5 с, оценить M1.
5. L2: сообщение покупателю (желательно).

## План тестов на реальном PostgreSQL (локальный PG той же major-версии, что Neon, или одноразовый отдельный Neon project; не staging/production)

1. **Сливание:** заказ с паузой внутри транзакции (после FOR SHARE) → оператор делает UPDATE true → UPDATE ждёт → заказ коммитится → UPDATE завершается → Apply стартует. Ни одной транзакции заказа во время Apply (`pg_stat_activity`, `pg_locks`).
2. Новый заказ во время Apply → 503 за < 100 мс, без ожидания блокировок и без занятого соединения.
3. Голодание (L3): 20 параллельных потоков заказов при UPDATE gate.
4. M1: payment-failed webhook, return, admin-правка заказа и товара во время Apply с паузой → время ожидания, P2028, отсутствие частичных записей, пул после commit.
5. Apply с ~16 000 товаров с реалистичными описаниями: длительность транзакции и удержания блокировок, WAL, размеры KVS, RSS Node, задержка Plesk↔Neon. 3 прогона.
6. lock_timeout (55P03), statement_timeout (57014), deadlock с writer «KVS, затем Product», `pg_terminate_backend` во время UPDATE и COMMIT, разрыв сети при COMMIT → `completed` или `outcome_unknown`.
7. Два Node-процесса Apply одновременно; Apply и restore одновременно.
8. Триггеры и правила на Product/KVS в копии схемы Neon (`pg_trigger`, `pg_rules`).

## Handoff для Codex

1. **OB1:** добавить в deploy-runbook и handoff точный идемпотентный INSERT gate=false до перезапуска workers и smoke-тест заказа. Не выполнять на live без разрешения.
2. **L1:** `vi.mock('@/lib/prisma')` в `app/api/orders/route.test.ts`; убедиться, что весь unit-набор проходит без `DATABASE_URL`.
3. **L2:** клиентская обработка 503 `checkout_maintenance` (RU/LV/EN) и тест.
4. **M1:** решение владельца — процедура или код. Если код, то быстрая проверка gate до транзакции в payment-failed release, returns, admin-правке заказа и admin-правках товаров, плюс тесты.
5. Опционально: admin-переключатель gate с правом, audit и lock_timeout.
6. Отдельный локальный commit, обновлённый handoff, новый SHA и evidence для Claude. Запреты push/merge/deploy/Neon/реальных XML сохраняются.
