# GrinS: исправления безопасности и handoff, 9 октября 2026

Исходный объект: `c3aec77192dbbf19204a491e76bd449f3e1e54d1`, ветка `release/grins-manual-import`. Кандидат для review — локальный коммит, содержащий этот документ; полный SHA получить `git rev-parse HEAD` в указанной рабочей копии и сверить с итоговым сообщением Codex. Независимая проверка Claude ещё не выполнялась. Дедлайн магазина: 20 октября 2026, Europe/Riga.

Рабочая копия релиза перенесена из `C:/Users/proku/eshop02-release-grins-manual-import` в `C:/Users/proku/OneDrive/Desktop/eshop02/.backups/grins-safety-release`. Она была чистой на исходном SHA. Основной checkout `feat/mandatory-admin-mfa` и его чужой WIP не являются источником изменений. Прочитаны оба исходных audit/handoff документа из основного checkout.

## Границы и вердикт

**Вердикт: READY FOR INDEPENDENT REVIEW.** Это подготовка к независимому review, не production readiness. Не выполнялись push, merge, staging/production deploy, подключения к Neon, реальные XML imports, изменения Plesk или FTPS. DDL существующего schema fixture выполнялся только в новых синтетических PGlite. Миграций для изменения не требуется; Prisma schema не менялась.

Scheduled Hairshop.lv runner, его preflight, parser и exporter не изменены. Ручной путь использует прежние matching/price/warehouse правила через проверенные decimal inputs и общий SQL UPDATE, но не вызывает пакетный `runSync`. Не обещается атомарность существующего scheduled runner.

## A–F: что изменено и почему

**A. Общая DB-блокировка.** До потребления preview создаётся durable SyncRun с actor, previewId, SHA и стадией acquiring; затем атомарно захватывается существующий `sync-run-lock`. Manual acquire не забирает истёкшую lease у running/неизвестного worker. В interactive transaction сначала берутся `SHARE ROW EXCLUSIVE` на Product и KeyValueSetting, затем `FOR UPDATE` строки lease и проверяется owner/срок. Preflight, snapshot и Apply находятся после этих блокировок. Блокировки таблиц действуют на PostgreSQL writers других процессов, даже если они не используют lease. Порядок table-before-row устраняет deadlock upgrade с конкурирующим INSERT lock. Deadlock с другими произвольными порядками доступа всё ещё может отменить одну транзакцию; частичного commit ручного импорта это не создаёт.

**B. Атомарность.** Все 200-row UPDATE statements, ERP metadata, version-2 backup, SHA ledger и completed marker находятся в одной транзакции. Ошибка любого statement/final marker откатывает всё. Пакеты не retry/continue и не commit отдельно. SyncRun остаётся вне этой транзакции для раннего журналирования. После ошибки отдельная resolution transaction берёт lease row lock, ждёт определённого исхода и перечитывает run: completed не переписывается failed. При невозможности resolution HTTP возвращает failed с reason=outcome_unknown, durable run остаётся running и lease намеренно сохраняется. Нельзя считать такой ответ доказательством rollback. При доказанном rollback productsSynced=0, stage=rolled_back, backupKey=null; uncommittedBackupKey — только имя отменённой транзакционной копии.

**C. Восстановление после продаж.** Backup version 2 содержит Product identity и все изменяемые поля, прежнюю ERP metadata/признак отсутствующей записи и fingerprint полного post-import Product состояния (включая revision, updatedAt, удаление, локальные товары) плюс metadata fingerprint. Execute restore повторно читает всё после блокировок. Любое отличие вызывает restore_conflict до UPDATE: заказ, отмена, возврат, admin edit, другой import, создание/удаление/relink. Это консервативный отказ целиком, без автоматического reconciliation. Restore сам атомарен, возвращает metadata, увеличивает revision и не меняет Order. Legacy backup разрешён только для dry-run; execute запрещён. Уже восстановленный backup повторно ничего не пишет и освобождает lease. SHA ledger при restore сохраняется.

