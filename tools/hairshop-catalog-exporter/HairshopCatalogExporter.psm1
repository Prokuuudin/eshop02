Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)
$script:XmlSchemaVersion = '1.0'
$script:SourceTables = @(
    'Product',
    'Language',
    'LocalizedProperty',
    'Category',
    'Product_Category_Mapping',
    'Manufacturer',
    'Product_Manufacturer_Mapping',
    'Picture',
    'Product_Picture_Mapping',
    'UrlRecord'
)

function Get-OptionalProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        $DefaultValue = $null
    )

    if ($null -eq $Object) {
        return $DefaultValue
    }

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $DefaultValue
    }

    return $property.Value
}

function Get-RowValue {
    param(
        [Parameter(Mandatory = $true)]$Row,
        [Parameter(Mandatory = $true)][string]$Name,
        $DefaultValue = $null
    )

    if ($Row -is [System.Data.DataRow]) {
        if (-not $Row.Table.Columns.Contains($Name)) {
            return $DefaultValue
        }

        $value = $Row[$Name]
    }
    else {
        $property = $Row.PSObject.Properties[$Name]
        if ($null -eq $property) {
            return $DefaultValue
        }
        $value = $property.Value
    }

    if ($null -eq $value -or $value -is [System.DBNull]) {
        return $DefaultValue
    }

    return $value
}

function ConvertTo-CatalogBoolean {
    param($Value)

    if ($Value -is [bool]) {
        return $Value
    }
    if ($Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or $Value -is [int64]) {
        return ([int64]$Value -ne 0)
    }

    $text = [string]$Value
    return $text.Equals('true', [System.StringComparison]::OrdinalIgnoreCase) -or $text -eq '1'
}

function ConvertTo-UtcText {
    param($Value)

    if ($null -eq $Value -or $Value -is [System.DBNull] -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return ''
    }

    if ($Value -is [DateTime]) {
        $date = [DateTime]$Value
    }
    else {
        $date = [DateTime]::Parse(
            [string]$Value,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal
        )
    }

    if ($date.Kind -eq [DateTimeKind]::Unspecified) {
        $date = [DateTime]::SpecifyKind($date, [DateTimeKind]::Utc)
    }
    else {
        $date = $date.ToUniversalTime()
    }

    return $date.ToString('o', [System.Globalization.CultureInfo]::InvariantCulture)
}

function New-SanitizationState {
    return [pscustomobject]@{
        ReplacementCount = 0
        Samples = New-Object System.Collections.ArrayList
        SampleLimit = 25
    }
}

function Add-SanitizationSample {
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][string]$Context,
        [Parameter(Mandatory = $true)][int]$CodePoint
    )

    $State.ReplacementCount++
    if ($State.Samples.Count -lt $State.SampleLimit) {
        $sample = [pscustomobject]@{
            context = $Context
            codePoint = ('U+{0:X4}' -f $CodePoint)
        }
        [void]$State.Samples.Add($sample)
    }
}

function ConvertTo-Xml10SafeString {
    param(
        $Value,
        [Parameter(Mandatory = $true)]$SanitizationState,
        [Parameter(Mandatory = $true)][string]$Context
    )

    if ($null -eq $Value -or $Value -is [System.DBNull]) {
        return ''
    }

    $text = [string]$Value
    $builder = New-Object System.Text.StringBuilder

    for ($index = 0; $index -lt $text.Length; $index++) {
        $character = $text[$index]
        $code = [int]$character

        if ([char]::IsHighSurrogate($character)) {
            if (($index + 1) -lt $text.Length -and [char]::IsLowSurrogate($text[$index + 1])) {
                [void]$builder.Append($character)
                [void]$builder.Append($text[$index + 1])
                $index++
                continue
            }

            Add-SanitizationSample -State $SanitizationState -Context $Context -CodePoint $code
            [void]$builder.Append([char]0xFFFD)
            continue
        }

        if ([char]::IsLowSurrogate($character)) {
            Add-SanitizationSample -State $SanitizationState -Context $Context -CodePoint $code
            [void]$builder.Append([char]0xFFFD)
            continue
        }

        $allowed = ($code -eq 0x09) -or ($code -eq 0x0A) -or ($code -eq 0x0D) -or
            (($code -ge 0x20) -and ($code -le 0xD7FF)) -or
            (($code -ge 0xE000) -and ($code -le 0xFFFD))

        if ($allowed) {
            [void]$builder.Append($character)
        }
        else {
            Add-SanitizationSample -State $SanitizationState -Context $Context -CodePoint $code
            [void]$builder.Append([char]0xFFFD)
        }
    }

    return $builder.ToString()
}

function Write-SafeAttribute {
    param(
        [Parameter(Mandatory = $true)][System.Xml.XmlWriter]$Writer,
        [Parameter(Mandatory = $true)][string]$Name,
        $Value,
        [Parameter(Mandatory = $true)]$SanitizationState,
        [Parameter(Mandatory = $true)][string]$Context
    )

    $safe = ConvertTo-Xml10SafeString -Value $Value -SanitizationState $SanitizationState -Context $Context
    $Writer.WriteAttributeString($Name, $safe)
}

function Write-SafeElement {
    param(
        [Parameter(Mandatory = $true)][System.Xml.XmlWriter]$Writer,
        [Parameter(Mandatory = $true)][string]$Name,
        $Value,
        [Parameter(Mandatory = $true)]$SanitizationState,
        [Parameter(Mandatory = $true)][string]$Context
    )

    $safe = ConvertTo-Xml10SafeString -Value $Value -SanitizationState $SanitizationState -Context $Context
    $Writer.WriteElementString($Name, $safe)
}

