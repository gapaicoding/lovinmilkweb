-- LOVIN MILK - PRIVATE STAGING FOR THE APPROVED JUNE 2026 IMPORT
-- Batch: LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2
--
-- Staging column names intentionally mirror the approved CSV headers.
-- Integer-like CSV fields use numeric plus an integral-value CHECK because
-- approved lexemes such as "18.0" are valid integers but PostgreSQL's integer
-- input function rejects them during COPY.

begin;

set local timezone = 'Asia/Jakarta';
set local lock_timeout = '15s';
set local statement_timeout = '0';

create schema if not exists staging;

revoke all on schema staging from public, anon, authenticated;

create table if not exists staging.asset_categories_import (
  category_name text not null,
  default_useful_life_months numeric not null
    check (
      default_useful_life_months > 0
      and default_useful_life_months = trunc(default_useful_life_months)
    ),
  description text,
  import_batch_key text not null,
  primary key (import_batch_key, category_name)
);

create table if not exists staging.historical_products_import (
  historical_product_key text not null,
  canonical_name text not null,
  category_name text,
  mapping_status text not null,
  current_product_match_strategy text,
  import_batch_key text not null,
  primary key (import_batch_key, historical_product_key)
);

create table if not exists staging.historical_product_aliases_import (
  alias_key text not null,
  historical_product_key text not null,
  alias_name text not null,
  normalized_alias text not null,
  spelling_normalized_alias text,
  mapping_status text not null,
  similarity_to_latest_menu numeric,
  occurrence_count numeric not null
    check (
      occurrence_count >= 0
      and occurrence_count = trunc(occurrence_count)
    ),
  import_batch_key text not null,
  primary key (import_batch_key, alias_key)
);

create table if not exists staging.historical_product_daily_quantities_import (
  source_key text not null,
  sale_date date not null,
  historical_product_key text not null,
  canonical_product_name text not null,
  category_name text,
  quantity numeric not null,
  is_free_menu boolean not null,
  raw_variants text,
  category_raw_variants text,
  source_file text not null,
  source_references text,
  data_origin text not null,
  import_batch_key text not null,
  primary key (import_batch_key, source_key),
  check (quantity >= 0)
);

create table if not exists staging.suppliers_import (
  supplier_key text not null,
  supplier_name text not null,
  normalized_name text not null,
  phone text,
  address text,
  link text,
  contact_person text,
  source_type text,
  source_references text,
  import_batch_key text not null,
  primary key (import_batch_key, supplier_key)
);

create table if not exists staging.supplier_items_import (
  supplier_item_key text not null,
  supplier_key text not null,
  catalog_no text,
  item_name_raw text not null,
  item_name_normalized text not null,
  brand_raw text,
  size_raw text,
  price_raw text,
  reference_price numeric,
  price_parse_status text,
  financial_class_final text,
  classification_policy text,
  source_file text,
  source_sheet text,
  source_row numeric,
  import_batch_key text not null,
  primary key (import_batch_key, supplier_item_key),
  check (
    source_row is null
    or source_row = trunc(source_row)
  ),
  check (reference_price is null or reference_price >= 0)
);

create table if not exists staging.purchases_import (
  line_source_key text not null,
  invoice_source_key text not null,
  purchase_date date not null,
  supplier_key text,
  supplier_name_raw text,
  receipt_reference text,
  item_name_raw text not null,
  item_name_normalized text not null,
  quantity numeric not null,
  unit text,
  unit_price numeric not null,
  total_amount numeric not null,
  calculated_total numeric,
  amount_difference numeric,
  source_category text,
  financial_class_final text not null,
  classification_policy text,
  asset_tracking boolean not null,
  source_file text not null,
  source_sheet text not null,
  source_row numeric,
  data_origin text not null,
  import_batch_key text not null,
  primary key (import_batch_key, line_source_key),
  check (quantity > 0),
  check (unit_price >= 0),
  check (total_amount >= 0),
  check (calculated_total is null or calculated_total >= 0),
  check (
    source_row is null
    or source_row = trunc(source_row)
  )
);