Fingerprint использует встроенный PostgreSQL SHA-256 канонического DB-представления, без pgcrypto extension/миграции. XML operation identity тоже использует SHA-256. Backup не является внешним backup/PITR, и его изменение вручную не защищено этим кодом.

**D. SHA-дедупликация.** `grins-manual-import-applied:<sha256>` создаётся в той же транзакции, что каталог и completed. Проверяется под блокировками до consume. Новый preview тех же байтов и повтор после потерянного ответа получают 409 already_applied и исходный runId. Restore не разрешает повтор файла. Force endpoint отсутствует. Если повтор действительно нужен, владелец/DB operator должны отдельно согласовать свежесть, продажи/резервирования, допустимость повторного stock snapshot и reviewed точечное изменение ledger под maintenance; этот handoff не разрешает удалять ledger/lease. Новый изменённый XML — другой SHA; hash не доказывает свежесть.

Контролируемый повтор — отдельная будущая процедура: (1) сохранить original run/SHA/backup и письменную причину повторного файла; (2) подтвердить смерть/завершение всех прошлых workers и определённый commit outcome, при running/unknown остановиться; (3) закрыть writers и сверить заказы/резервирования с временем export, при несовместимости получить новую корректную выгрузку вместо повторного старого snapshot; (4) получить явное разрешение владельца именно на этот SHA и согласованный reconciliation; (5) DB operator сохраняет полный evidence/backup и под reviewed transaction проверяет точный original runId и единственную SHA ledger запись перед отдельно разрешённым точечным изменением, без общей очистки ledger или lease; (6) новый preview и обычные HARD gates, один Apply; (7) сверить каталог/metadata/journal и сохранить связь нового run с original run прежде открытия writers. Эта процедура не выполнена и не заменяет независимый review её конкретного SQL плана. Сам API не предоставляет обхода dedup.

**E. Числа и slots.** Manual-only audit принимает decimal digits с необязательной точкой и окружающими пробелами. Hex, exponent, знаки, comma/group separators, NaN/Infinity, prefix strings, missing/object values и отрицательные значения блокируются. Stock допускает только целые значения (дробная запись только с нулями), Int32 bounds проверены также для суммы включённых складов. Price ограничен Decimal(12,2) диапазоном; vendor дробная точность сохраняет прежнее rounding до cents. Positive decimal underflow до нуля отклоняется. Каждый item должен иметь ровно один из slots 1–9. `price2=0` сохраняет прежнюю цену/approval и ставит ERP missing, как раньше; положительная цена снимает manual approval. Отрицательные значения требуют решения поставщика, а не молчаливого clamp в manual Apply.

**F. Журнал и ошибки.** Initial run сохраняет actor/SHA/previewId до критических действий; перед транзакцией stage=transaction_in_progress. Committed marker содержит filename/size/backupKey, preflight metrics/warnings, planned changes и отдельный SQL affected count. Crash до commit оставляет расследуемый running с прежним каталогом; crash после commit — completed и ledger. Произвольные DB exception messages не записываются в manual journal/API operational logs: используются стабильные codes. Failed API audit имеет action catalog.grins_import_failed, а не applied. Initial journal failure блокирует работу до catalog writes; если БД недоступна, нельзя гарантировать запись диагностики в неё.

## Карта файлов и транзакционных границ

