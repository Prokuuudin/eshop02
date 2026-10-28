[CmdletBinding()]
param()

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$modulePath = Join-Path (Split-Path $PSScriptRoot -Parent) 'HairshopCatalogExporter.psm1'
$fixturePath = Join-Path $PSScriptRoot 'fixtures\catalog-data.json'
Import-Module $modulePath -Force

$script:Passed = 0
$script:TemporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('hairshop-exporter-tests-' + [Guid]::NewGuid().ToString('N'))

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        throw "Assertion failed: $Message"
    }
}

function Assert-Equal {
    param($Expected, $Actual, [string]$Message)
    if ($Expected -ne $Actual) {
        throw "Assertion failed: $Message. Expected '$Expected', got '$Actual'."
    }
}

function Invoke-ExpectedFailure {
    param([scriptblock]$Action, [string]$MessagePattern)
    $failed = $false
    try {
        & $Action
    }
    catch {
        $failed = $true
        if (-not $_.Exception.Message.Contains($MessagePattern)) {
            throw "Expected failure containing '$MessagePattern', got '$($_.Exception.Message)'."
        }
    }
    if (-not $failed) {
        throw "Expected failure containing '$MessagePattern', but the action succeeded."
    }
}

function New-TestConfig {
    param([string]$OutputDirectory)
    return [pscustomobject]@{
        DatabaseName = 'hairshop_fixture'
        OutputDirectory = $OutputDirectory
        MinimumProductCount = 3
        MinimumPublishedCount = 2
        MinimumUnpublishedCount = 1
        ExpectedProductCount = 3
        ExpectedPublishedCount = 2
        ExpectedUnpublishedCount = 1
        MaximumProductDropPercent = 5.0
    }
}

