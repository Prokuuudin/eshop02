[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [switch]$Apply,
    [switch]$Scheduled
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'HairshopNewProductSync.psm1') -Force

try {
    $syncConfig = Read-HairshopNewProductSyncConfig -Path $ConfigPath
    if ($Scheduled -and -not ([string]$syncConfig.ScheduleEnabled -ieq 'true')) {
        Write-Host 'Hairshop new-product scheduled sync is disabled by configuration; no source or API access was attempted.'
        exit 0
    }
    $source = Invoke-HairshopCatalogJsonDownload -Config $syncConfig
    $result = Invoke-HairshopNewProductSync -Data $source.Data -Config $syncConfig -Apply:$Apply -SourceSnapshot $source.Metadata
    Write-Host ('Hairshop new-product sync completed. RunId={0}; Mode={1}' -f $result.RunId, $result.Mode)
    Write-Host ('Pending={0}; Created={1}; WouldCreate={2}; AlreadyExists={3}; Conflicts={4}; LocalRejected={5}' -f $result.Summary.pending, $result.Summary.created, $result.Summary.wouldCreate, $result.Summary.alreadyExists, $result.Summary.conflicts, $result.Summary.locallyRejected)
    Write-Host ('Report={0}' -f $result.ReportPath)
    exit 0
}
catch {
    Write-Error ('Hairshop new-product sync failed: {0}' -f $_.Exception.Message)
    exit 1
}