| Файл | Изменение |
|---|---|
| lib/sync/manual-import.ts | Делегирование Apply/execute restore атомарному пути; manual audit; legacy dry-run; backups без автоматической retention deletion |
| lib/sync/manual-import-atomic.ts | Общая lease, SQL transaction, resolution, SHA ledger, guarded recovery |
| lib/sync/manual-import-validation.ts | Строгие manual decimal/stock/per-item slot gates |
| app/api/admin/grins-import/apply/route.ts | 409 already_applied, failed audit action, safe operational errors |
| lib/sync/manual-import.test.ts | Обновлённые orchestration/backup/legacy tests; SQL claims вынесены в integration |
| lib/sync/manual-import-validation.test.ts | Numeric bounds/invalid forms/slots regressions |
| app/api/admin/grins-import/routes.test.ts | API replay и failed audit regressions |
| scripts/verify-grins-manual-import-pglite.ts | Совместимый entrypoint нового SQL regression |
| scripts/verify-grins-atomic-pglite.ts | Полный synthetic SQL цикл, failures, actual order, recovery, shared lease |
| scripts/verify-grins-atomic-crash.ts | Реальный child kill и reopen file-backed DB до/после commit |
| scripts/verify-grins-build-pglite.ts | Migration-free build с чистой loopback DB и allowlist env |
| этот docs-файл | Двусторонний handoff и ограничения доказательств |
| docs/grins-manual-import-readiness-audit-2026-10-09.md | Неизменённая копия исходного аудита для самостоятельного review checkout |
| docs/grins-manual-import-audit-handoff-2026-10-09.md | Неизменённая копия исходного handoff; исторический запрет edits заменён текущим явным заданием пользователя |

При успешном Apply: initial run commit → acquire lease commit → одна catalog/backup/ledger/completed transaction → owner-scoped release. При failure: catalog rollback → resolution transaction → release только после определённого исхода. При crash внутри transaction DB rollback освобождает SQL locks; durable lease остаётся до расследования. Истечение 30 минут само по себе не разрешает recovery/replay. При restore: initial restore run → shared acquire → один guarded restore/metadata/marker commit → release.

## Пути записи stock и границы защиты

| Путь | Реальная запись и взаимодействие |
|---|---|
| lib/orders-data-store.ts, customer/v1/admin order endpoints | createOrderWithSideEffects уменьшает Product.stock в общей transaction с Order; admin order editing применяет delta; reservation release/cancel/expiry увеличивает stock через условный переход Order |
| app/api/returns/[id]/route.ts | Терминальный возврат увеличивает Product.stock в transaction |
| lib/product-mutation.ts, lib/product-overrides-store.ts, admin products/bulk/import | Изменение товара/цены/stock, guarded revisions; CSV/editor writers также попадают под PostgreSQL Product table lock |
| lib/sync/sync-runner.ts, scripts/sync-products.ts | Scheduled batches пишут Product, отдельная финальная metadata transaction; общая lease препятствует штатному overlap с manual |
| manual Apply/restore | Атомарное обновление/guarded recovery, описанные выше |

Во время ручной transaction writers ждут SQL lock или получают timeout/deadlock и должны обработать ошибку. После commit каждый writer может работать нормально, но любое его изменение блокирует последующий restore. Никаких изменений бизнес-путей заказов или синхронизации в этом кандидате нет.

Сериализация во время Apply **не решает** свежесть XML: продажи между временем vendor export и началом Apply могут сделать абсолютный stock устаревшим. До operational допуска нужно maintenance/reconciliation решение владельца, актуальная выгрузка и учёт существующих резервирований. Код не вводит inventory event ledger и не утверждает безопасность бесконтрольного online stock snapshot после открытия продаж.

## Обязательная матрица ожидаемого и фактического поведения

