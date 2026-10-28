# Hairshop Catalog Exporter: первый production-запуск

Этот документ подготавливает один ручной запуск против `hairshop_p34s`. Он не разрешает выполнять SQL provisioning, запускать exporter, создавать Plesk Scheduled Task или передавать результат в Hairshop Pro без отдельного подтверждения владельца.

## 1. Результат проверки готовности

Рабочий exporter менять не требуется. Он совместим с Windows PowerShell 5.1, использует встроенный `System.Data.SqlClient`, не зависит от текущего каталога процесса и возвращает exit code `0`/`1`. Команда с абсолютными путями подходит для Plesk `Run a command`.

Exporter выполняет только:

- session-level `SET DEADLOCK_PRIORITY LOW` и `SET LOCK_TIMEOUT`;
- `SELECT` из каталога;
- rollback собственной read-only транзакции;
- запись XML/manifest только в локальный output-каталог.

Цены и остатки не запрашиваются. GrinS, Neon и Hairshop Pro в процессе не участвуют.

### Необходимые MSSQL-права

Server login должен иметь возможность подключиться к SQL Server, а database user — `CONNECT` к `hairshop_p34s` и объектный `SELECT` ровно на:

1. `dbo.Product`
2. `dbo.Language`
3. `dbo.LocalizedProperty`
4. `dbo.Category`
5. `dbo.Product_Category_Mapping`
6. `dbo.Manufacturer`
7. `dbo.Product_Manufacturer_Mapping`
8. `dbo.Picture`
9. `dbo.Product_Picture_Mapping`
10. `dbo.UrlRecord`

Не выдавать `db_datareader`: он шире требуемого набора. Не добавлять пользователя в `db_owner`, `db_datawriter`, `db_ddladmin`, `db_securityadmin` или серверные административные роли. Не выдавать `INSERT`, `UPDATE`, `DELETE`, `EXECUTE`, `ALTER`, `CONTROL`.

Подготовленный шаблон: `tools/hairshop-catalog-exporter/sql/provision-catalog-reader.sql`. Его выполняет только MSSQL-администратор. Codex этот файл не выполнял.

## 2. Действия MSSQL-администратора

### 2.1 Создать отдельный login/user

1. Открыть `provision-catalog-reader.sql` и проверить список объектов.
2. Использовать SQLCMD mode. Реальный пароль задавать только в приватной временной копии либо создать login через защищённый интерфейс SSMS и выполнить только database-секцию.
3. Использовать уникальный пароль длиной не менее 20 символов. Не сохранять заполненный файл в репозитории, webroot, тикете или журнале команд.
4. Выполнить provisioning под административной MSSQL-учётной записью.
5. Сохранить результат заключительного permission report без пароля.
6. Закрыть административное соединение.

Шаблон намеренно прекращает работу, если login или database user с таким именем уже существует: существующий principal нельзя автоматически переиспользовать без проверки.

### 2.2 Выполнить read-only schema smoke test

1. Создать новое соединение в SSMS именно как `hairshop_catalog_reader`.
2. Убедиться, что в окне соединения показана база `hairshop_p34s`.
3. Запустить `tools/hairshop-catalog-exporter/sql/smoke-test-readonly.sql` в SQLCMD mode.
4. Не запускать smoke test под администратором: он обязан доказать ограничения отдельного reader.

Ожидается:

- первая строка: `SmokeStatus = PASS`;
- `DatabaseName = hairshop_p34s`;
- `ProductsTotal` около `6629`;
- `Published` около `2486`;
- `Unpublished` около `4143`;
- ненулевые количества языков, категорий, переводов и image mappings;
- пять последних изменённых товаров без цен и остатков;
- состояние `READ_COMMITTED_SNAPSHOT` для оценки DBA.

Любой `THROW`, отсутствие столбца или несовпадение counts останавливает процедуру. Не выдавать дополнительные права и не снижать контрольные пороги до выяснения причины.

## 3. Файлы для Windows/Plesk

На production-сервер нужны только runtime-файлы:

```text
D:\PrivateTools\hairshop-catalog-exporter\Export-HairshopCatalog.ps1
D:\PrivateTools\hairshop-catalog-exporter\HairshopCatalogExporter.psm1
D:\PrivateConfig\hairshop-catalog-exporter.first-run.json
D:\PrivateConfig\hairshop-catalog-mssql.txt
D:\PrivateExports\hairshop-catalog-first-run\
```

Не переносить в runtime-каталог тестовую fixture. SQL provisioning/smoke scripts можно оставить на защищённой административной рабочей станции. Все каталоги должны находиться вне Plesk `httpdocs` и других публично раздаваемых путей.

Конфигурацию создать из `catalog-exporter.first-run.example.json`. Для первого запуска сохранить отдельный карантинный output:

```json
{
  "DatabaseName": "hairshop_p34s",
  "ConnectionStringEnvironmentVariable": "",
  "ConnectionStringFile": "D:\\PrivateConfig\\hairshop-catalog-mssql.txt",
  "OutputDirectory": "D:\\PrivateExports\\hairshop-catalog-first-run",
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

Карантинный каталог не подключать к web server, Hairshop Pro, file sync или CDN.

## 4. Windows ACL

Сначала администратор должен определить реальную Windows identity, под которой будет запускаться команда. Обозначение ниже: `SERVER\hairshop_export_task`.

Требуемые права:

| Путь | Task identity | Administrators / SYSTEM |
|---|---|---|
| `D:\PrivateTools\hairshop-catalog-exporter` | Read & Execute | Full Control |
| `D:\PrivateConfig` | Read & Execute на каталог | Full Control |
| `hairshop-catalog-exporter.first-run.json` | Read | Full Control |
| `hairshop-catalog-mssql.txt` | Read | Full Control |
| `D:\PrivateExports\hairshop-catalog-first-run` | Modify | Full Control |

Не давать доступ `Users`, `Everyone`, `IUSR`, `IIS_IUSRS` или anonymous web identities. Если Plesk запускает command той же Windows identity, что и application pool старого сайта, это нужно зафиксировать как риск: ACL уже не изолирует MSSQL secret от процесса сайта. Предпочтительна отдельная task identity.

Пример команд для администратора после подстановки подтверждённой identity; не выполнять вслепую:

```powershell
$TaskIdentity = 'SERVER\hairshop_export_task'

