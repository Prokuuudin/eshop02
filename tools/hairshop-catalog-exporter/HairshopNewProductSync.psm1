Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)

function Get-SyncValue {
    param($Object, [string]$Name, $Default = $null)
    if ($null -eq $Object) { return $Default }
    if ($Object -is [System.Data.DataRow]) {
        if (-not $Object.Table.Columns.Contains($Name)) { return $Default }
        $value = $Object[$Name]
    }
    else {
        $property = $Object.PSObject.Properties[$Name]
        if ($null -eq $property) { return $Default }
        $value = $property.Value
    }
    if ($null -eq $value -or $value -is [System.DBNull]) { return $Default }
    return $value
}

function ConvertTo-SyncBoolean {
    param($Value)
    if ($Value -is [bool]) { return $Value }
    return ([string]$Value -eq '1' -or [string]$Value -ieq 'true')
}

function ConvertTo-SyncUtcText {
    param($Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return '' }
    $date = if ($Value -is [DateTime]) { [DateTime]$Value } else {
        [DateTime]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal)
    }
    if ($date.Kind -eq [DateTimeKind]::Unspecified) { $date = [DateTime]::SpecifyKind($date, [DateTimeKind]::Utc) }
    else { $date = $date.ToUniversalTime() }
    return $date.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
}

function Add-SyncLookupValue {
    param([hashtable]$Lookup, [string]$Key, $Value)
    if (-not $Lookup.ContainsKey($Key)) { $Lookup[$Key] = New-Object Collections.ArrayList }
    [void]$Lookup[$Key].Add($Value)
}

function Get-PreferredSyncText {
    param($Primary, $Fallback)
    $first = [string]$Primary
    if (-not [string]::IsNullOrWhiteSpace($first)) { return $first.Trim() }
    $second = [string]$Fallback
    if (-not [string]::IsNullOrWhiteSpace($second)) { return $second.Trim() }
    return ''
}

function Get-PictureUrl {
    param($Picture)
    $id = [int64](Get-SyncValue $Picture 'PictureId' 0)
    if ($id -le 0) { return $null }
    $seo = ([string](Get-SyncValue $Picture 'SeoFilename' '')).Trim()
    if ($seo -and $seo -notmatch '^[a-zA-Z0-9._-]+$') { return $null }
    $mime = ([string](Get-SyncValue $Picture 'MimeType' 'image/jpeg')).ToLowerInvariant()
    $extension = switch ($mime) {
        'image/png' { 'png' }
        'image/gif' { 'gif' }
        'image/webp' { 'webp' }
        'image/pjpeg' { 'jpeg' }
        'image/jpeg' { 'jpeg' }
        default { $null }
    }
    if (-not $extension) { return $null }
    $padded = $id.ToString('0000000', [Globalization.CultureInfo]::InvariantCulture)
    $suffix = if ($seo) { "_$seo" } else { '' }
    return "https://hairshop.lv/content/images/thumbs/$padded$suffix.$extension"
}

