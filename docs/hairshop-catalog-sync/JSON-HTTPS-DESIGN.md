# Hairshop.lv → Hairshop Pro через JSON/HTTPS

## Решение

Синхронизацию можно выполнять без изменения nopCommerce и без добавления `dbo.Product.isMarkedForProSync`.

Hairshop.lv запускает независимый PowerShell-exporter рядом с MSSQL. Он использует SELECT-only principal, выбирает только `Deleted=0 AND Published=1`, формирует один атомарно заменяемый JSON snapshot и публикует его в защищённой HTTPS-директории. Hairshop Pro скачивает snapshot и выполняет фильтрацию, преобразование, дедупликацию, dry-run/apply, журналирование и восстановление.

Отказ от marker меняет одну гарантию: больше нет ручного opt-in для каждой карточки. Его заменяет обязательная фиксированная граница `SourceCreatedAfterUtc` на стороне Hairshop Pro. Товар рассматривается только если его существующее nopCommerce-поле `CreatedOnUtc` строго больше этой границы. Граница не двигается автоматически, не берётся из входного JSON и после первого apply закрепляется в state schema v2; drift блокируется до API.

## Поток данных

1. Source task на Hairshop.lv читает стандартные таблицы nopCommerce 3.90 под SELECT-only principal.
2. Экспортируются опубликованные товары и только данные, необходимые для карточки: стандартные product fields, product translations, category/manufacturer names и mappings, picture metadata.
3. Payload сериализуется в UTF-8 JSON, его точные байты получают SHA-256 и помещаются в base64 envelope.
4. Snapshot записывается во временный файл, проверяется и атомарно заменяет стабильный файл.
5. Web server отдаёт файл только по HTTPS и только после Basic/Bearer authorization. Credentials не находятся в URL.
6. Hairshop Pro consumer запрещает redirects, проверяет HTTPS URL, Content-Type, размер, schema/source, timestamp/freshness, source DB, product count, base64 и SHA-256.
7. Consumer отбрасывает `Published=false` и `CreatedOnUtc <= SourceCreatedAfterUtc`, затем строит тот же консервативный payload для API.
8. API снова проверяет legacy target ID, exact SKU/externalId и EAN в текущем Hairshop Pro. Только строка без совпадений может быть создана.
9. Новая строка создаётся `isActive=false`, `price=0`, `stock=0`, `erpPriceMissing=true`, `manualPriceApproved=false`.

## Сохранённые гарантии

- Никаких DDL или записей в MSSQL.
- Источник использует только SELECT и не содержит Hairshop Pro API secret.
- Dry-run по умолчанию.
- Apply требует `-Apply`, `AllowApply=true`, API secret и `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED=true`.
- Scheduled run дополнительно требует `ScheduleEnabled=true` и внешний enabled task.
- Existing products никогда не обновляются и не удаляются.
- Цена/остаток не передаются; GrinS остаётся единственным авторитетом этих полей.
- Product создаётся неактивным и не появляется в storefront до ручной активации.
- Advisory lock, Serializable transaction и retry `P2034` остаются в API.
- Локальный exclusive lock, строгая проверка каждого API result, partial-failure journal и commit state только после полного успеха сохранены.
- Потеря локального state не создаёт дубликаты: API повторно проверяет deterministic ID/SKU/EAN.
- Replay свежего snapshot безопасен благодаря идемпотентности; stale snapshot блокируется.

## Что нельзя полностью заменить стандартными полями

`Published` означает публикацию в Hairshop.lv, а не разрешение на перенос в Hairshop Pro. `CreatedOnUtc` позволяет отделить будущие карточки от исторического каталога, но не выражает исключение отдельного нового товара.

Поэтому схема без marker приемлема, если бизнес-правило звучит так: «после согласованной даты все новые опубликованные товары являются кандидатами Hairshop Pro». Если нужен ручной выбор каждой карточки, стандартных полей nopCommerce недостаточно: потребуется marker либо внешний allowlist, поддерживаемый вне MSSQL.

