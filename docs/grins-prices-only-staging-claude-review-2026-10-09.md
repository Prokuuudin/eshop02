# GrinS prices-only, подготовка staging: независимый review Claude, 9 октября 2026

Проверяемый объект: `release/grins-manual-import` @ `d0fff4931921c8fc9cde272ec7eafc2d016b6bc5`, diff от `41923c0`. Рабочая копия `.backups/grins-safety-release` чистая на этом SHA. Код не менялся. Push, merge, deploy, миграции, Neon и изменения staging/production не выполнялись.

## Вердикт: APPROVED WITH BLOCKERS

Изменения кода (OB1, L1, L2) приняты: новых дефектов уровня Medium и выше нет. Блокеры для staging — эксплуатационные предусловия, а не код. Для production по-прежнему обязателен OB2 (реальный PostgreSQL); он **не выполнен**, реального PG на машине ревьюера нет.

## Воспроизведённые проверки (Node 22.13.1; все DB URL aliases сняты; только loopback/in-memory PGlite)

| Проверка | Результат | Evidence (`test-results/claude-review-staging-2026-10-09/`) |
|---|---|---|
| 13 suites: manual-import, validation, price-query, maintenance, checkout-preparation, CLI, orders-data-store, grins routes, orders, v1 orders, import UI, checkout-order-api, parser | **212/212 PASS** без `DATABASE_URL`/`POSTGRES_*` | `unit.log` |
| SQL harness (15 000 synthetic) | **44/44 PASS** | `sql.log` |
| Crash: kill до/после commit | **2/2 PASS**, `stockChanged=0` | `crash.log` |
| Независимый end-to-end probe: реальный CLI как дочерний процесс против PGlite socket + интерпретация runtime gate | см. ниже | `cli-probe.log` |

**CLI (реальные child processes):**
- check при отсутствующей записи → exit 1 `checkout_state_missing_release_blocked`, запись не создана;
- init без `--confirm-initial-state open` или с `--expect-state closed` → отказ до подключения;
- init на пустой БД → `created:true`, `{"checkoutClosed":false}`;
- повторный check → exit 0, `value` и `updatedAt` не изменились (read-only подтверждён);
- init при существующем `true` → exit 1, `true` и `updatedAt` сохранены;
- init при malformed `"false"` → exit 1 `invalid_checkout_state`, значение не «вылечено»;
- БД недоступна → exit 1 `preparation_not_verified`, пароль из URL в выводе отсутствует.

**Runtime gate** (`assertGrinsCheckoutOpen` / `grinsMaintenanceClosed`):

| Значение | Checkout | Apply |
|---|---|---|
| отсутствует | закрыт | запрещён |
| `{"checkoutClosed":false}` (в т.ч. с лишними полями) | открыт | запрещён |
| `{"checkoutClosed":true}` | закрыт | разрешён |
| `"false"`, `0`, `{}`, `[]`, `false` | закрыт | запрещён |

Ошибка БД → обычное исключение (не `CheckoutMaintenanceError`) → 500, а не открытый checkout.

## Подтверждённые гарантии

- **OB1.** `lib/grins-checkout-preparation.ts` использует `INSERT … ON CONFLICT (key) DO NOTHING` по PK и строгое чтение после него. Существующие true/false/malformed и `updatedAt` не меняются, конкурентные вызовы дают одного создателя (PG: DO NOTHING ждёт незакоммиченную конфликтующую вставку и не перезаписывает её). Callsite только в CLI и тестах: в runtime, API, startup, build и npm lifecycle его нет. Миграции не нужны. Если авария случилась между init и стартом, в БД остаётся корректный `false`. Старый artifact эту запись игнорирует, поэтому откат безопасен. Авария до commit INSERT → запись отсутствует, runtime закрыт (fail-closed), а процедура требует повторного check.
- **L1.** Мок prisma отвергает любой неожиданный raw-доступ, а не возвращает «успех». Проверки gate и бизнес-ошибок заказа сохранены. Suite проходит без DB env.
- **L2.** 503 `checkout_maintenance` → отдельная причина → локализованный toast RU/LV/EN. Ветка `!ok` не показывает экран успеха. Прочие коды по-прежнему отображаются как раньше.
- **Prices-only.** `lib/sync/**` и API импорта в этом diff не менялись. Запрет full mode, неизменность stock/резервов, атомарность, SHA-ledger, округление и журнал подтверждены повторным прогоном SQL- и crash-harness.

## Дефекты

### D1 — LOW: `--target` декоративен (`scripts/prepare-grins-checkout-state.ts:16`)
`staging`/`production` — только метка. Защита держится исключительно на совпадении `--expected-host`/`--expected-database` с `DATABASE_URL`. Probe: `--target production` принят против `127.0.0.1`. Если оператор по ошибке подставит production URL и production host, запуск с `--target staging` пройдёт.

Минимальное исправление:
- для `--target production` требовать дополнительный флаг `--confirm-production-host <host>`, равный `--expected-host`;
- для `--target staging` отклонять host, который совпадает с переданным `--forbidden-host` (или с production host из приватной записи среды).

Для staging не блокер, до production — желательно.

### D2 — INFO (существовал раньше): EN/LV получают русский текст для insufficient_stock/network/server
`app/[lang]/checkout/checkout-order-api.ts:12-14`. L2 этого не ухудшил, вне scope. Отдельная задача i18n.

