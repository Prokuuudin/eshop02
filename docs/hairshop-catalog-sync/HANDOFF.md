# HANDOFF: Hairshop.lv → Hairshop Pro catalog sync

## Цель и архитектура

Однонаправленно переносить только контент новых товарных карточек из nopCommerce 3.90 Hairshop.lv в Hairshop Pro. Источник читается отдельным SELECT-only MSSQL principal. В API попадают только строки `Product`, где одновременно `Published = 1` и `isMarkedForProSync = 1`. PowerShell-клиент работает батчами через HTTPS; API создаёт только отсутствующие товары, не обновляет и не удаляет существующие. Цены и остатки остаются под авторитетом GrinS.

Запись закрыта тремя независимыми условиями: параметр `-Apply`, закрытый Plesk config `AllowApply=true` и серверный `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED=true`. По умолчанию используется dry-run. Новые записи создаются `isActive=false`, `price=0`, `stock=0`, `erpPriceMissing=true`, поэтому до ручной проверки Hairshop Pro они недоступны покупателям.

## Реализовано

- Существовавшие до этой ветки: защищённый API, строгая Zod-схема до 100 товаров, dry-run, PostgreSQL advisory lock + Serializable transaction, deterministic target ID, SKU/EAN/legacy-ID дедупликация, локальный state, атомарные JSON-отчёты, PowerShell lock, двойной write gate, запрет price/stock в payload.
- Добавлен отдельный MSSQL режим `-ProSyncOnly`; полный snapshot-export не изменён.
- Перед запросом проверяется наличие `dbo.Product.isMarkedForProSync` и точный тип MSSQL `bit`; неопределённость блокирует запуск.
- Product SELECT ограничен `Deleted=0 AND Published=1 AND isMarkedForProSync=1`.
- Конвертер повторно требует присутствующий булев маркер; отсутствующее/небулево значение блокирует HTTP-отправку.
- Неразрешённые и неопубликованные строки исключаются, незавершённые разрешённые карточки локально отклоняются с причиной.
- Новые карточки создаются неактивными (`isActive=false`).
- Read-only smoke test проверяет поле, тип и количество разрешённых опубликованных товаров.
- `.env.example` содержит только пустой secret и выключенный write gate.

## Проверено

Локально, без production MSSQL/Neon и без сетевых запросов:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\hairshop-catalog-exporter\tests\Run-Tests.ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\tools\hairshop-catalog-exporter\tests\Run-Sync-Tests.ps1
& '.\node_modules\.bin\vitest.cmd' run --config vitest.config.ts lib/sync/hairshop-new-product-sync.test.ts app/api/internal/hairshop-catalog-sync/route.test.ts
```

Результат этапа: PowerShell exporter `8/8`, PowerShell sync `9/9`, Vitest `15/15` — PASS. Проверены разрешённые, запрещённые, неопубликованные, незавершённые, отсутствующий/невалидный маркер, повторный apply, отсутствие price/stock write и блокировка параллельного запуска.

## Изменённые файлы текущего этапа

- `.env.example`
- `lib/sync/hairshop-new-product-sync.ts`
- `lib/sync/hairshop-new-product-sync.test.ts`
- `tools/hairshop-catalog-exporter/HairshopCatalogExporter.psm1`
- `tools/hairshop-catalog-exporter/HairshopNewProductSync.psm1`
- `tools/hairshop-catalog-exporter/Sync-HairshopNewProducts.ps1`
- `tools/hairshop-catalog-exporter/sql/smoke-test-readonly.sql`
- `tools/hairshop-catalog-exporter/tests/Run-Tests.ps1`
- `tools/hairshop-catalog-exporter/tests/Run-Sync-Tests.ps1`
- `tools/hairshop-catalog-exporter/tests/fixtures/catalog-data.json`
- `docs/hairshop-new-product-sync.md`
- `docs/hairshop-catalog-exporter-first-production-run.md`
- `docs/hairshop-catalog-sync/HANDOFF.md`

## Git

- Ветка: `codex/hairshop-catalog-sync-marked`
- Проверенная база этапа: `137250addfbd3eb80bd076bc468d5ad38a911d19`
- Актуальный SHA после каждого продолжения: `git rev-parse HEAD`
- Исходное основное дерево было грязным; работа изолирована в `.worktrees/hairshop-catalog-sync-marked` и не включает чужие изменения.

## Незавершённые задачи и ограничения

- Production deployment, production Neon/MSSQL, Plesk и действующие задания не изменялись.
- Scheduler подготовлен документально, но не создавался и не активировался.
- Нужен финальный аудит частичных batch-ошибок и журналирования, затем полный локальный regression run.
- Реальная доступность MSSQL с Pro Plesk и цепочка доверия TLS неизвестны; сетевые ограничения не обходить.
- Изображения остаются HTTPS-ссылками Hairshop.lv; бинарные файлы не копируются.

## Зависимости от администратора Hairshop.lv

1. Добавить `dbo.Product.isMarkedForProSync bit NOT NULL DEFAULT (0)` и подтвердить имя/тип.
2. Создать/проверить отдельный SELECT-only MSSQL login/user без write/DDL/control ролей.
3. Разрешить запуск `smoke-test-readonly.sql` этим пользователем и передать результат без connection string/пароля.
4. Подтвердить защищённый сетевой путь Plesk → MSSQL (private network/VPN либо точечный IP allowlist, TLS без `TrustServerCertificate=True`).
5. Проставлять marker только после осознанного разрешения конкретной опубликованной карточки.

## Продолжение

```powershell
Set-Location 'C:\Users\User\Desktop\eshop02\.worktrees\hairshop-catalog-sync-marked'
git status --short --branch
git log -5 --oneline --decorate
Get-Content -Raw .\docs\hairshop-catalog-sync\HANDOFF.md
```

Следующий конкретный шаг: улучшить failure-report для частично завершённых батчей и проверить, что повторный запуск безопасно восстанавливается после ошибки второго батча.
