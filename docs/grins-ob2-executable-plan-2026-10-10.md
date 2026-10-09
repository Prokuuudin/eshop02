# OB2: исполнимые испытания, 10 октября 2026

## Дополнительные обязательные серии последнего ревью

Все действия ниже — только отдельно разрешённый изолированный PostgreSQL/Neon test instance с verified registry/marker; никогда production. Исходные A/B/C и numeric gates ниже сохраняются. Измерять monotonic client wall time и DB activity с шагом100ms. Эти серии **не выполнены** локальной PGlite проверкой.

| Серия и исполнимые действия | Заранее заданный GO | NO-GO |
|---|---|---|
| Preview: 3 отдельных свежих XML по15000 SKU/1000 changed; guarded CLI preview, зафиксировать start/end/RSS и pending diff | Каждый≤60s, RSS≤min(1GiB,60% host budget),0 Product/Order/stock writes; pending preview единственный актуальный | Любой timeout, write вне pending/approved audit либо exceed |
| Neon compute pause: approved operator при synthetic window closed suspend isolated compute; выполнить check/preview, затем resume и10 checks | Все ошибки bounded≤45s,0 writes wrong environment/partial state; после подтверждённого resume первый check≤30s, затем10 reads p95≤2s и≤2×baseline | Automatic open, unbounded wait, credential fallback, partial state или exceed; API pause недоступен — серия OPEN |
| Connection ceiling: DBA фиксирует actual pool/server limits; synthetic holder clients постепенно занимают100% доступного test budget, оставляя только отдельный monitor; выполнить check и Apply; затем release holders | Ceiling действительно достигнут/зафиксирован; каждый failed admission≤45s;0 partial writes; checkout closed; после освобождения все blocked/idle-in-txn≤5s и10 reads p95≤2s/≤2×baseline | Не достигнут потолок, зависший backend, open, partial writes или persistent exhausted Prisma pool |
| Canceled webhook under Apply: seed1 reserved synthetic Order; удержать Apply Product lock8s существующим delay fixture; отправить валидный подписанный canceled через actual IIS webhook в момент lock; снять задержку, дождаться outcome и повторить точный payload2раза | Firstresponse≤15s; допускается500/P2028 или200 послеwait, но DB outcome установлен. После успешной повторной доставки reservation released ровно1раз, stock +quantity ровно1раз,0 extra debit; Apply prices полностью committed либо полностью rolledback; gateclosed до reconciliation | Неизвестный outcome, double release, partial state, автоматическоеopen или предположение providerretry |
| Prisma after P2028: pause existing order prepare callback8s (default txn5s) и отдельно fault Apply с контролируемым превышением actualtimeout; повторить3раза для каждого transport. Тот же Prisma instance после ошибки делает10 reads и1 synthetic order | Реальный P2028 в targetedcase;0partial writes; rollback/closed gate; DB backend accounted≤5s после finaloutcome;10reads p95≤2s/≤2×baseline, controlorder≤5s иexact1stockdebit | Mock-only P2028, orphan tx, новая Prisma instance вместо доказательства same-pool recovery, repeatederrors или exceed |

Для connection ceiling использовать DBA-reviewed bounded holder workload с явным числом `actualLimit`, private monitor endpoint и cleanup после измерения, а не неограниченный spawn. Connection/statement/application timeout задаются **до** серии: connect≤30s, admission≤45s. PgBouncer transaction ceiling и Neon websocket Pool ceiling измеряются отдельно; configuration unknown — OPEN, не PASS. Compute pause/resume требует фактических разрешённых Neon controls; scripted provider action здесь не выполняется.

Canceled test использует локальный harness как образец signing, но actual HTTP IIS transport и≥2workers обязательны; manual harness replay не доказывает Paysera automatic retry. До live Apply двойной payment reconciliation до/после close и фактическая session lifetime обязательны.

**Не выполнены на настоящем PostgreSQL в этой задаче.** Ни один fault не запускать на production или существующей staging. Нужен отдельно разрешённый синтетический PG/Windows stand, та же PG major и package lock/client/node, что будущая цель. До production все строки matrix ниже должны иметь evidence и GO; право на staging authorization не равно OB2 PASS.

## Stand и обязательные транспорты