| № / сценарий | Ожидается | Фактически / уровень доказательства |
|---|---|---|
| 1 Preview → Apply | Нет Product writes при preview, единый completed Apply | PASS, реальные SQL на 15 000 synthetic rows |
| 2 Повтор XML | 409 already_applied, прежние значения | PASS, SQL; также новый preview и replay после заказа |
| 3 Одновременный одинаковый Apply | Один committed winner | PASS, конкурентные Prisma вызовы через PGlite socket |
| 4 Два разных XML | Не более одного успеха, сохранённый latest preview | PASS, SQL single-preview semantics; PostgreSQL multi-backend contention отдельно не измерен |
| 5 Ошибка после части statements | Полный rollback | PASS, Product trigger на S7000; final marker trigger; restore mid-SQL trigger |
| 6 Ошибка до Product SQL | Отказ/failed, неизменный каталог | PASS, настоящий backup INSERT trigger и preflight reject |
| 7 Авария процесса | До commit старый каталог/running; после commit completed/new catalog | PASS, SIGKILL дочернего процесса, reopen file-backed PGlite |
| 8 Потеря ответа | committed не становится failed; replay показывает original run | PASS, SQL commit с injected lost acknowledgement + реальный after-commit kill; HTTP socket/IIS disconnect отдельно не тестировался |
| 9 Заказ → restore | Restore конфликтует, заказ/stock сохранены | PASS, настоящий createServerOrder на тестовой БД |
| 10 Некорректные числа | HARD, ошибочный ввод не становится 0 | PASS, 28 numeric/slots tests и existing evaluateFeed tests |
| 11 Failed preflight | Каталог неизменен | PASS, после preview реальные SQL изменения stock и повторный preflight |
| 12 Journal/backupKey | Атомарный completed и существующий backup; failed без ложной копии | PASS, SQL/journal проверка, canary, crash persistence |
| 13 Automatic sync | Чужая lease блокирует manual; manual release доступен cron | PASS, shared SQL lease и unchanged real scheduled runner; его собственная атомарность не изменена |
| 14 Права admin | Обе permissions обязательны, отказ до Apply | PASS, API/auth mocks; реальный HTTP/session/proxy не подтверждён |

Timeout cancellation: PASS для реального PostgreSQL SQLSTATE 57014, injected trigger после предыдущих statements. Probe показал, что PGlite не воспроизводит statement_timeout timer (pg_sleep завершился без cancellation). Реальный timer, backend termination, transport ambiguity и multi-backend lock waiting на полноценном изолированном PostgreSQL обязательны до эксплуатационного допуска. Concurrent calls на PGlite не заменяют такую проверку: движок имеет один backend.

## Проверки и воспроизведение

Использован Node 22.13.1 Windows, существующие dependencies (Next фактически 16.3.3, Prisma 7.8.0). Новый npm ci не выполнялся: это не hermetic lockfile verification и не проверка deployed Node 22.23.2. Logs находятся в ignored `test-results/` этой release worktree. Не удалять crash directories: это synthetic evidence; основной audit snapshot имеет junction и тоже не предназначен для cleanup.

* Unit/API: 262 PASS / 15 suites в расширенном прогоне; после последних API/numeric изменений 78 PASS / 3 изменённых suites (итоговый набор имеет 268 tests).
* SQL: **40/40 PASS**, atomic-sql.log; scenarios содержат expected/actual/pass, включая error triggers, actual order и unchanged-row revision guard.
* Crash: **2/2 PASS**, atomic-crash.log; прямой SQL worker PID, kill/reopen до/после commit.
* Typecheck: **PASS** standalone tsc --noEmit --incremental false и финальный Next typecheck.
* Lint: **PASS**, полный eslint . — 0 errors / 63 warnings до устранения одной новой missing-return-type warning; финальный lint всех 11 изменённых code/test файлов — без warnings/errors. Остальные предупреждения относятся к исходному дереву.
* Encoding: **PASS**, штатный check — 1192 source files; дополнительно staged files проверены как строгий UTF-8, включая docs/scripts. Diff --check — PASS.
* Production build: **PASS**, atomic-build-pglite.log, isolated_build_finished exitCode=0, 615/615 static pages. Остаются прежние Tailwind duration warnings. Package build не запускался; migrations не выполнялись. Успех проверен после финального JSONB field-comparison исправления.