comment on column staging.purchases_import.supplier_key is
  'Nullable by design. The approved CSV has 323 lines (322 invoices) without a proven supplier key; these remain unmapped rather than receiving a fabricated supplier.';

create table if not exists staging.daily_sales_summaries_import (
  date date not null,
  date_raw text,
  day_name_raw text,
  source_file text not null,
  source_sheet text not null,
  source_row numeric,
  bill_count numeric,
  membership_count numeric,
  coupon_count numeric,
  cashier text,
  adult_visitors numeric,
  child_visitors numeric,
  qris_dretail numeric,
  qris_dynamic_bca numeric,
  qris_static_bca numeric,
  debit_edc_bca numeric,
  qris_static_bri numeric,
  cash numeric,
  total_sales numeric not null,
  dine_in numeric,
  takeaway numeric,
  reservation numeric,
  opening_cash numeric,
  deposited_cash numeric,
  deposit_method text,
  closing_cash numeric,
  payment_sum numeric,
  total_sales_difference numeric,
  visitor_total numeric,
  data_entry_status text,
  total_sales_arayya numeric,
  total_sales_lovin numeric,
  source_key text not null,
  data_origin text not null,
  import_batch_key text not null,
  primary key (import_batch_key, source_key),
  unique (import_batch_key, date),
  check (
    source_row is null
    or source_row = trunc(source_row)
  ),
  check (
    bill_count is null
    or (bill_count >= 0 and bill_count = trunc(bill_count))
  ),
  check (
    membership_count is null
    or (
      membership_count >= 0
      and membership_count = trunc(membership_count)
    )
  ),
  check (
    coupon_count is null
    or (coupon_count >= 0 and coupon_count = trunc(coupon_count))
  ),
  check (
    adult_visitors is null
    or (adult_visitors >= 0 and adult_visitors = trunc(adult_visitors))
  ),
  check (
    child_visitors is null
    or (child_visitors >= 0 and child_visitors = trunc(child_visitors))
  ),
  check (
    visitor_total is null
    or (visitor_total >= 0 and visitor_total = trunc(visitor_total))
  ),
  check (total_sales >= 0)
);

create table if not exists staging.customer_traffic_daily_import (
  traffic_date date not null,
  adult_visitors numeric not null,
  child_visitors numeric not null,
  total_visitors numeric not null,
  bill_count numeric,
  source_key text not null,
  source_file text not null,
  source_sheet text not null,
  source_row numeric,
  data_origin text not null,
  import_batch_key text not null,
  primary key (import_batch_key, source_key),
  unique (import_batch_key, traffic_date),
  check (
    adult_visitors >= 0
    and adult_visitors = trunc(adult_visitors)
  ),
  check (
    child_visitors >= 0
    and child_visitors = trunc(child_visitors)
  ),
  check (
    total_visitors >= 0
    and total_visitors = trunc(total_visitors)
  ),
  check (
    bill_count is null
    or (bill_count >= 0 and bill_count = trunc(bill_count))
  ),
  check (
    source_row is null
    or source_row = trunc(source_row)
  )
);

create table if not exists staging.data_coverage_import (
  domain text not null,
  period_start date,
  period_end date,
  availability_status text not null,
  row_count numeric not null,
  notes text,
  import_batch_key text not null,
  primary key (import_batch_key, domain, period_start, period_end),
  check (row_count >= 0 and row_count = trunc(row_count)),
  check (
    period_start is null
    or period_end is null
    or period_end >= period_start
  )
);

