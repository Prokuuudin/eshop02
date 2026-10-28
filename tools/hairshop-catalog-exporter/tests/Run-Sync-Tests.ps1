[CmdletBinding()]
param()

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path (Split-Path $PSScriptRoot -Parent) 'HairshopCatalogExporter.psm1') -Force
Import-Module (Join-Path (Split-Path $PSScriptRoot -Parent) 'HairshopNewProductSync.psm1') -Force

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('hairshop-new-product-sync-tests-' + [Guid]::NewGuid().ToString('N'))
$fixture = Join-Path $PSScriptRoot 'fixtures\catalog-data.json'
$script:ApiCalls = 0

function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw "Assertion failed: $Message" } }
function Assert-Equal($Expected, $Actual, [string]$Message) { if ($Expected -ne $Actual) { throw "Assertion failed: $Message. Expected '$Expected', got '$Actual'." } }

try {
    [IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null
    $secretPath = Join-Path $temporaryRoot 'api.key'
    [IO.File]::WriteAllText($secretPath, ('x' * 40), (New-Object Text.UTF8Encoding($false, $true)))
    $config = [pscustomobject]@{
        ApiEndpoint = 'https://hairshoppro.example/api/internal/hairshop-catalog-sync'
        ApiKeyFile = $secretPath
        StatePath = Join-Path $temporaryRoot 'state\sync-state.json'
        ReportDirectory = Join-Path $temporaryRoot 'reports'
        BatchSize = 100
        RequestTimeoutSeconds = 30
        AllowApply = $true
    }
    $data = Read-CatalogFixture -Path $fixture
    $converted = ConvertTo-HairshopNewProductCandidates -Data $data
    Assert-Equal 2 $converted.Candidates.Count 'only published products become candidates'
    Assert-Equal 0 $converted.Rejected.Count 'valid fixture products are not rejected'
    $first = $converted.Candidates | Where-Object legacyProductId -eq 101
    $expectedRu = ($data.LocalizedValues | Where-Object { $_.EntityName -eq 'Product' -and $_.EntityId -eq 101 -and $_.LanguageId -eq 2 -and $_.LocaleKey -eq 'Name' }).LocaleValue
    $expectedEn = ($data.LocalizedValues | Where-Object { $_.EntityName -eq 'Product' -and $_.EntityId -eq 101 -and $_.LanguageId -eq 3 -and $_.LocaleKey -eq 'Name' }).LocaleValue
    Assert-Equal 'ONKO-001' $first.sku 'SKU mapping'
    Assert-Equal $expectedEn $first.titles.en 'EN title mapping'
    Assert-Equal $expectedRu $first.titles.ru 'RU title mapping'
    Assert-Equal $data.Categories[0].Name $first.categoryNames[0] 'category mapping'
    Assert-Equal $data.Manufacturers[0].Name $first.manufacturerName 'manufacturer mapping'
    Assert-Equal 'https://hairshop.lv/content/images/thumbs/0000501_onko-sensitive.jpeg' $first.images[0] 'safe image reference mapping'
    Write-Host 'PASS: published candidate mapping includes translations, category, manufacturer and image references'

    $duplicateData = Get-Content -LiteralPath $fixture -Raw -Encoding UTF8 | ConvertFrom-Json
    $duplicateData.Products[1].SKU = $duplicateData.Products[0].SKU
    $duplicates = ConvertTo-HairshopNewProductCandidates -Data $duplicateData
    Assert-Equal 0 $duplicates.Candidates.Count 'duplicate source SKU candidates are removed before batching'
    Assert-Equal 2 $duplicates.Rejected.Count 'both duplicate source SKU products are reported'
    Write-Host 'PASS: duplicate source identities are rejected before HTTP batching'

    $api = {
        param($Endpoint, $ApiKey, $Body, $TimeoutSeconds)
        $script:ApiCalls++
        $results = @($Body.products | ForEach-Object {
            [pscustomobject]@{
                legacyProductId = $_.legacyProductId
                sku = $_.sku
                ean = $_.ean
                targetProductId = "nop390-$($_.legacyProductId)"
                status = $(if ($Body.mode -eq 'apply') { 'created' } else { 'would_create' })
                reasons = @('TEST')
                matchedProductIds = @()
                warnings = @()
            }
        })
        return [pscustomobject]@{ schemaVersion = 1; runId = $Body.runId; mode = $Body.mode; metrics = [pscustomobject]@{}; results = $results }
    }

    $dryRun = Invoke-HairshopNewProductSync -Data $data -Config $config -ApiInvoker $api
    Assert-Equal 'dry-run' $dryRun.Mode 'default mode'
    Assert-Equal 2 $dryRun.Summary.wouldCreate 'dry-run would-create count'
    Assert-True (-not (Test-Path -LiteralPath $config.StatePath)) 'dry-run must not write state'
    Assert-True (Test-Path -LiteralPath $dryRun.ReportPath) 'dry-run report must be written'
    Write-Host 'PASS: dry-run calls the API, writes a report and leaves state untouched'

    $apply = Invoke-HairshopNewProductSync -Data $data -Config $config -Apply -ApiInvoker $api
    Assert-Equal 2 $apply.Summary.created 'apply created count'
    Assert-True (Test-Path -LiteralPath $config.StatePath) 'apply writes state'
    $stateText = Get-Content -LiteralPath $config.StatePath -Raw -Encoding UTF8
    Assert-True (-not $stateText.Contains(('x' * 40))) 'state must not contain the API secret'
    $callsAfterFirstApply = $script:ApiCalls

    $repeat = Invoke-HairshopNewProductSync -Data $data -Config $config -Apply -ApiInvoker $api
    Assert-Equal 0 $repeat.Summary.pending 'repeat apply has no locally pending products'
    Assert-Equal $callsAfterFirstApply $script:ApiCalls 'repeat apply does not call API for processed products'
    Assert-Equal 0 $repeat.Summary.created 'repeat apply creates nothing'
    $third = Invoke-HairshopNewProductSync -Data $data -Config $config -Apply -ApiInvoker $api
    Assert-Equal 0 $third.Summary.pending 'third apply remains idempotent after replacing an existing state backup'
    Assert-Equal $callsAfterFirstApply $script:ApiCalls 'third apply still makes no API call'
    Write-Host 'PASS: applied state makes the PowerShell client idempotent on repeat runs'

    $reports = @(Get-ChildItem -LiteralPath $config.ReportDirectory -Filter '*.json' -File)
    Assert-Equal 4 $reports.Count 'one journal report per run'
    Write-Host 'PASS: every run has a JSON journal and no secret is logged'
    Write-Host 'ALL SYNC TESTS PASSED: 5'
    exit 0
}
catch {
    Write-Error $_
    exit 1
}
finally {
    if (Test-Path -LiteralPath $temporaryRoot -PathType Container) {
        $resolved = [IO.Path]::GetFullPath($temporaryRoot)
        if ($resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolved).StartsWith('hairshop-new-product-sync-tests-')) {
            [IO.Directory]::Delete($resolved, $true)
        }
    }
}
