# GrinS: подготовка staging, 8 октября 2026

Статус: релизный кандидат собран и проверен локально; аудит кода — одобрен. Сборка и приёмка на staging не проводились. Production readiness к 20 октября не подтверждена: production `SyncRun` baseline не проверен (P0). Push/merge/deploy/миграции и удалённые операции не выполнялись.

## Ветка и состав

- Исходная ветка: `origin/main`, SHA `42409ce31bb538db8a7382dedcd3afffe73427df`.
- Релизная ветка: `release/grins-manual-import` (локальная, без push).
- MFA в RC не входит: `lib/server-auth.ts`, `Session.mfaVerified` и MFA-миграции — как в `main`. Импорт защищён правами `catalog.update` + `prices.update` (только platform admin), серверной проверкой `mustChangePassword` и Origin-guard в `proxy.ts`.
- Миграций и изменений схемы нет. Новых зависимостей нет.
- `AI_HANDOFF.md` (локальный рабочий журнал) в коммит не входит.

## Точный состав коммита (22 файла)

Ручной импорт GrinS (16):

```text
app/[lang]/admin/import/page.tsx
app/[lang]/admin/import/GrinsImportSection.tsx
app/api/admin/grins-import/auth.ts
app/api/admin/grins-import/preview/route.ts
app/api/admin/grins-import/apply/route.ts
app/api/admin/grins-import/history/route.ts
app/api/admin/grins-import/routes.test.ts
lib/sync/manual-import.ts
lib/sync/manual-import.test.ts
lib/sync/upsert-products.ts
lib/sync/upsert-products.test.ts
lib/product-mutation.test.ts
scripts/restore-grins-manual-import.ts
scripts/verify-grins-manual-import-pglite.ts
docs/grins-manual-import.md
docs/grins-manual-import-staging-2026-10-08.md
```

Исправление mapping склада 9 — коммит `aee5ac73` целиком (6):

```text
lib/sync/grins-warehouse-map.ts
lib/sync/grins-warehouse-map.test.ts
lib/sync/grins-xml-parser.test.ts
lib/sync/ftps-source-verification.ts
lib/sync/ftps-source-verification.test.ts
scripts/verify-ftps-source.ts
```

Слот 9 больше не трактуется как Елгава/10010. Продаваемый остаток не меняется: `Product.stock` = 10000 + 10001 + 10002 + 10005. На витрине Елгава и до, и после исправления показывается «нет в наличии».

Исправление гонки «заказ против сохранения формы» (stock CAS) в этот RC не входит — отдельный релиз.

## Порядок выкладки и checklist

1. До 14 октября: решение владельца о Plesk/IIS staging и операторе restore. Push/merge/deploy — отдельные разрешения.
2. P0: после отдельного разрешения выполнить read-only запрос к production, без изменения порогов:
   `SELECT "productsTotal","triggeredBy","finishedAt" FROM "SyncRun" WHERE status='completed' AND "triggeredBy" IN ('manual','cron') ORDER BY "finishedAt" DESC LIMIT 1;`
   Для имеющегося XML с 16176 строками ожидаемый baseline 13480–17973; для нового XML пересчитать диапазон по неизменённым preflight thresholds. Если baseline отсутствует/не подходит — решение владельца, без bypass.