create table if not exists staging.assets_import (
  asset_source_key text not null,
  asset_code text not null,
  asset_name text not null,
  asset_name_normalized text not null,
  asset_category text not null,
  acquisition_date date not null,
  acquisition_cost numeric not null,
  original_source_cost text,
  capitalization_threshold numeric not null,
  capitalization_status text not null,
  useful_life_months numeric not null,
  residual_value numeric not null,
  depreciation_method text not null,
  monthly_depreciation numeric not null,
  depreciation_start_date date,
  asset_status text not null,
  brand text,
  size text,
  supplier_name_raw text,
  source_file text,
  source_sheet text,
  source_row numeric,
  adjustment_note text,
  data_origin text not null,
  import_batch_key text not null,
  primary key (import_batch_key, asset_source_key),
  unique (import_batch_key, asset_code),
  check (acquisition_cost >= 0),
  check (capitalization_threshold >= 0),
  check (
    useful_life_months > 0
    and useful_life_months = trunc(useful_life_months)
  ),
  check (residual_value >= 0 and residual_value <= acquisition_cost),
  check (monthly_depreciation >= 0),
  check (
    source_row is null
    or source_row = trunc(source_row)
  )
);

create table if not exists staging.finance_summary_import (
  period_start date not null,
  period_end date not null,
  revenue numeric not null,
  hpp numeric not null,
  gross_profit numeric not null,
  operating_expense numeric not null,
  ebitda numeric not null,
  depreciation numeric not null,
  ebit_operating_profit numeric not null,
  tax_amount numeric,
  tax_status text not null,
  net_income_provisional numeric not null,
  net_income_status text not null,
  dividend_amount numeric,
  dividend_status text not null,
  retained_earnings_provisional numeric not null,
  data_origin text not null,
  import_batch_key text not null,
  primary key (import_batch_key, period_start, period_end),
  check (period_end >= period_start)
);

comment on schema staging is
  'Private client-side COPY landing area. Never expose this schema through PostgREST.';

revoke all on all tables in schema staging
  from public, anon, authenticated;
revoke all on all sequences in schema staging
  from public, anon, authenticated;

alter default privileges in schema staging
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema staging
  revoke all on sequences from public, anon, authenticated;

-- Audit results live in public for authorized reconciliation review, while
-- writes remain limited to postgres/owner and the backend service role.
create table if not exists public.data_import_reconciliation_results (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.data_import_batches(id) on delete cascade,
  phase text not null check (btrim(phase) <> ''),
  metric_key text not null check (btrim(metric_key) <> ''),
  expected_value text,
  actual_value text,
  passed boolean not null,
  checked_at timestamptz not null default clock_timestamp(),
  details jsonb not null default '{}'::jsonb,
  unique (import_batch_id, phase, metric_key)
);

comment on table public.data_import_reconciliation_results is
  'Batch-scoped reconciliation audit. psql/postgres and service_role write; active admins read; only active super admins delete.';

alter table public.data_import_reconciliation_results
  enable row level security;

drop policy if exists data_import_reconciliation_select_admin
  on public.data_import_reconciliation_results;
create policy data_import_reconciliation_select_admin
  on public.data_import_reconciliation_results
  for select
  to authenticated
  using (public.lm_is_active_admin());

drop policy if exists data_import_reconciliation_insert_system
  on public.data_import_reconciliation_results;
create policy data_import_reconciliation_insert_system
  on public.data_import_reconciliation_results
  for insert
  to service_role
  with check (true);

drop policy if exists data_import_reconciliation_update_system
  on public.data_import_reconciliation_results;
create policy data_import_reconciliation_update_system
  on public.data_import_reconciliation_results
  for update
  to service_role
  using (true)
  with check (true);

drop policy if exists data_import_reconciliation_delete_super_admin
  on public.data_import_reconciliation_results;
create policy data_import_reconciliation_delete_super_admin
  on public.data_import_reconciliation_results
  for delete
  to authenticated
  using (public.lm_is_active_super_admin());

revoke all on table public.data_import_reconciliation_results
  from public, anon, authenticated;
grant select, delete on table public.data_import_reconciliation_results
  to authenticated;
grant select, insert, update, delete
  on table public.data_import_reconciliation_results
  to service_role;

commit;