Матрица A: PostgreSQL direct TCP + PrismaPg. B: тот же PG через PgBouncer **pool_mode=transaction**, затем loopback WebSocket proxy /v1 + PrismaNeon, то есть порядок Node→WS proxy→PgBouncer→PG. C: после отдельного разрешения disposable non-production Neon project, **pooled** endpoint + PrismaNeon/ws/TLS. Ни B, ни C не заменять A-only результатом. Интерактивные транзакции используют Pool/Client WebSocket, не HTTP one-shot neon(): [Neon driver](https://github.com/neondatabase/serverless#sessions-transactions-and-node-postgres-compatibility). Local proxy overrides предусмотрены [driver CONFIG](https://github.com/neondatabase/serverless/blob/main/CONFIG.md); они не используются в production.

Оператор отдельно provision локальные PG/PgBouncer/wsproxy версии/ports и проверяет pool_mode через SHOW CONFIG/SHOW POOLS. Не предполагать установленный Docker/psql. Если выбран Docker, создавать отдельные volumes/containers с loopback ports и синтетическими credentials; service installation/hosts/DNS требует отдельного разрешения. WS proxy должен разрешать только 127.0.0.1:6432; никаких общедоступных relay endpoints.

Схема из exact prisma/schema.prisma должна быть provision только в пустом тестовом DB оператором. Можно использовать существующий verified SQL fixture test-results/grins-schema-20261008.sql, если доступен и hash/schema подтверждены; не migrate deploy/db push. Создать 16 000 linked synthetic Products с realistic descriptions/ERP data, stock >=100, valid price2=10; baseline completed FULL count16k; operator admin ID с test email/hash; fixture test order/reserve. Fresh synthetic XML меняет цены <=10% rows, чтобы не ослаблять production gates.

Защитные test records, только в изолированной БД: independent environment marker staging/<OB2 UUID>, gate false и `grins-ob2-test-authorized` = `{"instanceId":"<OB2 UUID>","synthetic":true}`. Approved registry instance соответствует этому **test** DB, содержит отдельную production запись; marker не provision автоматически. Код worker отказывается работать без test authorization и exact --confirm-isolated-test. Файлы XML/customer request/logs приватные; никаких production backups/credentials/PII в synthetic stand.

## Подготовленные executables

```powershell
$ob2Node = '<approved-node22.exe>'
$ob2Registry = '<private-ob2-registry.json>'
$ob2Id = '<OB2-staging-instance-UUID>'
$env:NODE_OPTIONS = '--conditions=react-server' # только отдельная test shell для server-only modules
# DATABASE_URL — только approved isolated stand, заранее приватно настроен.
& $ob2Node .\node_modules\tsx\dist\cli.mjs .\scripts\grins-ob2-worker.ts --environment-profile $ob2Registry --confirm-isolated-test $ob2Id --product ob2-p0 --pause-ms 2000
# Read-only мониторинг из отдельного psql connection (credentials только env):
& '<approved-psql.exe>' --file .\scripts\grins-ob2-monitor.sql
```

Worker вызывает **настоящий** createServerOrder/price prepare/stock transaction, не mocks. В output — orderId, elapsed или код ошибки; mail/gateway HTTP не вызывает. --pause-ms2000 держит FOR SHARE < default 5s timeout; --pause-ms8000 используется только для P2028 fault. `--release-order <synthetic-id>` вызывает настоящий payment-failed reservation release на test DB. Test-authorization marker не является разрешением работать на реальных данных.

Для B использовать URL hostname `ob2-stage.local` (approved mapping/proxy к loopback), port6432: lib/prisma тогда выбирает PrismaNeon, не localhost PrismaPg. В отдельном test process:

```powershell
$env:GRINS_OB2_LOCAL_WS = 'explicitly-approved-local-test'
# DATABASE_URL hostname ob2-stage.local:6432, database/profile/marker проверены.
& $ob2Node --import .\scripts\grins-ob2-local-ws.mjs .\node_modules\tsx\dist\cli.mjs .\scripts\grins-ob2-worker.ts --environment-profile $ob2Registry --confirm-isolated-test $ob2Id --product ob2-p0
```

Проверить сохранение preload в дочернем process; если tsx CLI не переносит Node --import, использовать в **локальном тесте** `node --import scripts/grins-ob2-local-ws.mjs --import tsx scripts/grins-ob2-worker.ts ...` и подтвердить по SDK transport logs выбор PrismaNeon/ws. Loopback insecure WS настройка запрещена для C/hosting/production; C использует штатный TLS и никаких local overrides.

## Сценарии по шагам

1. **Draining:** gate open; connection/process A запускает worker pause2000. Убедиться по pg_locks в FOR SHARE, затем process B вызывает protected operate close. Stopwatch B измеряет ожидание. A коммитится → B close commit → independent checkclosed. Число Order +1, ровно qty1 debit; инициализацией ничего не открывать. Повторить≥10 раз на A/B/C.
2. **Race двух checks:** запрос прошёл внешний gate до closing; добавить test pause перед началом create transaction в отдельной test copy/HTTP harness, не менять production code. Closing commit раньше FOR SHARE → maintenance отказ, Order/stock unchanged. 20 requests в гонке, минимум100 iterations. Где нужны timing hooks — review их и выполнить только на isolated stand.
3. **503 при Apply:** close/check/preview. В isolated fixture установить BEFORE UPDATE trigger только для ob2-p0, содержащий pg_sleep(8), и запустить protected apply. Это держит реальную Product/KVS SRE. Через≥2 IIS/iisnode workers направить 200 валидных HTTP POST /api/orders (20 concurrent lanes) с test auth/Origin/Turnstile/manual payment. Не ошибочная validation/request, а настоящий eligible checkout. Ожидаются 503 JSON + localized maintenance, без create/debit/payment. Loopback worker проверяет общий store admission; HTTP/IIS отдельный тест, его не подменять CLI.
4. **P2028/pool:** в том же paused Apply отдельно invoke worker --release-order reservedOrder (M1 fault, **не live window**) и order worker pause8000 при gate open в отдельном run. Записать actual Prisma code/elapsed, backend PID, pg_stat_activity каждые100ms из monitor connection, SHOW POOLS, Node pool counters. Проверить Order/Product на **независимом** connection: только committed operations, никаких частичных release/debit. После release/commit trigger убрать только в test DB.
5. **Lock timeout:** session A BEGIN; UPDATE test Product, удерживать>10s. B protected Apply должен получить failure от lock_timeout55P03; вся цена/stock/metadata неизменна, no completed marker. Не ждать, что PGlite симулирует timer.
6. **Statement timeout:** test trigger pg_sleep(185) или separately reviewed lowered timeout в isolated test wrapper→57014/Prisma failure; full rollback. **Deadlock:** A locks KVS row then UPDATE Product против Apply Product→KVS. Получить40P01, zero partial mutations. Сохранять exception code, не credential text.
7. **COMMIT ambiguity:** trusted monitor role terminate backend during updates/commit; отдельный network fault proxy разрывает WS during commit. Result completed с matching ledger/artifact либо outcome_unknown; никогда success без полного diff или false failed overwriting durable completed. Gate stays closed. Два Node-процесса одновременно Apply/restore и different XML — максимум один authorized catalog writer.
8. **Pool recovery:** после каждой fault дождаться commit/rollback/termination, измерить active и idle-in-transaction. Выполнить10 serial price reads и один approved control order после reopening; сравнить p95 с до-тестовым baseline. Не считать HTTP timeout освобождением backend.
9. **Multiple iisnode workers:** отдельный Windows IIS/iisnode stand с теми же Node/server.js/named-pipe PORT/handlers и≥2 доказанными worker PID. Повторить1–4 и7–8 через реальный IIS. Никаких предполагаемых counts; hosting logs+DB/application_name или private PID tracing нужны. Проверить 503 body PassThrough и отсутствие queued new orders.
10. **Performance:** убратьfault trigger, три full ~16k imports для каждого транспорта; real descriptions/KVS sizes, target Node22.23.2/architecture. Stopwatch от start Apply до completed release; DB lockduration/WALdiff, peakRSS, all stock/Order/reserves/ERP fingerprints before/after. Runbook no-active-payments/all-writers-paused должен быть воспроизведён, а не только объявлен.

## Заранее фиксированные GO/NO-GO

| Критерий | GO | NO-GO |
|---|---|---|
| Identity | Неверный target/UUID/schema/profile →0 mutations; staging-labelled known production URL отклоняется до connection | Любой bypass/marker auto-repair |
| Draining | admitted order exactlyonce; close не коммитится до его завершения; 0 partial Order/stock | Close раньше FOR SHARE release или partial writes |
| New checkout under Apply | 200/200 eligible requests =503 JSON; p95≤200ms, max≤500ms, 0 new Orders/debits/gateway calls | Любой newOrder, wrongbody либо latency exceed |
| No inventory changes | Product.stock/isActive/deleted + all Order/reserve + ERP warehouse fingerprints EXACT equality до/после Apply | Любой необъяснённый delta |
| Failure integrity | 0 partial price/Order/stock; success↔full diff↔ledger; failed/unknown gateclosed | Inconsistentjournal/data или automaticopen |
| P2028 | Actual code detected in targeted fault; 0 partial txn writes; backend observations accounted | Only mock/inferred code, unobserved orphan transaction |
| Pool recovery | После final DB outcome все blocked/idle-in-txn завершены≤5s;10 new reads p95≤2s и≤2× baseline; controlorder succeeds | Orphan>5s, persistentpool exhaustion/read regression |
| Apply performance | Все3 normal runs≤60s, SRE≤60s; RSS≤min(1GiB,60% hosting memory budget); timeout/recycle budget≥2×max normalrun | Любой exceed или неизвестныйhosting budget |
| Workers/transport | ≥2 actual IISworkers; A/B/C all measured; pooled endpoint confirmedtransaction mode; SET LOCAL/FOR SHARE honored | TCP-only/PGlite-only claim orunknownpool mode |
| M1 first live window | 0 active/queued returns/releases/admin mutations;0 active/unknownpayments/callbacks | Любой unaccountedwriter/payment |

60s разрешается только для **maintenance-only, нулевого M1 потока**; оно не означает безопасность M1 операций с default5s timeout. Если не удаётся доказать паузу всех writers — NO-GO независимо от длительности Apply. 200ms/500ms критерии относятся к измеренному application roundtrip на agreed stand; если network baseline сам превышает бюджет, менять критерий нельзя задним числом ради PASS — отдельно согласовать до новой серии.

Evidence record: exactSHA/Node/OS/PG/SDK/PgBouncer versions, config/mode fingerprints, workerPIDs, sanitized SQLSTATE/Prisma codes, request timings JSON, pg_locks/activity timeline, poolstats before/during/after, full dataset fingerprints и run/backup/ledger/Window IDs, operator/sign-off. При отсутствии любого matrix evidence OB2 остаётся OPEN. План готов к отдельно разрешённому выполнению; tests не выполнены на real PG/Neon/IIS в этом задании.
