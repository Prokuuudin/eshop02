# GrinS prices-only: handoff для Claude, 9 октября 2026

Исходный SHA: `3fc27d6edd69932d1d865cbe8ce16b02718cff7e`, ветка `release/grins-manual-import`. Кандидат — отдельный локальный коммит, содержащий этот документ (`git rev-parse HEAD`); полный SHA также указан в итоговом сообщении Codex. Рабочая копия: `.backups/grins-safety-release`. Основной MFA checkout и посторонний WIP не изменены. Дедлайн магазина — 20 октября 2026, Europe/Riga.

Прочитаны прежний safety handoff и независимый `grins-manual-import-claude-review-2026-10-09.md` с вердиктом APPROVED WITH BLOCKERS. Последний включён в кандидата без изменений как исходный контекст. Владелец выбрал временный **prices-only**, подтвердил выключенную автоматическую синхронизацию и отсутствие передачи веб-заказов в GrinS. Эти подтверждения не являются новым аудитом runtime. Старые документы описывают прежний полный импорт, этот документ — новый режим.

## Вердикт и границы

**Вердикт: READY FOR INDEPENDENT REVIEW.** Независимый review нового кандидата Claude ещё не выполнен. Нет production readiness. Не выполнялись push/merge/deploy, изменения Neon/staging/production, Plesk, реальные XML Apply, миграции, включение FTPS/scheduler или передача заказов в ERP. DDL schema fixture и настройки maintenance gate использованы исключительно в новых синтетических PGlite. Новых зависимостей не установлено.

## Разрешённый write scope

Apply использует **только** `buildManualPriceQuery`, не `buildUpsertQuery`, не `runSync`. SQL SET содержит `price`, `erpPriceMissing`, `manualPriceApproved`, `manualApprovedPrice`, `revision`, `updatedAt`. Ни stock, ни резервы, ни isActive/isDeleted, ни складская metadata не являются UPDATE targets. Нет INSERT Product. Цена берётся всегда из price2, независимо от scheduled SYNC_PRIMARY_PRICE_TIER.

ERP `erp-extra-data` вообще не записывается, включая warehouseQuantities и reference price1–4. В этом режиме источником продаваемой цены является Product.price; старые ERP reference tiers не должны использоваться как подтверждение актуальной импортированной цены. История/SyncRun/backup/SHA ledger и pending preview — служебные записи операции.

Литерал price2=0 сохраняет цену и manual approval, но ставит erpPriceMissing по прежней бизнес-политике: это может повлиять на **ценовую** пригодность к продаже, а не на количественный stock. При положительной цене approval снимается. Stock, резервы и доступное количество из-за XML не изменяются. Не реализованы компенсация продаж, частичная синхронизация stock или inventory reconciliation.

## B1: единые точные cents

Decimal lexer остаётся строгим. Для цен округление half-up вычисляется по исходным decimal digits через BigInt до преобразования в number. Положительное значение, округляющееся до 0 cents, отклоняется. 0.004, 0.0049, 0.0000001 — HARD; 0.005 → 0.01; настоящее 0 остаётся 0. Hex/exponent/negative/nonfinite/overflow не допускаются. Preview использует нормализованную price2; SQL получает fixed-2 decimal и дополнительно round(...,2). Preview и SQL больше не сравнивают сырую положительную sub-cent цену по-разному.

XML stock/quantity/slots по-прежнему проходят структурную/числовую валидацию, но их размер/изменение не участвует в stock business gates, warnings, change counts или применении. Цена/размер полной выгрузки/linked ratio/zero-price/large-change gates сохранены. Нужна свежая выгрузка для проверки фактического vendor decimal contract.

Унаследованные stock-metrics в типе PreflightMetrics заполнены 0/{} как неиспользуемые поля режима, а не как измерение суммарных остатков каталога. Из них нельзя делать вывод, что текущий warehouse/stock sum равен нулю. Planned stockChanges=0 означает отсутствие складских UPDATE.

## Транзакции, Preview, SHA и restore

Сохранены shared DB lease, запрет manual takeover истёкшей running/unknown lease, table locks Product → KVS → lease row, атомарный catalog/backup/ledger/completed commit и resolution потерянного COMMIT acknowledgement. Неопределённый исход остаётся running/outcome_unknown для расследования; automatic restore отсутствует.