function Add-ToLookup {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Lookup,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)]$Value
    )

    if (-not $Lookup.ContainsKey($Key)) {
        $Lookup[$Key] = New-Object System.Collections.ArrayList
    }
    [void]$Lookup[$Key].Add($Value)
}

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hash = $sha.ComputeHash($stream)
            return ([System.BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
        }
        finally {
            $sha.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Write-Utf8NoBomFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    [System.IO.File]::WriteAllText($Path, $Content, $script:Utf8NoBom)
}

function Read-CatalogExporterConfig {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $config = Get-Content -LiteralPath $resolvedPath -Raw -Encoding UTF8 | ConvertFrom-Json

    if ([string]::IsNullOrWhiteSpace([string](Get-OptionalProperty $config 'OutputDirectory' ''))) {
        throw 'Configuration field OutputDirectory is required.'
    }

    $defaults = @{
        DatabaseName = 'hairshop_p34s'
        ConnectionStringEnvironmentVariable = 'HAIRSHOP_CATALOG_MSSQL_CONNECTION_STRING'
        ConnectionStringFile = ''
        CommandTimeoutSeconds = 180
        LockTimeoutMilliseconds = 5000
        MinimumProductCount = 1
        MinimumPublishedCount = 0
        MinimumUnpublishedCount = 0
        ExpectedProductCount = 0
        ExpectedPublishedCount = 0
        ExpectedUnpublishedCount = 0
        MaximumProductDropPercent = 5.0
    }

    foreach ($entry in $defaults.GetEnumerator()) {
        if ($null -eq $config.PSObject.Properties[$entry.Key]) {
            $config | Add-Member -NotePropertyName $entry.Key -NotePropertyValue $entry.Value
        }
    }

    $config.OutputDirectory = [System.IO.Path]::GetFullPath([string]$config.OutputDirectory)
    return $config
}

function Resolve-CatalogConnectionString {
    param([Parameter(Mandatory = $true)]$Config)

    $environmentName = [string](Get-OptionalProperty $Config 'ConnectionStringEnvironmentVariable' '')
    $secretFile = [string](Get-OptionalProperty $Config 'ConnectionStringFile' '')
    $fromEnvironment = ''

    if (-not [string]::IsNullOrWhiteSpace($environmentName)) {
        $fromEnvironment = [Environment]::GetEnvironmentVariable($environmentName, 'Process')
    }

    if (-not [string]::IsNullOrWhiteSpace($fromEnvironment) -and -not [string]::IsNullOrWhiteSpace($secretFile)) {
        throw 'Configure either ConnectionStringEnvironmentVariable or ConnectionStringFile, not both.'
    }

    if (-not [string]::IsNullOrWhiteSpace($fromEnvironment)) {
        return $fromEnvironment.Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($secretFile)) {
        if (-not [System.IO.Path]::IsPathRooted($secretFile)) {
            throw 'ConnectionStringFile must be an absolute path outside the web root.'
        }
        if (-not (Test-Path -LiteralPath $secretFile -PathType Leaf)) {
            throw 'Configured ConnectionStringFile does not exist.'
        }
        $value = [System.IO.File]::ReadAllText($secretFile, $script:Utf8NoBom).Trim()
        if ([string]::IsNullOrWhiteSpace($value)) {
            throw 'ConnectionStringFile is empty.'
        }
        return $value
    }

    throw 'No MSSQL connection string is configured. Use the configured environment variable or ConnectionStringFile.'
}

function Assert-SelectOnlySql {
    param([Parameter(Mandatory = $true)][string]$Sql)

    $trimmed = $Sql.TrimStart()
    if (-not ($trimmed.StartsWith('SELECT', [System.StringComparison]::OrdinalIgnoreCase) -or
        $trimmed.StartsWith('WITH', [System.StringComparison]::OrdinalIgnoreCase))) {
        throw 'Exporter refused to execute a non-SELECT SQL statement.'
    }

    if ($trimmed -match '(?im)^\s*(INSERT|UPDATE|DELETE|MERGE|EXEC(?:UTE)?|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|DENY)\b') {
        throw 'Exporter refused SQL containing a mutating statement.'
    }
}

function Invoke-SelectTable {
    param(
        [Parameter(Mandatory = $true)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory = $true)][System.Data.SqlClient.SqlTransaction]$Transaction,
        [Parameter(Mandatory = $true)][string]$Sql,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )

    Assert-SelectOnlySql -Sql $Sql
    $command = $Connection.CreateCommand()
    try {
        $command.Transaction = $Transaction
        $command.CommandTimeout = $TimeoutSeconds
        $command.CommandText = $Sql
        $table = New-Object System.Data.DataTable
        $reader = $command.ExecuteReader()
        try {
            $table.Load($reader)
        }
        finally {
            $reader.Dispose()
        }
        return ,$table
    }
    finally {
        $command.Dispose()
    }
}

function Assert-ReadOnlyDatabasePrincipal {
    param(
        [Parameter(Mandatory = $true)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory = $true)][System.Data.SqlClient.SqlTransaction]$Transaction,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )

    $principalSql = @'
SELECT IS_SRVROLEMEMBER('sysadmin') AS IsSysadmin,
       IS_SRVROLEMEMBER('serveradmin') AS IsServerAdmin,
       IS_SRVROLEMEMBER('securityadmin') AS IsSecurityAdmin,
       IS_SRVROLEMEMBER('dbcreator') AS IsDbCreator,
       IS_MEMBER('db_owner') AS IsDbOwner,
       IS_MEMBER('db_datawriter') AS IsDbDataWriter,
       IS_MEMBER('db_ddladmin') AS IsDbDdlAdmin,
       IS_MEMBER('db_securityadmin') AS IsDbSecurityAdmin,
       HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL') AS CanControlDatabase,
       HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'ALTER') AS CanAlterDatabase,
       HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS CanInsertDatabase,
       HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'UPDATE') AS CanUpdateDatabase,
       HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'DELETE') AS CanDeleteDatabase
