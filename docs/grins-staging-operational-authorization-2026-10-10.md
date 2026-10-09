# GrinS: защищённая staging-процедура, 10 октября 2026

Основание: d0fff4931921c8fc9cde272ec7eafc2d016b6bc5 и staging review Claude от 09.10. Новый candidate SHA — commit, содержащий этот документ; получить из итогового сообщения и git rev-parse HEAD. Это **готовая процедура для запроса разрешения**, не выполненный deploy/Neon backup/import. Не было push/merge/deploy/миграций/реальных DB connections. Prices-only SQL и stock arithmetic сохранены; добавлены защитные operator-команды и диагностический UUID окна.

## D1: две независимые проверки среды

Приватный registry-файл вне Document Root/Git/backup public zip должен быть утверждён владельцем и доступен только оператору на чтение. Он содержит две среды, разные уникальные instanceId, разрешённые direct/pooled endpoints, database и schema. Не генерировать registry из случайного DATABASE_URL; пример ниже не исполним, пока placeholders не заменены настоящей утверждённой записью.

```json
{"version":1,"environments":{
 "staging":{"instanceId":"<new-staging-UUID>","hosts":["<staging-direct>","<staging-pooler>"],"database":"<staging-db>","schema":"public"},
 "production":{"instanceId":"<different-production-UUID>","hosts":["<production-direct>","<production-pooler>"],"database":"<production-db>","schema":"public"}
}}
```

UUID — идентификатор, не credential. Его создают один раз offline (`[guid]::NewGuid()`), фиксируют вместе с фактическим Neon project/branch/endpoint и меняют только при отдельно проверенной смене instance. Registry должен быть защищён ACL от записи app workers. Совпадающие UUID или endpoint registries отвергаются. --target выбирает запись файла, а не произвольные --expected-host/db; production требует отдельного `--confirm-production <production-instanceId>` даже для check. Если production URL подан со staging target, известный endpoint отвергается **до connection**.

В самой БД независимый marker: KVS key `grins-deployment-environment`, value `{"environment":"staging","instanceId":"<staging-UUID>"}`. Его первоначально provision делает только DB operator после отдельного разрешения и независимого подтверждения project/branch в панели/записи владельца. Это один DML record, не migration; обычные CLI marker не создают/не исправляют. INSERT … ON CONFLICT DO NOTHING и отдельный SELECT позволяют обнаружить существующий чужой marker. Production clone сохраняет production marker и поэтому не принимается как staging, даже при совпавших host/db в неверно составленном registry. Переклассифицировать clone можно только по отдельному reviewed действию на доказанно изолированной ветке; не обновлять production marker ради прохождения проверки.

После соединения сверяются current_database/current_schema и marker target/UUID. Marker FOR SHARE удерживается в transaction настройки; внутри каждой core Apply/resolution transaction operator-facade повторяет проверку. Смена identity во время действия блокируется SQL lock. Runtime/API не открывают checkout и не provision marker автоматически. Защита рассчитана на ошибки выбора, а не на злоумышленника с DBA и правом подмены обоих доверенных источников.

## R3: точное исполнение Windows Plesk

Нужен назначенный оператор консоли/DB. UI-only Plesk не исполняет эти команды безопасно сам; при отсутствии оператора — STOP. Физический root, Node 22.23.2 installation path/architecture, одинаковые Application/Document Root /staging-httpdocs, production mode и startup server.js подтверждает hosting operator. Не подставлять исторический C:\Inetpub путь без подтверждения. Все commands выполняются в правильном root по одной, exit 0 обязателен.

```powershell
$grinsNode = '<approved-absolute-Node22.23.2-node.exe>'
$grinsProfile = '<private-absolute-environments.json>'
$grinsId = '<approved-staging-UUID>'
& $grinsNode --version
& $grinsNode -p "process.platform + ' ' + process.arch"
Test-Path -LiteralPath '.\node_modules\tsx\dist\cli.mjs'
Test-Path -LiteralPath '.\generated\prisma\client.ts'
```

tsx используется **локальный** через `node_modules/tsx/dist/cli.mjs`, не глобальный и не npx. Prisma Client сгенерирован из exact candidate schema. CLI не читает dotenv: hosting operator задаёт именно staging DATABASE_URL в отдельном приватном process environment, сверяет independent registry/marker, не печатает secrets. Worker env отдельно сверяется с тем же instance: CLI env не доказывает IIS worker env. PORT/named pipe назначает iisnode, не задавать 3000 и не переносить CLI env в app вслепую.

