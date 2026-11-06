# HANDOFF: Hairshop.lv → Hairshop Pro catalog sync

## Текущее состояние

- Ветка: `codex/hairshop-catalog-sync-mainline`.
- Основа: актуальный на момент переноса `origin/main`, commit `dd3cec15e4c0c858352321451c7962aa01968b9c`.
- Исходная ветка `codex/hairshop-catalog-sync-marked` (`139a113ff4abfa2c921c4f4c7af86d9eff6017ea`) не переписывалась.
- Из исходной ветки перенесены только marker/write-gate/recovery изменения синхронизации. Исторические commits и посторонние изменения не переносились.
- Production, Neon, Plesk и Hairshop.lv не изменялись. Задание по расписанию не создавалось и не включалось. Запись товаров не включалась.

## Назначение и границы

Однонаправленно переносить только контент новых товарных карточек из nopCommerce 3.90 Hairshop.lv в Hairshop Pro. Источник читается отдельным SELECT-only MSSQL principal. В API допускаются только строки `dbo.Product`, у которых одновременно `Deleted = 0`, `Published = 1` и `isMarkedForProSync = 1`.

API создаёт только отсутствующие товары. Оно не обновляет и не удаляет существующие товары, не принимает цену или остаток и не связывает существующие строки эвристически. Новые товары создаются с `isActive=false`, `price=0`, `stock=0`, `erpPriceMissing=true`, `manualPriceApproved=false`. Цена и остаток остаются под авторитетом GrinS, а товар остаётся скрытым до отдельной ручной проверки.

Запись закрыта независимыми условиями: параметр `-Apply`, локальный `AllowApply=true` и серверный `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED=true`. По умолчанию используется dry-run. Для scheduled-режима дополнительно требуется `ScheduleEnabled=true`; при выключенном флаге команда завершается до MSSQL и HTTP.

## Что перенесено на mainline

- MSSQL metadata-check требует наличие `dbo.Product.isMarkedForProSync` с точным типом `bit`; отсутствие или другой тип блокирует запуск.
- Новый режим экспортера `-ProSyncOnly` использует фильтр `Deleted=0 AND Published=1 AND isMarkedForProSync=1`; обычный snapshot-export не изменён.
- Конвертер повторно проверяет marker как boolean и fail-closed отклоняет отсутствующее/невалидное значение до HTTP batching.
- API ограничивает request body размером 5 MiB до обращения к Prisma; Zod по-прежнему ограничивает batch 100 товарами.
- Новые карточки создаются неактивными. Payload по-прежнему не содержит price/stock.
- PowerShell-клиент проверяет count, identity, status, target ID и SKU каждого API-ответа до обновления локального state.
- При частичном сбое journal сохраняет подтверждённые batches и прогресс; state фиксируется только после полного успеха. Полный повтор идемпотентен.
- `-Scheduled` и независимый `ScheduleEnabled=false` добавлены только как выключенный fail-closed gate. Внешнее расписание не создавалось.

## Совместимость с текущим main

- API: сохранены текущие `withSerializableRetry` для Prisma `P2034`, PostgreSQL advisory transaction lock, `Serializable` transaction, детерминированные target IDs и storefront revalidation.
- Taxonomy v2: существующие функции и tests main сохранены; marker/recovery логика добавлена без изменения taxonomy write gate `HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED`.
- Prisma: используемые поля `Product` существуют в текущей schema; Prisma Client 7.8.0 генерируется успешно. Миграций schema в этой ветке нет.
- GrinS: текущий `lib/sync/upsert-products.ts` остаётся update-only, ищет только точный `externalId`, не создаёт и не связывает товары и не меняет `isActive`. Поэтому GrinS может позднее обновить цену/остаток импортированной строки, но не публикует её автоматически.
- `.env.example` main уже содержит пустой secret и выключенные catalog/taxonomy write gates; дублирующие строки не добавлялись.

## Проверки (2026-11-06)

Все проверки выполнены локально, без production MSSQL/Neon и без запросов к Hairshop.lv.

- PowerShell exporter: `8/8` PASS.
- PowerShell sync: `14/14` PASS, включая marker fail-closed, disabled scheduler, строгую валидацию API и recovery после частичного сбоя.
- Целевые Vitest: `43/43` PASS для product sync API/lib, taxonomy API, storefront revalidation и GrinS upsert compatibility.
- Prisma Client generation: PASS с фиктивным локальным `DATABASE_URL`; соединение с БД не выполнялось.
- `npm run typecheck`: PASS.
- ESLint изменённых TypeScript-файлов: PASS.
- Полный Vitest с `--maxWorkers=4`: `358/358` files, `2925/2925` tests PASS.
- Historical immutable allowlists отдельно: `9/9` files, `133/133` tests PASS. Проверены `controlled-first-wave`, `second-wave`, `fourth/fifth/sixth-wave`, `first/second/final new-product` и `final-existing`; эталонные SHA и allowlist-файлы не менялись.

Первый неограниченный полный Vitest-прогон дал один 5-секундный timeout в существующем PGlite-тесте `lib/sync/manual-price-query.test.ts` и связанный worker timeout. Этот файл отдельно прошёл `11/11`, после чего ограниченный полный прогон прошёл полностью. Изменений для обхода timeout не вносилось.

## Команды проверки

```powershell
Set-Location 'C:\Users\User\Desktop\eshop02\.worktrees\hairshop-catalog-sync-mainline'
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\hairshop-catalog-exporter\tests\Run-Tests.ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\hairshop-catalog-exporter\tests\Run-Sync-Tests.ps1
$env:DATABASE_URL='postgresql://generated_only:generated_only@127.0.0.1:5432/generated_only'
& '..\..\node_modules\.bin\prisma.cmd' generate
npm run typecheck
& '..\..\node_modules\.bin\vitest.cmd' run --config vitest.config.ts --maxWorkers=4
```

## Git и рабочая копия

- Mainline port commits перед финальным HANDOFF: `72853e8a` и `48364641`.
- Актуальный commit: `git rev-parse HEAD`.
- Worktree: `C:\Users\User\Desktop\eshop02\.worktrees\hairshop-catalog-sync-mainline`.
- Исходное основное дерево было грязным; работа изолирована в worktree и не включает пользовательские изменения из него.

## Оставшиеся блокеры перед реальным запуском

1. Администратор Hairshop.lv должен добавить и подтвердить `dbo.Product.isMarkedForProSync bit NOT NULL DEFAULT (0)`.
2. Нужен отдельный SELECT-only MSSQL login/user без write, DDL и control ролей.
3. Этим пользователем нужно выполнить `tools/hairshop-catalog-exporter/sql/smoke-test-readonly.sql` и передать результат без secret/connection string.
4. Нужно подтвердить защищённый сетевой путь Plesk → MSSQL и доверенную TLS-цепочку без `TrustServerCertificate=True`.
5. Только после этого можно вручную отметить конкретные опубликованные карточки и отдельно согласовать включение любого write gate или расписания.

До снятия этих блокеров не включать `ScheduleEnabled`, Plesk task, `AllowApply` или `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED`. Изображения остаются HTTPS-ссылками Hairshop.lv; бинарные файлы не копируются.

## Как продолжить

```powershell
Set-Location 'C:\Users\User\Desktop\eshop02\.worktrees\hairshop-catalog-sync-mainline'
git status --short --branch
git log -5 --oneline --decorate
Get-Content -Raw .\docs\hairshop-catalog-sync\HANDOFF.md
```

Следующий безопасный шаг — review Draft PR. Merge, production deployment и любые внешние write-операции в scope этой задачи не входят.