function Get-FileSha256 {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

try {
    [System.IO.Directory]::CreateDirectory($script:TemporaryRoot) | Out-Null
    $outputDirectory = Join-Path $script:TemporaryRoot 'output'
    $config = New-TestConfig -OutputDirectory $outputDirectory
    $data = Read-CatalogFixture -Path $fixturePath

    $first = Invoke-CatalogSnapshotExport -Data $data -Config $config
    $manifestPath = Join-Path $outputDirectory 'manifest.json'
    Assert-True (Test-Path -LiteralPath $manifestPath -PathType Leaf) 'manifest.json must be published'
    Assert-True (Test-Path -LiteralPath $first.SnapshotPath -PathType Leaf) 'snapshot must be published'
    Assert-Equal 3 $first.Summary.ProductsTotal 'product count'
    Assert-Equal 2 $first.Summary.Published 'published count'
    Assert-Equal 1 $first.Summary.Unpublished 'unpublished count'
    Assert-Equal 1 $first.SanitizedCharacterCount 'invalid XML 1.0 character replacement count'

    $bytes = [System.IO.File]::ReadAllBytes($first.SnapshotPath)
    Assert-True (-not ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)) 'XML must be UTF-8 without BOM'
    $strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
    $xmlText = $strictUtf8.GetString($bytes)
    Assert-True ($xmlText.Contains([string]$data.Languages[0].Name)) 'UTF-8 Latvian content must survive'
    Assert-True ($xmlText.Contains([string]$data.LocalizedValues[0].LocaleValue)) 'UTF-8 Cyrillic content must survive'
    Assert-True (-not $xmlText.Contains([string][char]0x001C)) 'invalid XML control character must be removed'
    Assert-True ($xmlText.Contains([string][char]0xFFFD)) 'invalid XML control character must be replaced with U+FFFD'
    Assert-True (-not $xmlText.Contains('<Price>')) 'product prices must not be exported'
    Assert-True (-not $xmlText.Contains('<StockQuantity>')) 'product stock must not be exported'

    $xmlDocument = New-Object System.Xml.XmlDocument
    $xmlDocument.XmlResolver = $null
    $xmlDocument.Load($first.SnapshotPath)
    Assert-Equal 3 $xmlDocument.SelectNodes('/CatalogExport/Products/Product').Count 'strict XML product nodes'
    Assert-Equal 1 $xmlDocument.SelectNodes('/CatalogExport/Products/Product[@ProductId="101"]/CategoryMappings/Category[@CategoryId="10"]').Count 'category mapping'
    Assert-Equal 1 $xmlDocument.SelectNodes('/CatalogExport/Products/Product[@ProductId="101"]/ManufacturerMappings/Manufacturer[@ManufacturerId="20"]').Count 'manufacturer mapping'
    Assert-Equal 1 $xmlDocument.SelectNodes('/CatalogExport/Products/Product[@ProductId="101"]/Pictures/Picture[@PictureId="501"]').Count 'picture mapping'
    Assert-Equal 1 $xmlDocument.SelectNodes('/CatalogExport/Products/Product[@ProductId="101"]/LocalizedValues/LocalizedValue[@LanguageCode="ru"][@Key="Name"]').Count 'structured translation'

    $firstManifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-Equal (Get-FileSha256 -Path $first.SnapshotPath) $firstManifest.sha256 'manifest SHA-256'
    Assert-Equal 3 $firstManifest.summary.productsTotal 'manifest product count'
    Assert-Equal 'excluded-non-authoritative-use-GrinS' $firstManifest.authority.prices 'manifest price authority'
    $script:Passed++
    Write-Host 'PASS: valid UTF-8 XML, sanitization, relations, counts and manifest checksum'

    $cliOutputDirectory = Join-Path $script:TemporaryRoot 'cli-output'
    $cliConfigPath = Join-Path $script:TemporaryRoot 'cli-config.json'
    $cliConfig = New-TestConfig -OutputDirectory $cliOutputDirectory
    $cliConfig | Add-Member -NotePropertyName ConnectionStringEnvironmentVariable -NotePropertyValue 'HAIRSHOP_TEST_CONNECTION_STRING'
    $cliConfig | Add-Member -NotePropertyName ConnectionStringFile -NotePropertyValue ''
    $cliConfigJson = $cliConfig | ConvertTo-Json -Depth 5
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)
    [System.IO.File]::WriteAllText($cliConfigPath, $cliConfigJson, $utf8NoBom)
    $entryPoint = Join-Path (Split-Path $PSScriptRoot -Parent) 'Export-HairshopCatalog.ps1'
    $cliOutput = & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $entryPoint -ConfigPath $cliConfigPath -FixturePath $fixturePath -AllowFixtureSource 2>&1
    $cliExitCode = $LASTEXITCODE
    Assert-Equal 0 $cliExitCode ('command-line entry point must succeed: ' + ($cliOutput -join ' '))
    Assert-True (Test-Path -LiteralPath (Join-Path $cliOutputDirectory 'manifest.json') -PathType Leaf) 'command-line entry point must publish manifest'
    $script:Passed++
    Write-Host 'PASS: command-line entry point runs with the explicit fixture safety switch'

    $firstManifestHash = Get-FileSha256 -Path $manifestPath
    $second = Invoke-CatalogSnapshotExport -Data $data -Config $config
    Assert-True ($second.RunId -ne $first.RunId) 'rerun must create a new immutable snapshot'
    Assert-True (Test-Path -LiteralPath $first.SnapshotPath -PathType Leaf) 'rerun must preserve previous snapshot'
    Assert-True (Test-Path -LiteralPath $second.SnapshotPath -PathType Leaf) 'rerun must publish new snapshot'
    $backupManifest = Join-Path $outputDirectory ("manifest.previous.{0}.json" -f $second.RunId)
    Assert-True (Test-Path -LiteralPath $backupManifest -PathType Leaf) 'atomic manifest replacement must retain backup manifest'
    Assert-Equal $firstManifestHash (Get-FileSha256 -Path $backupManifest) 'backup manifest must equal previous stable manifest'
    $script:Passed++
    Write-Host 'PASS: repeat run preserves previous snapshot and atomically replaces manifest'

    $stableManifestHash = Get-FileSha256 -Path $manifestPath
    $duplicateData = (Get-Content -LiteralPath $fixturePath -Raw -Encoding UTF8 | ConvertFrom-Json)
    $duplicateData.Products[1].ProductId = $duplicateData.Products[0].ProductId
    Invoke-ExpectedFailure -MessagePattern 'Duplicate ProductId' -Action {
        Invoke-CatalogSnapshotExport -Data $duplicateData -Config $config | Out-Null
    }
    Assert-Equal $stableManifestHash (Get-FileSha256 -Path $manifestPath) 'duplicate ID failure must preserve stable manifest'
    $script:Passed++
    Write-Host 'PASS: duplicate ProductId is rejected without changing manifest'

    $incompleteConfig = New-TestConfig -OutputDirectory $outputDirectory
    $incompleteConfig.MinimumProductCount = 99
    Invoke-ExpectedFailure -MessagePattern 'below configured minimum' -Action {
        Invoke-CatalogSnapshotExport -Data $data -Config $incompleteConfig | Out-Null
    }
    Assert-Equal $stableManifestHash (Get-FileSha256 -Path $manifestPath) 'incomplete export failure must preserve stable manifest'
    $script:Passed++
    Write-Host 'PASS: incomplete export is rejected without changing manifest'

    $lockPath = Join-Path $outputDirectory '.catalog-export.lock'
    $lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    try {
        Invoke-ExpectedFailure -MessagePattern 'already running' -Action {
            Invoke-CatalogSnapshotExport -Data $data -Config $config | Out-Null
        }
    }
    finally {
        $lockStream.Dispose()
    }
    Assert-Equal $stableManifestHash (Get-FileSha256 -Path $manifestPath) 'concurrent run failure must preserve stable manifest'
    $script:Passed++
    Write-Host 'PASS: exclusive lock rejects a concurrent run'

    $temporaryArtifacts = @(Get-ChildItem -LiteralPath $outputDirectory -File | Where-Object { $_.Name -like '*.tmp' })
    Assert-Equal 0 $temporaryArtifacts.Count 'temporary files must be cleaned after failures'
    $script:Passed++
    Write-Host 'PASS: temporary publication files are cleaned after failures'

    Write-Host ("ALL TESTS PASSED: {0}" -f $script:Passed)
    exit 0
}
catch {
    Write-Error $_
    exit 1
}
finally {
    if (Test-Path -LiteralPath $script:TemporaryRoot -PathType Container) {
        $resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($script:TemporaryRoot)
        $expectedPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
        if ($resolvedTemporaryRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
            [System.IO.Path]::GetFileName($resolvedTemporaryRoot).StartsWith('hairshop-exporter-tests-', [System.StringComparison]::Ordinal)) {
            [System.IO.Directory]::Delete($resolvedTemporaryRoot, $true)
        }
    }
}