Новый preview содержит server-owned mode=prices-only и SHA-256 ценового состояния связанных Product: id/externalId, цена/approval/price-missing, revision, active/deleted. Fingerprint читается до/после evaluation, чтобы отклонить изменение во время preview. API сохраняет именно fingerprint показанного evaluation. Apply повторно проверяет gates под блокировками и отклоняет catalog_changed_since_preview, даже если новые изменения укладываются в ratio thresholds. Нужен новый preview. Изменение только stock при заказе не выдаётся за изменение цены, но Apply всё равно требует maintenance. Старый preview без mode/fingerprint или с full mode отклоняется.

Apply body допускает только previewId, sha256 и необязательный mode=prices-only. full/prices-and-stock/includeStock/stock и любые неизвестные ключи получают 400 до Apply. Даже внутренний вызов не имеет параметра, выбирающего stock SQL. Idempotency key теперь `grins-manual-import-applied:prices-only:<sha256>` с mode и scope=product-prices. Прежний successful SHA без mode тоже блокируется: прежний полный импорт уже включал эти цены. Restore не удаляет ledger; force endpoint отсутствует.

Backup v3 хранит **только ценовые поля** и identity, mode, source SHA/run, full-Product post-state fingerprint и fingerprint ERP metadata для conflict guard. Он не хранит восстанавливаемый stock или warehouse payload. Execute restore разрешён только для v3 prices-only, под той же maintenance/lease/transaction защитой. SET restore содержит только ценовые поля и revision/updatedAt. Любое изменение Product/ERP после импорта даёт restore_conflict; заказы и ERP metadata не восстанавливаются. Старые stock backups не исполняются этим кодом. Одноразовый успешный restore остаётся консервативным: открытие продаж/любая правка обычно исключает его, нужен оператор и новый корректный файл.

## B3: обязательное обслуживание и техническая защита checkout

**B3 не объявляется устранённым.** Product table lock и длинная interactive transaction сохраняются: lock_timeout=10 s, statement_timeout=180 s, Prisma import timeout=240 s, обычные order transactions имеют прежний default timeout. Цена-only не делает UPDATE Product совместимым с checkout. Не доказаны реальная длительность, pool recovery, Neon transport и IIS timeouts.

Новый shared DB gate: KVS key `grins-prices-only-maintenance`, value `{"checkoutClosed":true|false}`. Новые заказы допускаются только при явном JSON boolean false; отсутствие, неверный тип/формат и true fail closed. Apply/execute restore допускаются только при явном true. Это **обязательная настройка перед будущим запуском**: без неё новые заказы закрыты, а Apply недоступен. В этой задаче настройка live не менялась.

Common createOrderWithSideEffects проверяет gate до transaction, затем повторно `SELECT ... FOR SHARE` первым действием transaction. Shared row lock удерживается до commit Order/stock/price snapshot. Поэтому operator UPDATE false→true должен дождаться ранее допущенных order transactions. Новый customer POST также проверяет gate до opportunistic reservation cleanup; customer/v1/admin create возвращают 503 checkout_maintenance. Existing order/pay/cancel/return semantics и stock arithmetic не менялись. После открытия checkout новый заказ получает актуальную DB-цену; уже созданные Order snapshots сохраняются.

