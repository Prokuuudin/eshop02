# HANDOFF: Hairshop.lv → Hairshop Pro JSON/HTTPS sync

## Состояние

- Ветка: `codex/hairshop-json-https-sync`.
- Draft PR: [#14](https://github.com/Prokuuudin/eshop02/pull/14) в `main`; он supersedes #13, но #13 не изменён и не закрыт.
- Основа: HEAD Draft PR #13, `14b3d54693cf5d0cb949047f3848f8b2d2b1a41b`.
- PR #13 и его ветка не переписывались.
- Новая ветка заменяет прямое MSSQL-чтение с Hairshop Pro на protected JSON/HTTPS source.
- Production, Neon, Plesk, Hairshop.lv и MSSQL не изменялись. Merge/deploy/schedule/apply не выполнялись.

## Архитектура

Hairshop.lv запускает независимый PowerShell producer рядом с MSSQL. Он читает стандартные nopCommerce 3.90 tables под SELECT-only principal, выбирает `Deleted=0 AND Published=1` и атомарно публикует один JSON snapshot в protected HTTPS directory. Код nopCommerce и MSSQL schema не меняются.

Hairshop Pro скачивает файл с отдельным Authorization secret и выполняет всю бизнес-обработку: проверку snapshot, cutoff, mapping, дедупликацию, API batching, journals и state.

`dbo.Product.isMarkedForProSync` удалён из контракта. Вместо per-product marker используется обязательный фиксированный `SourceCreatedAfterUtc` в закрытом Hairshop Pro config. Кандидатом может стать только source Product с `CreatedOnUtc` строго позже cutoff. Cutoff не берётся из JSON, не продвигается автоматически и после первого apply закрепляется в state schema v2; drift блокируется до API.

Полное сравнение: [`JSON-HTTPS-DESIGN.md`](JSON-HTTPS-DESIGN.md).

## Source snapshot

Producer files:

- `tools/hairshop-catalog-exporter/HairshopCatalogExporter.psm1`;
- `tools/hairshop-catalog-exporter/HairshopCatalogJsonSource.psm1`;
- `tools/hairshop-catalog-exporter/Export-HairshopCatalogJson.ps1`.

Envelope schema v1 содержит source, generated timestamp, random snapshot ID, product count, encoding, SHA-256 и base64 exact UTF-8 JSON payload. Payload содержит только published Product content, product translations, category/manufacturer names and mappings и picture metadata. Price/stock отсутствуют.

Файл пишется во временный path, parse-проверяется и атомарно заменяет stable snapshot; предыдущая версия сохраняется как `.previous`.

## Consumer fail-closed checks

До Hairshop Pro API проверяются:

- `https://` URL без credentials/query/fragment;
- Authorization из отдельного absolute ACL-protected файла;
- redirects disabled;
- JSON Content-Type;
- envelope/payload byte limits;
- exact schema/source/encoding;
- snapshot ID, freshness и future skew;
- expected source database;
- declared и minimum product counts;
- base64 и exact SHA-256;
- boolean `Published`, required content timestamps и fixed `SourceCreatedAfterUtc`;
- duplicate source legacy ID/SKU/EAN.

Scheduled mode с `ScheduleEnabled=false` завершается до чтения source secret и до HTTPS/API access.

## Сохранённые гарантии PR #13

- Dry-run по умолчанию.
- Apply требует `-Apply`, `AllowApply=true`, API secret и `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED=true`.
- API сохраняет request size limit, timing-safe secret, advisory xact lock, Serializable transaction и retry `P2034`.
- Existing Product никогда не обновляется/удаляется; soft-deleted/ambiguous identity блокируется.
- Deterministic ID, exact SKU/externalId и EAN повторно проверяются в текущей Hairshop Pro DB.
- Новый Product: `isActive=false`, `price=0`, `stock=0`, `erpPriceMissing=true`, `manualPriceApproved=false`.
- GrinS остаётся update-only и не создаёт/не связывает/не активирует Product.
- Local exclusive lock, strict API response validation, partial-failure journal и commit state только после полного успеха сохранены.
- Retry и потеря local state не создают дубликаты благодаря DB identity checks.

## Осознанный компромисс

Стандартные `Published` и `CreatedOnUtc` не выражают ручное разрешение конкретного товара для Hairshop Pro. Без marker схема безопасна только при бизнес-правиле: все новые опубликованные товары после согласованного cutoff являются кандидатами.

Если требуется per-product opt-in, нужен внешний allowlist либо marker после отдельного разрешения. Текущая реализация сама MSSQL schema не меняет.

## Проверки 2026-11-07

Локально, без production/network access:

- PowerShell exporter: `8/8` PASS.
- PowerShell JSON/sync: `15` сценариев PASS.
- Targeted Vitest: `5/5` files, `43/43` tests PASS.
- Prisma Client generation: PASS с фиктивным URL, без DB connection.
- `npm run typecheck`: PASS.
- ESLint изменённых TypeScript files PR #13: PASS.
- Full Vitest `--maxWorkers=4`: `358/358` files, `2925/2925` tests PASS.
- Historical immutable allowlists: `9/9` files, `133/133` tests PASS; canonical SHA/allowlists не менялись.

## Конфигурация Hairshop Pro

Шаблон: `tools/hairshop-catalog-exporter/catalog-sync.example.json`.

Обязательные source gates:

- `SourceSnapshotUrl`;
- `SourceAuthorizationFile`;
- `SourceCreatedAfterUtc`;
- `ExpectedSourceDatabase`;
- `MaximumSnapshotAgeMinutes` (5–1440);
- `MaximumSnapshotBytes` (1024–104857600);
- `MinimumSnapshotProductCount` (явно заданный положительный threshold).

Example cutoff и threshold являются placeholders, а не production-решением.

## Внешние блокеры

1. Владелец должен подтвердить, что после cutoff все новые published Product допустимы как кандидаты без per-product opt-in.
2. Согласовать точный `SourceCreatedAfterUtc`; его нельзя выбирать автоматически.
3. Определить protected HTTPS URL, Basic/Bearer scheme, TLS certificate и web ACL без anonymous/upload/directory listing.
4. Подтвердить SELECT-only MSSQL principal через `sql/smoke-test-json-source-readonly.sql`. DDL не требуется.
5. Установить реальный `MinimumSnapshotProductCount` по проверенному source count.
6. Отдельно разрешить любые source/consumer scheduled tasks, production dry-run и тем более apply/write gate.

## Продолжение

```powershell
Set-Location 'C:\Users\User\Desktop\eshop02\.worktrees\hairshop-json-https-sync'
git status --short --branch
git log -6 --oneline --decorate
Get-Content -Raw -Encoding UTF8 .\docs\hairshop-catalog-sync\HANDOFF.md
Get-Content -Raw -Encoding UTF8 .\docs\hairshop-catalog-sync\JSON-HTTPS-DESIGN.md
```

Следующий безопасный шаг — review Draft PR и выбор cutoff/auth/threshold. Не включать tasks, `ScheduleEnabled`, `AllowApply` или server write gate.
