# Hairshop.lv: автономный экспорт каталога из MSSQL

## Назначение и границы

Экспортёр читает каталог nopCommerce 3.90 из MSSQL и публикует неизменяемый XML-снимок вместе со стабильным `manifest.json`. Он не изменяет nopCommerce, MSSQL, Hairshop Pro или GrinS и не содержит импортёра Hairshop Pro.

Экспортируются неудалённые (`Product.Deleted = 0`) опубликованные и неопубликованные товары, их переводы, категории, производители, активные slug и связи с изображениями. Бинарные изображения не экспортируются. Цены и остатки не читаются и помечены в XML/manifest как неавторитетные данные, которыми продолжает управлять GrinS.

## Состав

- `tools/hairshop-catalog-exporter/Export-HairshopCatalog.ps1` — точка запуска.
- `tools/hairshop-catalog-exporter/HairshopCatalogExporter.psm1` — чтение MSSQL, проверки и публикация.
- `tools/hairshop-catalog-exporter/catalog-exporter.example.json` — конфигурация без секретов.
- `tools/hairshop-catalog-exporter/tests/Run-Tests.ps1` — автономные тесты PowerShell 5.1.
- `tools/hairshop-catalog-exporter/tests/fixtures/catalog-data.json` — тестовые данные, не production-данные.

## Модель безопасности

Скрипт использует встроенный `System.Data.SqlClient`; дополнительные модули PowerShell не нужны. В connection string принудительно устанавливаются `Application Name=HairshopCatalogExporter`, `ApplicationIntent=ReadOnly` и `Persist Security Info=False`.

До чтения каталога скрипт проверяет текущего MSSQL principal. Запуск прекращается, если principal:

- состоит в привилегированных серверных или database-ролях (`sysadmin`, `serveradmin`, `securityadmin`, `dbcreator`, `db_owner`, `db_datawriter`, `db_ddladmin`, `db_securityadmin`);
- имеет эффективные `CONTROL`, `ALTER`, `INSERT`, `UPDATE` или `DELETE` на базе;
- имеет `INSERT`, `UPDATE`, `DELETE`, `ALTER` или `CONTROL` на любой используемой таблице;
- не имеет `SELECT` на любой используемой таблице.

Проверяются таблицы `Product`, `Language`, `LocalizedProperty`, `Category`, `Product_Category_Mapping`, `Manufacturer`, `Product_Manufacturer_Mapping`, `Picture`, `Product_Picture_Mapping`, `UrlRecord`. Скрипт не создаёт пользователя и не выдаёт права.

Данные читаются в одной транзакции `ReadCommitted`, которая всегда откатывается. Для сессии задаются низкий приоритет при deadlock и ограниченный `LOCK_TIMEOUT`, поэтому экспорт уступает рабочему магазину. Если на базе уже включён `READ_COMMITTED_SNAPSHOT`, чтение получает версионное поведение без изменения настроек базы. Включать эту опцию в рамках установки экспортёра нельзя.

## Конфигурация

Скопировать пример в закрытый служебный каталог вне webroot и изменить только значения среды:

```json
{
  "DatabaseName": "hairshop_p34s",
  "ConnectionStringEnvironmentVariable": "HAIRSHOP_CATALOG_MSSQL_CONNECTION_STRING",
  "ConnectionStringFile": "",
  "OutputDirectory": "D:\\PrivateExports\\hairshop-catalog",
  "CommandTimeoutSeconds": 180,
  "LockTimeoutMilliseconds": 5000,
  "MinimumProductCount": 6500,
  "MinimumPublishedCount": 2400,
  "MinimumUnpublishedCount": 4000,
  "ExpectedProductCount": 0,
  "ExpectedPublishedCount": 0,
  "ExpectedUnpublishedCount": 0,
  "MaximumProductDropPercent": 5.0
}
```

Значение `0` у `Expected*Count` отключает точное равенство: каталог может расти. Минимумы соответствуют подтверждённому эталону 6 629 / 2 486 / 4 143 с небольшим запасом. После первого разрешённого production-запуска их следует пересмотреть по подтверждённому baseline.

### Вариант A: переменная окружения

Предпочтительный вариант — системная либо пользовательская переменная учётной записи Scheduled Task. Пример значения приведён только как шаблон:

```powershell
$env:HAIRSHOP_CATALOG_MSSQL_CONNECTION_STRING = 'Server=SERVER\INSTANCE;Database=hairshop_p34s;User ID=hairshop_catalog_reader;Password=REPLACE_ME;Encrypt=True;TrustServerCertificate=False;Connect Timeout=15'
```

Не помещать эту команду с реальным паролем в Scheduled Task, репозиторий или лог. Переменная должна быть настроена администратором сервера в защищённом контексте учётной записи задачи.

