[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ExporterConfigPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [string]$FixturePath = '',
    [switch]$AllowFixtureSource
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'HairshopCatalogExporter.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'HairshopCatalogJsonSource.psm1') -Force

try {
    $config = Read-CatalogExporterConfig -Path $ExporterConfigPath
    if ($FixturePath) {
        if (-not $AllowFixtureSource) { throw 'Fixture mode requires -AllowFixtureSource.' }
        $data = Read-CatalogFixture -Path $FixturePath
    }
    else { $data = Get-CatalogDataFromMssql -Config $config -PublishedProductsOnly }
    $snapshot = New-HairshopCatalogJsonSnapshot -Data $data
    $published = Write-HairshopCatalogJsonSnapshotAtomic -Snapshot $snapshot -Path $OutputPath
    Write-Host ("Hairshop catalog JSON snapshot published. Products={0}; SHA256={1}; Path={2}" -f $snapshot.productCount, $snapshot.payloadSha256, $published)
    exit 0
}
catch {
    Write-Error $_
    exit 1
}
