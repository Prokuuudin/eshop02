# Hairshop.lv → Hairshop Pro: новые товары через JSON/HTTPS

## Назначение

Hairshop.lv не меняет nopCommerce code и MSSQL schema. Независимый read-only PowerShell producer рядом с MSSQL публикует один защищённый JSON snapshot. Hairshop Pro скачивает его по HTTPS и выполняет всю бизнес-обработку.

Подробное обоснование и сравнение с PR #13: [`hairshop-catalog-sync/JSON-HTTPS-DESIGN.md`](hairshop-catalog-sync/JSON-HTTPS-DESIGN.md).

## Правило отбора

Marker `dbo.Product.isMarkedForProSync` не используется и не требуется.

Кандидат должен одновременно:

- иметь `Deleted=0` и `Published=1` в nopCommerce;
- иметь `CreatedOnUtc` строго позже локального `SourceCreatedAfterUtc` Hairshop Pro;
- содержать Product ID, SKU, title, created/updated timestamps;
- не конфликтовать с другим source Product по legacy ID, SKU или EAN;
- не совпадать в Hairshop Pro по deterministic target ID, SKU/externalId или EAN.

`SourceCreatedAfterUtc` — ручная неизменяемая bootstrap-граница. Она обязательна, хранится только на Hairshop Pro, никогда не принимается из source snapshot и после первого apply закрепляется в state schema v2. Изменившийся cutoff блокируется до API.

## Source producer на Hairshop.lv

Файлы:

```text
HairshopCatalogExporter.psm1
HairshopCatalogJsonSource.psm1
Export-HairshopCatalogJson.ps1
```

Producer:

- использует отдельный SELECT-only principal;
- не выполняет DDL/DML;
- не читает цены и остатки;
- экспортирует только опубликованные Product и необходимые content relations;
- кодирует точный UTF-8 payload в base64 envelope с SHA-256;
- проверяет JSON и атомарно заменяет стабильный файл;
- не знает Hairshop Pro API secret.

Protected web directory должна разрешать только HTTPS GET после Basic/Bearer authorization. Запрещены HTTP, anonymous access, directory listing, redirects и upload через web.

## Consumer на Hairshop Pro

`Sync-HairshopNewProducts.ps1` сначала читает config. В scheduled mode при `ScheduleEnabled=false` он завершается до чтения authorization-файла и до сетевого запроса.

При разрешённом запуске consumer проверяет:

- HTTPS URL без credentials/query/fragment;
- Authorization из отдельного ACL-protected файла;
- отсутствие redirect;
- `Content-Type: application/json`;
- maximum bytes;
- envelope schema/source/encoding;
- snapshot timestamp и freshness;
- expected source database;
- declared/minimum product count;
- base64 и точный SHA-256 payload.

После этого выполняются cutoff, content mapping, local state, batching и существующий Hairshop Pro API.

## Безопасность записи

По умолчанию consumer работает как dry-run. Для создания одновременно требуются:

1. параметр `-Apply`;
2. `AllowApply=true` в закрытом consumer config;
3. API secret минимум 32 символа;
4. `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED=true` на Hairshop Pro.

Для scheduled apply дополнительно требуются `-Scheduled`, `ScheduleEnabled=true` и enabled external task.

API сохраняет advisory lock, Serializable transaction, retry `P2034`, строгую identity-дедупликацию и request limit. Existing products не обновляются и не удаляются.

Новая карточка создаётся:

```text
isActive = false
price = 0
stock = 0
erpPriceMissing = true
manualPriceApproved = false
```

GrinS позже обновляет только цену/остаток по exact `externalId`; он не создаёт, не связывает и не активирует карточку.

## Consumer config

Использовать `tools/hairshop-catalog-exporter/catalog-sync.example.json` как шаблон.

Ключевые поля:

```json
{
  "SourceSnapshotUrl": "https://hairshop.lv/protected-export/hairshop-pro-catalog.json",
  "SourceAuthorizationFile": "D:\\PrivateConfig\\hairshop-json-source.authorization",
  "SourceCreatedAfterUtc": "2026-11-07T00:00:00Z",
  "ExpectedSourceDatabase": "hairshop_p34s",
  "MaximumSnapshotAgeMinutes": 180,
  "MaximumSnapshotBytes": 52428800,
  "MinimumSnapshotProductCount": 2000,
  "AllowApply": false,
  "ScheduleEnabled": false
}
```

Authorization-файл содержит одну строку вида `Basic <base64>` или `Bearer <token>`. Credentials нельзя помещать в URL, config, report или stdout.

Значение cutoff в example является только placeholder. Перед использованием владелец должен утвердить реальную границу.

## Идемпотентность и восстановление

- Dry-run не пишет local state.
- Apply фиксирует state только после успешного завершения всех batches.
- При позднем сбое failure journal содержит completed/total batches, acknowledged results, `stateCommitted=false` и partial results.
- Полный retry безопасен: уже созданные строки API возвращает как `already_exists`.
- Потеря local state также не создаёт дубликат благодаря повторной DB identity-проверке.
- Повторно скачанный свежий snapshot безопасен; stale или повреждённый snapshot блокируется до API.

## Запрещённые действия в подготовленном состоянии

- не включать producer/consumer scheduled tasks;
- не устанавливать `AllowApply=true`;
- не включать server write gate;
- не выполнять production dry-run/apply без отдельного разрешения;
- не менять MSSQL schema;
- не открывать MSSQL в интернет.