3. Сборка: не запускать `npm run build` — он выполняет `prisma migrate deploy`. Использовать `prisma generate` + `node scripts/build-canonical-cwd.mjs` против проверенной staging-БД. Генерация страниц обращается к БД, поэтому полная сборка на staging-БД обязательна; локальная сборка на пустой PGlite не доказывает поведение на реальных данных.
4. До 17 октября: staging должен иметь собственную изолированную БД и подтверждённый fingerprint/connection target. Снимок до приёмки, закрытые внешние платежи/почта и тестовые учётные записи. Не переносить acceptance writes в production.
5. Зафиксировать effective IIS request filtering `maxAllowedContentLength`, Plesk/iisnode/ARR proxy/request/response timeout, app pool idle/recycle policy и ограничения загрузки. Значение `maxDuration=300` в route не доказывает timeout IIS. Реальный XML сейчас 8851639 bytes; проверить upload без 413 и apply без 502/504. Настроить согласованное окно не менее измеренной длительности плюс запас; ориентир 300 секунд, подтвердить нагрузочным staging-прогоном. В процессе импорта отключить scheduled sync и исключить deploy/recycle/restart. Vercel-приёмка не заменяет Plesk/IIS (лимит тела запроса Vercel 4.5 MB меньше файла).
6. Получить свежий XML непосредственно из GrinS, записать время выгрузки и SHA-256. Preview: сопоставления, изменения, missing price, дубликаты, warehouse rules; HARD=0, WARN объяснены. Preview каталог не меняет.
7. Apply: runId, status completed, errorCount=0, backupKey, duration, журнал/audit. Повторный Apply того же preview отвергается. Проверить разрыв браузерного соединения: запрос не считать отменённым, результат выяснить по журналу. На изолированной staging БД отдельно проверить recycle mid-run и восстановление после lease expiry, без рестарта production.
8. Сверить 3–5 товаров с GrinS: обычный положительный price2/stock; изменённая цена; price2=0 (старую цену сохраняет, missing ERP flag); товар только с исключёнными складами; товар с разрешёнными складами. Stock = сумма 10000/10001/10002/10005. Проверить stale editor: открыть, изменить ERP цену импортом, сохранить старую форму => 409, новая цена сохранена. Идентичный импорт => revision не меняется.
9. Проверить backupKey и число rows. Выполнить restore dry-run на изолированной staging БД, убедиться в отсутствии writes. Execute восстановления проверять только после разрешения, при остановленных заказах/резервированиях/изменениях, с контрольной сверкой stock. Назначить оператора и подтвердить Neon PITR/retention; не считать PITR проверенным по наличию документа.
10. Перед 20 октября: подписанная приёмка, доставка свежего XML и оператор назначены, P0/P1 закрыты. Первый production import и deploy — отдельные разрешения владельца.

## Откат и оставшиеся риски

Код: вернуть утверждённый предыдущий release; не перезапускать приложение во время импорта. Данные: технический partial failure — повторный импорт правильного файла после завершения/истечения lease; ошибочный файл — правильный свежий XML предпочтительнее. Restore возвращает stock до снимка и может отменить списания заказов; остановить продажи/резервирования/отмены, сохранить первую backupKey (retention 5), dry-run, разрешение оператора, execute и сверка заказов/stock. ERP extra metadata не восстанавливается. Если копии нет — согласованный PITR, без обещания доступности неподтверждённого окна.

P0: production FULL SyncRun baseline не проверен. P1: staging host/timeouts/сборка и приёмка на staging-БД; оператор restore/PITR. P2: evaluation/backup происходят до authoritative sync lock (cron должен быть остановлен; снимок одного statement не является атомарным с будущим apply); restore dry-run до lock; retention 5; отсутствие AuditLog у restore; preview error observability; UI lint warning и английские preflight messages; `.gitattributes`/CRLF.

## Проверки релизного кандидата (Node 22.13.1, только loopback/PGlite)

| Проверка | Результат |
| --- | --- |
| Целевые тесты: импорт 47 (32 + 15), upsert, product-mutation, склад/парсер, ftps-verification, sync-runner, scheduled-sync | 156/156 PASS |
| Изолированный SQL (`scripts/verify-grins-manual-import-pglite.ts`, схема `main` через `prisma migrate diff --from-empty`) | 43/43 PASS |
| Полный unit, `--maxWorkers=2` | 289/289 файлов, 2085/2085 PASS |
| Integration (`vitest.integration.config.ts`) | 3/3 PASS |
| `tsc --noEmit --incremental false` | PASS |
| eslint | 0 errors |
| security / architecture / encoding audit, `git diff --check` | PASS |
| `next build --webpack` через `scripts/build-canonical-cwd.mjs` (без migrate deploy) против пустой loopback-PGlite со схемой `main` | PASS, 615/615 страниц |
| `vitest.stock-postgres.config.ts` | не запускался: нужна локальная PostgreSQL |

Число тестов меньше, чем в рабочем дереве MFA-ветки, потому что `main` не содержит тестов других задач (competitor pricing, MFA, pagination); тесты `main` + 2 новых файла импорта запущены все.

Windows-checkout с `core.autocrlf=true` даёт 37 локальных падений тестов неизменяемых allowlist SHA (wave/backfill). В индексе все файлы в LF, CI работает на ubuntu; к RC не относится. Локально: перевыложить затронутые data-файлы в LF (`git -c core.autocrlf=false checkout -- <файлы>`).

XML локально valid, 16176 rows/unique SKU/parsed, 0 empty SKU/duplicates/invalid/negative numeric values. SHA-256 `26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad`. Это не проверка свежести и не сверка с рабочей БД или GrinS. Доступный XML имеет LastWriteTime 26 сентября 2026: для приёмки и запуска нужен новый файл из GrinS.
