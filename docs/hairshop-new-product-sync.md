# Hairshop.lv → Hairshop Pro: автоматическая синхронизация новых товаров

## Что делает поток

Раз в час Windows/Plesk-клиент читает существующим SELECT-only подключением полный каталог nopCommerce 3.90, выбирает только опубликованные товары, которых ещё нет в локальном state, и отправляет их батчами в защищённый Hairshop Pro API.

API:

- никогда не обновляет существующие товары;
- не удаляет и не деактивирует товары;
- не принимает поля цены и остатка;
- проверяет legacy ID, SKU, `externalId` и EAN;
- создаёт только товар без единого identity-совпадения;
- отправляет неоднозначности и soft-deleted совпадения в отчёт;
- всегда отправляет SKU `2468BR` и `2368BR` в ручную проверку;
- сериализует параллельные apply-запросы advisory lock;
- по умолчанию работает как dry-run.

Схема Neon не меняется, миграция не требуется.

## Поля нового товара

| Источник nopCommerce | Hairshop Pro |
|---|---|
| `Product.Id` | детерминированный `Product.id = nop390-<Id>` |
| SKU | `sku` и `externalId` |
| Gtin | `barcode` |
| RU/default Name | `title` |
| LV Name | `titleLv` |
| EN Name | `titleEn` |
| RU/default description | `description` |
| LV/EN descriptions | существующие служебные поля `technicalSpecs.__descriptionLv/__descriptionEn`, уже используемые страницей товара |
| первый Manufacturer | `brand`, `manufacturerName` |
| Category mappings | консервативное сопоставление с `hair/face/body/nails/equipment`; неизвестное → `uncategorized` + warning |
| Picture mappings | HTTPS-ссылки на существующие файлы `hairshop.lv/content/images` |

Hairshop Pro не имеет отдельных колонок `descriptionLv`/`descriptionEn`, но уже использует зарезервированные ключи `technicalSpecs.__descriptionLv/__descriptionEn`; синхронизация повторно использует этот механизм без миграции. Бинарные изображения не копируются: сохраняются ссылки на старый разрешённый источник. Это минимально и не создаёт второй image storage.

Новый товар создаётся с:

```text
price = 0
stock = 0
erpPriceMissing = true
manualPriceApproved = false
isActive = true
```

Значения `price=0` и `stock=0` являются техническими обязательными значениями схемы, не данными старого магазина. Товар не считается имеющим действующую ERP-цену. Существующий GrinS sync позже обновляет цену и остаток только по точному `externalId=SKU`; код GrinS не изменён.

## Защита записи

Для реального создания одновременно требуются:

1. `mode=apply`, который PowerShell отправляет только с параметром `-Apply`;
2. `AllowApply=true` в закрытой Plesk-конфигурации;
3. `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED=true` в окружении Hairshop Pro;
4. корректный общий secret длиной минимум 32 символа.

Без любого из условий запись невозможна. Dry-run читает Product identities, но не открывает transaction записи.

## Файлы Hairshop Pro

```text
app/api/internal/hairshop-catalog-sync/route.ts
lib/sync/hairshop-new-product-sync.ts
```

Необходимые server environment variables:

```text
HAIRSHOP_CATALOG_SYNC_SECRET=<случайный секрет минимум 32 символа>
HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED=false
```

На первом этапе `WRITE_ENABLED` оставить `false`. Секрет не передавать через URL и не выводить в лог.

## Файлы Windows/Plesk

К существующему exporter добавить:

```text
D:\PrivateTools\hairshop-catalog-exporter\HairshopCatalogExporter.psm1
D:\PrivateTools\hairshop-catalog-exporter\HairshopNewProductSync.psm1
D:\PrivateTools\hairshop-catalog-exporter\Sync-HairshopNewProducts.ps1
D:\PrivateConfig\hairshop-catalog-exporter.json
D:\PrivateConfig\hairshop-catalog-sync.json
D:\PrivateConfig\hairshop-catalog-sync.key
D:\PrivateState\hairshop-catalog-sync-state.json        # создаётся после apply
D:\PrivateReports\hairshop-catalog-sync\               # JSON-журналы
```

Использовать `catalog-sync.example.json` как шаблон. Код получает MSSQL-настройки через уже существующий `hairshop-catalog-exporter.json`, поэтому второй MSSQL exporter не создаётся.

ACL:

- код — `Read & Execute` для task identity;
- конфигурация и оба secret-файла — `Read` только для task identity, SYSTEM и Administrators;
- state/reports — `Modify` для task identity;
- все пути вне webroot;
- без `IUSR`, `IIS_IUSRS`, `Everyone` и публичной раздачи.

Файл `hairshop-catalog-sync.key` содержит только тот же secret, что `HAIRSHOP_CATALOG_SYNC_SECRET`, без кавычек и дополнительных строк.

## Первый dry-run

До создания Scheduled Task вручную выполнить под будущей task identity:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "D:\PrivateTools\hairshop-catalog-exporter\Sync-HairshopNewProducts.ps1" -ConfigPath "D:\PrivateConfig\hairshop-catalog-sync.json"
```

Проверить JSON-журнал:

- `created = 0`;
- `wouldCreate` содержит только действительно отсутствующие товары;
- `alreadyExists` — однозначные существующие SKU/EAN;
- `conflicts` и `locallyRejected` разобраны вручную;
- secrets отсутствуют;
- `2468BR`/`2368BR` имеют `EXPLICIT_MANUAL_REVIEW_SKU`;
- категории `uncategorized` и отсутствующие manufacturer/images/translations видны в warnings.

Dry-run не создаёт state, поэтому его можно повторять.

## Первый apply после отдельного разрешения

Только после проверки dry-run:

1. установить `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED=true` в Hairshop Pro и применить обычным разрешённым deployment-процессом;
2. установить `AllowApply=true` в закрытом `catalog-sync.json`;
3. выполнить один ручной запуск с `-Apply`;
4. проверить созданные товары, JSON-журнал и state;
5. дождаться штатного GrinS run и проверить, что он заполнил цену/остаток по exact `externalId`, не меняя контент карточки.

Ручная apply-команда:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "D:\PrivateTools\hairshop-catalog-exporter\Sync-HairshopNewProducts.ps1" -ConfigPath "D:\PrivateConfig\hairshop-catalog-sync.json" -Apply
```

Повторный apply безопасен: обработанные legacy ID пропускаются локально, а потеря state не создаёт дубликаты, поскольку API повторно проверяет target ID/SKU/EAN.

## Plesk Scheduled Task

После успешного ручного apply создать `Run a command` раз в час, например на 17-й минуте:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "D:\PrivateTools\hairshop-catalog-exporter\Sync-HairshopNewProducts.ps1" -ConfigPath "D:\PrivateConfig\hairshop-catalog-sync.json" -Apply
```

Эксклюзивный lock рядом со state отклоняет пересекающийся запуск. Plesk должен сохранять exit code и stdout/stderr, но stdout содержит только counts и путь отчёта — не secret и не connection string.

Для остановки отключить Scheduled Task. Уже созданные товары не изменяются и не удаляются.
