# GrinS prices-only: подготовка staging/production и обслуживание, 9 октября 2026

**Историческая версия.** Operator-команды и среды теперь защищены registry+DB-marker; актуальная процедура: [operational authorization 10.10](grins-staging-operational-authorization-2026-10-10.md). Старые CLI commands без --environment-profile намеренно отказывают; старые raw SQL close/open не использовать как обход новой защиты.

Это **процедура будущего выполнения**, не отчёт о live-действиях. Текущая задача разрешает локальный код/тесты/документы/commit. Push/merge/deploy, подключения к Neon, изменение staging/production и реальные контрольные заказы здесь не выполнялись. Для каждой среды и каждого окна требуется отдельное разрешение владельца. Миграции не нужны.

Кандидат: локальный commit в release/grins-manual-import, содержащий этот документ; полный SHA взять из final/handoff и git rev-parse HEAD, перед выпуском сверить trusted источник. Чужой MFA/WIP checkout не использовать. Checkout-state хранится в общей БД, KVS key `grins-prices-only-maintenance`, value с **JSON boolean** checkoutClosed.

## OB1: обязательный pre-deploy gate

Runtime по-прежнему fail-closed: нет записи/неверный формат → новые заказы закрыты, Apply недоступен. Автоматического открытия при неизвестном состоянии нет. Новая установка считается подготовленной только после явной инициализации и успешного независимого check **до включения или перезапуска новых workers**. Пропуск шага — NO-GO для выкладки, а не допустимое состояние новой установки.

`scripts/prepare-grins-checkout-state.ts` по умолчанию только читает. Требует target, expected-host, expected-database и expect-state. DB identity берётся из process DATABASE_URL и сравнивается с заранее согласованной приватной записью среды; не выводить URL/пароль в чат/лог. Не брать expected identity из случайно оказавшегося в shell URL. Dotenv не загружается. Использовать отдельную операторскую консоль, проверенный root/Node и точный candidate source; наличие SSH/RDP не предполагается — нужен уполномоченный hosting/DB operator.

Инициализация разрешена только при письменном подтверждении, что начальное открытое состояние безопасно: нет незавершённого импорта, неизвестного lease/worker или действующего maintenance. Она выполняет:

```sql
INSERT INTO "KeyValueSetting" (key, value, "updatedAt")
VALUES ('grins-prices-only-maintenance', '{"checkoutClosed":false}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
```

Это не migration/seed каталога. PK сериализует одновременные inserts; существующие true/false/value/updatedAt не обновляются. После INSERT helper перечитывает запись и строго проверяет boolean. Malformed existing state не исправляется автоматически. Если существующее true не соответствует ожидаемому open, CLI завершится с exit 1 и сохранит true. **Нельзя повторной инициализацией открывать maintenance или лечить unknown state.** Для запланированного закрытого окна использовать только check с expect-state closed и расследовать происхождение состояния.

Если CLI ещё не может быть исполнен до Git-публикации нового source на hosting, штатный DB operator может выполнить **тот же заранее reviewed SQL** в подтверждённой среде, затем отдельно SELECT value и проверить JSON boolean/ровно одну запись. Новые workers не запускать, пока это не подтверждено. Нельзя публиковать приложение и надеяться на последующую вставку: именно это вызвало бы OB1.

## Подготовка staging

1. Получить отдельное разрешение на staging-подготовку/выкладку/smoke; подтвердить приватно endpoint/database/schema/роль, что это изолированная staging БД. Секреты не копировать из production. Назначить операторов приложения/БД/восстановления и канал связи.
2. Зафиксировать old SHA/BUILD_ID/config, полный rollback artifact и защищённые env/IIS/uploads. Согласовать окно, закрытие внешних mutations и остановку всех writers. Если gate отсутствует, прежняя работа checkout/состояние системы должны быть выяснены до решения initial open.
3. Из точного candidate source в приватной операторской среде выполнить read-only check ниже (ожидается exit 0 только при существующей корректной false). Missing/unexpected/malformed → остановить выпуск. Если отсутствующая запись действительно является новой подготовкой и initial open отдельно разрешён, выполнить initialize-if-missing. Существующее true не сбрасывать.