'@
    $principal = (Invoke-SelectTable -Connection $Connection -Transaction $Transaction -Sql $principalSql -TimeoutSeconds $TimeoutSeconds).Rows[0]
    foreach ($permission in @(
        'IsSysadmin',
        'IsServerAdmin',
        'IsSecurityAdmin',
        'IsDbCreator',
        'IsDbOwner',
        'IsDbDataWriter',
        'IsDbDdlAdmin',
        'IsDbSecurityAdmin',
        'CanControlDatabase',
        'CanAlterDatabase',
        'CanInsertDatabase',
        'CanUpdateDatabase',
        'CanDeleteDatabase'
    )) {
        if (ConvertTo-CatalogBoolean $principal[$permission]) {
            throw "MSSQL principal is not read-only: $permission is granted."
        }
    }

    $values = ($script:SourceTables | ForEach-Object { "('dbo', '$($_.Replace("'", "''"))')" }) -join ",`n"
    $sql = @"
SELECT required.SchemaName,
       required.TableName,
       HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + '.' + QUOTENAME(required.TableName), 'OBJECT', 'SELECT') AS CanSelect,
       HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + '.' + QUOTENAME(required.TableName), 'OBJECT', 'INSERT') AS CanInsert,
       HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + '.' + QUOTENAME(required.TableName), 'OBJECT', 'UPDATE') AS CanUpdate,
       HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + '.' + QUOTENAME(required.TableName), 'OBJECT', 'DELETE') AS CanDelete,
       HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + '.' + QUOTENAME(required.TableName), 'OBJECT', 'ALTER') AS CanAlter,
       HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + '.' + QUOTENAME(required.TableName), 'OBJECT', 'CONTROL') AS CanControl
FROM (VALUES
$values
) required(SchemaName, TableName)
ORDER BY required.TableName
"@

    $permissions = Invoke-SelectTable -Connection $Connection -Transaction $Transaction -Sql $sql -TimeoutSeconds $TimeoutSeconds
    foreach ($row in $permissions.Rows) {
        $tableName = [string]$row['TableName']
        if (-not (ConvertTo-CatalogBoolean $row['CanSelect'])) {
            throw "MSSQL principal lacks SELECT on required table dbo.$tableName."
        }

        foreach ($permission in @('CanInsert', 'CanUpdate', 'CanDelete', 'CanAlter', 'CanControl')) {
            if (ConvertTo-CatalogBoolean $row[$permission]) {
                throw "MSSQL principal is not read-only: $permission is granted on dbo.$tableName."
            }
        }
    }
}

function Get-CatalogDataFromMssql {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)]$Config)

    $connectionString = Resolve-CatalogConnectionString -Config $Config
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder($connectionString)
    $builder.ApplicationName = 'HairshopCatalogExporter'
    $builder.ApplicationIntent = [System.Data.SqlClient.ApplicationIntent]::ReadOnly
    $builder.PersistSecurityInfo = $false

    $connection = New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
    $transaction = $null
    try {
        $connection.Open()
        $transaction = $connection.BeginTransaction([System.Data.IsolationLevel]::ReadCommitted)
        $timeout = [int]$Config.CommandTimeoutSeconds

        $sessionCommand = $connection.CreateCommand()
        try {
            $sessionCommand.Transaction = $transaction
            $sessionCommand.CommandTimeout = $timeout
            $sessionCommand.CommandText = "SET DEADLOCK_PRIORITY LOW; SET LOCK_TIMEOUT $([int]$Config.LockTimeoutMilliseconds);"
            [void]$sessionCommand.ExecuteNonQuery()
        }
        finally {
            $sessionCommand.Dispose()
        }

        $databaseTable = Invoke-SelectTable -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout -Sql @'
SELECT DB_NAME() AS DatabaseName
'@
        $actualDatabase = [string]$databaseTable.Rows[0]['DatabaseName']
        $expectedDatabase = [string]$Config.DatabaseName
        if (-not [string]::IsNullOrWhiteSpace($expectedDatabase) -and
            -not $actualDatabase.Equals($expectedDatabase, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Connected database '$actualDatabase' does not match configured DatabaseName."
        }

        Assert-ReadOnlyDatabasePrincipal -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout

        $products = Invoke-SelectTable -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout -Sql @'
SELECT p.Id AS ProductId,
       p.SKU AS SKU,
       p.Gtin AS EAN,
       p.Name,
       p.ShortDescription,
       p.FullDescription,
       p.MetaKeywords,
       p.MetaDescription,
       p.MetaTitle,
       p.Published,
       p.CreatedOnUtc,
       p.UpdatedOnUtc
FROM dbo.Product p
WHERE p.Deleted = 0
ORDER BY p.Id
'@

        $languages = Invoke-SelectTable -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout -Sql @'
SELECT l.Id AS LanguageId,
       l.Name,
       l.LanguageCulture,
       l.UniqueSeoCode,
       l.Published,
       l.DisplayOrder
FROM dbo.Language l
ORDER BY l.DisplayOrder, l.Id
'@

        $localizedValues = Invoke-SelectTable -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout -Sql @'
SELECT lp.EntityId,
       lp.LanguageId,
       lp.LocaleKeyGroup AS EntityName,
       lp.LocaleKey,
       lp.LocaleValue
FROM dbo.LocalizedProperty lp
WHERE lp.LocaleKeyGroup IN ('Product', 'Category', 'Manufacturer')
  AND lp.LocaleKey IN ('Name', 'ShortDescription', 'FullDescription', 'Description', 'MetaKeywords', 'MetaDescription', 'MetaTitle')
ORDER BY lp.LocaleKeyGroup, lp.EntityId, lp.LanguageId, lp.LocaleKey
'@

        $categories = Invoke-SelectTable -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout -Sql @'
SELECT c.Id AS CategoryId,
       c.ParentCategoryId,
       c.Name,
       c.Description,
       c.MetaKeywords,
       c.MetaDescription,
       c.MetaTitle,
       c.Published,
       c.DisplayOrder,
       c.CreatedOnUtc,
       c.UpdatedOnUtc
FROM dbo.Category c
WHERE c.Deleted = 0
ORDER BY c.Id
'@

        $categoryMappings = Invoke-SelectTable -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout -Sql @'
SELECT pcm.ProductId,
       pcm.CategoryId,
       pcm.IsFeaturedProduct,
       pcm.DisplayOrder
FROM dbo.Product_Category_Mapping pcm
INNER JOIN dbo.Product p ON p.Id = pcm.ProductId AND p.Deleted = 0
INNER JOIN dbo.Category c ON c.Id = pcm.CategoryId AND c.Deleted = 0
ORDER BY pcm.ProductId, pcm.DisplayOrder, pcm.CategoryId
'@

        $manufacturers = Invoke-SelectTable -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout -Sql @'
SELECT m.Id AS ManufacturerId,
       m.Name,
       m.Description,
       m.MetaKeywords,
       m.MetaDescription,
       m.MetaTitle,
       m.Published,
       m.DisplayOrder,
       m.CreatedOnUtc,
       m.UpdatedOnUtc
FROM dbo.Manufacturer m
WHERE m.Deleted = 0
ORDER BY m.Id
'@

        $manufacturerMappings = Invoke-SelectTable -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout -Sql @'
SELECT pmm.ProductId,
       pmm.ManufacturerId,
       pmm.IsFeaturedProduct,
       pmm.DisplayOrder
FROM dbo.Product_Manufacturer_Mapping pmm
INNER JOIN dbo.Product p ON p.Id = pmm.ProductId AND p.Deleted = 0
INNER JOIN dbo.Manufacturer m ON m.Id = pmm.ManufacturerId AND m.Deleted = 0
ORDER BY pmm.ProductId, pmm.DisplayOrder, pmm.ManufacturerId
'@

        $pictures = Invoke-SelectTable -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout -Sql @'
SELECT ppm.ProductId,
       ppm.PictureId,
       ppm.DisplayOrder,
       pic.MimeType,
       pic.SeoFilename,
       pic.AltAttribute,
       pic.TitleAttribute
FROM dbo.Product_Picture_Mapping ppm
INNER JOIN dbo.Product p ON p.Id = ppm.ProductId AND p.Deleted = 0
INNER JOIN dbo.Picture pic ON pic.Id = ppm.PictureId
ORDER BY ppm.ProductId, ppm.DisplayOrder, ppm.PictureId
'@

        $slugs = Invoke-SelectTable -Connection $connection -Transaction $transaction -TimeoutSeconds $timeout -Sql @'
SELECT ur.EntityId,
       ur.EntityName,
       ur.LanguageId,
       ur.Slug,
       ur.IsActive
FROM dbo.UrlRecord ur
WHERE ur.EntityName IN ('Product', 'Category', 'Manufacturer')
  AND ur.IsActive = 1
ORDER BY ur.EntityName, ur.EntityId, ur.LanguageId, ur.Id DESC
'@

        $transaction.Rollback()
        $transaction.Dispose()
        $transaction = $null

        return [pscustomobject]@{
            SourceDatabase = $actualDatabase
            Products = @($products.Rows)
            Languages = @($languages.Rows)
            LocalizedValues = @($localizedValues.Rows)
            Categories = @($categories.Rows)
            CategoryMappings = @($categoryMappings.Rows)
            Manufacturers = @($manufacturers.Rows)
            ManufacturerMappings = @($manufacturerMappings.Rows)
            Pictures = @($pictures.Rows)
            Slugs = @($slugs.Rows)
        }
    }
    finally {
        if ($null -ne $transaction) {
            try { $transaction.Rollback() } catch { }
            $transaction.Dispose()
        }
        $connection.Dispose()
    }
}

function Read-CatalogFixture {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $data = Get-Content -LiteralPath $resolvedPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $data.PSObject.Properties['SourceDatabase']) {
        $data | Add-Member -NotePropertyName SourceDatabase -NotePropertyValue 'fixture'
    }
    return $data
}

function Get-CatalogSummary {
    param([Parameter(Mandatory = $true)]$Data)

    $products = @($Data.Products)
    $published = 0
    foreach ($product in $products) {
        if (ConvertTo-CatalogBoolean (Get-RowValue $product 'Published' $false)) {
            $published++
        }
    }

    return [pscustomobject]@{
        ProductsTotal = $products.Count
        Published = $published
        Unpublished = $products.Count - $published
        Languages = @($Data.Languages).Count
        Categories = @($Data.Categories).Count
        Manufacturers = @($Data.Manufacturers).Count
        PictureMappings = @($Data.Pictures).Count
    }
}

function Assert-CatalogData {
    param(
        [Parameter(Mandatory = $true)]$Data,
        [Parameter(Mandatory = $true)]$Config,
        [Parameter(Mandatory = $true)]$Summary,
        $PreviousManifest
    )

    $seen = @{}
    foreach ($product in @($Data.Products)) {
        $id = [string](Get-RowValue $product 'ProductId' '')
        if ([string]::IsNullOrWhiteSpace($id)) {
            throw 'Catalog contains a product without ProductId.'
        }
        if ($seen.ContainsKey($id)) {
            throw "Duplicate ProductId detected: $id."
        }
        $seen[$id] = $true
    }

    $minimumProducts = [int](Get-OptionalProperty $Config 'MinimumProductCount' 1)
    $minimumPublished = [int](Get-OptionalProperty $Config 'MinimumPublishedCount' 0)
    $minimumUnpublished = [int](Get-OptionalProperty $Config 'MinimumUnpublishedCount' 0)

    if ($Summary.ProductsTotal -lt $minimumProducts) {
        throw "Incomplete export: $($Summary.ProductsTotal) products is below configured minimum $minimumProducts."
    }
    if ($Summary.Published -lt $minimumPublished) {
        throw "Incomplete export: $($Summary.Published) published products is below configured minimum $minimumPublished."
    }
    if ($Summary.Unpublished -lt $minimumUnpublished) {
        throw "Incomplete export: $($Summary.Unpublished) unpublished products is below configured minimum $minimumUnpublished."
    }

    foreach ($check in @(
        @{ Config = 'ExpectedProductCount'; Actual = $Summary.ProductsTotal; Label = 'products' },
        @{ Config = 'ExpectedPublishedCount'; Actual = $Summary.Published; Label = 'published products' },
        @{ Config = 'ExpectedUnpublishedCount'; Actual = $Summary.Unpublished; Label = 'unpublished products' }
    )) {
        $expected = [int](Get-OptionalProperty $Config $check.Config 0)
        if ($expected -gt 0 -and $check.Actual -ne $expected) {
            throw "Expected $expected $($check.Label), got $($check.Actual)."
        }
    }

    if ($null -ne $PreviousManifest) {
        $previousTotal = [int]$PreviousManifest.summary.productsTotal
        if ($previousTotal -gt 0 -and $Summary.ProductsTotal -lt $previousTotal) {
            $dropPercent = (($previousTotal - $Summary.ProductsTotal) * 100.0) / $previousTotal
            $maximumDrop = [double](Get-OptionalProperty $Config 'MaximumProductDropPercent' 5.0)
            if ($dropPercent -gt $maximumDrop) {
                throw ('Incomplete export: product count dropped by {0:N2}% (maximum {1:N2}%).' -f $dropPercent, $maximumDrop)
            }
        }
    }
}

function Read-AndValidatePreviousManifest {
    param([Parameter(Mandatory = $true)][string]$OutputDirectory)

    $manifestPath = Join-Path $OutputDirectory 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        return $null
    }

    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        throw 'Existing manifest.json is invalid; refusing to overwrite it.'
    }

    $fileName = [string](Get-OptionalProperty $manifest 'fileName' '')
    $expectedHash = [string](Get-OptionalProperty $manifest 'sha256' '')
    if ([string]::IsNullOrWhiteSpace($fileName) -or [string]::IsNullOrWhiteSpace($expectedHash)) {
        throw 'Existing manifest.json is incomplete; refusing to overwrite it.'
    }

    if ([System.IO.Path]::GetFileName($fileName) -ne $fileName) {
        throw 'Existing manifest contains an unsafe fileName.'
    }

    $snapshotPath = Join-Path $OutputDirectory $fileName
    if (-not (Test-Path -LiteralPath $snapshotPath -PathType Leaf)) {
        throw 'Existing manifest references a missing snapshot; refusing to overwrite it.'
    }

    $actualHash = Get-Sha256Hex -Path $snapshotPath
    if (-not $actualHash.Equals($expectedHash, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Existing snapshot checksum does not match manifest; refusing to overwrite it.'
    }

    return $manifest
}

function Write-LocalizedValues {
    param(
        [Parameter(Mandatory = $true)][System.Xml.XmlWriter]$Writer,
        $Values,
        [Parameter(Mandatory = $true)][hashtable]$LanguageCodes,
        [Parameter(Mandatory = $true)]$SanitizationState,
        [Parameter(Mandatory = $true)][string]$Context
    )

    $Writer.WriteStartElement('LocalizedValues')
    foreach ($value in @($Values) | Sort-Object { [int](Get-RowValue $_ 'LanguageId' 0) }, { [string](Get-RowValue $_ 'LocaleKey' '') }) {
        $languageId = [string](Get-RowValue $value 'LanguageId' '')
        $Writer.WriteStartElement('LocalizedValue')
        Write-SafeAttribute $Writer 'LanguageId' $languageId $SanitizationState "$Context.LocalizedValue.LanguageId"
        if ($LanguageCodes.ContainsKey($languageId)) {
            Write-SafeAttribute $Writer 'LanguageCode' $LanguageCodes[$languageId] $SanitizationState "$Context.LocalizedValue.LanguageCode"
        }
        Write-SafeAttribute $Writer 'Key' (Get-RowValue $value 'LocaleKey' '') $SanitizationState "$Context.LocalizedValue.Key"
        $text = ConvertTo-Xml10SafeString (Get-RowValue $value 'LocaleValue' '') $SanitizationState "$Context.LocalizedValue.Value"
        $Writer.WriteString($text)
        $Writer.WriteEndElement()
    }
    $Writer.WriteEndElement()
}

function Write-EntitySlugs {
    param(
        [Parameter(Mandatory = $true)][System.Xml.XmlWriter]$Writer,
        $Values,
        [Parameter(Mandatory = $true)][hashtable]$LanguageCodes,
        [Parameter(Mandatory = $true)]$SanitizationState,
        [Parameter(Mandatory = $true)][string]$Context
    )

    $Writer.WriteStartElement('Slugs')
    foreach ($slug in @($Values) | Sort-Object { [int](Get-RowValue $_ 'LanguageId' 0) }, { [string](Get-RowValue $_ 'Slug' '') }) {
        $languageId = [string](Get-RowValue $slug 'LanguageId' '0')
        $Writer.WriteStartElement('Slug')
        Write-SafeAttribute $Writer 'LanguageId' $languageId $SanitizationState "$Context.Slug.LanguageId"
        if ($LanguageCodes.ContainsKey($languageId)) {
            Write-SafeAttribute $Writer 'LanguageCode' $LanguageCodes[$languageId] $SanitizationState "$Context.Slug.LanguageCode"
        }
        $text = ConvertTo-Xml10SafeString (Get-RowValue $slug 'Slug' '') $SanitizationState "$Context.Slug.Value"
        $Writer.WriteString($text)
        $Writer.WriteEndElement()
    }
    $Writer.WriteEndElement()
}

function Write-CatalogXml {
    param(
        [Parameter(Mandatory = $true)]$Data,
        [Parameter(Mandatory = $true)]$Summary,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$RunId,
        [Parameter(Mandatory = $true)][DateTime]$GeneratedAtUtc,
        [Parameter(Mandatory = $true)]$SanitizationState
    )

    $languageCodes = @{}
    foreach ($language in @($Data.Languages)) {
        $languageId = [string](Get-RowValue $language 'LanguageId' '')
        $code = [string](Get-RowValue $language 'UniqueSeoCode' '')
        if ([string]::IsNullOrWhiteSpace($code)) {
            $code = [string](Get-RowValue $language 'LanguageCulture' '')
        }
        $languageCodes[$languageId] = $code
    }

    $localizedLookup = @{}
    foreach ($value in @($Data.LocalizedValues)) {
        $key = '{0}|{1}' -f (Get-RowValue $value 'EntityName' ''), (Get-RowValue $value 'EntityId' '')
        Add-ToLookup $localizedLookup $key $value
    }

    $slugLookup = @{}
    foreach ($slug in @($Data.Slugs)) {
        $key = '{0}|{1}' -f (Get-RowValue $slug 'EntityName' ''), (Get-RowValue $slug 'EntityId' '')
        Add-ToLookup $slugLookup $key $slug
    }

    $categoryMappingLookup = @{}
    foreach ($mapping in @($Data.CategoryMappings)) {
        Add-ToLookup $categoryMappingLookup ([string](Get-RowValue $mapping 'ProductId' '')) $mapping
    }

    $manufacturerMappingLookup = @{}
    foreach ($mapping in @($Data.ManufacturerMappings)) {
        Add-ToLookup $manufacturerMappingLookup ([string](Get-RowValue $mapping 'ProductId' '')) $mapping
    }

    $pictureLookup = @{}
    foreach ($picture in @($Data.Pictures)) {
        Add-ToLookup $pictureLookup ([string](Get-RowValue $picture 'ProductId' '')) $picture
    }

    $settings = New-Object System.Xml.XmlWriterSettings
    $settings.Encoding = $script:Utf8NoBom
    $settings.Indent = $true
    $settings.IndentChars = '  '
    $settings.NewLineChars = "`n"
    $settings.NewLineHandling = [System.Xml.NewLineHandling]::Entitize
    $settings.CheckCharacters = $true
    $settings.CloseOutput = $true

    $writer = [System.Xml.XmlWriter]::Create($Path, $settings)
    try {
        $writer.WriteStartDocument()
        $writer.WriteStartElement('CatalogExport')
        Write-SafeAttribute $writer 'SchemaVersion' $script:XmlSchemaVersion $SanitizationState 'CatalogExport.SchemaVersion'
        Write-SafeAttribute $writer 'Source' 'nopCommerce-3.90-MSSQL' $SanitizationState 'CatalogExport.Source'
        Write-SafeAttribute $writer 'RunId' $RunId $SanitizationState 'CatalogExport.RunId'
        Write-SafeAttribute $writer 'GeneratedAtUtc' ($GeneratedAtUtc.ToString('o')) $SanitizationState 'CatalogExport.GeneratedAtUtc'

        $writer.WriteStartElement('Summary')
        Write-SafeAttribute $writer 'ProductsTotal' $Summary.ProductsTotal $SanitizationState 'Summary.ProductsTotal'
        Write-SafeAttribute $writer 'Published' $Summary.Published $SanitizationState 'Summary.Published'
        Write-SafeAttribute $writer 'Unpublished' $Summary.Unpublished $SanitizationState 'Summary.Unpublished'
        Write-SafeAttribute $writer 'Languages' $Summary.Languages $SanitizationState 'Summary.Languages'
        Write-SafeAttribute $writer 'Categories' $Summary.Categories $SanitizationState 'Summary.Categories'
        Write-SafeAttribute $writer 'Manufacturers' $Summary.Manufacturers $SanitizationState 'Summary.Manufacturers'
        Write-SafeAttribute $writer 'PictureMappings' $Summary.PictureMappings $SanitizationState 'Summary.PictureMappings'
        $writer.WriteEndElement()

        $writer.WriteStartElement('Authority')
        Write-SafeElement $writer 'Prices' 'excluded-non-authoritative-use-GrinS' $SanitizationState 'Authority.Prices'
        Write-SafeElement $writer 'Stock' 'excluded-non-authoritative-use-GrinS' $SanitizationState 'Authority.Stock'
        $writer.WriteEndElement()

        $writer.WriteStartElement('Languages')
        foreach ($language in @($Data.Languages) | Sort-Object { [int](Get-RowValue $_ 'DisplayOrder' 0) }, { [int](Get-RowValue $_ 'LanguageId' 0) }) {
            $id = [string](Get-RowValue $language 'LanguageId' '')
            $writer.WriteStartElement('Language')
            Write-SafeAttribute $writer 'LanguageId' $id $SanitizationState "Language[$id].LanguageId"
            Write-SafeAttribute $writer 'Name' (Get-RowValue $language 'Name' '') $SanitizationState "Language[$id].Name"
            Write-SafeAttribute $writer 'Culture' (Get-RowValue $language 'LanguageCulture' '') $SanitizationState "Language[$id].Culture"
            Write-SafeAttribute $writer 'Code' (Get-RowValue $language 'UniqueSeoCode' '') $SanitizationState "Language[$id].Code"
            Write-SafeAttribute $writer 'Published' ((ConvertTo-CatalogBoolean (Get-RowValue $language 'Published' $false)).ToString().ToLowerInvariant()) $SanitizationState "Language[$id].Published"
            Write-SafeAttribute $writer 'DisplayOrder' (Get-RowValue $language 'DisplayOrder' 0) $SanitizationState "Language[$id].DisplayOrder"
            $writer.WriteEndElement()
        }
        $writer.WriteEndElement()

        $writer.WriteStartElement('Categories')
        foreach ($category in @($Data.Categories) | Sort-Object { [int](Get-RowValue $_ 'CategoryId' 0) }) {
            $id = [string](Get-RowValue $category 'CategoryId' '')
            $context = "Category[$id]"
            $writer.WriteStartElement('Category')
            Write-SafeAttribute $writer 'CategoryId' $id $SanitizationState "$context.CategoryId"
            Write-SafeAttribute $writer 'ParentCategoryId' (Get-RowValue $category 'ParentCategoryId' 0) $SanitizationState "$context.ParentCategoryId"
            Write-SafeAttribute $writer 'Published' ((ConvertTo-CatalogBoolean (Get-RowValue $category 'Published' $false)).ToString().ToLowerInvariant()) $SanitizationState "$context.Published"
            Write-SafeAttribute $writer 'DisplayOrder' (Get-RowValue $category 'DisplayOrder' 0) $SanitizationState "$context.DisplayOrder"
            Write-SafeAttribute $writer 'CreatedOnUtc' (ConvertTo-UtcText (Get-RowValue $category 'CreatedOnUtc' $null)) $SanitizationState "$context.CreatedOnUtc"
            Write-SafeAttribute $writer 'UpdatedOnUtc' (ConvertTo-UtcText (Get-RowValue $category 'UpdatedOnUtc' $null)) $SanitizationState "$context.UpdatedOnUtc"
            Write-SafeElement $writer 'Name' (Get-RowValue $category 'Name' '') $SanitizationState "$context.Name"
            Write-SafeElement $writer 'Description' (Get-RowValue $category 'Description' '') $SanitizationState "$context.Description"
            foreach ($field in @('MetaKeywords', 'MetaDescription', 'MetaTitle')) {
                Write-SafeElement $writer $field (Get-RowValue $category $field '') $SanitizationState "$context.$field"
            }
            $localizedKey = "Category|$id"
            Write-LocalizedValues $writer $(if ($localizedLookup.ContainsKey($localizedKey)) { $localizedLookup[$localizedKey] } else { @() }) $languageCodes $SanitizationState $context
            Write-EntitySlugs $writer $(if ($slugLookup.ContainsKey($localizedKey)) { $slugLookup[$localizedKey] } else { @() }) $languageCodes $SanitizationState $context
            $writer.WriteEndElement()
        }
        $writer.WriteEndElement()

        $writer.WriteStartElement('Manufacturers')
        foreach ($manufacturer in @($Data.Manufacturers) | Sort-Object { [int](Get-RowValue $_ 'ManufacturerId' 0) }) {
            $id = [string](Get-RowValue $manufacturer 'ManufacturerId' '')
            $context = "Manufacturer[$id]"
            $writer.WriteStartElement('Manufacturer')
            Write-SafeAttribute $writer 'ManufacturerId' $id $SanitizationState "$context.ManufacturerId"
            Write-SafeAttribute $writer 'Published' ((ConvertTo-CatalogBoolean (Get-RowValue $manufacturer 'Published' $false)).ToString().ToLowerInvariant()) $SanitizationState "$context.Published"
            Write-SafeAttribute $writer 'DisplayOrder' (Get-RowValue $manufacturer 'DisplayOrder' 0) $SanitizationState "$context.DisplayOrder"
            Write-SafeAttribute $writer 'CreatedOnUtc' (ConvertTo-UtcText (Get-RowValue $manufacturer 'CreatedOnUtc' $null)) $SanitizationState "$context.CreatedOnUtc"
            Write-SafeAttribute $writer 'UpdatedOnUtc' (ConvertTo-UtcText (Get-RowValue $manufacturer 'UpdatedOnUtc' $null)) $SanitizationState "$context.UpdatedOnUtc"
            Write-SafeElement $writer 'Name' (Get-RowValue $manufacturer 'Name' '') $SanitizationState "$context.Name"
            Write-SafeElement $writer 'Description' (Get-RowValue $manufacturer 'Description' '') $SanitizationState "$context.Description"
            foreach ($field in @('MetaKeywords', 'MetaDescription', 'MetaTitle')) {
                Write-SafeElement $writer $field (Get-RowValue $manufacturer $field '') $SanitizationState "$context.$field"
            }
            $localizedKey = "Manufacturer|$id"
            Write-LocalizedValues $writer $(if ($localizedLookup.ContainsKey($localizedKey)) { $localizedLookup[$localizedKey] } else { @() }) $languageCodes $SanitizationState $context
            Write-EntitySlugs $writer $(if ($slugLookup.ContainsKey($localizedKey)) { $slugLookup[$localizedKey] } else { @() }) $languageCodes $SanitizationState $context
            $writer.WriteEndElement()
        }
        $writer.WriteEndElement()

        $writer.WriteStartElement('Products')
        foreach ($product in @($Data.Products) | Sort-Object { [int64](Get-RowValue $_ 'ProductId' 0) }) {
            $id = [string](Get-RowValue $product 'ProductId' '')
            $context = "Product[$id]"
            $writer.WriteStartElement('Product')
            Write-SafeAttribute $writer 'ProductId' $id $SanitizationState "$context.ProductId"
            Write-SafeAttribute $writer 'Published' ((ConvertTo-CatalogBoolean (Get-RowValue $product 'Published' $false)).ToString().ToLowerInvariant()) $SanitizationState "$context.Published"
            Write-SafeAttribute $writer 'CreatedOnUtc' (ConvertTo-UtcText (Get-RowValue $product 'CreatedOnUtc' $null)) $SanitizationState "$context.CreatedOnUtc"
            Write-SafeAttribute $writer 'UpdatedOnUtc' (ConvertTo-UtcText (Get-RowValue $product 'UpdatedOnUtc' $null)) $SanitizationState "$context.UpdatedOnUtc"

            Write-SafeElement $writer 'SKU' (Get-RowValue $product 'SKU' '') $SanitizationState "$context.SKU"
            Write-SafeElement $writer 'EAN' (Get-RowValue $product 'EAN' '') $SanitizationState "$context.EAN"

            $writer.WriteStartElement('DefaultContent')
            foreach ($field in @('Name', 'ShortDescription', 'FullDescription', 'MetaKeywords', 'MetaDescription', 'MetaTitle')) {
                Write-SafeElement $writer $field (Get-RowValue $product $field '') $SanitizationState "$context.$field"
            }
            $writer.WriteEndElement()

            $localizedKey = "Product|$id"
            Write-LocalizedValues $writer $(if ($localizedLookup.ContainsKey($localizedKey)) { $localizedLookup[$localizedKey] } else { @() }) $languageCodes $SanitizationState $context
            Write-EntitySlugs $writer $(if ($slugLookup.ContainsKey($localizedKey)) { $slugLookup[$localizedKey] } else { @() }) $languageCodes $SanitizationState $context

            $writer.WriteStartElement('CategoryMappings')
            if ($categoryMappingLookup.ContainsKey($id)) {
                foreach ($mapping in @($categoryMappingLookup[$id]) | Sort-Object { [int](Get-RowValue $_ 'DisplayOrder' 0) }, { [int](Get-RowValue $_ 'CategoryId' 0) }) {
                    $writer.WriteStartElement('Category')
                    Write-SafeAttribute $writer 'CategoryId' (Get-RowValue $mapping 'CategoryId' '') $SanitizationState "$context.CategoryMapping.CategoryId"
                    Write-SafeAttribute $writer 'IsFeaturedProduct' ((ConvertTo-CatalogBoolean (Get-RowValue $mapping 'IsFeaturedProduct' $false)).ToString().ToLowerInvariant()) $SanitizationState "$context.CategoryMapping.IsFeaturedProduct"
                    Write-SafeAttribute $writer 'DisplayOrder' (Get-RowValue $mapping 'DisplayOrder' 0) $SanitizationState "$context.CategoryMapping.DisplayOrder"
                    $writer.WriteEndElement()
                }
            }
            $writer.WriteEndElement()

            $writer.WriteStartElement('ManufacturerMappings')
            if ($manufacturerMappingLookup.ContainsKey($id)) {
                foreach ($mapping in @($manufacturerMappingLookup[$id]) | Sort-Object { [int](Get-RowValue $_ 'DisplayOrder' 0) }, { [int](Get-RowValue $_ 'ManufacturerId' 0) }) {
                    $writer.WriteStartElement('Manufacturer')
                    Write-SafeAttribute $writer 'ManufacturerId' (Get-RowValue $mapping 'ManufacturerId' '') $SanitizationState "$context.ManufacturerMapping.ManufacturerId"
                    Write-SafeAttribute $writer 'IsFeaturedProduct' ((ConvertTo-CatalogBoolean (Get-RowValue $mapping 'IsFeaturedProduct' $false)).ToString().ToLowerInvariant()) $SanitizationState "$context.ManufacturerMapping.IsFeaturedProduct"
                    Write-SafeAttribute $writer 'DisplayOrder' (Get-RowValue $mapping 'DisplayOrder' 0) $SanitizationState "$context.ManufacturerMapping.DisplayOrder"
                    $writer.WriteEndElement()
                }
            }
            $writer.WriteEndElement()

            $writer.WriteStartElement('Pictures')
            if ($pictureLookup.ContainsKey($id)) {
                foreach ($picture in @($pictureLookup[$id]) | Sort-Object { [int](Get-RowValue $_ 'DisplayOrder' 0) }, { [int](Get-RowValue $_ 'PictureId' 0) }) {
                    $writer.WriteStartElement('Picture')
                    foreach ($field in @('PictureId', 'DisplayOrder', 'MimeType', 'SeoFilename', 'AltAttribute', 'TitleAttribute')) {
                        Write-SafeAttribute $writer $field (Get-RowValue $picture $field '') $SanitizationState "$context.Picture.$field"
                    }
                    $writer.WriteEndElement()
                }
            }
            $writer.WriteEndElement()

            $writer.WriteEndElement()
        }
        $writer.WriteEndElement()

        $writer.WriteEndElement()
        $writer.WriteEndDocument()
    }
    finally {
        $writer.Dispose()
    }
}

