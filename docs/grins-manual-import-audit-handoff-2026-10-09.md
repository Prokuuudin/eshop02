# Handoff: аудит GrinS, 9 октября 2026

Основной отчёт и инструкция администратору: [grins-manual-import-readiness-audit-2026-10-09.md](grins-manual-import-readiness-audit-2026-10-09.md).

**Вердикт NOT READY для регулярных обновлений после запуска.** Дедлайн 20.10.2026, Europe/Riga. Владелец сообщил о working staging preview со старым XML 16 025 rows; Apply на live staging не проверялся, свежего XML нет. FTPS вне задачи.

## Источник и границы

Проверен точный `release/grins-manual-import` RC `c3aec77192dbbf19204a491e76bd449f3e1e54d1`. Не использовать текущий checkout как RC: HEAD при начале аудита `7b359b1d367c338352d57945e0c062dae8f079de`, многочисленный чужой WIP, MFA/другая schema. Ничего из него не менять/не коммитить. Git читался с per-command `-c safe.directory=C:/Users/proku/OneDrive/Desktop/eshop02`; глобальная конфигурация не менялась.

Изолированный export: `test-results/grins-readiness-20261009/snapshot`; архив `rc.tar`. В snapshot создан junction node_modules к имеющимся локальным dependencies, локальный RC Prisma client и отдельный `audit-probes.ts`; последний — только evidence probe, не изменение релиза. Не удалять snapshot рекурсивно без проверки junction/absolute paths; это не запрос на cleanup.

Изменения этой задачи: два новых docs-файла и локальные test artifacts. **Код выпуска не изменён.** Production/staging DB не подключались, live Apply не запускался, migrations/install/push/merge/deploy не выполнялись. Prisma generate — только локальная генерация client из snapshot schema, с loopback DATABASE_URL. Существующий SQL schema fixture исполнен только в пустом PGlite в памяти.

## Свежие доказательства

Все пути ниже внутри `test-results/grins-readiness-20261009/` (обычно ignored Git):

| Файл | Содержание |
|---|---|
| `unit-node22.log` | 10 файлов / 150 tests PASS, Node 22.13.1, exit 0 |
| `sql.log` | 43 SQL checks PASS, Node 22.13.1, exit 0, in-memory PGlite на 127.0.0.1:54329 |
| `generate.log` | Локальный Prisma Client 7.8.0 сгенерирован из точной RC schema |
| `probes.log` | `0x10` → audit valid, parsed price 0, HARD/warnings пусты; `-1` → negativePrices=1, HARD/warnings пусты; `1e2` корректно 100 и warning |
| `unit.log` | Предварительный PASS на Node 20.10.0; заменён целевым прогоном выше |

Использован существующий `test-results/grins-schema-20261008.sql`. `git diff d8f2a222 c3aec771 -- prisma/schema.prisma` пуст; SQL fixture исторически создан для этой schema. Dependencies не устанавливались заново, поэтому нет обещания hermetic lockfile install. Deployed Node 22.23.2/Plesk/Neon в новых тестах отсутствуют.

Основная команда tests из snapshot: Node 22.13.1 → `node_modules/vitest/vitest.mjs run --config vitest.config.ts lib/sync/manual-import.test.ts lib/sync/sync-runner.test.ts lib/sync/sync-lock.test.ts lib/sync/sync-preflight.test.ts lib/sync/grins-xml-parser.test.ts lib/sync/grins-warehouse-map.test.ts lib/sync/upsert-products.test.ts app/api/admin/grins-import/routes.test.ts lib/admin-permissions.test.ts lib/api-guard.test.ts --maxWorkers=2`.

SQL: Node 22.13.1 → `node_modules/tsx/dist/cli.mjs scripts/verify-grins-manual-import-pglite.ts ../../grins-schema-20261008.sql`. Скрипт задаёт loopback URL до dynamic import Prisma, Prisma выбирает Pg adapter. Он создаёт synthetic catalog, выполняет Apply и restore **только в временной тестовой БД** и закрывает listener/client/БД в finally. Схемные миграции не нужны и не запускались.

## Главные действия для продолжения

1. Прочитать риски R1–R10 основного отчёта; получить согласование минимальных исправлений перед любыми code edits. Пользователь прямо запретил исправлять код без отдельного разрешения.
2. R1: перенести preflight/backup под одну общую authoritative lease и передавать ownership runner. Без реализации допускается лишь доказанное окно без всех writers.
3. R2: пакетный import частично commits — это подтверждено SQL. Restore атомарен для Product fields, но stock после продаж перезапишется. Не объявлять безопасным postlaunch online import без отдельного решения. Maintenance + восстановление до открытия продаж — минимальный текущий путь.
4. R3: строгий общий numeric decoder и проверка каждого warehouse slot; negatives пока не HARD. Negative policy согласовать с владельцем GrinS, не выдавать clamp за проверку данных.
5. R4: one-use preview не SHA dedup. Один файл можно загрузить заново; no-op тест верен только без intervening changes. Определить server gate для successful SHA и failed recovery policy.
6. R5: записывать actor/SHA/backupKey до первого Product write, закрыть ранние exceptions/lease cleanup. Сейчас kill может оставить только running/manual, а не расследуемую операцию.
7. R6/R7: назначить hosting/DB/catalog operators и реальные контакты, проверить full recovery scope, metadata rollback, внешний backup. Retention 5 может удалить нужный snapshot; failed attempts/повторные файлы также создают копии.
8. Выполнить секцию 7 отчёта со свежим XML на отдельной изолированной БД. Staging Apply требует **сначала доказательства DB isolation и отдельного разрешения**, даже если isolation подтверждали в старой deployment-задаче. Production запрещён.

## Что не делать

Не менять бизнес-логику/пороги ради прохождения старого XML; не считать 16 025 rows доказательством свежести; не запускать package build (содержит migrations); не стирать sync lock и не повторять Apply после timeout без worker/journal проверки; не выполнять snapshot restore поверх новых заказов; не считать UI planned changes фактически изменёнными строками. Не переносить legacy deployment NO-GO на сегодняшний staging статус и не считать владельческое сообщение независимым доказательством exact deployed SHA.

Тесты missed scenarios: HTTP disconnect и worker kill/recycle, ранние/final metadata DB failures, failure restore transaction, order/admin concurrency, full body/depth limits, redaction canary, existing/new admin runtime matrix, freshness/source verification. SQL 43/43 покрывает Product recovery при injected batch failure в quiescent synthetic DB, а не все эти сценарии.