```powershell
# Только будущему оператору после разрешения; DATABASE_URL уже приватно настроен.
node --import tsx scripts/prepare-grins-checkout-state.ts --target staging --expected-host '<approved-staging-host>' --expected-database '<approved-staging-db>' --expect-state open
# Только при missing и подтверждённом initial open:
node --import tsx scripts/prepare-grins-checkout-state.ts --target staging --expected-host '<approved-staging-host>' --expected-database '<approved-staging-db>' --expect-state open --initialize --confirm-initial-state open
# Независимый повторный check, exit 0 обязателен:
node --import tsx scripts/prepare-grins-checkout-state.ts --target staging --expected-host '<approved-staging-host>' --expected-database '<approved-staging-db>' --expect-state open
```

4. По существующей отдельно согласованной Plesk-процедуре доставить **reviewed full SHA**, собрать без package build/migrate deploy, проверить полный artifact и только затем включить новые workers. Сохраняются требования одинаковых Application/Document Root, custom server.js, верного staging env и полного rollback. Не смешивать old/new workers без gate. Script инициализации не является deployment hook и не запускается через npm lifecycle.
5. Проверить startup/static/admin и gate из actual runtime DB; выполнить разрешённый контрольный staging-заказ через обычный checkout с синтетическим покупателем и изолированным платёжным/почтовым режимом. Проверить Order, price snapshot, stock debit и корректный rollback/cancel по штатной процедуре. Не делать live-платёж или отправку внешним получателям без отдельного разрешения. Этот smoke — доказательство admission, а не разрешение импорта.
6. Выполнить отдельное окно prices-only ниже со свежим XML, сверить результаты и провести post-window заказ. Сохранить timings, run/SHA/backupKey, init created/not-created и состояние gate; не прикладывать PII/XML/credentials к публичному отчёту.

## Подготовка production

1. До production **обязательны** независимый Claude review нового SHA, успешная staging-приёмка и проверка OB2/конкуренции на полноценном изолированном PostgreSQL. Текущий локальный READY FOR INDEPENDENT REVIEW не разрешает production. Подтверждённо оставить scheduler/FTPS выключенными.
2. Получить отдельное production-разрешение на настройки/выкладку/контрольный заказ и import window; зафиксировать утверждённые production identity, rollback artifact, backup/операторов/окно. Не использовать staging credentials, XML fixtures или synthetic build artifact как production release.
3. Повторить read-only pre-deploy check **production**. При missing выяснить состояние системы и отдельно разрешить initial open. Без подтверждения или при true/unknown — не открывать и не переключать новые workers. Выполнить только init-if-missing и обязательный повторный check до рестарта:

```powershell
node --import tsx scripts/prepare-grins-checkout-state.ts --target production --expected-host '<approved-production-host>' --expected-database '<approved-production-db>' --expect-state open
# Отдельно разрешённая первичная инициализация, если записи нет:
node --import tsx scripts/prepare-grins-checkout-state.ts --target production --expected-host '<approved-production-host>' --expected-database '<approved-production-db>' --expect-state open --initialize --confirm-initial-state open
node --import tsx scripts/prepare-grins-checkout-state.ts --target production --expected-host '<approved-production-host>' --expected-database '<approved-production-db>' --expect-state open
```

4. Если production уже намеренно closed, не запускать initialization expecting open. Под отдельно разрешённой выкладкой сохранить true, использовать read-only --expect-state closed и открывать только по завершённому incident/maintenance record. Инициализатор никогда не заменяет обычное управляемое открытие.
5. Выкладывать точный одобренный SHA/совместимую сборку без migrations, соблюдать полный artifact rollback и проверку всех workers. После разрешённого открытия провести заранее согласованный контролируемый заказ и штатную обработку оплаты/отмены; сверить stock/Order/price, избежать неразрешённой реальной оплаты/почты. После доказанного smoke владельцу отдельно разрешить prices-only окно.