icacls 'D:\PrivateTools\hairshop-catalog-exporter' /inheritance:r /grant:r 'BUILTIN\Administrators:(OI)(CI)F' 'NT AUTHORITY\SYSTEM:(OI)(CI)F' "${TaskIdentity}:(OI)(CI)RX"
icacls 'D:\PrivateConfig' /inheritance:r /grant:r 'BUILTIN\Administrators:(OI)(CI)F' 'NT AUTHORITY\SYSTEM:(OI)(CI)F' "${TaskIdentity}:(OI)(CI)RX"
icacls 'D:\PrivateExports\hairshop-catalog-first-run' /inheritance:r /grant:r 'BUILTIN\Administrators:(OI)(CI)F' 'NT AUTHORITY\SYSTEM:(OI)(CI)F' "${TaskIdentity}:(OI)(CI)M"
```

После применения проверить ACL через `icacls <path>` и чтение/запись именно под task identity. Не менять ACL webroot.

## 5. Строка подключения

Для Plesk наиболее предсказуем текущий поддерживаемый exporter-вариант с защищённым secret-файлом. Файл содержит одну строку без кавычек и переносов:

```text
Server=SERVER\INSTANCE;Database=hairshop_p34s;User ID=hairshop_catalog_reader;Password=SECRET;Encrypt=True;TrustServerCertificate=False;Connect Timeout=15
```

Реальное значение создавать интерактивно в защищённом каталоге, а не командой, попадающей в shell history. Если SQL Server не имеет доверенного TLS-сертификата, параметры `Encrypt`/`TrustServerCertificate` должен отдельно подтвердить DBA; не отключать проверку сертификата молча.

Exporter не выводит connection string и принудительно задаёт `ApplicationIntent=ReadOnly`, `Application Name=HairshopCatalogExporter`, `Persist Security Info=False`. Это не заменяет SELECT-only permissions.

## 6. Однократный первый запуск

Этот шаг выполняется только после отдельного разрешения и успешного schema smoke test. Scheduled Task не создавать. Команду запустить вручную под будущей task identity:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "D:\PrivateTools\hairshop-catalog-exporter\Export-HairshopCatalog.ps1" -ConfigPath "D:\PrivateConfig\hairshop-catalog-exporter.first-run.json"
```

Это та же форма команды, которую позднее можно использовать в Plesk `Run a command`. Она не требует working directory и не содержит секретов.

Ожидаемый exit code: `0`. В stdout должны быть `RunId`, counts, число заменённых XML-символов, пути XML/manifest и SHA-256. При exit code `1` остановиться; не повторять запуск циклически и не ослаблять права/пороги.

## 7. Проверка первого snapshot

В карантинном output должны появиться:

```text
catalog-<RunId>.xml
manifest.json
.catalog-export.lock
```

Проверка SHA-256 и counts в Windows PowerShell 5.1:

```powershell
$OutputDirectory = 'D:\PrivateExports\hairshop-catalog-first-run'
$ManifestPath = Join-Path $OutputDirectory 'manifest.json'
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$XmlPath = Join-Path $OutputDirectory $Manifest.fileName

if (-not (Test-Path -LiteralPath $XmlPath -PathType Leaf)) { throw 'Manifest snapshot is missing.' }
$ActualSha256 = (Get-FileHash -LiteralPath $XmlPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ActualSha256 -ne $Manifest.sha256) { throw 'SHA-256 mismatch.' }
if ($Manifest.summary.productsTotal -lt 6500) { throw 'Product count below safety threshold.' }
if ($Manifest.summary.published -lt 2400) { throw 'Published count below safety threshold.' }
if ($Manifest.summary.unpublished -lt 4000) { throw 'Unpublished count below safety threshold.' }

$Settings = New-Object System.Xml.XmlReaderSettings
$Settings.CheckCharacters = $true
$Settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$Settings.XmlResolver = $null
$Reader = [System.Xml.XmlReader]::Create($XmlPath, $Settings)
try { while ($Reader.Read()) { } } finally { $Reader.Dispose() }

'PASS: manifest, SHA-256, counts and strict XML are valid.'
```

Затем вручную сравнить несколько `ProductId` с nopCommerce: минимум один published, один unpublished, один недавно созданный, переводы RU/LV/EN, category/manufacturer mappings и picture IDs. Проверить `sanitization.replacementCount` и samples; ожидаемое историческое значение около 14, но это не фиксированный норматив.

## 8. Завершение контрольного запуска

После проверки:

- не перемещать XML/manifest в webroot;
- не передавать их Hairshop Pro;
- не создавать Scheduled Task;
- не менять GrinS;
- сохранить output в карантине до решения владельца;
- зафиксировать длительность, counts, размер XML, SHA-256 и ошибки/предупреждения без connection string.

Следующий этап — решение владельца о регулярном расписании и защищённой доставке. Он не входит в первый контрольный запуск.
