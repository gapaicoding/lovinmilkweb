[CmdletBinding()]
param(
  [string]$PackageRoot = 'E:\lovin_milk_fase_1_8_juni_2026',
  [string]$ProjectRef = 'baukcqccetzzwzgpbnoj',
  [string]$BatchKey = 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2',
  [string]$LogDirectory = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$requiredPackageRoot = 'E:\lovin_milk_fase_1_8_juni_2026'
if (
  [System.IO.Path]::GetFullPath($PackageRoot).TrimEnd('\') -cne
  [System.IO.Path]::GetFullPath($requiredPackageRoot).TrimEnd('\')
) {
  throw (
    'PackageRoot must remain the approved immutable package path: ' +
    $requiredPackageRoot
  )
}

function ConvertTo-PsqlPath {
  param([Parameter(Mandatory = $true)][string]$LiteralPath)

  return ([System.IO.Path]::GetFullPath($LiteralPath) -replace '\\', '/')
}

function Get-QueryParameter {
  param(
    [Parameter(Mandatory = $true)][uri]$Uri,
    [Parameter(Mandatory = $true)][string]$Name
  )

  foreach ($pair in $Uri.Query.TrimStart('?').Split(
      [char[]]@('&'),
      [System.StringSplitOptions]::RemoveEmptyEntries
    )) {
    $parts = $pair.Split([char[]]@('='), 2)
    if (
      [System.Uri]::UnescapeDataString($parts[0]) -eq $Name -and
      $parts.Count -eq 2
    ) {
      return [System.Uri]::UnescapeDataString($parts[1])
    }
  }

  return $null
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
  throw @'
SUPABASE_DB_URL is not set. Configure it in the current terminal from the
Supabase Dashboard Connect flow; do not paste the credential into source,
logs, screenshots, or chat.
'@
}

$databaseUrl = $env:SUPABASE_DB_URL
if ($databaseUrl.IndexOf($ProjectRef, [System.StringComparison]::Ordinal) -lt 0) {
  throw "SUPABASE_DB_URL does not identify the required project ref $ProjectRef."
}

$databaseUri = $null
if (
  -not [System.Uri]::TryCreate(
    $databaseUrl,
    [System.UriKind]::Absolute,
    [ref]$databaseUri
  ) -or
  $databaseUri.Scheme -notin @('postgres', 'postgresql')
) {
  throw 'SUPABASE_DB_URL must be a valid postgresql:// or postgres:// URI.'
}

$userInfoSeparator = $databaseUri.UserInfo.IndexOf(':')
if ($userInfoSeparator -lt 1) {
  throw 'SUPABASE_DB_URL must include a database user and password.'
}

$databaseUser = [System.Uri]::UnescapeDataString(
  $databaseUri.UserInfo.Substring(0, $userInfoSeparator)
)
$databasePassword = [System.Uri]::UnescapeDataString(
  $databaseUri.UserInfo.Substring($userInfoSeparator + 1)
)
$databaseName = [System.Uri]::UnescapeDataString(
  $databaseUri.AbsolutePath.TrimStart('/')
)
if ([string]::IsNullOrWhiteSpace($databaseName)) {
  $databaseName = 'postgres'
}

$databasePort = $databaseUri.Port
if ($databasePort -lt 1) {
  $databasePort = 5432
}

$sslMode = Get-QueryParameter -Uri $databaseUri -Name 'sslmode'
if ([string]::IsNullOrWhiteSpace($sslMode)) {
  $sslMode = 'require'
}

$approvedCsvRoot = Join-Path $PackageRoot 'approved_csv'
$psqlScript = Join-Path $PSScriptRoot 'import_june_2026_staging.psql'
if (-not (Test-Path -LiteralPath $psqlScript -PathType Leaf)) {
  throw "The psql driver is missing: $psqlScript"
}

$csvSpecs = [ordered]@{
  asset_categories_csv = @{
    File = 'asset_categories_full.csv'
    Count = 3
    Header = 'category_name,default_useful_life_months,description,import_batch_key'
  }
  assets_csv = @{
    File = 'assets_full.csv'
    Count = 21
    Header = 'asset_source_key,asset_code,asset_name,asset_name_normalized,asset_category,acquisition_date,acquisition_cost,original_source_cost,capitalization_threshold,capitalization_status,useful_life_months,residual_value,depreciation_method,monthly_depreciation,depreciation_start_date,asset_status,brand,size,supplier_name_raw,source_file,source_sheet,source_row,adjustment_note,data_origin,import_batch_key'
  }
  traffic_csv = @{
    File = 'customer_traffic_daily_june_2026.csv'
    Count = 30
    Header = 'traffic_date,adult_visitors,child_visitors,total_visitors,bill_count,source_key,source_file,source_sheet,source_row,data_origin,import_batch_key'
  }
  daily_sales_csv = @{
    File = 'daily_sales_summaries_june_2026.csv'
    Count = 30
    Header = 'date,date_raw,day_name_raw,source_file,source_sheet,source_row,bill_count,membership_count,coupon_count,cashier,adult_visitors,child_visitors,qris_dretail,qris_dynamic_bca,qris_static_bca,debit_edc_bca,qris_static_bri,cash,total_sales,dine_in,takeaway,reservation,opening_cash,deposited_cash,deposit_method,closing_cash,payment_sum,total_sales_difference,visitor_total,data_entry_status,total_sales_arayya,total_sales_lovin,source_key,data_origin,import_batch_key'
  }
  coverage_csv = @{
    File = 'data_coverage_june_2026.csv'
    Count = 7
    Header = 'domain,period_start,period_end,availability_status,row_count,notes,import_batch_key'
  }
  finance_csv = @{
    File = 'finance_summary_june_2026.csv'
    Count = 1
    Header = 'period_start,period_end,revenue,hpp,gross_profit,operating_expense,ebitda,depreciation,ebit_operating_profit,tax_amount,tax_status,net_income_provisional,net_income_status,dividend_amount,dividend_status,retained_earnings_provisional,data_origin,import_batch_key'
  }
  aliases_csv = @{
    File = 'historical_product_aliases_june_2026.csv'
    Count = 68
    Header = 'alias_key,historical_product_key,alias_name,normalized_alias,spelling_normalized_alias,mapping_status,similarity_to_latest_menu,occurrence_count,import_batch_key'
  }
  quantities_csv = @{
    File = 'historical_product_daily_quantities_june_2026.csv'
    Count = 656
    Header = 'source_key,sale_date,historical_product_key,canonical_product_name,category_name,quantity,is_free_menu,raw_variants,category_raw_variants,source_file,source_references,data_origin,import_batch_key'
  }
  historical_products_csv = @{
    File = 'historical_products_june_2026.csv'
    Count = 61
    Header = 'historical_product_key,canonical_name,category_name,mapping_status,current_product_match_strategy,import_batch_key'
  }
  purchases_csv = @{
    File = 'purchases_june_2026.csv'
    Count = 344
    Header = 'line_source_key,invoice_source_key,purchase_date,supplier_key,supplier_name_raw,receipt_reference,item_name_raw,item_name_normalized,quantity,unit,unit_price,total_amount,calculated_total,amount_difference,source_category,financial_class_final,classification_policy,asset_tracking,source_file,source_sheet,source_row,data_origin,import_batch_key'
  }
  supplier_items_csv = @{
    File = 'supplier_items_june_2026.csv'
    Count = 20
    Header = 'supplier_item_key,supplier_key,catalog_no,item_name_raw,item_name_normalized,brand_raw,size_raw,price_raw,reference_price,price_parse_status,financial_class_final,classification_policy,source_file,source_sheet,source_row,import_batch_key'
  }
  suppliers_csv = @{
    File = 'suppliers_june_2026.csv'
    Count = 9
    Header = 'supplier_key,supplier_name,normalized_name,phone,address,link,contact_person,source_type,source_references,import_batch_key'
  }
}

foreach ($variableName in $csvSpecs.Keys) {
  $spec = $csvSpecs[$variableName]
  $csvPath = Join-Path $approvedCsvRoot $spec.File
  if (-not (Test-Path -LiteralPath $csvPath -PathType Leaf)) {
    throw "Approved CSV is missing: $csvPath"
  }

  $actualHeader = (
    Get-Content -LiteralPath $csvPath -Encoding UTF8 -TotalCount 1
  ).TrimStart([char]0xFEFF)
  if ($actualHeader -cne $spec.Header) {
    throw "Header mismatch in approved CSV $($spec.File). Import aborted."
  }

  $rows = @(Import-Csv -LiteralPath $csvPath -Encoding UTF8)
  if ($rows.Count -ne $spec.Count) {
    throw (
      "Row count mismatch in {0}: found {1}, expected {2}." -f
      $spec.File,
      $rows.Count,
      $spec.Count
    )
  }

  $wrongBatchRows = @(
    $rows |
      Where-Object { $_.import_batch_key -cne $BatchKey }
  ).Count
  if ($wrongBatchRows -ne 0) {
    throw (
      "{0} contains {1} row(s) outside approved batch {2}." -f
      $spec.File,
      $wrongBatchRows,
      $BatchKey
    )
  }
}

$psqlCommand = Get-Command 'psql' -ErrorAction SilentlyContinue
if ($null -ne $psqlCommand) {
  $psqlPath = $psqlCommand.Source
} else {
  $bundledPsql = Join-Path $PackageRoot (
    'tools\postgresql-17.10-2\pgsql\bin\psql.exe'
  )
  if (-not (Test-Path -LiteralPath $bundledPsql -PathType Leaf)) {
    throw (
      'psql was not found on PATH or in the approved package tools folder. ' +
      'Install/use the approved PostgreSQL client; the import was not started.'
    )
  }
  $psqlPath = $bundledPsql
}

if ([string]::IsNullOrWhiteSpace($LogDirectory)) {
  $LogDirectory = Join-Path $PSScriptRoot '..\reports'
}
$resolvedLogDirectory = [System.IO.Path]::GetFullPath($LogDirectory)
[System.IO.Directory]::CreateDirectory($resolvedLogDirectory) | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$logPath = Join-Path (
  $resolvedLogDirectory
) "import_june_2026_staging_$timestamp.log"

$psqlArguments = @(
  '--no-psqlrc',
  '--echo-errors',
  '--set', 'ON_ERROR_STOP=1',
  '--set', "batch_key=$BatchKey"
)
$psqlArguments += @('--file', (ConvertTo-PsqlPath -LiteralPath $psqlScript))

$environmentNames = @(
  'SUPABASE_DB_URL',
  'PGHOST',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGPASSWORD',
  'PGSSLMODE',
  'PGAPPNAME',
  'PGCLIENTENCODING'
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
  $previousEnvironment[$name] = [System.Environment]::GetEnvironmentVariable(
    $name,
    [System.EnvironmentVariableTarget]::Process
  )
}

try {
  # libpq environment variables keep the password out of arguments and logs.
  [System.Environment]::SetEnvironmentVariable(
    'SUPABASE_DB_URL',
    $null,
    [System.EnvironmentVariableTarget]::Process
  )
  [System.Environment]::SetEnvironmentVariable(
    'PGHOST',
    $databaseUri.Host,
    [System.EnvironmentVariableTarget]::Process
  )
  [System.Environment]::SetEnvironmentVariable(
    'PGPORT',
    [string]$databasePort,
    [System.EnvironmentVariableTarget]::Process
  )
  [System.Environment]::SetEnvironmentVariable(
    'PGDATABASE',
    $databaseName,
    [System.EnvironmentVariableTarget]::Process
  )
  [System.Environment]::SetEnvironmentVariable(
    'PGUSER',
    $databaseUser,
    [System.EnvironmentVariableTarget]::Process
  )
  [System.Environment]::SetEnvironmentVariable(
    'PGPASSWORD',
    $databasePassword,
    [System.EnvironmentVariableTarget]::Process
  )
  [System.Environment]::SetEnvironmentVariable(
    'PGSSLMODE',
    $sslMode,
    [System.EnvironmentVariableTarget]::Process
  )
  [System.Environment]::SetEnvironmentVariable(
    'PGAPPNAME',
    'lovin-milk-june-2026-staging-import',
    [System.EnvironmentVariableTarget]::Process
  )
  [System.Environment]::SetEnvironmentVariable(
    'PGCLIENTENCODING',
    'UTF8',
    [System.EnvironmentVariableTarget]::Process
  )

  @(
    "timestamp=$((Get-Date).ToString('o'))",
    "project_ref=$ProjectRef",
    "batch_key=$BatchKey",
    'credential_logged=false'
  ) | Set-Content -LiteralPath $logPath -Encoding UTF8

  Write-Host "Validated 12 approved CSV files for project $ProjectRef."
  Write-Host "Starting transactional staging COPY. Log: $logPath"

  & $psqlPath @psqlArguments 2>&1 |
    Tee-Object -FilePath $logPath -Append
  $psqlExitCode = $LASTEXITCODE

  if ($psqlExitCode -ne 0) {
    throw (
      "psql staging import failed with exit code $psqlExitCode. " +
      "The transaction was not committed. Review $logPath."
    )
  }

  Write-Host 'Staging import committed successfully. Run staging reconciliation next.'
} finally {
  foreach ($name in $environmentNames) {
    [System.Environment]::SetEnvironmentVariable(
      $name,
      $previousEnvironment[$name],
      [System.EnvironmentVariableTarget]::Process
    )
  }

  $databasePassword = $null
  $databaseUrl = $null
  $databaseUri = $null
}