## Окно обслуживания: оба окружения

1. **До начала:** сверить состояние gate и последний SyncRun/lease, admin audit и hosting workers. Не должно быть активного Apply/restore/старого sync, неизвестного running/outcome_unknown, активного return/cancel/reservation release, order/product admin mutation или незавершённого catalog writer. Определить все источники callbacks/expiry/background jobs; не считать отсутствие HTTP запросов доказательством отсутствия server work. Истечение lease не доказывает смерть процесса.

   Будущие read-only probes уполномоченному оператору (без XML/errorSample/PII):

   ```sql
   SELECT id,status,"triggeredBy","startedAt","finishedAt"
   FROM "SyncRun" WHERE status='running' ORDER BY "startedAt";
   SELECT value->>'runId' AS owner, value->>'lockedUntil' AS locked_until
   FROM "KeyValueSetting" WHERE key='sync-run-lock';
   SELECT pid,application_name,state,xact_start,wait_event_type,wait_event
   FROM pg_stat_activity
   WHERE datname=current_database() AND pid<>pg_backend_pid() AND xact_start IS NOT NULL;
   ```

   Running/unknown/held lease или необъяснённая transaction → STOP и сверка с реальными workers/очередями. Эти probes — моментальный снимок, а не доказательство quiescence сами по себе; нужен подтверждённый запрет новых writers и draining. Отсутствующая таблица/schema mismatch → STOP, не migration. CLI check отдельно подтверждает typed gate state.
2. **M1 — процедура, не расширенный gate:** закрыть внешний приём mutations кроме разрешённых GrinS admin endpoints, приостановить возвраты/изменения заказов/товаров/bulk и reservation expiry/release. Приостановить или надёжно буферизовать payment callbacks, подтвердить retry/повторную доставку и backlog reconciliation с провайдером. Нельзя просто терять webhook. Если безопасная пауза, отсутствие writers или retry не подтверждены — STOP. Эта задача не добавляет gate на эти операции.
3. Внешний checkout перевести в согласованный maintenance, чтобы новые FOR SHARE не мешали draining. Уполномоченный DB operator закрывает существующую запись в отдельной transaction с коротким lock_timeout:

```sql
BEGIN;
SET LOCAL lock_timeout = '10s';
UPDATE "KeyValueSetting"
SET value = jsonb_set(value, '{checkoutClosed}', 'true'::jsonb), "updatedAt" = now()
WHERE key='grins-prices-only-maintenance'
  AND jsonb_typeof(value->'checkoutClosed')='boolean'
RETURNING value;
-- Ровно одна строка, checkoutClosed=true. Иначе ROLLBACK и STOP.
COMMIT;
```

4. Дождаться **commit**, затем независимый check --expect-state closed. UPDATE ждёт FOR SHARE от ранее допущенных заказов; timeout/deadlock требует rollback/расследования, не обхода lock. Подтвердить отсутствие активных order/writer transactions по DB/worker records. Для проверки отказа отправить **валидную, авторизованную обычную checkout попытку** с корректным Origin/Turnstile/cart: ожидается 503 JSON checkout_maintenance и локализованное сообщение, отсутствуют новый Order/debit/reservation/payment/email. 401/403/validation error не доказывают gate. Контрольный запрос выполняется только по явному разрешению на runtime probe.
5. Администратор загружает свежий vendor XML в режиме «Импорт только цен». Проверить SHA/price2/диапазоны/rounding, matched/skipped counts, все HARD и подозрительные warnings. Stock changes=0; ERP warehouse data не обновляется. Старый preview или изменившийся price fingerprint требует новой проверки; не подменять XML и не ослаблять пороги.
6. Apply один раз. Не запускать другие операции до определённого результата. Журнал: prices-only, completed/errorCount=0, original SHA, v3 backup и actual/planned price counters. HTTP timeout не означает rollback; не повторять и не чистить lease/ledger.
7. Сверить полный price diff и неизменность stock, reserve/Order и ERP warehouse data, контрольные SKU/price flags/видимую цену/кэш и startup logs. Literal price2=0 сохраняет цену по прежней политике, но может влиять на ценовую продажность; это не stock update. Зафиксировать evidence и разрешение открыть checkout.
8. Только после GO в отдельной reviewed transaction вернуть **существующий проверенный true** в false; не пользоваться initialize для открытия:

```sql
BEGIN;
SET LOCAL lock_timeout = '10s';
UPDATE "KeyValueSetting"
SET value=jsonb_set(value,'{checkoutClosed}','false'::jsonb), "updatedAt"=now()
WHERE key='grins-prices-only-maintenance' AND value->'checkoutClosed'='true'::jsonb
RETURNING value;
-- Ровно одна строка с false; иначе ROLLBACK и STOP.
COMMIT;
```

9. Check --expect-state open, затем снять внешнее maintenance и возобновить writers/callback backlog штатным порядком. Выполнить отдельно разрешённый контрольный заказ: новая authoritative цена, один Order/debit, корректные reservation/payment transitions и сообщения, без повторного списания. Старые Order snapshots не переписываются. Сохранить время открытия/результат; при ошибке вновь закрыть и расследовать, не запускать import/restore автоматически.

## Авария

Failed/running/outcome_unknown, потеря ответа, отсутствующая/повреждённая запись, неожиданные writers, drift цены или timeout → внешний checkout и gate остаются закрытыми. При неопределённом gate runtime fail-closed; **не создавать false через initializer**. Сохранить SHA/run/backup/lease/worker facts и последующие операции, определить commit outcome по durable журналу/ledger и DB. Восстановление выполняется только отдельно разрешённым оператором: v3 prices-only conflict guard может отказать после любых Product changes. Не откатывать Orders/stock/БД вслепую, не удалять lease/ledger и не открывать по одному HTTP 200. Возобновление — только после доказанного исхода, сверки и решения владельца.

## План реального PostgreSQL: OB2/L3/M1

Использовать отдельный локальный PG той же major-версии, что целевой Neon, и синтетический schema/catalog; не staging/production. Проверки других проектов Neon требуют отдельного разрешения, здесь не выполнялись.

1. 8 отдельных connections/processes initialize missing: один affected=1, остальные 0, одна корректная false; повтор и существующая true/malformed не изменяют value/timestamp. Race initializer против uncommitted INSERT true/UPDATE true: существующая закрытая запись не перезаписана; все исходы документированы.
2. Order удерживает FOR SHARE → operator UPDATE true ждёт → order commit → UPDATE commit → Apply. Order, прошедший внешний check до закрытия, но начавший transaction после, должен получить maintenance; частичного Order/stock нет.
3. Во время paused Apply: новые customer/v1/admin orders возвращают 503 без ожидания Product-lock. Измерить latency/active pool connections, не утверждать это по PGlite. 20 потоков + closing UPDATE проверить starvation (L3), lock_timeout/повтор оператора и восстановление пула.
4. M1 в **изолированном fault стенде**: deliberately concurrent returns/reservation release/order/product edit подтверждают реальное ожидание/timeout/rollback. Для первого live окна эти операции обязаны отсутствовать; код не расширяется. Проверить сохранение/повтор webhook backlog после окна.
5. Реальные 55P03/57014/40P01, terminate backend/COMMIT disconnect, два Apply и Apply/restore. Durable completed либо unknown, никогда ложный success; открытие остаётся заблокированным до recovery.
6. 3 representative ~16k imports: lock duration, WAL, KVS sizes, Node RSS, transport delay, triggers/rules Product/KVS. Сверить полный stock/reserve/price diff и восстановление пула/контрольный order после открытия. Результаты и критерии runtime GO отдельно утверждает владелец.