function ConvertTo-HairshopNewProductCandidates {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)]$Data)

    $languageCodes = @{}
    foreach ($language in @($Data.Languages)) {
        $id = [string](Get-SyncValue $language 'LanguageId' '')
        $code = ([string](Get-SyncValue $language 'UniqueSeoCode' '')).Trim().ToLowerInvariant()
        if (-not $code) {
            $culture = ([string](Get-SyncValue $language 'LanguageCulture' '')).Trim().ToLowerInvariant()
            if ($culture.Length -ge 2) { $code = $culture.Substring(0, 2) }
        }
        if ($id -and $code) { $languageCodes[$id] = $code }
    }

    $localized = @{}
    foreach ($value in @($Data.LocalizedValues)) {
        $entity = [string](Get-SyncValue $value 'EntityName' '')
        $entityId = [string](Get-SyncValue $value 'EntityId' '')
        $languageId = [string](Get-SyncValue $value 'LanguageId' '')
        $key = [string](Get-SyncValue $value 'LocaleKey' '')
        if ($entity -and $entityId -and $languageCodes.ContainsKey($languageId) -and $key) {
            $localized["$entity|$entityId|$($languageCodes[$languageId])|$key"] = [string](Get-SyncValue $value 'LocaleValue' '')
        }
    }

    $categories = @{}
    foreach ($category in @($Data.Categories)) { $categories[[string](Get-SyncValue $category 'CategoryId' '')] = $category }
    $categoryMappings = @{}
    foreach ($mapping in @($Data.CategoryMappings)) { Add-SyncLookupValue $categoryMappings ([string](Get-SyncValue $mapping 'ProductId' '')) $mapping }

    $manufacturers = @{}
    foreach ($manufacturer in @($Data.Manufacturers)) { $manufacturers[[string](Get-SyncValue $manufacturer 'ManufacturerId' '')] = $manufacturer }
    $manufacturerMappings = @{}
    foreach ($mapping in @($Data.ManufacturerMappings)) { Add-SyncLookupValue $manufacturerMappings ([string](Get-SyncValue $mapping 'ProductId' '')) $mapping }

    $pictures = @{}
    foreach ($picture in @($Data.Pictures)) { Add-SyncLookupValue $pictures ([string](Get-SyncValue $picture 'ProductId' '')) $picture }

    $candidates = New-Object Collections.ArrayList
    $rejected = New-Object Collections.ArrayList
    foreach ($product in @($Data.Products)) {
        if (-not (ConvertTo-SyncBoolean (Get-SyncValue $product 'Published' $false))) { continue }
        $id = [int64](Get-SyncValue $product 'ProductId' 0)
        $sku = ([string](Get-SyncValue $product 'SKU' '')).Trim()
        $defaultTitle = ([string](Get-SyncValue $product 'Name' '')).Trim()
        if ($id -le 0 -or -not $sku -or -not $defaultTitle) {
            [void]$rejected.Add([pscustomobject]@{ legacyProductId = $id; sku = $sku; reason = 'MISSING_REQUIRED_ID_SKU_OR_TITLE' })
            continue
        }

        $text = @{}
        foreach ($code in @('ru', 'lv', 'en')) {
            $text[$code] = [ordered]@{
                title = [string]($localized["Product|$id|$code|Name"])
                short = [string]($localized["Product|$id|$code|ShortDescription"])
                full = [string]($localized["Product|$id|$code|FullDescription"])
                metaTitle = [string]($localized["Product|$id|$code|MetaTitle"])
                metaDescription = [string]($localized["Product|$id|$code|MetaDescription"])
            }
        }

        $categoryNames = New-Object Collections.ArrayList
        if ($categoryMappings.ContainsKey([string]$id)) {
            foreach ($mapping in @($categoryMappings[[string]$id]) | Sort-Object { [int](Get-SyncValue $_ 'DisplayOrder' 0) }) {
                $categoryId = [string](Get-SyncValue $mapping 'CategoryId' '')
                if ($categories.ContainsKey($categoryId)) {
                    $name = ([string](Get-SyncValue $categories[$categoryId] 'Name' '')).Trim()
                    if ($name -and -not $categoryNames.Contains($name)) { [void]$categoryNames.Add($name) }
                }
            }
        }

        $manufacturerName = $null
        if ($manufacturerMappings.ContainsKey([string]$id)) {
            $firstMapping = @($manufacturerMappings[[string]$id] | Sort-Object { [int](Get-SyncValue $_ 'DisplayOrder' 0) } | Select-Object -First 1)
            if ($firstMapping.Count) {
                $manufacturerId = [string](Get-SyncValue $firstMapping[0] 'ManufacturerId' '')
                if ($manufacturers.ContainsKey($manufacturerId)) {
                    $name = ([string](Get-SyncValue $manufacturers[$manufacturerId] 'Name' '')).Trim()
                    if ($name) { $manufacturerName = $name }
                }
            }
        }

        $imageUrls = New-Object Collections.ArrayList
        if ($pictures.ContainsKey([string]$id)) {
            foreach ($picture in @($pictures[[string]$id]) | Sort-Object { [int](Get-SyncValue $_ 'DisplayOrder' 0) }) {
                $url = Get-PictureUrl $picture
                if ($url -and -not $imageUrls.Contains($url)) { [void]$imageUrls.Add($url) }
            }
        }

        $defaultDescription = Get-PreferredSyncText (Get-SyncValue $product 'FullDescription' '') (Get-SyncValue $product 'ShortDescription' '')
        $created = ConvertTo-SyncUtcText (Get-SyncValue $product 'CreatedOnUtc' $null)
        $updated = ConvertTo-SyncUtcText (Get-SyncValue $product 'UpdatedOnUtc' $null)
        if (-not $created -or -not $updated) {
            [void]$rejected.Add([pscustomobject]@{ legacyProductId = $id; sku = $sku; reason = 'MISSING_CREATED_OR_UPDATED_DATE' })
            continue
        }

        [void]$candidates.Add([pscustomobject][ordered]@{
            legacyProductId = $id
            sku = $sku
            ean = $(if ([string]::IsNullOrWhiteSpace([string](Get-SyncValue $product 'EAN' ''))) { $null } else { ([string](Get-SyncValue $product 'EAN' '')).Trim() })
            published = $true
            titles = [pscustomobject][ordered]@{ default = $defaultTitle; ru = $text.ru.title; lv = $text.lv.title; en = $text.en.title }
            descriptions = [pscustomobject][ordered]@{
                default = $defaultDescription
                ru = (Get-PreferredSyncText $text.ru.full $text.ru.short)
                lv = (Get-PreferredSyncText $text.lv.full $text.lv.short)
                en = (Get-PreferredSyncText $text.en.full $text.en.short)
            }
            metaTitles = [pscustomobject][ordered]@{ default = [string](Get-SyncValue $product 'MetaTitle' ''); ru = $text.ru.metaTitle; lv = $text.lv.metaTitle; en = $text.en.metaTitle }
            metaDescriptions = [pscustomobject][ordered]@{ default = [string](Get-SyncValue $product 'MetaDescription' ''); ru = $text.ru.metaDescription; lv = $text.lv.metaDescription; en = $text.en.metaDescription }
            categoryNames = @($categoryNames)
            manufacturerName = $manufacturerName
            images = @($imageUrls)
            createdOnUtc = $created
            updatedOnUtc = $updated
        })
    }

    $skuCounts = @{}
    $eanCounts = @{}
    $idCounts = @{}
    foreach ($candidate in @($candidates)) {
        $skuKey = ([string]$candidate.sku).Trim().ToUpperInvariant()
        $eanKey = ([string]$candidate.ean).Trim().ToUpperInvariant() -replace '[\s-]+', ''
        $idKey = [string]$candidate.legacyProductId
        $skuCounts[$skuKey] = [int]$skuCounts[$skuKey] + 1
        if ($eanKey) { $eanCounts[$eanKey] = [int]$eanCounts[$eanKey] + 1 }
        $idCounts[$idKey] = [int]$idCounts[$idKey] + 1
    }
    $safeCandidates = New-Object Collections.ArrayList
    foreach ($candidate in @($candidates)) {
        $skuKey = ([string]$candidate.sku).Trim().ToUpperInvariant()
        $eanKey = ([string]$candidate.ean).Trim().ToUpperInvariant() -replace '[\s-]+', ''
        $idKey = [string]$candidate.legacyProductId
        $reasons = New-Object Collections.ArrayList
        if ([int]$skuCounts[$skuKey] -gt 1) { [void]$reasons.Add('DUPLICATE_SOURCE_SKU') }
        if ($eanKey -and [int]$eanCounts[$eanKey] -gt 1) { [void]$reasons.Add('DUPLICATE_SOURCE_EAN') }
        if ([int]$idCounts[$idKey] -gt 1) { [void]$reasons.Add('DUPLICATE_SOURCE_LEGACY_ID') }
        if ($reasons.Count) {
            [void]$rejected.Add([pscustomobject]@{ legacyProductId = $candidate.legacyProductId; sku = $candidate.sku; reason = (@($reasons) -join ',') })
        }
        else { [void]$safeCandidates.Add($candidate) }
    }

    return [pscustomobject]@{ Candidates = @($safeCandidates); Rejected = @($rejected) }
}