### D3 — INFO: под IIS 503 может подменяться HTML-страницей
Если IIS `httpErrors` заменит тело 503 своей страницей, клиент покажет общую ошибку вместо maintenance-сообщения. Ложного успеха не будет. Проверить на staging; при необходимости `existingResponse="PassThrough"` — это решение конфигурации хостинга, а не кода.

## Runbook (`grins-prices-only-staging-production-preparation-2026-10-09.md`)

Порядок 1–10 соблюдён: изоляция staging DB → rollback artifact → отсутствие операций → остановка workers (Plesk-процедура A) → init → read-only check → запуск workers → контрольный заказ → закрытие gate по UPDATE с `lock_timeout` → аварийный раздел. Ручного изменения production без отдельного разрешения не требуется. Инициализатор явно запрещён как средство открытия или recovery. Открытие возможно только UPDATE `true→false` по существующей проверенной записи.

Пробелы:
- **R1.** Нет явного шага **снимка БД** (Neon branch/фиксация PITR-времени) перед первым import-окном. Backup v3 покрывает только цены и одноразов. Добавить запись точки восстановления БД.
- **R2.** «Внешний checkout перевести в согласованный maintenance» (шаг 3 окна) не определяет механизм: кроме gate его нет. Либо описать конкретный механизм (IIS rule или страница), либо убрать шаг и опираться на gate + `lock_timeout` + повтор.
- **R3.** CLI требует на сервере новый source, `node_modules` с dev-зависимостями (`tsx`), сгенерированный Prisma client и ручную установку `DATABASE_URL` в процесс оператора (`.env.local` не читается). Это совместимо с вариантом A (сборка в остановленном target). Но плесковая процедура от 8 октября остаётся NO-GO без оператора с консолью. Если оператора нет, запасной вариант — тот же reviewed SQL от DB-оператора (описан).
- **R4.** M1: в окне нужен подтверждённый retry Paysera webhook после 5xx/недоступности и процедура обработки backlog. Без этого — STOP. Runbook это требует, но доказательств пока нет.

## Оставшиеся блокеры для staging (все эксплуатационные)

1. Отдельное разрешение владельца и назначенный оператор, способный выполнить CLI или reviewed SQL в подтверждённой staging identity и остановить/запустить workers.
2. Закрытые предусловия Plesk-процедуры от 8 октября: полный rollback artifact, остановка всех workers, безопасная сборка без миграций.
3. R1: зафиксированная точка восстановления staging БД.
4. R4: подтверждение retry/backlog платёжных callbacks на время окна (или окно без платёжной активности на staging).

## Блокеры для production (не меняются)

OB2 на реальном PostgreSQL, успешная staging-приёмка, D1 желателен.

## Оценка плана реального PostgreSQL

План в runbook покрывает:
- гонки init;
- сливание через FOR SHARE;
- мгновенные 503 во время Apply;
- голодание;
- M1 fault stand;
- 55P03/57014/40P01;
- terminate/disconnect;
- нагрузку ~16k.

Добавить:
- **P1.** Транспорт как в production: Prisma через `@prisma/adapter-neon` (websocket) к **pooled** endpoint (PgBouncer transaction mode), а не только локальный PG/TCP. Нужен локальный PgBouncer в transaction mode либо одноразовый отдельный Neon project по отдельному разрешению. Проверить `SET LOCAL`/`set_config(...,true)`, FOR SHARE, interactive transaction и поведение после P2028.
- **P2.** Состояние соединения после client-side timeout Prisma (P2028): сколько `idle in transaction`/active остаётся в `pg_stat_activity`, когда пул восстанавливается.
- **P3.** Несколько iisnode workers (≥2 Node-процесса) одновременно с закрытием gate.
- **P4.** Критерии GO заранее в числах: Apply < N с, новый заказ в окне → 503 < 200 мс, ноль частичных Order/stock, пул восстановлен < M с после commit.

Пока это не выполнено, OB2 открыт; ничего из этого не объявляется проверенным.

## План безопасной выкладки на staging

1. Разрешение владельца; подтвердить приватно изолированную staging identity (host/db/role); зафиксировать точку восстановления БД (R1) и rollback artifact.
2. Закрыть внешние mutations, остановить все staging workers, убедиться в отсутствии running SyncRun/lease/активных транзакций (read-only probes из runbook).
3. Доставить и собрать exact `d0fff493…` без package build/migrate.
4. CLI read-only check. Если запись отсутствует и initial open разрешён → init-if-missing → повторный check exit 0. Существующий `true` не трогать. Если CLI недоступен → reviewed SQL от DB-оператора и SELECT-проверка.
5. Запустить новые workers. Проверить startup, static и admin; контрольный синтетический заказ (open). Проверить 503 JSON через IIS (D3).
6. Отдельное окно prices-only по runbook. После него открыть gate UPDATE `true→false`, сделать контрольный заказ и сверку.
7. Любая неопределённость → gate закрыт, расследование. Не использовать init для открытия.

## Handoff для Codex

1. **D1 (рекомендуется до production):** обязательное подтверждение production host отдельным флагом и запрет известного production host при `--target staging`. Тесты child-CLI на оба отказа до импорта Prisma.
2. **Runbook:** добавить R1 (точка восстановления БД), уточнить R2 (механизм или удаление), явно прописать R4 (доказательство retry Paysera или окно без платежей), D3 (проверка 503 через IIS), дополнения P1–P4 к плану OB2.
3. Код prices-only/gate не менять без новой причины.
4. Отдельный локальный commit, обновлённый handoff, новый SHA и evidence для Claude. Запреты push/merge/deploy/Neon/реальных XML сохраняются.
