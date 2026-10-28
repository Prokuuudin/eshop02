[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,

    [string]$FixturePath = '',

    [switch]$AllowFixtureSource
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$modulePath = Join-Path $PSScriptRoot 'HairshopCatalogExporter.psm1'
Import-Module $modulePath -Force

try {
    $config = Read-CatalogExporterConfig -Path $ConfigPath

    if (-not [string]::IsNullOrWhiteSpace($FixturePath)) {
        if (-not $AllowFixtureSource) {
            throw 'Fixture mode requires the explicit -AllowFixtureSource switch.'
        }
        $data = Read-CatalogFixture -Path $FixturePath
    }
    else {
        $data = Get-CatalogDataFromMssql -Config $config
    }

    $result = Invoke-CatalogSnapshotExport -Data $data -Config $config
    Write-Host ('Catalog export completed. RunId={0}' -f $result.RunId)
    Write-Host ('Products={0}; Published={1}; Unpublished={2}' -f $result.Summary.ProductsTotal, $result.Summary.Published, $result.Summary.Unpublished)
    Write-Host ('SanitizedCharacters={0}' -f $result.SanitizedCharacterCount)
    Write-Host ('Snapshot={0}' -f $result.SnapshotPath)
    Write-Host ('Manifest={0}' -f $result.ManifestPath)
    Write-Host ('SHA256={0}' -f $result.Sha256)
    exit 0
}
catch {
    Write-Error ('Catalog export failed: {0}' -f $_.Exception.Message)
    exit 1
}