function Test-CatalogXmlStrict {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$ExpectedSummary
    )

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        throw 'Catalog XML unexpectedly contains a UTF-8 BOM.'
    }

    [void]$script:Utf8NoBom.GetString($bytes)

    $settings = New-Object System.Xml.XmlReaderSettings
    $settings.CheckCharacters = $true
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $reader = [System.Xml.XmlReader]::Create($Path, $settings)
    try {
        while ($reader.Read()) { }
    }
    finally {
        $reader.Dispose()
    }

    $document = New-Object System.Xml.XmlDocument
    $document.PreserveWhitespace = $true
    $document.XmlResolver = $null
    $document.Load($Path)

    $root = $document.DocumentElement
    if ($null -eq $root -or $root.Name -ne 'CatalogExport') {
        throw 'Catalog XML has an unexpected root element.'
    }
    if ($root.GetAttribute('SchemaVersion') -ne $script:XmlSchemaVersion) {
        throw 'Catalog XML has an unexpected schema version.'
    }

    $productNodes = $document.SelectNodes('/CatalogExport/Products/Product')
    if ($productNodes.Count -ne $ExpectedSummary.ProductsTotal) {
        throw "Strict XML validation found $($productNodes.Count) products; expected $($ExpectedSummary.ProductsTotal)."
    }

    $published = $document.SelectNodes('/CatalogExport/Products/Product[@Published="true"]').Count
    if ($published -ne $ExpectedSummary.Published) {
        throw "Strict XML validation found $published published products; expected $($ExpectedSummary.Published)."
    }
}