function Read-HairshopNewProductSyncConfig {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $config = Get-Content -LiteralPath $resolved -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($name in @('CatalogExporterConfigPath', 'ApiEndpoint', 'ApiKeyFile', 'StatePath', 'ReportDirectory')) {
        if ([string]::IsNullOrWhiteSpace([string](Get-SyncValue $config $name ''))) { throw "Sync configuration field $name is required." }
    }
    foreach ($name in @('CatalogExporterConfigPath', 'ApiKeyFile', 'StatePath', 'ReportDirectory')) {
        if (-not [IO.Path]::IsPathRooted([string]$config.$name)) { throw "Sync configuration field $name must be an absolute path outside webroot." }
    }
    $uri = New-Object Uri([string]$config.ApiEndpoint)
    if ($uri.Scheme -ne 'https') { throw 'ApiEndpoint must use HTTPS.' }
    if ($null -eq $config.PSObject.Properties['BatchSize']) { $config | Add-Member -NotePropertyName BatchSize -NotePropertyValue 50 }
    if ($null -eq $config.PSObject.Properties['RequestTimeoutSeconds']) { $config | Add-Member -NotePropertyName RequestTimeoutSeconds -NotePropertyValue 120 }
    if ($null -eq $config.PSObject.Properties['AllowApply']) { $config | Add-Member -NotePropertyName AllowApply -NotePropertyValue $false }
    $config.BatchSize = [Math]::Min(100, [Math]::Max(1, [int]$config.BatchSize))
    return $config
}