Основание для row/table lock взаимодействия — [официальная PostgreSQL explicit-locking документация](https://www.postgresql.org/docs/current/explicit-locking.html): FOR SHARE блокирует UPDATE своей строки и держится до конца transaction; обычный SELECT совместим с SHARE ROW EXCLUSIVE. Это статическое обоснование, не измерение многопроцессного PostgreSQL. PGlite имеет один backend и не подтверждает реальные waits/Prisma timeout cancellation/pool behavior.

### Будущая процедура оператора, не выполнялась

1. Отдельное разрешение на staging writes/deploy/import; все workers должны работать на новом exact SHA. Смешанный deployment со старыми workers без guard недопустим. Назначить hosting/DB/recovery operator.
2. До открытия магазина инициализировать shared gate явным boolean false, если checkout разрешён; при выкладке держать внешний checkout закрытым. Missing gate намеренно закрывает новые orders. Предварительно согласовать конкретный SQL и endpoint; никаких секретов в отчёте.
3. Закрыть внешний checkout для customer/v1/admin creation, остановить новые catalog writers и плановые sync. Подготовить завершение/паузы reservation expiry, payment-failed stock release, returns и иных existing-order writers, чтобы они не накопились на Product-lock. Guard новых orders не заменяет эту операционную часть.
4. Уполномоченный оператор меняет gate в общей staging DB на true в проверенной transaction и ждёт её commit. UPDATE должен дождаться FOR SHARE от допущенных orders. Не считать начатый UPDATE уже закрытым gate. Подтвердить closed flag, 503 для новых orders и отсутствие активных writers; получить fresh XML/backup readiness.
5. Preview в UI «Импорт только цен», проверить warnings/контрольные SKU; Apply один раз. Журнал должен показывать prices-only, completed, zero stock changes, original SHA и v3 backup. При unknown/running ничего не повторять и gate не открывать.
6. Проверить полный price/stock/order/ERP diff, storefront/cache и новую authoritative checkout цену; сохранить outcome. Only after approval оператор возвращает gate=false и открывает внешний checkout. Existing reservations не пересчитываются по XML. Проверить самостоятельную обработку их release/payment после окна.

Пример **будущего** изменения существующей настройки (не готовая команда для live; только после operator review и разрешения): `UPDATE "KeyValueSetting" SET value='{"checkoutClosed":true}'::jsonb,"updatedAt"=now() WHERE key='grins-prices-only-maintenance' RETURNING key;`. Требовать ровно одну строку и commit. Первичная INSERT/upsert, runtime credentials и открытие false — отдельные точно проверенные действия оператора; они не являются schema migration. Не удалять gate/lease/ledger и не включать cron автоматически.

## Проверки

Node 22.13.1 Windows; существующие dependencies, Prisma 7.8.0 / фактический Next 16.3.3. Не hermetic npm ci и не deployed Node 22.23.2/Neon/Plesk. Evidence в ignored test-results этой worktree: prices-unit.log, prices-sql.log, prices-crash.log, prices-lint.log, prices-build.log. Использован прежний schema fixture `../../test-results/grins-schema-20261008.sql` только в новых loopback/in-memory/file-backed PGlite. Скрипты не читают env files; build child получает allowlist env.

| Обязательный сценарий | Ожидается / фактически проверяется |
|---|---|
| Preview → price Apply | Rounded price2 и completed; stock samples/counts=0; real SQL |
| Stock одинаков | Полный SELECT id/stock/active/deleted до/после, включая skipped rows; real SQL |
| Резервы/available quantity одинаковы | Actual createServerOrder reserved до Apply; весь Order и net Product.stock неизменны; release после Apply возвращает исходный stock, не ERP+q |
| Replay | already_applied для нового preview тех же байтов, mode-aware ledger |
| Подмена mode | API full/includeStock/stock — 400 до Apply; старый stored preview full — отказ |
| 0.004 | HARD до SQL; 0.005=0.01, zero literal по прежней политике |
| SQL failure | Ошибка Product после прежних statements, backup INSERT/final completed marker/restore errors — атомарный rollback |
| Restore после изменений | Actual reservation release меняет Product → restore_conflict, цена/stock/Order сохранены |
| Конкурирующие imports | Same preview один winner, different XML не более одного и latest preview сохранён; логика на PGlite, не PG contention |
| Checkout/цена | Closed gate actual new order отказ; HTTP503 mocks до cleanup/reservation/payment; reopen actual order читает новую цену, старый snapshot не меняется. Real concurrent checkout wait/pool не проверен |
| Unmatched/new/deleted | Skip, no INSERT Product, неизменные prices/stock; причины в warnings/history metrics |
| UI языки | Реальный render RU/LV/EN: prices-only и stocks/reservations unchanged, без stock Apply элементов |

Финальные результаты: **215/215 unit/API**, 12 suites; отдельно **3/3 UI locale renders**; **37/37 real-SQL checks** на 15 000 synthetic Product; **2/2 actual PID kill/reopen**, с явно записанным stockChanged=0 до/после commit. Standalone tsc --noEmit --incremental false и Next typecheck — PASS. Полный lint — 0 errors / 63 warnings до удаления нового unused SAMPLE_SIZE; после удаления scoped lint новых/изменённых helper модулей — без замечаний. Остальные warnings исходные, включая React effect в GrinsImportSection. Encoding — PASS (1198 source files) плюс строгий UTF-8 для staged docs/scripts; diff --check — PASS. Финальный migration-free production build — PASS, exitCode=0, 615/615 static pages, прежние Tailwind duration warnings. Early initial journal failure по-прежнему не допускает Product work; sensitive DB exception text не сохраняется в operation diagnostics.

Воспроизведение: `node --conditions=react-server --import tsx scripts/verify-grins-manual-import-pglite.ts <schema fixture>`; `node --import tsx scripts/verify-grins-atomic-crash.ts <schema>`; build `node --import tsx scripts/verify-grins-build-pglite.ts <schema>`. Все эти harness — синтетические, не deployment scripts. Package build содержит prisma migrate deploy и здесь **не запускался**; build harness вызывает только build-canonical-cwd.mjs → Next build --webpack. Schema/prisma migrations не менялись.

## Изменённые файлы

* lib/sync/manual-import.ts, manual-import-atomic.ts, manual-import-validation.ts, manual-price-preflight.ts, manual-price-query.ts — server mode, precise cents, price-only gates/SQL/backup/restore.
* lib/grins-import-maintenance.ts; lib/orders-data-store.ts; app/api/orders/route.ts, app/api/v1/orders/route.ts, app/api/admin/orders/route.ts — shared admission gate и HTTP503; обычная stock/reservation арифметика прежняя.
* app/api/admin/grins-import/{preview,apply,history}/route.ts; app/[lang]/admin/import/GrinsImportSection.tsx — режим, запрет full, journal/UI RU/LV/EN.
* lib/sync/{manual-import,manual-price-query}.test.ts; lib/grins-import-maintenance.test.ts; lib/orders-data-store.test.ts; app/api/admin/grins-import/routes.test.ts; app/api/orders/route.test.ts; app/api/v1/orders/route.test.ts; app/[lang]/admin/import/GrinsImportSection.test.ts — regressions.
* scripts/verify-grins-prices-pglite.ts, verify-grins-atomic-pglite.ts, verify-grins-manual-import-pglite.ts, verify-grins-atomic-crash.ts — новые current-mode SQL сценарии, совместимые entrypoints и price crash checks.
* docs/grins-manual-import-claude-review-2026-10-09.md — неизменённый исходный review; этот handoff — новый контекст.

## Двусторонний handoff

Claude должен читать diff **от 3fc27d6**, не MFA checkout. Проверить все SQL SET targets и module/API reachability, прямые и поддельные вызовы, zero/rounding bounds, mode-aware/legacy SHA, preview fingerprint races, backup v3/legacy execute refusal, price flags и ERP reference-data ограничения. Проверить admission gate на customer/v1/admin/common create paths; отсутствие fast-path обхода, изменение gate между двумя checks, FOR SHARE draining и all-worker rollout. Не считать B3 решённым без реального PG/Neon pool evidence.

Отдельно на изолированном полноценном PostgreSQL: две и более connections/processes, gate close при уже начавшемся createOrder, новая checkout попытка во время паузы Apply, returns/payment release/admin writers, lock timeout/deadlock/statement timeout, COMMIT disconnect и 20 concurrent requests/pool recovery. Измерить полный ~16k import с реальными размерами descriptions/KVS. Проверить видимую/quoted цену после открытия checkout и stale-cache/cart поведение на отдельном HTTP стенде.

При дефектах Claude создаёт новый review файл с exact SHA, severity, file/line, fixture/command, expected/actual, evidence и verdict, передаёт Codex. Codex исправляет отдельным local commit, обновляет этот handoff и возвращает Claude новый SHA/diff/tests. Нельзя молча переносить замечания старого full-mode stock reconcile проекта в выбранный prices-only scope. Нельзя менять existing sync/exporter или live data без нового разрешения.

Остаются: реальное concurrency/timeout/transport/HTTP подтверждение, mandatory maintenance setup и пауза всех writers, cache/quote acceptance, fresh vendor XML, hosting limits/rollback operator, storage retention и upload body/depth/CPU ограничения. Custom DB triggers на Product/KVS не аудированы на Neon: перед runtime acceptance проверить их на изолированной копии схемы, чтобы исключить сторонние price→stock side effects. M1 остаётся ограничением shared scheduled acquire; принят только при подтверждённо выключенном cron. M2 stale running требует operator investigation, не автоматической очистки lease. Миграций не требуется. До review и staging acceptance production GO отсутствует.