## Сравнение

| Критерий | PR #13: прямой MSSQL + marker | JSON/HTTPS без marker |
|---|---|---|
| Hairshop.lv | DDL для нового поля, заполнение marker, MSSQL network access с Pro | Один независимый read-only exporter, protected static HTTPS location |
| nopCommerce code | Не меняется | Не меняется |
| MSSQL schema | Добавляется custom `bit` | Не меняется |
| Выбор товара | Явный per-product opt-in | `Published=1` и `CreatedOnUtc > fixed cutoff` |
| Секреты на Hairshop.lv | MSSQL reader; при прямом потоке Pro имеет MSSQL secret | Только локальный MSSQL reader и web authorization; Hairshop Pro API secret отсутствует |
| Сетевой доступ | Pro → MSSQL, требуется firewall/VPN/TLS | Pro → HTTPS 443; MSSQL остаётся локальным для Hairshop.lv |
| Нагрузка MSSQL | Каждый Pro sync читает MSSQL и relations | Source task создаёт snapshot один раз; повторные Pro dry-run не трогают MSSQL |
| Проверка целостности | DB transaction + API validation | Atomic file + freshness/size/source/count/SHA + API validation |
| Частичный сбой | Journal + idempotent retry | Те же механизмы; source snapshot неизменяем в рамках скачивания |
| Перенос Hairshop Pro | Нужно заново открывать путь к старому MSSQL | Достаточно HTTPS URL и authorization secret |
| Перенос Hairshop.lv | Нужно восстановить MSSQL route и custom column | Нужно восстановить локальный exporter и protected URL |
| Эксплуатация | Один task, но сильная сетевая/DB связанность | Два простых task; слабая связанность и легче диагностировать границу source/consumer |
| Главный риск | Ошибочная установка marker/DDL | Все новые published после cutoff становятся кандидатами |

## Минимальные действия на Hairshop.lv

1. Создать/проверить SELECT-only principal через `sql/smoke-test-json-source-readonly.sql`. Структуру БД не менять.
2. Разместить `HairshopCatalogExporter.psm1`, `HairshopCatalogJsonSource.psm1` и `Export-HairshopCatalogJson.ps1` вне nopCommerce application directory.
3. Выделить protected web directory для одного JSON-файла. Запретить directory listing, HTTP и anonymous access; не разрешать upload через web.
4. Настроить Basic/Bearer authorization и TLS с доверенной цепочкой.
5. Подготовить disabled task, который атомарно обновляет JSON. До отдельного разрешения task не включать.

Пример команды producer:

```powershell
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass `
  -File "D:\PrivateTools\hairshop-catalog-exporter\Export-HairshopCatalogJson.ps1" `
  -ExporterConfigPath "D:\PrivateConfig\hairshop-catalog-exporter.json" `
  -OutputPath "D:\ProtectedExport\hairshop-pro-catalog.json"
```

## Действия на Hairshop Pro

1. Выбрать и зафиксировать `SourceCreatedAfterUtc` до первого dry-run. Автоматически продвигать cutoff нельзя.
2. Сохранить Authorization header в ACL-protected файле вне webroot.
3. Оставить `ScheduleEnabled=false`, `AllowApply=false` и `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED=false`.
4. Выполнить ручной dry-run, проверить весь `wouldCreate`, `conflict` и `locallyRejected` список.
5. Любой apply или включение расписания требует отдельного разрешения.

## Нерешённые внешние вопросы

- Конкретный protected HTTPS URL и способ authorization.
- Начальное значение `SourceCreatedAfterUtc`.
- Минимально ожидаемое количество опубликованных товаров для `MinimumSnapshotProductCount`.
- Частота source task и допустимая свежесть `MaximumSnapshotAgeMinutes`.

До согласования этих значений схема остаётся подготовленной, но выключенной.