Команды запускать из release worktree под установленным Node 22.13.1; node в обычном PATH здесь 20.10.0. Для SQL с actual order использовать `node --conditions=react-server --import tsx scripts/verify-grins-manual-import-pglite.ts <absolute schema fixture>` (при CLI respawn передать также NODE_OPTIONS=--conditions=react-server). Crash: `node --import tsx scripts/verify-grins-atomic-crash.ts <schema>`. Build: `node --import tsx scripts/verify-grins-build-pglite.ts <schema>`.

Crash harness запускает SQL worker непосредственно через `--import tsx`, проверяет IPC pid=spawned pid и только затем SIGKILL/exit/reopen. Не принимать kill CLI wrapper за доказательство смерти DB worker. Startup deadline тестового harness 180 секунд относится к seed/evaluation под нагрузкой, не к DB/application timeout.

Schema fixture: основной workspace `test-results/grins-schema-20261008.sql`, соответствует исходной RC schema. Скрипты задают только 127.0.0.1:54329/54330/54331 и synthetic credentials. Ни один не читает .env.local. Build child получает allowlist env; package build **запрещён для этой проверки**, поскольку содержит prisma migrate deploy. Harness вызывает только scripts/build-canonical-cwd.mjs → локальный Next build --webpack. Initial build с недоступным port 9 выявил существующий SSG DB dependency; build с изолированной DB отдельно подтверждается финальным evidence.

## Независимый review Claude и обратный handoff

Claude: начать с exact commit diff относительно c3aec771 и исходных R1–R10 audit/handoff, а не с текущего MFA checkout. Опровергать гарантии ниже, не принимать PASS mocks за SQL доказательство. Проверить:

1. Очередность Product/KVS table locks и lease row, expired-running owner, commit resolution и все early return/catch/finally. Отдельно воспроизвести два PG backends, зависший writer, stale runner, lock timeout/deadlock и потерю соединения при COMMIT.
2. Все Product/metadata/backup/ledger/completed statements действительно внутри одной transaction; failed/unresolved никогда не превращается в ложный success. Проверить kill до/после commit и lease cleanup после noop restore.
3. Actual order/cancel/return/admin/import paths и guard recovery, включая ABA stock, identity deletion/relink, metadata edit, legacy backups, отсутствие automatic restore. Оценить консервативный whole-catalog SHA-256 fingerprint и threat model.
4. Дедупликацию успешного SHA при новом preview, разных actor и replay после заказа; отдельную разрешённую reapply процедуру. Новая выгрузка не должна автоматически считаться свежей по новому SHA.
5. XML decimal forms, диапазоны, очень длинные числа, rounding до cents, tiny fraction stock, отрицательные данные и slots 1–9. Подтвердить этот contract со свежим vendor XML.
6. Durability initial journal и committed backup; canary redaction; planned vs affected counters; API action failed. Ошибка записи initial journal должна остановить импорт.
7. Длительность одной transaction, WAL/locks/memory и влияние на checkout/settings. Без измерения полного Neon/Plesk lifecycle не выдавать operational GO.

При замечаниях создать `docs/grins-manual-import-claude-review-2026-10-09.md`: exact SHA, verdict, severity, file/line, воспроизводимая команда/fixture, expected/actual и raw synthetic evidence paths. Не вносить молча изменения в чужой WIP. Передать Codex этот файл и исходный SHA. Codex исправляет отдельным локальным commit, обновляет этот handoff и повторно передаёт diff/test evidence Claude. Оба направления сохраняют запреты push/merge/deploy/Neon/реальных XML без отдельного разрешения.

До staging acceptance остаются fresh XML, реальная PostgreSQL concurrency/timers/transport, exact deployed Node/Neon/IIS timeouts, read-only/build policy, maintenance/recovery operator и согласование stock freshness. Body/depth/CPU upload limits из R10 не закрыты этим изменением; scoped manual logging исправлен, global scheduled/history legacy error redaction не заявляется исправленной. Backups pinned: рост KVS storage требует reviewed retention после закрытия инцидентов.