function Publish-ManifestAtomically {
    param(
        [Parameter(Mandatory = $true)][string]$TemporaryManifestPath,
        [Parameter(Mandatory = $true)][string]$ManifestPath,
        [Parameter(Mandatory = $true)][string]$RunId
    )

    if (Test-Path -LiteralPath $ManifestPath -PathType Leaf) {
        $backupPath = Join-Path ([System.IO.Path]::GetDirectoryName($ManifestPath)) "manifest.previous.$RunId.json"
        [System.IO.File]::Replace($TemporaryManifestPath, $ManifestPath, $backupPath, $true)
    }
    else {
        [System.IO.File]::Move($TemporaryManifestPath, $ManifestPath)
    }
}

function Invoke-CatalogSnapshotExport {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Data,
        [Parameter(Mandatory = $true)]$Config
    )

    $outputDirectory = [System.IO.Path]::GetFullPath([string]$Config.OutputDirectory)
    [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

    $lockPath = Join-Path $outputDirectory '.catalog-export.lock'
    try {
        $lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    }
    catch {
        throw 'Another catalog export is already running (exclusive lock is held).'
    }

    $temporaryXmlPath = $null
    $temporaryManifestPath = $null
    try {
        $previousManifest = Read-AndValidatePreviousManifest -OutputDirectory $outputDirectory
        $summary = Get-CatalogSummary -Data $Data
        Assert-CatalogData -Data $Data -Config $Config -Summary $summary -PreviousManifest $previousManifest

        $generatedAtUtc = [DateTime]::UtcNow
        $runId = '{0}-{1}' -f $generatedAtUtc.ToString('yyyyMMddTHHmmssfffZ'), ([Guid]::NewGuid().ToString('N').Substring(0, 8))
        $fileName = "catalog-$runId.xml"
        $finalXmlPath = Join-Path $outputDirectory $fileName
        $temporaryXmlPath = "$finalXmlPath.tmp"
        $manifestPath = Join-Path $outputDirectory 'manifest.json'
        $temporaryManifestPath = Join-Path $outputDirectory ".manifest.$runId.tmp"
        $sanitization = New-SanitizationState

        Write-CatalogXml -Data $Data -Summary $summary -Path $temporaryXmlPath -RunId $runId -GeneratedAtUtc $generatedAtUtc -SanitizationState $sanitization
        Test-CatalogXmlStrict -Path $temporaryXmlPath -ExpectedSummary $summary

        $fileInfo = Get-Item -LiteralPath $temporaryXmlPath
        if ($fileInfo.Length -le 0) {
            throw 'Catalog XML is empty.'
        }
        $sha256 = Get-Sha256Hex -Path $temporaryXmlPath

        [System.IO.File]::Move($temporaryXmlPath, $finalXmlPath)
        $temporaryXmlPath = $null

        $sourceDatabase = [string](Get-OptionalProperty $Data 'SourceDatabase' (Get-OptionalProperty $Config 'DatabaseName' 'hairshop_p34s'))
        $manifest = [ordered]@{
            schemaVersion = $script:XmlSchemaVersion
            runId = $runId
            generatedAtUtc = $generatedAtUtc.ToString('o')
            source = [ordered]@{
                system = 'nopCommerce-3.90-MSSQL'
                database = $sourceDatabase
                accessMode = 'select-only'
            }
            fileName = $fileName
            byteLength = $fileInfo.Length
            sha256 = $sha256
            summary = [ordered]@{
                productsTotal = $summary.ProductsTotal
                published = $summary.Published
                unpublished = $summary.Unpublished
                languages = $summary.Languages
                categories = $summary.Categories
                manufacturers = $summary.Manufacturers
                pictureMappings = $summary.PictureMappings
            }
            sanitization = [ordered]@{
                replacementCount = $sanitization.ReplacementCount
                samples = @($sanitization.Samples)
            }
            authority = [ordered]@{
                prices = 'excluded-non-authoritative-use-GrinS'
                stock = 'excluded-non-authoritative-use-GrinS'
            }
        }

        $manifestJson = $manifest | ConvertTo-Json -Depth 12
        Write-Utf8NoBomFile -Path $temporaryManifestPath -Content $manifestJson
        [void](Get-Content -LiteralPath $temporaryManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json)
        Publish-ManifestAtomically -TemporaryManifestPath $temporaryManifestPath -ManifestPath $manifestPath -RunId $runId
        $temporaryManifestPath = $null

        return [pscustomobject]@{
            RunId = $runId
            ManifestPath = $manifestPath
            SnapshotPath = $finalXmlPath
            Sha256 = $sha256
            Summary = $summary
            SanitizedCharacterCount = $sanitization.ReplacementCount
        }
    }
    finally {
        if ($null -ne $temporaryXmlPath -and (Test-Path -LiteralPath $temporaryXmlPath)) {
            [System.IO.File]::Delete($temporaryXmlPath)
        }
        if ($null -ne $temporaryManifestPath -and (Test-Path -LiteralPath $temporaryManifestPath)) {
            [System.IO.File]::Delete($temporaryManifestPath)
        }
        $lockStream.Dispose()
    }
}

Export-ModuleMember -Function @(
    'Read-CatalogExporterConfig',
    'Get-CatalogDataFromMssql',
    'Read-CatalogFixture',
    'Invoke-CatalogSnapshotExport'
)
