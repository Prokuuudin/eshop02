param(
    [string]$Source = 'C:\Users\User\Desktop\ESHOP_M+ MATERIALS\export.xml',
    [string]$Destination = (Join-Path $PSScriptRoot 'export_sample.xml')
)

$ErrorActionPreference = 'Stop'
[xml]$document = Get-Content -LiteralPath $Source -Raw
$items = @($document.root.item)

function Get-Features($item) {
    $features = [System.Collections.Generic.HashSet[string]]::new()
    $sku = [string]$item.sku
    $code = [string]$item.code
    $title = [string]$item.title

    if ($sku -match '^\d+$') { [void]$features.Add('sku:numeric') }
    if ($sku -match '[A-Za-z]' -and $sku -match '\d') { [void]$features.Add('sku:alphanumeric') }
    if ($sku -match '^-') { [void]$features.Add('sku:negative-looking') }
    if ($sku -match '^\d+\.\d+$') { [void]$features.Add('sku:decimal-looking') }
    if ($sku -match '/') { [void]$features.Add('sku:slash') }
    if ($sku -match '[^A-Za-z0-9./-]') { [void]$features.Add('sku:other-punctuation') }

    if ($code -eq '') { [void]$features.Add('code:empty') }
    elseif ($code -match '^\d+$') { [void]$features.Add('code:numeric') }
    elseif ($code -match '^-') { [void]$features.Add('code:negative-looking') }
    elseif ($code -match '^\d+\.\d+$') { [void]$features.Add('code:decimal-looking') }
    else { [void]$features.Add('code:alphanumeric') }

    if ($title -match '[^\u0000-\u007F]') { [void]$features.Add('title:unicode') }
    if ($title -match '[&<>"'']') { [void]$features.Add('title:xml-special') }
    if ($title -match '^\d+$') { [void]$features.Add('title:numeric-only') }

    foreach ($field in 'capacity','price1','price2','price3','price4') {
        $text = [string]$item.$field
        $value = [decimal]$text
        if ($value -eq 0) { [void]$features.Add("${field}:zero") }
        elseif ($text -match '\.') { [void]$features.Add("${field}:positive-decimal") }
        else { [void]$features.Add("${field}:positive-integer") }
    }

    if ([int]$item.quantity -eq 0) { [void]$features.Add('quantity:zero') }
    else { [void]$features.Add('quantity:positive') }

    $positiveWarehouses = 0
    foreach ($warehouse in $item.warehouses.warehouse) {
        $id = [string]$warehouse.id
        $value = [decimal]$warehouse.'#text'
        if ($value -eq 0) { [void]$features.Add("warehouse-${id}:zero") }
        else {
            [void]$features.Add("warehouse-${id}:positive")
            $positiveWarehouses++
        }
    }
    if ($positiveWarehouses -eq 0) { [void]$features.Add('stock:none') }
    elseif ($positiveWarehouses -eq 1) { [void]$features.Add('stock:one-warehouse') }
    else { [void]$features.Add('stock:multiple-warehouses') }

    return $features
}

$required = [System.Collections.Generic.HashSet[string]]::new()
$featureSets = foreach ($item in $items) {
    $set = Get-Features $item
    foreach ($feature in $set) { [void]$required.Add($feature) }
    [pscustomobject]@{ Item = $item; Features = $set }
}

$selected = [System.Collections.Generic.List[object]]::new()
$uncovered = [System.Collections.Generic.HashSet[string]]::new($required)
while ($uncovered.Count -gt 0) {
    $best = $null
    $bestGain = 0
    foreach ($candidate in $featureSets) {
        $gain = 0
        foreach ($feature in $candidate.Features) {
            if ($uncovered.Contains($feature)) { $gain++ }
        }
        if ($gain -gt $bestGain) {
            $best = $candidate
            $bestGain = $gain
        }
    }
    if ($null -eq $best -or $bestGain -eq 0) { throw 'Feature coverage stalled.' }
    $selected.Add($best)
    foreach ($feature in $best.Features) { [void]$uncovered.Remove($feature) }
}

# Include genuine boundary records for the principal numeric fields.
$boundaryItems = foreach ($field in 'capacity','price1','price2','price3','price4','quantity') {
    $items | Sort-Object { [decimal]$_.$field } | Select-Object -First 1
    $items | Sort-Object { [decimal]$_.$field } | Select-Object -Last 1
}
$boundaryItems += @(foreach ($id in 1..9) {
    $items | Sort-Object { [decimal](($_.warehouses.warehouse | Where-Object id -eq ([string]$id)).'#text') } | Select-Object -Last 1
})

$selectedSku = [System.Collections.Generic.HashSet[string]]::new()
$finalItems = [System.Collections.Generic.List[object]]::new()
$selectedItems = @($selected | ForEach-Object { $_.Item })
foreach ($item in $selectedItems + @($boundaryItems)) {
    if ($selectedSku.Add([string]$item.sku)) { $finalItems.Add($item) }
}

$output = [System.Xml.XmlDocument]::new()
[void]$output.AppendChild($output.CreateXmlDeclaration('1.0', 'utf-8', $null))
$root = $output.CreateElement('root')
[void]$output.AppendChild($root)
foreach ($item in $finalItems) {
    [void]$root.AppendChild($output.ImportNode($item, $true))
}

$settings = [System.Xml.XmlWriterSettings]::new()
$settings.Encoding = [System.Text.UTF8Encoding]::new($false)
$settings.Indent = $true
$settings.NewLineChars = "`n"
$writer = [System.Xml.XmlWriter]::Create($Destination, $settings)
try { $output.Save($writer) } finally { $writer.Dispose() }

Write-Output "Source items: $($items.Count)"
Write-Output "Sample items: $($finalItems.Count)"
Write-Output "Covered value classes: $($required.Count)"
Write-Output "Destination: $Destination"
