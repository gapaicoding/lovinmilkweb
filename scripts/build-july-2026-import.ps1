param(
  [string]$Workbook = "imports/lovin_menu_final_dan_penjualan_juli_2026_staging.xlsx",
  [string]$Output = "supabase/migrations/20260731180000_final_lovin_catalog_july_2026_actual.sql"
)

$ErrorActionPreference = "Stop"

function SqlText([object]$value) {
  if ($null -eq $value -or [string]::IsNullOrEmpty([string]$value)) { return "null" }
  return "'" + ([string]$value).Replace("'", "''") + "'"
}

function SqlNumber([object]$value) {
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) { return "null" }
  return ([decimal]$value).ToString([Globalization.CultureInfo]::InvariantCulture)
}

function ExcelDate([object]$value) {
  return [DateTime]::FromOADate([double]$value).ToString("yyyy-MM-dd")
}

function Read-XlsxSheet([string]$path, [string]$sheetName) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $path))
  try {
    [xml]$workbook = [IO.StreamReader]::new(
      ($archive.Entries | Where-Object FullName -eq "xl/workbook.xml").Open()
    ).ReadToEnd()
    [xml]$relationships = [IO.StreamReader]::new(
      ($archive.Entries | Where-Object FullName -eq "xl/_rels/workbook.xml.rels").Open()
    ).ReadToEnd()
    $sheet = $workbook.workbook.sheets.sheet | Where-Object name -eq $sheetName
    if (-not $sheet) { throw "Sheet $sheetName tidak ditemukan." }
    $relationshipId = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    $relationship = $relationships.Relationships.Relationship | Where-Object Id -eq $relationshipId
    $entryPath = $relationship.Target.TrimStart("/")
    if (-not $entryPath.StartsWith("xl/")) { $entryPath = "xl/" + $entryPath }
    $entry = $archive.Entries | Where-Object FullName -eq $entryPath
    [xml]$xml = [IO.StreamReader]::new($entry.Open()).ReadToEnd()
    $rows = @()
    foreach ($row in $xml.worksheet.sheetData.row) {
      $values = @{}
      foreach ($cell in $row.c) {
        $letters = $cell.r -replace "[0-9]", ""
        $column = 0
        foreach ($character in $letters.ToCharArray()) {
          $column = ($column * 26) + ([int][char]$character - [int][char]'A' + 1)
        }
        $values[$column] = if ($null -ne $cell.v) { [string]$cell.v } else { $null }
      }
      $rows += ,$values
    }
    $headers = $rows[0]
    $result = @()
    foreach ($row in $rows | Select-Object -Skip 1) {
      $record = [ordered]@{}
      foreach ($column in $headers.Keys) { $record[$headers[$column]] = $row[$column] }
      $result += [pscustomobject]$record
    }
    return $result
  } finally { $archive.Dispose() }
}

$menu = Read-XlsxSheet $Workbook "Menu_Final"
$sales = Read-XlsxSheet $Workbook "Sales_Harian_Juli"
$mapping = Read-XlsxSheet $Workbook "Mapping_Produk"
$quantities = Read-XlsxSheet $Workbook "Qty_Produk_Juli"

$menuValues = $menu | ForEach-Object {
  "(" + (SqlText $_.'Kategori Final') + "," + (SqlText $_.'Produk Final') + "," + (SqlNumber $_.'Harga Menu') + ")"
}
$salesValues = $sales | ForEach-Object {
  $date = ExcelDate $_.Tanggal
  $rawLovin = SqlNumber $_.'Sales Lovin Raw'
  $resolvedLovin = SqlNumber $_.'Sales Lovin Resolved'
  $detailAvailable = if ([decimal]($_.'Qty Produk Tercatat') -gt 0) { "true" } else { "false" }
  "(" + (SqlText $date) + "::date," + (SqlNumber $_.'Jumlah Struk (sumber)') + "," +
    (SqlNumber $_.'Pengunjung Dewasa') + "," + (SqlNumber $_.'Pengunjung Anak') + "," +
    (SqlNumber $_.'Total Pengunjung') + "," + (SqlNumber $_.'Total Sales') + "," +
    (SqlNumber $_.'Sales Arayya') + "," + $rawLovin + "," + $resolvedLovin + "," +
    (SqlNumber $_.'Qty Produk Tercatat') + ",$detailAvailable," + (SqlText $_.'Catatan Sumber') + ")"
}
$mappingValues = $mapping | ForEach-Object {
  "(" + (SqlText $_.'Nama Produk di Sheet Juli') + "," + (SqlText $_.'Produk Menu Final') + "," +
    (SqlText $_.'Kategori Final') + "," + (SqlText $_.'Status Mapping') + "," +
    $(if ($_.'Gratis' -eq '1') { 'true' } else { 'false' }) + ")"
}
$quantityValues = $quantities | ForEach-Object {
  "(" + (SqlText (ExcelDate $_.Tanggal)) + "::date," + (SqlText $_.'Nama Produk Sumber') + "," +
    (SqlNumber $_.Qty) + "," + (SqlText $_.'Produk Menu Final') + "," +
    (SqlText $_.'Kategori Final') + "," + (SqlText $_.'Status Mapping') + "," +
    $(if ($_.'Gratis' -eq '1') { 'true' } else { 'false' }) + ")"
}

$template = Get-Content -Raw "supabase/sql/final_lovin_july_2026_import.template.sql"
$sql = $template.Replace("__MENU_VALUES__", ($menuValues -join ",`n"))
$sql = $sql.Replace("__SALES_VALUES__", ($salesValues -join ",`n"))
$sql = $sql.Replace("__MAPPING_VALUES__", ($mappingValues -join ",`n"))
$sql = $sql.Replace("__QUANTITY_VALUES__", ($quantityValues -join ",`n"))
$utf8NoBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path (Resolve-Path ".") $Output), $sql, $utf8NoBom)
Write-Output "Generated $Output from $Workbook"