### Вариант B: защищённый secret-файл

Если окружение Plesk не позволяет безопасно передать переменную, в `ConnectionStringFile` указывается абсолютный путь к текстовому файлу, содержащему только connection string:

```json
{
  "ConnectionStringEnvironmentVariable": "",
  "ConnectionStringFile": "D:\\PrivateConfig\\hairshop-catalog-mssql.txt"
}
```

Файл обязан находиться вне `httpdocs`/webroot. ACL: `Read` только для Windows-учётной записи Scheduled Task и администраторов; без наследуемого доступа IIS/IUSR/application pool. В логах connection string не выводится.

## Формат XML

Упрощённый пример:

```xml
<?xml version="1.0" encoding="utf-8"?>
<CatalogExport SchemaVersion="1.0" Source="nopCommerce-3.90-MSSQL"
               RunId="20261028T120000000Z-a1b2c3d4"
               GeneratedAtUtc="2026-10-28T12:00:00.0000000Z">
  <Summary ProductsTotal="6629" Published="2486" Unpublished="4143"
           Languages="3" Categories="120" Manufacturers="80" PictureMappings="9000" />
  <Authority>
    <Prices>excluded-non-authoritative-use-GrinS</Prices>
    <Stock>excluded-non-authoritative-use-GrinS</Stock>
  </Authority>
  <Languages>
    <Language LanguageId="1" Name="Latviešu" Culture="lv-LV" Code="lv"
              Published="true" DisplayOrder="1" />
  </Languages>
  <Categories>
    <Category CategoryId="10" ParentCategoryId="0" Published="true" DisplayOrder="1">
      <Name>Šampūni</Name>
      <Description>...</Description>
      <LocalizedValues>...</LocalizedValues>
      <Slugs>...</Slugs>
    </Category>
  </Categories>
  <Manufacturers>...</Manufacturers>
  <Products>
    <Product ProductId="101" Published="true"
             CreatedOnUtc="2024-01-10T08:00:00.0000000Z"
             UpdatedOnUtc="2026-10-20T09:15:00.0000000Z">
      <SKU>ONKO-001</SKU>
      <EAN>4750000000101</EAN>
      <DefaultContent>
        <Name>Onko Sensitive</Name>
        <ShortDescription>...</ShortDescription>
        <FullDescription>...</FullDescription>
      </DefaultContent>
      <LocalizedValues>
        <LocalizedValue LanguageId="2" LanguageCode="ru" Key="Name">...</LocalizedValue>
      </LocalizedValues>
      <Slugs>...</Slugs>
      <CategoryMappings><Category CategoryId="10" IsFeaturedProduct="false" DisplayOrder="1" /></CategoryMappings>
      <ManufacturerMappings>...</ManufacturerMappings>
      <Pictures><Picture PictureId="501" DisplayOrder="1" MimeType="image/jpeg" SeoFilename="onko-sensitive" /></Pictures>
    </Product>
  </Products>
</CatalogExport>
```

Значения проходят XML 1.0 sanitation. Недопустимые управляющие символы и непарные surrogate заменяются на `U+FFFD`; число и контексты первых 25 замен попадают в manifest. XML пишется в строгом UTF-8 без BOM, затем повторно читается строгим UTF-8 decoder и `XmlReader` с запрещённым DTD.

## Manifest и атомарная публикация

Пример:

```json
{
  "schemaVersion": "1.0",
  "runId": "20261028T120000000Z-a1b2c3d4",
  "generatedAtUtc": "2026-10-28T12:00:00.0000000Z",
  "source": {
    "system": "nopCommerce-3.90-MSSQL",
    "database": "hairshop_p34s",
    "accessMode": "select-only"
  },
  "fileName": "catalog-20261028T120000000Z-a1b2c3d4.xml",
  "byteLength": 12345678,
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "summary": {
    "productsTotal": 6629,
    "published": 2486,
    "unpublished": 4143,
    "languages": 3,
    "categories": 120,
    "manufacturers": 80,
    "pictureMappings": 9000
  },
  "sanitization": {
    "replacementCount": 14,
    "samples": []
  },
  "authority": {
    "prices": "excluded-non-authoritative-use-GrinS",
    "stock": "excluded-non-authoritative-use-GrinS"
  }
}
```

Последовательность публикации:

1. Получить эксклюзивный `.catalog-export.lock`.
2. Проверить существующие `manifest.json`, snapshot и SHA-256.
3. Создать XML во временном файле в том же каталоге.
4. Проверить XML, количество товаров и статусы; вычислить SHA-256.
5. Атомарно переименовать XML в уникальный `catalog-<runId>.xml`.
6. Создать и проверить временный manifest.
7. Атомарно заменить стабильный `manifest.json`, сохранив предыдущий как `manifest.previous.<runId>.json`.