До первой новой startup: приватный полный rollback artifact (source/.next/BUILD_ID/node_modules/generated/public managed assets/env/IIS/ACL/uploads); остановить **все** staging workers/автозапуск и закрыть внешний доступ без раскрытия исходников. Disable Node.js не считается доказательством безопасного maintenance. Публикация exact approved SHA только после отдельного push/deploy разрешения. Сборка (после авторизации): `npm.cmd ci --ignore-scripts --include=dev`; `& $grinsNode .\node_modules\prisma\build\index.js generate`; `& $grinsNode .\scripts\build-canonical-cwd.mjs`. Ни package build, ни migrate deploy/db push/seed не запускать. Проверить native sharp/Next, весь artifact/layout/source SHA/BUILD_ID, staging-only build/runtime env. Разрушительное cleanup запрещено; сохранить old artifact для rollback без rebuild.

До включения новых workers — verified prep check, при missing отдельно разрешённый init false только при доказанно безопасном initial open:

```powershell
& $grinsNode .\node_modules\tsx\dist\cli.mjs .\scripts\prepare-grins-checkout-state.ts --environment-profile $grinsProfile --target staging --expect-state open
# Только после отдельного initial-open разрешения при missing:
& $grinsNode .\node_modules\tsx\dist\cli.mjs .\scripts\prepare-grins-checkout-state.ts --environment-profile $grinsProfile --target staging --expect-state open --initialize --confirm-initial-state open
```

Не сбрасывать существующее true. Legacy closed без UUID управляемого окна — STOP/recovery review, не init/open. Затем включить новые workers, убедиться в отсутствии старых, проверить HTTPS/assets/admin и отдельно разрешённый synthetic smoke order без live payments/email. Проверить IIS 503 JSON: httpErrors может заменить ответ HTML; PassThrough — только отдельно разрешённая hosting конфигурация. Не менять её автоматически.

## R4: первое окно без активных платежей

1. Не создавать новые Paysera/PayPal sessions: checkout будет closed, внешние тесты gateway не выполнять. На staging использовать изолированный test merchant и синтетических покупателей, не production keys. Не «выключать подпись», не возвращать фиктивный 200 непроцессированному callback.
2. До closing/Apply сверить DB pending/unpaid provider orders с paymentSessionId/reserved orders, provider merchant portal statuses и outstanding/failed callback deliveries. Любой неизвестный/активный payment, необработанный callback/backlog, спорная cancellation → STOP. Дождаться/обработать их штатно **до** окна; не менять статус заказов предполагаемым SQL. Ноль только в локальной DB не доказывает отсутствие provider callbacks.
3. Подтвердить отсутствие returns/cancel/reservation-expiry/admin order/product/bulk writers и background sync. Не расширять gate кодом: пауза и draining — подтверждённая процедура операторов. Не блокировать callbacks в надежде на retry; для первого окна выбирается подтверждённо пустой payment поток. Webhook endpoint остаётся корректным; неожиданный callback/неизвестный writer во время окна делает приёмку NO-GO и checkout остаётся closed до сверки.

По коду: raw-body HMAC → invalid 401; malformed signed JSON 400; только event.type=order с merchant_order_id, paid/canceled вызывают updateServerOrderPayment; thin payment/refund ACK без применения. DB/config error →500. Paid терминален; canceled release условный reserved→released, duplicate не освобождает дважды. Unknown order может получить ACK200 без изменения; `paid` после ранее released не резервирует stock заново — это требует отдельного reconciliation, не считать все out-of-order события безопасными. Код платежей не переписывался.