function Read-SyncState {
    param([string]$Path)
    $processed = @{}
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $state = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([int](Get-SyncValue $state 'schemaVersion' 0) -ne 1) { throw 'Unsupported sync state schemaVersion.' }
        $stateProcessed = Get-SyncValue $state 'processed' $null
        if ($null -ne $stateProcessed) {
            foreach ($property in $stateProcessed.PSObject.Properties) { $processed[$property.Name] = $property.Value }
        }
    }
    return $processed
}

function Write-JsonAtomic {
    param([string]$Path, $Value)
    $directory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Path))
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $temporary = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 15), $script:Utf8NoBom)
        [void](Get-Content -LiteralPath $temporary -Raw -Encoding UTF8 | ConvertFrom-Json)
        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            $backup = "$Path.previous"
            [IO.File]::Replace($temporary, $Path, $backup, $true)
        }
        else { [IO.File]::Move($temporary, $Path) }
    }
    finally { if (Test-Path -LiteralPath $temporary) { [IO.File]::Delete($temporary) } }
}

function Invoke-SyncApiRequest {
    param([string]$Endpoint, [string]$ApiKey, $Body, [int]$TimeoutSeconds)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    return Invoke-RestMethod -Uri $Endpoint -Method Post -Headers @{ 'x-hairshop-catalog-sync-key' = $ApiKey } -ContentType 'application/json; charset=utf-8' -Body ($Body | ConvertTo-Json -Depth 15 -Compress) -TimeoutSec $TimeoutSeconds
}

