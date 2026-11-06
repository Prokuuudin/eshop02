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
function Invoke-ExpectedFailure {
    param([scriptblock]$Action, [string]$MessagePattern)
    $failed = $false
    try { & $Action }
    catch {
        $failed = $true
        if (-not $_.Exception.Message.Contains($MessagePattern)) {
            throw "Expected failure containing '$MessagePattern', got '$($_.Exception.Message)'."
        }
    }
    if (-not $failed) { throw "Expected failure containing '$MessagePattern', but the action succeeded." }
}

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
    Assert-Equal 2 $converted.Candidates.Count 'only marked and published products become candidates'
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
    Write-Host 'PASS: marked published candidate mapping includes translations, category, manufacturer and image references'

    $deniedData = Get-Content -LiteralPath $fixture -Raw -Encoding UTF8 | ConvertFrom-Json
    $deniedData.Products[1].IsMarkedForProSync = $false
    $denied = ConvertTo-HairshopNewProductCandidates -Data $deniedData
    Assert-Equal 1 $denied.Candidates.Count 'unmarked published product is excluded'
    Assert-Equal 101 $denied.Candidates[0].legacyProductId 'only explicitly marked published product remains'

    $incompleteData = Get-Content -LiteralPath $fixture -Raw -Encoding UTF8 | ConvertFrom-Json
    $incompleteData.Products[0].Name = ''
    $incomplete = ConvertTo-HairshopNewProductCandidates -Data $incompleteData
    Assert-Equal 1 $incomplete.Candidates.Count 'incomplete marked product is not sent'
    Assert-Equal 1 $incomplete.Rejected.Count 'incomplete marked product is reported locally'
    Assert-Equal 'MISSING_REQUIRED_ID_SKU_OR_TITLE' $incomplete.Rejected[0].reason 'incomplete product rejection reason'

    $missingMarkerData = Get-Content -LiteralPath $fixture -Raw -Encoding UTF8 | ConvertFrom-Json
    $missingMarkerData.Products[0].PSObject.Properties.Remove('IsMarkedForProSync')
    Invoke-ExpectedFailure -MessagePattern 'does not contain IsMarkedForProSync' -Action {
        ConvertTo-HairshopNewProductCandidates -Data $missingMarkerData | Out-Null
    }
    $invalidMarkerData = Get-Content -LiteralPath $fixture -Raw -Encoding UTF8 | ConvertFrom-Json
    $invalidMarkerData.Products[0].IsMarkedForProSync = 'true'
    Invoke-ExpectedFailure -MessagePattern 'confirmed boolean' -Action {
        ConvertTo-HairshopNewProductCandidates -Data $invalidMarkerData | Out-Null
    }
    Write-Host 'PASS: denied, unpublished, incomplete, missing-marker and invalid-marker products fail closed'

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

    Invoke-ExpectedFailure -MessagePattern 'does not contain results' -Action {
        Assert-SyncApiBatchResponse -Response ([pscustomobject]@{ runId = 'response-test'; mode = 'dry-run'; results = @() }) -Batch @($converted.Candidates[0]) -RunId 'response-test' -Mode 'dry-run' | Out-Null
    }
    Invoke-ExpectedFailure -MessagePattern "invalid status 'created'" -Action {
        Assert-SyncApiBatchResponse -Response ([pscustomobject]@{
            runId = 'response-test'
            mode = 'dry-run'
            results = @([pscustomobject]@{ legacyProductId = 101; sku = 'ONKO-001'; targetProductId = 'nop390-101'; status = 'created' })
        }) -Batch @($converted.Candidates[0]) -RunId 'response-test' -Mode 'dry-run' | Out-Null
    }
    Write-Host 'PASS: incomplete and mode-inconsistent API responses are rejected'

    $callsBeforeBlockedRun = $script:ApiCalls
    Invoke-ExpectedFailure -MessagePattern 'does not contain IsMarkedForProSync' -Action {
        Invoke-HairshopNewProductSync -Data $missingMarkerData -Config $config -ApiInvoker $api | Out-Null
    }
    Assert-Equal $callsBeforeBlockedRun $script:ApiCalls 'missing marker blocks every API request'
    Write-Host 'PASS: fail-closed marker validation happens before HTTP batching'

    $dryRun = Invoke-HairshopNewProductSync -Data $data -Config $config -ApiInvoker $api
    Assert-Equal 'dry-run' $dryRun.Mode 'default mode'
    Assert-Equal 2 $dryRun.Summary.wouldCreate 'dry-run would-create count'
    Assert-True (-not (Test-Path -LiteralPath $config.StatePath)) 'dry-run must not write state'
    Assert-True (Test-Path -LiteralPath $dryRun.ReportPath) 'dry-run report must be written'
    Write-Host 'PASS: dry-run calls the API, writes a report and leaves state untouched'

    $lockPath = "$($config.StatePath).lock"
    $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $callsBeforeConcurrentRun = $script:ApiCalls
        Invoke-ExpectedFailure -MessagePattern 'already running' -Action {
            Invoke-HairshopNewProductSync -Data $data -Config $config -ApiInvoker $api | Out-Null
        }
        Assert-Equal $callsBeforeConcurrentRun $script:ApiCalls 'concurrent run is rejected before HTTP batching'
    }
    finally { $lockStream.Dispose() }
    Write-Host 'PASS: exclusive scheduler lock rejects a parallel run'

    $partialConfig = [pscustomobject]@{
        ApiEndpoint = $config.ApiEndpoint
        ApiKeyFile = $config.ApiKeyFile
        StatePath = Join-Path $temporaryRoot 'partial-state\sync-state.json'
        ReportDirectory = Join-Path $temporaryRoot 'partial-reports'
        BatchSize = 1
        RequestTimeoutSeconds = 30
        AllowApply = $true
    }
    $script:PartialCalls = 0
    $partialApi = {
        param($Endpoint, $ApiKey, $Body, $TimeoutSeconds)
        $script:PartialCalls++
        if ($script:PartialCalls -eq 2) { throw 'simulated second batch failure' }
        $product = @($Body.products)[0]
        return [pscustomobject]@{
            schemaVersion = 1
            runId = $Body.runId
            mode = $Body.mode
            metrics = [pscustomobject]@{}
            results = @([pscustomobject]@{ legacyProductId = $product.legacyProductId; sku = $product.sku; ean = $product.ean; targetProductId = "nop390-$($product.legacyProductId)"; status = 'created'; reasons = @('TEST'); matchedProductIds = @(); warnings = @() })
        }
    }
    Invoke-ExpectedFailure -MessagePattern 'simulated second batch failure' -Action {
        Invoke-HairshopNewProductSync -Data $data -Config $partialConfig -Apply -ApiInvoker $partialApi | Out-Null
    }
    Assert-True (-not (Test-Path -LiteralPath $partialConfig.StatePath)) 'partial failure must not commit local state'
    $partialFailurePath = @(Get-ChildItem -LiteralPath $partialConfig.ReportDirectory -Filter '*.json' -File)[0].FullName
    $partialFailure = Get-Content -LiteralPath $partialFailurePath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-Equal 1 $partialFailure.progress.completedBatches 'failure report completed batch count'
    Assert-Equal 2 $partialFailure.progress.totalBatches 'failure report total batch count'
    Assert-Equal 1 $partialFailure.progress.acknowledgedResults 'failure report acknowledged result count'
    Assert-Equal 'created' $partialFailure.partialResults[0].status 'failure report retains committed remote result'

    $recoveryApi = {
        param($Endpoint, $ApiKey, $Body, $TimeoutSeconds)
        $product = @($Body.products)[0]
        $status = if ([int64]$product.legacyProductId -eq 101) { 'already_exists' } else { 'created' }
        return [pscustomobject]@{
            schemaVersion = 1
            runId = $Body.runId
            mode = $Body.mode
            metrics = [pscustomobject]@{}
            results = @([pscustomobject]@{ legacyProductId = $product.legacyProductId; sku = $product.sku; ean = $product.ean; targetProductId = "nop390-$($product.legacyProductId)"; status = $status; reasons = @('TEST'); matchedProductIds = @(); warnings = @() })
        }
    }
    $recovered = Invoke-HairshopNewProductSync -Data $data -Config $partialConfig -Apply -ApiInvoker $recoveryApi
    Assert-Equal 1 $recovered.Summary.alreadyExists 'recovery recognizes remotely committed first batch'
    Assert-Equal 1 $recovered.Summary.created 'recovery creates only the previously failed batch'
    $recoveredState = Get-Content -LiteralPath $partialConfig.StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-Equal 2 @($recoveredState.processed.PSObject.Properties).Count 'recovery commits both products to local state'
    Write-Host 'PASS: partial batch failure is journaled and a full retry recovers idempotently'

    $scheduledConfigPath = Join-Path $temporaryRoot 'scheduled-disabled.json'
    $scheduledConfig = [ordered]@{
        CatalogExporterConfigPath = Join-Path $temporaryRoot 'must-not-be-read-exporter.json'
        ApiEndpoint = $config.ApiEndpoint
        ApiKeyFile = Join-Path $temporaryRoot 'must-not-be-read-api.key'
        StatePath = Join-Path $temporaryRoot 'must-not-be-written-state.json'
        ReportDirectory = Join-Path $temporaryRoot 'must-not-be-written-reports'
        BatchSize = 50
        RequestTimeoutSeconds = 30
        AllowApply = $false
        ScheduleEnabled = $false
    }
    [IO.File]::WriteAllText($scheduledConfigPath, ($scheduledConfig | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false, $true)))
    $scheduledEntryPoint = Join-Path (Split-Path $PSScriptRoot -Parent) 'Sync-HairshopNewProducts.ps1'
    $scheduledOutput = & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $scheduledEntryPoint -ConfigPath $scheduledConfigPath -Scheduled -Apply 2>&1
    Assert-Equal 0 $LASTEXITCODE ('disabled scheduled entry point exit code: ' + ($scheduledOutput -join ' '))
    Assert-True (($scheduledOutput -join ' ').Contains('disabled by configuration')) 'disabled scheduled entry point reports a no-op'
    Assert-True (-not (Test-Path -LiteralPath $scheduledConfig.StatePath)) 'disabled schedule does not create state'
    Assert-True (-not (Test-Path -LiteralPath $scheduledConfig.ReportDirectory)) 'disabled schedule does not create reports or access API'
    Write-Host 'PASS: scheduled mode is a no-op until its independent config gate is enabled'

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
    Assert-Equal 5 $reports.Count 'one journal report per started run, including fail-closed validation failure'
    Write-Host 'PASS: every run has a JSON journal and no secret is logged'
    Write-Host 'ALL SYNC TESTS PASSED: 13'
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