Официальный [Checkout Modern webhook guide](https://developers.paysera.com/guides/checkout-modern/api-integration/webhooks) описывает 5xx retry/backoff, до четырёх deliveries (паузы около 1/5/25 часов), прекращение при 2xx/401 и single delivery для ручного resend. Это подтверждение документации, **не проверка вашего merchant config/фактической доставки**. Поэтому первое окно не полагается на retry. Отдельная приёмка: подписанный synthetic paid twice, canceled twice, canceled после paid, injected SQL fault→500→точная ручная повторная доставка→один release; сверить Order/stock на каждом шаге. Actual provider resend/retry проверить только после отдельного разрешения; manual resend не доказывает автоматический retry.

## R1: полноценная точка восстановления до Apply

XML/v3 backup — только guarded pricing snapshot, не DB backup. После closed/draining/payment quiescence, **до preview/apply**, сохранить полный snapshot базы и доказать restore capability.

Предпочтение: approved отдельная Neon snapshot/backup branch **из именно staging** с зафиксированным source project/branch/endpoint, UTC timestamp/LSN, snapshot/branch ID, retention/expiry и оператором. Не обещать PITR по одному timestamp: проверить plan/history window и тип ветки. [Текущая Neon restore документация](https://github.com/neondatabase/website/blob/main/content/docs/postgres/backup-restore/branch-restore.md) ограничивает instant restore root branches и предупреждает о полном overwrite всех DB/schema; child staging branch может не поддерживать этот механизм. Проверенный full logical dump — допустимая независимая альтернатива.

Для logical backup DB operator использует direct (не pooler) endpoint той же verified instance, pg_dump совместимой major-версии. Сначала env-verified CLI check closed. Один и тот же приватно зафиксированный DATABASE_URL используется для check и derivation PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD; не подставлять URL/password в command line. PGPASSWORD — только защищённый child process env, очистить/восстановить shell env после команды. Приватный путь вне Document Root, ACL/encryption обязательны.

```powershell
# DATABASE_URL уже verified, direct и неизменен; secrets не выводить.
& $grinsNode .\node_modules\tsx\dist\cli.mjs scripts/operate-grins-staging.ts --environment-profile $grinsProfile --target staging --action check --expect-state closed
if ($LASTEXITCODE -ne 0) { throw 'Wrong environment/state: no backup or Apply' }
& $grinsNode .\node_modules\tsx\dist\cli.mjs scripts/operate-grins-staging.ts --environment-profile $grinsProfile --target staging --action checkpoint
if ($LASTEXITCODE -ne 0) { throw 'Checkpoint metadata failed: no Apply' }
# Сохранить timestamp/LSN/counts приватно вместе с dump record; это не backup.
$grinsBackupUri = [uri]$env:DATABASE_URL
if ($grinsBackupUri.Host -like '*-pooler.*') { throw 'Use approved direct endpoint' }
$env:PGHOST = $grinsBackupUri.Host
$env:PGPORT = if ($grinsBackupUri.Port -gt 0) { [string]$grinsBackupUri.Port } else { '5432' }
$env:PGDATABASE = [uri]::UnescapeDataString($grinsBackupUri.AbsolutePath.TrimStart('/'))
# PGUSER/PGPASSWORD задаёт оператор из того же verified credential source, приватно.
$env:PGSSLMODE = 'require'
& '<approved-pg_dump.exe>' --format=custom --no-owner --no-acl --file '<private-staging-recovery.dump>'
if ($LASTEXITCODE -ne 0) { throw 'Backup failed: no Apply' }
Get-FileHash -LiteralPath '<private-staging-recovery.dump>' -Algorithm SHA256
& '<approved-pg_restore.exe>' --list '<private-staging-recovery.dump>'
if ($LASTEXITCODE -ne 0) { throw 'Backup TOC invalid: no Apply' }
```

TOC/hash не доказывают восстановление. Создать отдельно разрешённую **изолированную recovery rehearsal DB/branch**, восстановить туда весь dump и сравнить source/snapshot counts+hashes Product pricing+stock, Order/reservations, KVS/ERP metadata, schema/functions/triggers. Проверить auth/roles separately (--no-owner/acl не сохраняет cluster roles). Записать успешный rehearsal и длительность. Роли/credential/endpoint recovery не переключать на текущий staging. Новый clone наследует marker: registry запрещает неподтверждённую переклассификацию; DB operator присваивает отдельный recovery UUID только после доказательства новой ветки. До verified snapshot+rehearsal — NO-GO для Apply.

## R2: защищённые commands, строго последовательно

Все actions используют тот же $grinsProfile/$grinsId и verified staging DATABASE_URL. Каждая строка отдельный запуск, exit 0 обязателен. Не объединять Apply и open в finally/скрипт auto-open. Чистое окно: нет running/unknown SyncRun/lease/активных writers; DB/hosting operator подтверждают quiescence, read-only probes прежнего runbook не заменяют draining.

```powershell
# 1 Закрыть; 2 независимый read-back
& $grinsNode .\node_modules\tsx\dist\cli.mjs .\scripts\operate-grins-staging.ts --environment-profile $grinsProfile --target staging --action close --confirm-operation $grinsId --expect-state closed
& $grinsNode .\node_modules\tsx\dist\cli.mjs .\scripts\operate-grins-staging.ts --environment-profile $grinsProfile --target staging --action check --expect-state closed
# Проверить валидную checkout попытку через IIS: 503 JSON и отсутствие нового Order/debit/payment.
# 3 Snapshot/rehearsal по R1, затем preview; admin actor ID из approved admin record.
& $grinsNode .\node_modules\tsx\dist\cli.mjs .\scripts\operate-grins-staging.ts --environment-profile $grinsProfile --target staging --action preview --confirm-operation $grinsId --actor '<approved-admin-id>' --xml '<private-fresh-export.xml>'
# Сверить весь price diff/HARD/warnings, прочитать previewId/SHA из результата.
& $grinsNode .\node_modules\tsx\dist\cli.mjs .\scripts\operate-grins-staging.ts --environment-profile $grinsProfile --target staging --action apply --confirm-operation $grinsId --actor '<same-admin-id>' --preview '<previewId>' --sha256 '<XML-SHA256>' --acknowledge-price-warnings
# 4 Результат, плюс полный price/stock/order/ERP diff и HTTP/cache evidence
& $grinsNode .\node_modules\tsx\dist\cli.mjs .\scripts\operate-grins-staging.ts --environment-profile $grinsProfile --target staging --action result --run '<runId>'
# 5 Только после signed GO владельца: explicit open; 6 независимый read-back
& $grinsNode .\node_modules\tsx\dist\cli.mjs .\scripts\operate-grins-staging.ts --environment-profile $grinsProfile --target staging --action open --confirm-operation $grinsId --completed-run '<verified-runId>' --expect-state open
& $grinsNode .\node_modules\tsx\dist\cli.mjs .\scripts\operate-grins-staging.ts --environment-profile $grinsProfile --target staging --action check --expect-state open
```

Close создаёт maintenanceWindowId только при false→true. Apply записывает этот UUID в диагностику до Product work и при завершении; opener принимает только completed/errorCount0/prices-only этого окна и отсутствие failed/running в нём. Сравнение часов/SQL timestamp не используется: локальный integration обнаружил timezone discrepancy между adapter и PG. Старый completed-run или legacy closed без window UUID не открывают checkout. Существующее true не «перезакрывается» с новым UUID. Для этой guarded procedure использовать operator Apply; UI оставить для smoke/read-only inspection, UI Apply без window context opener не примет. Все операции privileged/admin-bound, не публичный endpoint, actor permissions проверяются. CLI не пишет отдельный HTTP AuditLog; SyncRun сохраняет actor/SHA/window, operator logs хранят приватно.

После открытия — отдельно разрешённый synthetic контрольный заказ: новая authoritative цена, один Order/debit/reservation, прежние snapshots не переписаны. Проверить восстановление writers, обработку безопасного backlog и pool health. Если ошибся open/check/control order — вновь закрыть при первой возможности и выяснить состояние, не продолжать новый import.

## Аварийное восстановление без потери последующих заказов

1. Gate/checkout остаются closed; при DB недоступной/unknown форме runtime fail-closed. Не init false, не стирать lease/ledger, не убивать worker без установленного commit outcome. Сохранить failed/current artifact и новый snapshot текущей БД, даже если есть старый restore point.
2. Определить running worker, durable SyncRun/ledger/backup и фактический price diff. Atomic failed rollback обычно не требует DB restore. COMMIT acknowledgment lost: completed либо unknown, HTTP500 не доказательство rollback.
3. Если нужен pricing undo — только отдельно approved v3 guarded restore при неизменном post-state; после новых заказов/правок guard может отказать. Не обходить conflict, не записывать старые stocks/Orders. Из восстановленной **новой ветки** извлечь baseline и составить reviewed price-only reconciliation с compare-and-swap текущих цен/revisions; последующие Order/reservation/payment changes сохраняются. Этот reconciliation не реализован автоматически.
4. Full restore/switch live staging допускается лишь отдельно после доказательства нуля последующих operations либо после полного подтверждённого переноса/сверки всех последующих Orders/reserves/payments/auth changes. Предпочтение restore в новую ветку и selective repair; не inplace-overwrite текущей ветки. Восстановленный dump может содержать gate=false — держать внешний доступ/все writers закрытыми и отдельно установить checked true до любого переключения workers.
5. Failed-window opener намеренно отказывает даже после ручной починки; открытие recovery — отдельный reviewed план/разрешение владельца, не подстановка старого runId. До GO DB/recovery/hosting operators продажи не открывать. Production restore/PITR исключены из staging-разрешения.

## Разрешения, которые нужны отдельно

* Publish/push approved commit и staging deploy/install/generate/build/stop/start; hosting console/env/ACL/IIS changes если потребуются.
* Provision independent environment marker и approved private registry; staging gate init/close/open.
* Staging snapshot/branch/logical dump, restore rehearsal/new recovery instance; каждое live restore/switch/selective repair — отдельное разрешение.
* Fresh XML preview/apply (DB writes), synthetic HTTP probes/control orders/auth sessions, payment test/resend, pause/drain/resume writers и проверка callback backlog.
* OB2 local services/fixtures или отдельный disposable Neon project/pooled endpoint и multi-iisnode stand; не production и не существующая staging БД для fault injection.

OB2 исполнимые сценарии и numerical acceptance — [отдельный план](grins-ob2-executable-plan-2026-10-10.md). Новый код передать Claude. READY FOR STAGING AUTHORIZATION означает готовность обсуждать эти конкретные действия, не отсутствие runtime gates и не production GO.