function Invoke-HairshopNewProductSync {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Data,
        [Parameter(Mandatory = $true)]$Config,
        [switch]$Apply,
        [scriptblock]$ApiInvoker
    )
    if ($Apply -and -not (ConvertTo-SyncBoolean (Get-SyncValue $Config 'AllowApply' $false))) { throw 'Apply is disabled in sync configuration.' }
    if (-not (Test-Path -LiteralPath ([string]$Config.ApiKeyFile) -PathType Leaf)) { throw 'Configured API key file does not exist.' }
    $apiKey = [IO.File]::ReadAllText([string]$Config.ApiKeyFile, $script:Utf8NoBom).Trim()
    if ($apiKey.Length -lt 32) { throw 'Catalog sync API key must contain at least 32 characters.' }
    if ($null -eq $ApiInvoker) { $ApiInvoker = ${function:Invoke-SyncApiRequest} }

    [IO.Directory]::CreateDirectory([string]$Config.ReportDirectory) | Out-Null
    $stateDirectory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath([string]$Config.StatePath))
    [IO.Directory]::CreateDirectory($stateDirectory) | Out-Null
    $lockPath = "$($Config.StatePath).lock"
    try { $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { throw 'Another Hairshop new-product sync is already running.' }

    $runId = '{0}-{1}' -f [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'), ([Guid]::NewGuid().ToString('N').Substring(0, 8))
    $mode = if ($Apply) { 'apply' } else { 'dry-run' }
    $reportPath = Join-Path ([string]$Config.ReportDirectory) "catalog-sync-$runId.json"
    try {
        $converted = ConvertTo-HairshopNewProductCandidates -Data $Data
        $processed = Read-SyncState -Path ([string]$Config.StatePath)
        $pending = @($converted.Candidates | Where-Object { -not $processed.ContainsKey([string]$_.legacyProductId) })
        $results = New-Object Collections.ArrayList
        for ($offset = 0; $offset -lt $pending.Count; $offset += [int]$Config.BatchSize) {
            $last = [Math]::Min($offset + [int]$Config.BatchSize - 1, $pending.Count - 1)
            $batch = @($pending[$offset..$last])
            $body = [pscustomobject][ordered]@{ schemaVersion = 1; runId = $runId; mode = $mode; products = $batch }
            $response = & $ApiInvoker ([string]$Config.ApiEndpoint) $apiKey $body ([int]$Config.RequestTimeoutSeconds)
            if ([string](Get-SyncValue $response 'runId' '') -ne $runId -or [string](Get-SyncValue $response 'mode' '') -ne $mode) { throw 'Catalog sync API returned an unexpected runId or mode.' }
            foreach ($result in @($response.results)) { [void]$results.Add($result) }
        }

        if ($Apply) {
            foreach ($result in @($results)) {
                if ($result.status -in @('created', 'already_exists')) {
                    $processed[[string]$result.legacyProductId] = [ordered]@{ status = [string]$result.status; targetProductId = [string]$result.targetProductId; processedAtUtc = [DateTime]::UtcNow.ToString('o') }
                }
            }
            $stateObject = [ordered]@{ schemaVersion = 1; updatedAtUtc = [DateTime]::UtcNow.ToString('o'); processed = $processed }
            Write-JsonAtomic -Path ([string]$Config.StatePath) -Value $stateObject
        }

        $summary = [ordered]@{
            candidates = $converted.Candidates.Count
            pending = $pending.Count
            locallyRejected = $converted.Rejected.Count
            created = @($results | Where-Object status -eq 'created').Count
            wouldCreate = @($results | Where-Object status -eq 'would_create').Count
            alreadyExists = @($results | Where-Object status -eq 'already_exists').Count
            conflicts = @($results | Where-Object status -eq 'conflict').Count
        }
        $report = [ordered]@{ schemaVersion = 1; runId = $runId; mode = $mode; generatedAtUtc = [DateTime]::UtcNow.ToString('o'); summary = $summary; locallyRejected = @($converted.Rejected); results = @($results) }
        Write-JsonAtomic -Path $reportPath -Value $report
        return [pscustomobject]@{ RunId = $runId; Mode = $mode; Summary = [pscustomobject]$summary; ReportPath = $reportPath; StatePath = [string]$Config.StatePath }
    }
    catch {
        $failure = [ordered]@{ schemaVersion = 1; runId = $runId; mode = $mode; generatedAtUtc = [DateTime]::UtcNow.ToString('o'); status = 'failed'; error = $_.Exception.Message.Substring(0, [Math]::Min(500, $_.Exception.Message.Length)) }
        try { Write-JsonAtomic -Path $reportPath -Value $failure } catch { }
        throw
    }
    finally { $lock.Dispose() }
}

Export-ModuleMember -Function @('Read-HairshopNewProductSyncConfig', 'ConvertTo-HairshopNewProductCandidates', 'Invoke-HairshopNewProductSync')