При любой ошибке временные файлы удаляются, а предыдущий manifest не меняется. Если сбой произойдёт после шага 5, останется безопасный, никем не опубликованный orphan XML: потребитель должен читать только файл, на который указывает `manifest.json`. Автоматическое удаление старых snapshots намеренно не реализовано.

## Локальная проверка

Из корня проекта:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\tools\hairshop-catalog-exporter\tests\Run-Tests.ps1"
```

Тесты не подключаются к MSSQL и работают во временном каталоге ОС. Они проверяют UTF-8/XML, Unicode, sanitation, связи, SHA-256, повторный запуск, дубликаты `ProductId`, неполный экспорт, эксклюзивную блокировку и сохранность стабильного manifest.

## Установка и запуск в Plesk

Разместить файлы экспортёра и конфигурацию в служебном каталоге вне webroot, например:

- код: `D:\PrivateTools\hairshop-catalog-exporter` — `Read & Execute` для task account;
- конфигурация: `D:\PrivateConfig` — `Read` для task account;
- snapshots: `D:\PrivateExports\hairshop-catalog` — `Modify` для task account;
- secret-файл, если используется: `Read` только для task account и Administrators.

Не давать IIS/IUSR/application pool доступ к secret-файлу. Каталог экспорта не должен раздаваться публично веб-сервером. Система доставки в Hairshop Pro должна получать manifest и указанный snapshot через отдельный аутентифицированный read-only канал.

Команда Plesk Scheduled Task (`Run a command`):

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "D:\PrivateTools\hairshop-catalog-exporter\Export-HairshopCatalog.ps1" -ConfigPath "D:\PrivateConfig\hairshop-catalog-exporter.json"
```

`ExecutionPolicy Bypass` действует только на этот процесс. На сервере с настроенной подписью скриптов предпочтительно подписать файлы и использовать действующую policy.

Рекомендуемое начальное расписание: один раз в сутки в `02:35` по часовому поясу сервера, вне резервного копирования и тяжёлых задач магазина. Перед включением администратор обязан подтвердить фактический timezone Plesk и отсутствие пересечения с пиковым окном GrinS. После замера длительности и нагрузки частоту можно пересмотреть.

Для остановки: в Plesk открыть Scheduled Tasks и отключить задачу. Не удалять `manifest.json`: он продолжает ссылаться на последний целостный snapshot. Экспортёр не изменяет БД, поэтому rollback БД не требуется.

## Контрольные точки первого безопасного запуска

До первого запуска на сервере владелец/администратор должен предоставить или подтвердить:

1. Отдельный MSSQL login/user, не являющийся nopCommerce admin, только с `CONNECT` и `SELECT` на перечисленных таблицах; без write/DDL/CONTROL и привилегированных ролей.
2. Фактические имена схемы/таблиц/столбцов установленной базы 3.90. Основные поля `Product.Gtin`, `Product.Published`, `Product.Deleted`, mapping-таблицы и `Picture.SeoFilename` подтверждаются историческим скриптом; `Language`, `UrlRecord` и полный набор metadata требуют read-only smoke test на этой базе.
3. Разрешение на один read-only smoke test вне пикового времени. Сначала установить завышенные минимумы либо временный отдельный output-каталог, чтобы результат не мог стать опубликованным для потребителя.
4. Windows-учётную запись Plesk task и ACL закрытых каталогов; достаточное свободное место минимум для двух полных snapshots плюс запас.
5. Способ защищённой доставки manifest/XML в Hairshop Pro. Публичный URL и общий webroot не рекомендуются.
6. Решение по изображениям: XML содержит только `PictureId`, MIME/SEO/alt/title и порядок. Для самих бинарных файлов нужен отдельный разрешённый read-only источник; этот экспортёр их не копирует.
7. Подтверждённый baseline после первого чтения: ожидается около 6 629 товаров, 2 486 опубликованных и 4 143 неопубликованных. Любое расхождение сначала анализируется, не ослабляя проверки автоматически.
8. Проверку состояния `READ_COMMITTED_SNAPSHOT` и допустимого окна нагрузки DBA. Скрипт сам не меняет эту настройку.

После smoke test проверить exit code `0`, итоговые counts, `sanitization.replacementCount`, SHA-256 и открытие XML строгим парсером. Затем вручную сравнить выборку нескольких legacy `ProductId` (включая опубликованный и неопубликованный товар), переводы, категории, производителей и изображения с nopCommerce. Только после этой точки можно разрешать регулярную задачу и отдельно проектировать потребитель Hairshop Pro.
