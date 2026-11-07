Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)

function Get-JsonSourceValue {
    param($Row, [string]$Name, $Default = $null)
    if ($Row -is [System.Data.DataRow]) {
        if (-not $Row.Table.Columns.Contains($Name)) { return $Default }
        $value = $Row[$Name]
    }
    else {
        $property = $Row.PSObject.Properties[$Name]
        if ($null -eq $property) { return $Default }
        $value = $property.Value
    }
    if ($null -eq $value -or $value -is [System.DBNull]) { return $Default }
    return $value
}

function ConvertTo-JsonSourceUtc {
    param($Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return '' }
    $date = if ($Value -is [DateTime]) { [DateTime]$Value } else {
        [DateTime]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal)
    }
    if ($date.Kind -eq [DateTimeKind]::Unspecified) { $date = [DateTime]::SpecifyKind($date, [DateTimeKind]::Utc) }
    else { $date = $date.ToUniversalTime() }
    return $date.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
}

function ConvertTo-JsonSourceBoolean {
    param($Value)
    if ($Value -is [bool]) { return [bool]$Value }
    if ($Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or $Value -is [int64]) { return ([int64]$Value -ne 0) }
    $text = [string]$Value
    if ($text -eq '1' -or $text.Equals('true', [StringComparison]::OrdinalIgnoreCase)) { return $true }
    if ($text -eq '0' -or $text.Equals('false', [StringComparison]::OrdinalIgnoreCase)) { return $false }
    throw "JSON source export cannot normalize boolean value '$text'."
}

function ConvertTo-JsonSourceRow {
    param($Row, [string[]]$Fields, [string[]]$BooleanFields = @(), [string[]]$UtcFields = @())
    $result = [ordered]@{}
    foreach ($field in $Fields) {
        $value = Get-JsonSourceValue $Row $field $null
        if ($field -in $BooleanFields) { $value = ConvertTo-JsonSourceBoolean $value }
        elseif ($field -in $UtcFields) { $value = ConvertTo-JsonSourceUtc $value }
        $result[$field] = $value
    }
    return [pscustomobject]$result
}

function Get-JsonSourceSha256 {
    param([byte[]]$Bytes)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function New-HairshopCatalogJsonSnapshot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Data,
        [DateTime]$GeneratedAtUtc = [DateTime]::UtcNow
    )

    $products = @($Data.Products | Where-Object { ConvertTo-JsonSourceBoolean (Get-JsonSourceValue $_ 'Published' $false) })
    if ($products.Count -eq 0) { throw 'JSON source export refused to publish an empty product snapshot.' }
    $productIds = @{}
    foreach ($product in $products) {
        $id = [string](Get-JsonSourceValue $product 'ProductId' '')
        if (-not $id -or $productIds.ContainsKey($id)) { throw "JSON source export found an invalid or duplicate ProductId '$id'." }
        $productIds[$id] = $true
    }

    $payload = [pscustomobject][ordered]@{
        SourceDatabase = [string](Get-JsonSourceValue $Data 'SourceDatabase' '')
        Languages = @($Data.Languages | ForEach-Object { ConvertTo-JsonSourceRow $_ @('LanguageId','Name','LanguageCulture','UniqueSeoCode','Published','DisplayOrder') @('Published') })
        Products = @($products | ForEach-Object { ConvertTo-JsonSourceRow $_ @('ProductId','SKU','EAN','Name','ShortDescription','FullDescription','MetaKeywords','MetaDescription','MetaTitle','Published','CreatedOnUtc','UpdatedOnUtc') @('Published') @('CreatedOnUtc','UpdatedOnUtc') })
        LocalizedValues = @($Data.LocalizedValues | Where-Object { [string](Get-JsonSourceValue $_ 'EntityName' '') -eq 'Product' -and $productIds.ContainsKey([string](Get-JsonSourceValue $_ 'EntityId' '')) } | ForEach-Object { ConvertTo-JsonSourceRow $_ @('EntityId','LanguageId','EntityName','LocaleKey','LocaleValue') })
        Categories = @($Data.Categories | ForEach-Object { ConvertTo-JsonSourceRow $_ @('CategoryId','Name') })
        CategoryMappings = @($Data.CategoryMappings | Where-Object { $productIds.ContainsKey([string](Get-JsonSourceValue $_ 'ProductId' '')) } | ForEach-Object { ConvertTo-JsonSourceRow $_ @('ProductId','CategoryId','IsFeaturedProduct','DisplayOrder') @('IsFeaturedProduct') })
        Manufacturers = @($Data.Manufacturers | ForEach-Object { ConvertTo-JsonSourceRow $_ @('ManufacturerId','Name') })
        ManufacturerMappings = @($Data.ManufacturerMappings | Where-Object { $productIds.ContainsKey([string](Get-JsonSourceValue $_ 'ProductId' '')) } | ForEach-Object { ConvertTo-JsonSourceRow $_ @('ProductId','ManufacturerId','IsFeaturedProduct','DisplayOrder') @('IsFeaturedProduct') })
        Pictures = @($Data.Pictures | Where-Object { $productIds.ContainsKey([string](Get-JsonSourceValue $_ 'ProductId' '')) } | ForEach-Object { ConvertTo-JsonSourceRow $_ @('ProductId','PictureId','DisplayOrder','MimeType','SeoFilename','AltAttribute','TitleAttribute') })
    }
    $payloadJson = $payload | ConvertTo-Json -Depth 15 -Compress
    $payloadBytes = $script:Utf8NoBom.GetBytes($payloadJson)
    return [pscustomobject][ordered]@{
        schemaVersion = 1
        source = 'nopCommerce-3.90-MSSQL'
        generatedAtUtc = $GeneratedAtUtc.ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)
        snapshotId = [Guid]::NewGuid().ToString('N')
        productCount = $products.Count
        payloadEncoding = 'base64+utf8+json'
        payloadSha256 = Get-JsonSourceSha256 $payloadBytes
        payloadBase64 = [Convert]::ToBase64String($payloadBytes)
    }
}

function Write-HairshopCatalogJsonSnapshotAtomic {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)]$Snapshot, [Parameter(Mandatory = $true)][string]$Path)
    $fullPath = [IO.Path]::GetFullPath($Path)
    $directory = [IO.Path]::GetDirectoryName($fullPath)
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $temporary = "$fullPath.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporary, ($Snapshot | ConvertTo-Json -Depth 5), $script:Utf8NoBom)
        [void](Get-Content -LiteralPath $temporary -Raw -Encoding UTF8 | ConvertFrom-Json)
        if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
            [IO.File]::Replace($temporary, $fullPath, "$fullPath.previous", $true)
        }
        else { [IO.File]::Move($temporary, $fullPath) }
    }
    finally { if (Test-Path -LiteralPath $temporary) { [IO.File]::Delete($temporary) } }
    return $fullPath
}

Export-ModuleMember -Function @('New-HairshopCatalogJsonSnapshot','Write-HairshopCatalogJsonSnapshotAtomic')
