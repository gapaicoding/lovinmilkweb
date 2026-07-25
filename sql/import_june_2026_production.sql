\set ON_ERROR_STOP on

\if :{?batch_key}
\else
  \set batch_key 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2'
\endif

\echo 'Starting atomic production import for batch' :batch_key

begin;

set role postgres;
set local timezone = 'Asia/Jakarta';
set local lock_timeout = '15s';
set local statement_timeout = '0';
set local application_name = 'lovin-milk-june-2026-production-import';

select pg_advisory_xact_lock(
  hashtextextended('lovin-milk:june-import:' || :'batch_key', 0)
);

do $relations_preflight$
declare
  v_relation text;
  v_required constant text[] := array[
    'public.data_import_batches',
    'public.data_import_reconciliation_results',
    'public.data_coverage_periods',
    'public.daily_sales_summaries',
    'public.customer_traffic_daily',
    'public.historical_products',
    'public.historical_product_aliases',
    'public.historical_product_daily_quantities',
    'public.suppliers',
    'public.supplier_items',
    'public.purchase_invoices',
    'public.purchase_items',
    'public.asset_categories',
    'public.assets',
    'public.asset_depreciation_entries',
    'public.tax_entries',
    'public.owner_distributions',
    'public.v_asset_book_values',
    'public.v_financial_statement_monthly',
    'staging.asset_categories_import',
    'staging.assets_import',
    'staging.customer_traffic_daily_import',
    'staging.daily_sales_summaries_import',
    'staging.data_coverage_import',
    'staging.finance_summary_import',
    'staging.historical_product_aliases_import',
    'staging.historical_product_daily_quantities_import',
    'staging.historical_products_import',
    'staging.purchases_import',
    'staging.supplier_items_import',
    'staging.suppliers_import'
  ];
begin
  foreach v_relation in array v_required loop
    if to_regclass(v_relation) is null then
      raise exception
        'Production import aborted: required relation % is missing.',
        v_relation;
    end if;
  end loop;
end;
$relations_preflight$;

create temporary table _june_production_import_context (
  import_batch_id uuid primary key,
  batch_key text not null,
  prior_status text not null,
  actor_id uuid
) on commit drop;

insert into _june_production_import_context (
  import_batch_id,
  batch_key,
  prior_status
)
select
  id,
  batch_key,
  status
from public.data_import_batches
where batch_key = :'batch_key'
  and facts_period_start = date '2026-06-01'
  and facts_period_end = date '2026-06-30'
  and assets_full = true;

-- Local history models roles through user_roles, while some already-pulled
-- deployments may expose profiles.role. Resolve either model without inventing
-- an actor UUID.
do $context_preflight$
declare
  v_actor uuid;
  v_status text;
begin
  if (select count(*) from _june_production_import_context) <> 1 then
    raise exception
      'Production import aborted: approved batch scope was not found.';
  end if;

  select prior_status
  into v_status
  from _june_production_import_context;

  if v_status not in ('staged', 'imported', 'reconciled') then
    raise exception
      'Production import aborted: batch status % is not importable.',
      v_status;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) then
    execute
      'select id
       from public.profiles
       where is_active = true
         and role::text = ''super_admin''
       order by created_at nulls last, id
       limit 1'
    into v_actor;
  end if;

  if v_actor is null and to_regclass('public.user_roles') is not null then
    select p.id
    into v_actor
    from public.profiles p
    join public.user_roles ur
      on ur.user_id = p.id
    where p.is_active = true
      and ur.role::text = 'super_admin'
    order by p.created_at nulls last, p.id
    limit 1;
  end if;

  if v_actor is null then
    raise exception
      'Production import aborted: no active super_admin audit actor exists.';
  end if;

  update _june_production_import_context
  set actor_id = v_actor;

  if not exists (
    select 1
    from public.data_import_reconciliation_results r
    join _june_production_import_context c
      on c.import_batch_id = r.import_batch_id
    where r.phase = 'staging'
  ) or exists (
    select 1
    from public.data_import_reconciliation_results r
    join _june_production_import_context c
      on c.import_batch_id = r.import_batch_id
    where r.phase = 'staging'
      and not r.passed
  ) then
    raise exception
      'Production import aborted: staging reconciliation is missing or failed.';
  end if;
end;
$context_preflight$;

-- Reject ambiguous global-master collisions. Rows already owned by another
-- import batch are never silently reassigned to this batch.
do $master_conflict_preflight$
declare
  v_batch_id uuid := (
    select import_batch_id from _june_production_import_context
  );
  v_batch_key text := (
    select batch_key from _june_production_import_context
  );
begin
  if exists (
    select 1
    from staging.suppliers_import st
    join public.suppliers p
      on p.normalized_name = st.normalized_name
     and p.supplier_key <> st.supplier_key
     and p.deleted_at is null
    where st.import_batch_key = v_batch_key
  ) then
    raise exception
      'Production import aborted: supplier normalized_name conflicts with a different supplier_key.';
  end if;

  if exists (
    select 1
    from staging.suppliers_import st
    join public.suppliers p
      on p.supplier_key = st.supplier_key
    where st.import_batch_key = v_batch_key
      and p.import_batch_id is not null
      and p.import_batch_id <> v_batch_id
  ) then
    raise exception
      'Production import aborted: a supplier key belongs to another import batch.';
  end if;

  if exists (
    select 1
    from staging.supplier_items_import st
    join public.supplier_items p
      on p.supplier_item_key = st.supplier_item_key
    where st.import_batch_key = v_batch_key
      and p.import_batch_id is not null
      and p.import_batch_id <> v_batch_id
  ) then
    raise exception
      'Production import aborted: a supplier item key belongs to another import batch.';
  end if;

  if exists (
    select 1
    from staging.assets_import st
    join public.assets p
      on p.asset_code = st.asset_code
     and p.deleted_at is null
    where st.import_batch_key = v_batch_key
      and (
        p.import_batch_id is distinct from v_batch_id
        or p.asset_source_key is distinct from st.asset_source_key
      )
  ) then
    raise exception
      'Production import aborted: an active asset code conflicts with a different source/batch.';
  end if;

  if exists (
    select 1
    from staging.assets_import st
    join public.assets p
      on p.import_batch_id = v_batch_id
     and p.asset_source_key = st.asset_source_key
    where st.import_batch_key = v_batch_key
      and p.asset_code <> st.asset_code
  ) then
    raise exception
      'Production import aborted: an asset source key conflicts with a different asset code.';
  end if;
end;
$master_conflict_preflight$;

update public.data_import_batches b
set
  status = 'importing',
  started_at = coalesce(b.started_at, clock_timestamp()),
  completed_at = null,
  updated_at = clock_timestamp(),
  updated_by = c.actor_id
from _june_production_import_context c
where b.id = c.import_batch_id;

-- 1. Data coverage
insert into public.data_coverage_periods (
  import_batch_id,
  domain,
  period_start,
  period_end,
  availability_status,
  row_count,
  notes,
  created_by
)
select
  c.import_batch_id,
  st.domain,
  st.period_start,
  st.period_end,
  st.availability_status,
  st.row_count::bigint,
  st.notes,
  c.actor_id
from staging.data_coverage_import st
cross join _june_production_import_context c
where st.import_batch_key = c.batch_key
on conflict (import_batch_id, domain, period_start, period_end)
do update
set
  availability_status = excluded.availability_status,
  row_count = excluded.row_count,
  notes = excluded.notes,
  created_by = excluded.created_by;

-- 2. Historical products. current_product_id is intentionally neither
-- supplied nor overwritten: no unproven current-menu mapping is fabricated.
insert into public.historical_products (
  import_batch_id,
  historical_product_key,
  canonical_name,
  category_name,
  mapping_status,
  current_product_match_strategy,
  created_by,
  updated_by
)
select
  c.import_batch_id,
  st.historical_product_key,
  st.canonical_name,
  st.category_name,
  st.mapping_status,
  st.current_product_match_strategy,
  c.actor_id,
  c.actor_id
from staging.historical_products_import st
cross join _june_production_import_context c
where st.import_batch_key = c.batch_key
on conflict (import_batch_id, historical_product_key)
do update
set
  canonical_name = excluded.canonical_name,
  category_name = excluded.category_name,
  mapping_status = excluded.mapping_status,
  current_product_match_strategy = excluded.current_product_match_strategy,
  updated_at = clock_timestamp(),
  updated_by = excluded.updated_by;

-- 3. Historical product aliases, constrained to a same-batch parent.
insert into public.historical_product_aliases (
  import_batch_id,
  historical_product_id,
  alias_key,
  alias_name,
  normalized_alias,
  spelling_normalized_alias,
  mapping_status,
  similarity_to_latest_menu,
  occurrence_count,
  created_by
)
select
  c.import_batch_id,
  hp.id,
  st.alias_key,
  st.alias_name,
  st.normalized_alias,
  st.spelling_normalized_alias,
  st.mapping_status,
  st.similarity_to_latest_menu,
  st.occurrence_count::integer,
  c.actor_id
from staging.historical_product_aliases_import st
cross join _june_production_import_context c
join public.historical_products hp
  on hp.import_batch_id = c.import_batch_id
 and hp.historical_product_key = st.historical_product_key
where st.import_batch_key = c.batch_key
on conflict (import_batch_id, alias_key)
do update
set
  historical_product_id = excluded.historical_product_id,
  alias_name = excluded.alias_name,
  normalized_alias = excluded.normalized_alias,
  spelling_normalized_alias = excluded.spelling_normalized_alias,
  mapping_status = excluded.mapping_status,
  similarity_to_latest_menu = excluded.similarity_to_latest_menu,
  occurrence_count = excluded.occurrence_count,
  created_by = excluded.created_by;

-- 4. Historical quantity facts, without historical price fields.
insert into public.historical_product_daily_quantities (
  import_batch_id,
  historical_product_id,
  source_key,
  sale_date,
  canonical_product_name,
  category_name,
  quantity,
  is_free_menu,
  raw_variants,
  category_raw_variants,
  source_file,
  source_references,
  data_origin,
  created_by
)
select
  c.import_batch_id,
  hp.id,
  st.source_key,
  st.sale_date,
  st.canonical_product_name,
  st.category_name,
  st.quantity,
  st.is_free_menu,
  st.raw_variants,
  st.category_raw_variants,
  st.source_file,
  st.source_references,
  st.data_origin,
  c.actor_id
from staging.historical_product_daily_quantities_import st
cross join _june_production_import_context c
join public.historical_products hp
  on hp.import_batch_id = c.import_batch_id
 and hp.historical_product_key = st.historical_product_key
where st.import_batch_key = c.batch_key
on conflict (import_batch_id, source_key)
do update
set
  historical_product_id = excluded.historical_product_id,
  sale_date = excluded.sale_date,
  canonical_product_name = excluded.canonical_product_name,
  category_name = excluded.category_name,
  quantity = excluded.quantity,
  is_free_menu = excluded.is_free_menu,
  raw_variants = excluded.raw_variants,
  category_raw_variants = excluded.category_raw_variants,
  source_file = excluded.source_file,
  source_references = excluded.source_references,
  data_origin = excluded.data_origin,
  created_by = excluded.created_by;

-- 5. Supplier master
insert into public.suppliers (
  import_batch_id,
  supplier_key,
  supplier_name,
  normalized_name,
  phone,
  address,
  link,
  contact_person,
  source_type,
  source_references,
  is_active,
  created_by,
  updated_by,
  deleted_at,
  deleted_by
)
select
  c.import_batch_id,
  st.supplier_key,
  st.supplier_name,
  st.normalized_name,
  st.phone,
  st.address,
  st.link,
  st.contact_person,
  st.source_type,
  st.source_references,
  true,
  c.actor_id,
  c.actor_id,
  null::timestamptz,
  null::uuid
from staging.suppliers_import st
cross join _june_production_import_context c
where st.import_batch_key = c.batch_key
on conflict (supplier_key)
do update
set
  import_batch_id = excluded.import_batch_id,
  supplier_name = excluded.supplier_name,
  normalized_name = excluded.normalized_name,
  phone = excluded.phone,
  address = excluded.address,
  link = excluded.link,
  contact_person = excluded.contact_person,
  source_type = excluded.source_type,
  source_references = excluded.source_references,
  is_active = true,
  updated_at = clock_timestamp(),
  updated_by = excluded.updated_by,
  deleted_at = null,
  deleted_by = null;

-- 6. Supplier catalog items, each tied to a supplier from this batch.
insert into public.supplier_items (
  import_batch_id,
  supplier_id,
  supplier_item_key,
  catalog_no,
  item_name_raw,
  item_name_normalized,
  brand_raw,
  size_raw,
  price_raw,
  reference_price,
  price_parse_status,
  financial_class,
  classification_policy,
  source_file,
  source_sheet,
  source_row,
  is_active,
  created_by,
  updated_by,
  deleted_at,
  deleted_by
)
select
  c.import_batch_id,
  s.id,
  st.supplier_item_key,
  st.catalog_no,
  st.item_name_raw,
  st.item_name_normalized,
  st.brand_raw,
  st.size_raw,
  st.price_raw,
  st.reference_price,
  st.price_parse_status,
  st.financial_class_final,
  st.classification_policy,
  st.source_file,
  st.source_sheet,
  st.source_row::integer,
  true,
  c.actor_id,
  c.actor_id,
  null::timestamptz,
  null::uuid
from staging.supplier_items_import st
cross join _june_production_import_context c
join public.suppliers s
  on s.import_batch_id = c.import_batch_id
 and s.supplier_key = st.supplier_key
 and s.deleted_at is null
where st.import_batch_key = c.batch_key
on conflict (supplier_item_key)
do update
set
  import_batch_id = excluded.import_batch_id,
  supplier_id = excluded.supplier_id,
  catalog_no = excluded.catalog_no,
  item_name_raw = excluded.item_name_raw,
  item_name_normalized = excluded.item_name_normalized,
  brand_raw = excluded.brand_raw,
  size_raw = excluded.size_raw,
  price_raw = excluded.price_raw,
  reference_price = excluded.reference_price,
  price_parse_status = excluded.price_parse_status,
  financial_class = excluded.financial_class,
  classification_policy = excluded.classification_policy,
  source_file = excluded.source_file,
  source_sheet = excluded.source_sheet,
  source_row = excluded.source_row,
  is_active = true,
  updated_at = clock_timestamp(),
  updated_by = excluded.updated_by,
  deleted_at = null,
  deleted_by = null;

-- 7. Purchase invoice headers. A NULL supplier key remains NULL; 322 approved
-- invoices have no proven supplier mapping and receive no fabricated supplier.
insert into public.purchase_invoices (
  import_batch_id,
  invoice_source_key,
  purchase_date,
  supplier_id,
  supplier_name_raw,
  receipt_reference,
  source_file,
  source_sheet,
  data_origin,
  status,
  created_by,
  updated_by,
  deleted_at,
  deleted_by
)
select distinct
  c.import_batch_id,
  st.invoice_source_key,
  st.purchase_date,
  s.id,
  st.supplier_name_raw,
  st.receipt_reference,
  st.source_file,
  st.source_sheet,
  st.data_origin,
  'recorded',
  c.actor_id,
  c.actor_id,
  null::timestamptz,
  null::uuid
from staging.purchases_import st
cross join _june_production_import_context c
left join public.suppliers s
  on s.import_batch_id = c.import_batch_id
 and s.supplier_key = nullif(btrim(st.supplier_key), '')
 and s.deleted_at is null
where st.import_batch_key = c.batch_key
on conflict (import_batch_id, invoice_source_key)
do update
set
  purchase_date = excluded.purchase_date,
  supplier_id = excluded.supplier_id,
  supplier_name_raw = excluded.supplier_name_raw,
  receipt_reference = excluded.receipt_reference,
  source_file = excluded.source_file,
  source_sheet = excluded.source_sheet,
  data_origin = excluded.data_origin,
  status = 'recorded',
  updated_at = clock_timestamp(),
  updated_by = excluded.updated_by,
  deleted_at = null,
  deleted_by = null;

-- 8. Purchase lines. These do not touch the legacy expenses table.
insert into public.purchase_items (
  import_batch_id,
  purchase_invoice_id,
  line_source_key,
  item_name_raw,
  item_name_normalized,
  quantity,
  unit,
  unit_price,
  amount,
  calculated_total,
  amount_difference,
  source_category,
  financial_class,
  classification_policy,
  asset_tracking,
  source_file,
  source_sheet,
  source_row,
  data_origin,
  created_by,
  updated_by,
  deleted_at,
  deleted_by
)
select
  c.import_batch_id,
  inv.id,
  st.line_source_key,
  st.item_name_raw,
  st.item_name_normalized,
  st.quantity,
  st.unit,
  st.unit_price,
  st.total_amount,
  st.calculated_total,
  st.amount_difference,
  st.source_category,
  st.financial_class_final,
  st.classification_policy,
  st.asset_tracking,
  st.source_file,
  st.source_sheet,
  st.source_row::integer,
  st.data_origin,
  c.actor_id,
  c.actor_id,
  null::timestamptz,
  null::uuid
from staging.purchases_import st
cross join _june_production_import_context c
join public.purchase_invoices inv
  on inv.import_batch_id = c.import_batch_id
 and inv.invoice_source_key = st.invoice_source_key
where st.import_batch_key = c.batch_key
on conflict (import_batch_id, line_source_key)
do update
set
  purchase_invoice_id = excluded.purchase_invoice_id,
  item_name_raw = excluded.item_name_raw,
  item_name_normalized = excluded.item_name_normalized,
  quantity = excluded.quantity,
  unit = excluded.unit,
  unit_price = excluded.unit_price,
  amount = excluded.amount,
  calculated_total = excluded.calculated_total,
  amount_difference = excluded.amount_difference,
  source_category = excluded.source_category,
  financial_class = excluded.financial_class,
  classification_policy = excluded.classification_policy,
  asset_tracking = excluded.asset_tracking,
  source_file = excluded.source_file,
  source_sheet = excluded.source_sheet,
  source_row = excluded.source_row,
  data_origin = excluded.data_origin,
  updated_at = clock_timestamp(),
  updated_by = excluded.updated_by,
  deleted_at = null,
  deleted_by = null;

-- 9. Actual daily revenue summaries. Decimal integer lexemes were validated in
-- staging before these explicit integer casts.
insert into public.daily_sales_summaries (
  import_batch_id,
  source_key,
  sale_date,
  date_raw,
  day_name_raw,
  bill_count,
  membership_count,
  coupon_count,
  cashier,
  adult_visitors,
  child_visitors,
  visitor_total,
  qris_dretail,
  qris_dynamic_bca,
  qris_static_bca,
  debit_edc_bca,
  qris_static_bri,
  cash,
  total_sales,
  dine_in,
  takeaway,
  reservation,
  opening_cash,
  deposited_cash,
  deposit_method,
  closing_cash,
  payment_sum,
  total_sales_difference,
  data_entry_status,
  total_sales_arayya,
  total_sales_lovin,
  source_file,
  source_sheet,
  source_row,
  data_origin,
  created_by
)
select
  c.import_batch_id,
  st.source_key,
  st.date,
  st.date_raw,
  st.day_name_raw,
  st.bill_count::integer,
  st.membership_count::integer,
  st.coupon_count::integer,
  st.cashier,
  st.adult_visitors::integer,
  st.child_visitors::integer,
  st.visitor_total::integer,
  st.qris_dretail,
  st.qris_dynamic_bca,
  st.qris_static_bca,
  st.debit_edc_bca,
  st.qris_static_bri,
  st.cash,
  st.total_sales,
  st.dine_in,
  st.takeaway,
  st.reservation,
  st.opening_cash,
  st.deposited_cash,
  st.deposit_method,
  st.closing_cash,
  st.payment_sum,
  st.total_sales_difference,
  st.data_entry_status,
  st.total_sales_arayya,
  st.total_sales_lovin,
  st.source_file,
  st.source_sheet,
  st.source_row::integer,
  st.data_origin,
  c.actor_id
from staging.daily_sales_summaries_import st
cross join _june_production_import_context c
where st.import_batch_key = c.batch_key
on conflict (import_batch_id, source_key)
do update
set
  sale_date = excluded.sale_date,
  date_raw = excluded.date_raw,
  day_name_raw = excluded.day_name_raw,
  bill_count = excluded.bill_count,
  membership_count = excluded.membership_count,
  coupon_count = excluded.coupon_count,
  cashier = excluded.cashier,
  adult_visitors = excluded.adult_visitors,
  child_visitors = excluded.child_visitors,
  visitor_total = excluded.visitor_total,
  qris_dretail = excluded.qris_dretail,
  qris_dynamic_bca = excluded.qris_dynamic_bca,
  qris_static_bca = excluded.qris_static_bca,
  debit_edc_bca = excluded.debit_edc_bca,
  qris_static_bri = excluded.qris_static_bri,
  cash = excluded.cash,
  total_sales = excluded.total_sales,
  dine_in = excluded.dine_in,
  takeaway = excluded.takeaway,
  reservation = excluded.reservation,
  opening_cash = excluded.opening_cash,
  deposited_cash = excluded.deposited_cash,
  deposit_method = excluded.deposit_method,
  closing_cash = excluded.closing_cash,
  payment_sum = excluded.payment_sum,
  total_sales_difference = excluded.total_sales_difference,
  data_entry_status = excluded.data_entry_status,
  total_sales_arayya = excluded.total_sales_arayya,
  total_sales_lovin = excluded.total_sales_lovin,
  source_file = excluded.source_file,
  source_sheet = excluded.source_sheet,
  source_row = excluded.source_row,
  data_origin = excluded.data_origin,
  created_by = excluded.created_by;

-- 10. Aggregate customer traffic
insert into public.customer_traffic_daily (
  import_batch_id,
  source_key,
  traffic_date,
  adult_visitors,
  child_visitors,
  total_visitors,
  bill_count,
  source_file,
  source_sheet,
  source_row,
  data_origin,
  created_by
)
select
  c.import_batch_id,
  st.source_key,
  st.traffic_date,
  st.adult_visitors::integer,
  st.child_visitors::integer,
  st.total_visitors::integer,
  st.bill_count::integer,
  st.source_file,
  st.source_sheet,
  st.source_row::integer,
  st.data_origin,
  c.actor_id
from staging.customer_traffic_daily_import st
cross join _june_production_import_context c
where st.import_batch_key = c.batch_key
on conflict (import_batch_id, source_key)
do update
set
  traffic_date = excluded.traffic_date,
  adult_visitors = excluded.adult_visitors,
  child_visitors = excluded.child_visitors,
  total_visitors = excluded.total_visitors,
  bill_count = excluded.bill_count,
  source_file = excluded.source_file,
  source_sheet = excluded.source_sheet,
  source_row = excluded.source_row,
  data_origin = excluded.data_origin,
  created_by = excluded.created_by;

-- 11. Asset categories are global masters and have a case-insensitive active
-- unique index in the foundation migration.
insert into public.asset_categories (
  name,
  default_useful_life_months,
  description,
  is_active,
  created_by,
  updated_by,
  deleted_at,
  deleted_by
)
select
  st.category_name,
  st.default_useful_life_months::integer,
  st.description,
  true,
  c.actor_id,
  c.actor_id,
  null::timestamptz,
  null::uuid
from staging.asset_categories_import st
cross join _june_production_import_context c
where st.import_batch_key = c.batch_key
on conflict (lower(name)) where deleted_at is null
do update
set
  name = excluded.name,
  default_useful_life_months = excluded.default_useful_life_months,
  description = excluded.description,
  is_active = true,
  updated_at = clock_timestamp(),
  updated_by = excluded.updated_by,
  deleted_at = null,
  deleted_by = null;

-- 12. Full asset register. monthly_depreciation is generated by production;
-- no depreciation entry is inserted for tracking-only assets.
insert into public.assets (
  import_batch_id,
  asset_category_id,
  asset_source_key,
  asset_code,
  asset_name,
  asset_name_normalized,
  acquisition_date,
  acquisition_cost,
  original_source_cost,
  capitalization_threshold,
  capitalization_status,
  useful_life_months,
  residual_value,
  depreciation_method,
  depreciation_start_date,
  asset_status,
  brand,
  size,
  supplier_name_raw,
  source_file,
  source_sheet,
  source_row,
  adjustment_note,
  data_origin,
  created_by,
  updated_by,
  deleted_at,
  deleted_by
)
select
  c.import_batch_id,
  ac.id,
  st.asset_source_key,
  st.asset_code,
  st.asset_name,
  st.asset_name_normalized,
  st.acquisition_date,
  st.acquisition_cost,
  st.original_source_cost,
  st.capitalization_threshold,
  st.capitalization_status,
  st.useful_life_months::integer,
  st.residual_value,
  st.depreciation_method,
  st.depreciation_start_date,
  st.asset_status,
  st.brand,
  st.size,
  st.supplier_name_raw,
  st.source_file,
  st.source_sheet,
  st.source_row::integer,
  st.adjustment_note,
  st.data_origin,
  c.actor_id,
  c.actor_id,
  null::timestamptz,
  null::uuid
from staging.assets_import st
cross join _june_production_import_context c
join public.asset_categories ac
  on lower(ac.name) = lower(st.asset_category)
 and ac.deleted_at is null
where st.import_batch_key = c.batch_key
on conflict (import_batch_id, asset_source_key)
  where asset_source_key is not null
do update
set
  asset_category_id = excluded.asset_category_id,
  asset_code = excluded.asset_code,
  asset_name = excluded.asset_name,
  asset_name_normalized = excluded.asset_name_normalized,
  acquisition_date = excluded.acquisition_date,
  acquisition_cost = excluded.acquisition_cost,
  original_source_cost = excluded.original_source_cost,
  capitalization_threshold = excluded.capitalization_threshold,
  capitalization_status = excluded.capitalization_status,
  useful_life_months = excluded.useful_life_months,
  residual_value = excluded.residual_value,
  depreciation_method = excluded.depreciation_method,
  depreciation_start_date = excluded.depreciation_start_date,
  asset_status = excluded.asset_status,
  brand = excluded.brand,
  size = excluded.size,
  supplier_name_raw = excluded.supplier_name_raw,
  source_file = excluded.source_file,
  source_sheet = excluded.source_sheet,
  source_row = excluded.source_row,
  adjustment_note = excluded.adjustment_note,
  data_origin = excluded.data_origin,
  updated_at = clock_timestamp(),
  updated_by = excluded.updated_by,
  deleted_at = null,
  deleted_by = null;

-- Same-transaction acceptance checks. A single failure raises before COMMIT,
-- rolling back all upserts and the transient importing status.
create temporary table _june_production_import_checks (
  metric_key text primary key,
  expected_value text,
  actual_value text,
  passed boolean not null,
  details jsonb not null default '{}'::jsonb
) on commit drop;

insert into _june_production_import_checks (
  metric_key,
  expected_value,
  actual_value,
  passed,
  details
)
select
  metric_key,
  expected_value::text,
  actual_value::text,
  actual_value = expected_value,
  jsonb_build_object('kind', 'count')
from (
  select
    'data_coverage_count'::text as metric_key,
    7::numeric as expected_value,
    count(*)::numeric as actual_value
  from public.data_coverage_periods d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'daily_sales_summaries_count', 30, count(*)
  from public.daily_sales_summaries d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'customer_traffic_daily_count', 30, count(*)
  from public.customer_traffic_daily d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'historical_products_count', 61, count(*)
  from public.historical_products d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'historical_product_aliases_count', 68, count(*)
  from public.historical_product_aliases d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'historical_product_daily_quantities_count', 656, count(*)
  from public.historical_product_daily_quantities d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'suppliers_count', 9, count(*)
  from public.suppliers d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'supplier_items_count', 20, count(*)
  from public.supplier_items d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'purchase_invoices_count', 343, count(*)
  from public.purchase_invoices d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'purchase_items_count', 344, count(*)
  from public.purchase_items d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'assets_count', 21, count(*)
  from public.assets d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'asset_categories_count', 3, count(distinct d.asset_category_id)
  from public.assets d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
) as cardinalities;

insert into _june_production_import_checks (
  metric_key,
  expected_value,
  actual_value,
  passed,
  details
)
select
  metric_key,
  expected_value::text,
  actual_value::text,
  actual_value = expected_value,
  jsonb_build_object('kind', 'total')
from (
  select
    'revenue_total'::text as metric_key,
    30011000.00::numeric as expected_value,
    coalesce(sum(d.total_sales), 0)::numeric as actual_value
  from public.daily_sales_summaries d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'bill_count_total', 342, coalesce(sum(d.bill_count), 0)
  from public.daily_sales_summaries d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'adult_visitors_total', 421, coalesce(sum(d.adult_visitors), 0)
  from public.customer_traffic_daily d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'child_visitors_total', 406, coalesce(sum(d.child_visitors), 0)
  from public.customer_traffic_daily d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'visitor_total', 827, coalesce(sum(d.total_visitors), 0)
  from public.customer_traffic_daily d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'product_quantity_total', 1358, coalesce(sum(d.quantity), 0)
  from public.historical_product_daily_quantities d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'purchase_total', 11535298.00, coalesce(sum(d.amount), 0)
  from public.purchase_items d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'hpp_total', 10488538.00, coalesce(sum(d.amount), 0)
  from public.purchase_items d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
    and d.financial_class = 'hpp'

  union all
  select 'operating_expense_total', 1046760.00, coalesce(sum(d.amount), 0)
  from public.purchase_items d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
    and d.financial_class = 'operating_expense'

  union all
  select 'asset_register_total', 870145.00, coalesce(sum(d.acquisition_cost), 0)
  from public.assets d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
) as totals;

insert into _june_production_import_checks (
  metric_key,
  expected_value,
  actual_value,
  passed,
  details
)
select
  metric_key,
  '0',
  actual_value::text,
  actual_value = 0,
  jsonb_build_object('kind', check_kind)
from (
  select
    'daily_sales_outside_june'::text as metric_key,
    count(*)::numeric as actual_value,
    'date_scope'::text as check_kind
  from public.daily_sales_summaries d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.sale_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'product_quantities_outside_june', count(*), 'date_scope'
  from public.historical_product_daily_quantities d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.sale_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'purchases_outside_june', count(*), 'date_scope'
  from public.purchase_invoices d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
    and d.purchase_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'traffic_outside_june', count(*), 'date_scope'
  from public.customer_traffic_daily d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.traffic_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'orphan_aliases', count(*), 'relationship'
  from public.historical_product_aliases a
  join _june_production_import_context c
    on c.import_batch_id = a.import_batch_id
  left join public.historical_products p
    on p.id = a.historical_product_id
   and p.import_batch_id = c.import_batch_id
  where p.id is null

  union all
  select 'orphan_product_quantities', count(*), 'relationship'
  from public.historical_product_daily_quantities q
  join _june_production_import_context c
    on c.import_batch_id = q.import_batch_id
  left join public.historical_products p
    on p.id = q.historical_product_id
   and p.import_batch_id = c.import_batch_id
  where p.id is null

  union all
  select 'orphan_supplier_items', count(*), 'relationship'
  from public.supplier_items si
  join _june_production_import_context c
    on c.import_batch_id = si.import_batch_id
  left join public.suppliers s
    on s.id = si.supplier_id
   and s.import_batch_id = c.import_batch_id
  where si.deleted_at is null
    and s.id is null

  union all
  select 'cross_batch_purchase_suppliers', count(*), 'relationship'
  from public.purchase_invoices inv
  join _june_production_import_context c
    on c.import_batch_id = inv.import_batch_id
  join public.suppliers s
    on s.id = inv.supplier_id
  where inv.deleted_at is null
    and s.import_batch_id <> c.import_batch_id

  union all
  select 'orphan_purchase_items', count(*), 'relationship'
  from public.purchase_items pi
  join _june_production_import_context c
    on c.import_batch_id = pi.import_batch_id
  left join public.purchase_invoices inv
    on inv.id = pi.purchase_invoice_id
   and inv.import_batch_id = c.import_batch_id
  where pi.deleted_at is null
    and inv.id is null

  union all
  select 'invalid_purchase_financial_classes', count(*), 'quality'
  from public.purchase_items pi
  join _june_production_import_context c
    on c.import_batch_id = pi.import_batch_id
  where pi.deleted_at is null
    and pi.financial_class not in ('hpp', 'operating_expense')

  union all
  select 'forbidden_estimated_origins', count(*), 'quality'
  from (
    select d.data_origin
    from public.daily_sales_summaries d
    join _june_production_import_context c
      on c.import_batch_id = d.import_batch_id
    union all
    select d.data_origin
    from public.customer_traffic_daily d
    join _june_production_import_context c
      on c.import_batch_id = d.import_batch_id
    union all
    select d.data_origin
    from public.historical_product_daily_quantities d
    join _june_production_import_context c
      on c.import_batch_id = d.import_batch_id
    union all
    select d.data_origin
    from public.purchase_items d
    join _june_production_import_context c
      on c.import_batch_id = d.import_batch_id
    where d.deleted_at is null
    union all
    select d.data_origin
    from public.assets d
    join _june_production_import_context c
      on c.import_batch_id = d.import_batch_id
    where d.deleted_at is null
  ) as origins
  where data_origin not in ('actual', 'adjusted')

  union all
  select 'assets_not_tracking_only_expensed', count(*), 'asset_policy'
  from public.assets a
  join _june_production_import_context c
    on c.import_batch_id = a.import_batch_id
  where a.deleted_at is null
    and a.capitalization_status <> 'tracking_only_expensed'

  union all
  select 'assets_with_nonzero_monthly_depreciation', count(*), 'asset_policy'
  from public.assets a
  join _june_production_import_context c
    on c.import_batch_id = a.import_batch_id
  where a.deleted_at is null
    and a.monthly_depreciation <> 0

  union all
  select 'depreciation_entries_created', count(*), 'no_fabrication'
  from public.asset_depreciation_entries de
  join public.assets a
    on a.id = de.asset_id
  join _june_production_import_context c
    on c.import_batch_id = a.import_batch_id

  union all
  select 'tax_entries_created', count(*), 'no_fabrication'
  from public.tax_entries t
  join _june_production_import_context c
    on c.import_batch_id = t.import_batch_id
  where t.deleted_at is null

  union all
  select 'owner_distributions_created', count(*), 'no_fabrication'
  from public.owner_distributions d
  join _june_production_import_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
) as zero_checks;

-- Production views and the finance control row must agree before commit.
with finance_view as (
  select v.*
  from public.v_financial_statement_monthly v
  join _june_production_import_context c
    on c.import_batch_id = v.import_batch_id
  where v.month_start = date '2026-06-01'
),
finance_control as (
  select f.*
  from staging.finance_summary_import f
  join _june_production_import_context c
    on c.batch_key = f.import_batch_key
  where f.period_start = date '2026-06-01'
    and f.period_end = date '2026-06-30'
),
comparison as (
  select count(*)::bigint as mismatch_count
  from finance_view v
  cross join finance_control f
  where
    v.revenue is distinct from f.revenue
    or v.hpp is distinct from f.hpp
    or v.gross_profit is distinct from f.gross_profit
    or v.operating_expense is distinct from f.operating_expense
    or v.ebitda is distinct from f.ebitda
    or v.depreciation is distinct from f.depreciation
    or v.ebit_operating_profit is distinct from f.ebit_operating_profit
    or v.tax_recorded is distinct from false
    or v.tax_amount is not null
    or v.net_income_final is not null
    or v.net_income_provisional_before_tax
      is distinct from f.net_income_provisional
    or v.dividend_recorded is distinct from false
    or v.dividend_amount is not null
    or v.retained_earnings_final is not null
    or v.statement_status <> 'provisional_before_tax'
)
insert into _june_production_import_checks (
  metric_key,
  expected_value,
  actual_value,
  passed,
  details
)
select
  'financial_view_row_count',
  '1',
  (select count(*)::text from finance_view),
  (select count(*) = 1 from finance_view),
  jsonb_build_object('kind', 'reporting_view')
union all
select
  'financial_view_matches_control',
  '0',
  mismatch_count::text,
  mismatch_count = 0
    and (select count(*) = 1 from finance_view)
    and (select count(*) = 1 from finance_control),
  jsonb_build_object('kind', 'reporting_view')
from comparison;

with asset_view as (
  select v.*
  from public.v_asset_book_values v
  join _june_production_import_context c
    on c.import_batch_id = v.import_batch_id
)
insert into _june_production_import_checks (
  metric_key,
  expected_value,
  actual_value,
  passed,
  details
)
select
  'asset_view_count',
  '21',
  count(*)::text,
  count(*) = 21,
  jsonb_build_object('kind', 'reporting_view')
from asset_view
union all
select
  'asset_view_acquisition_total',
  '870145.00',
  coalesce(sum(acquisition_cost), 0)::text,
  coalesce(sum(acquisition_cost), 0) = 870145.00,
  jsonb_build_object('kind', 'reporting_view')
from asset_view
union all
select
  'asset_view_accumulated_depreciation',
  '0',
  coalesce(sum(accumulated_depreciation), 0)::text,
  coalesce(sum(accumulated_depreciation), 0) = 0,
  jsonb_build_object('kind', 'reporting_view')
from asset_view
union all
select
  'asset_view_book_value',
  '870145.00',
  coalesce(sum(current_book_value), 0)::text,
  coalesce(sum(current_book_value), 0) = 870145.00,
  jsonb_build_object('kind', 'reporting_view')
from asset_view;

do $validate_before_commit$
declare
  v_failed bigint;
begin
  select count(*)
  into v_failed
  from _june_production_import_checks
  where not passed;

  if v_failed > 0 then
    raise exception
      'Production import validation failed for % metric(s); all production changes will roll back.',
      v_failed;
  end if;
end;
$validate_before_commit$;

-- Persist a compact initial reconciliation. attempt_count provides positive
-- evidence that the exact import was run a second time for idempotency testing.
insert into public.data_import_reconciliation_results as existing (
  import_batch_id,
  phase,
  metric_key,
  expected_value,
  actual_value,
  passed,
  checked_at,
  details
)
select
  c.import_batch_id,
  'production_import',
  ch.metric_key,
  ch.expected_value,
  ch.actual_value,
  ch.passed,
  clock_timestamp(),
  ch.details || jsonb_build_object('attempt_count', 1)
from _june_production_import_context c
cross join _june_production_import_checks ch
on conflict (import_batch_id, phase, metric_key)
do update
set
  expected_value = excluded.expected_value,
  actual_value = excluded.actual_value,
  passed = excluded.passed,
  checked_at = excluded.checked_at,
  details = (
    excluded.details - 'attempt_count'
  ) || jsonb_build_object(
    'attempt_count',
    coalesce(
      (
        existing.details ->> 'attempt_count'
      )::integer,
      0
    ) + 1
  );

update public.data_import_batches b
set
  status = 'imported',
  completed_at = clock_timestamp(),
  updated_at = clock_timestamp(),
  updated_by = c.actor_id
from _june_production_import_context c
where b.id = c.import_batch_id;

commit;

\echo 'PRODUCTION IMPORT PASSED AND COMMITTED.'
\echo 'Run this file a second time, then run production reconciliation.'

select
  b.batch_key,
  b.status,
  b.started_at,
  b.completed_at,
  (
    select (r.details ->> 'attempt_count')::integer
    from public.data_import_reconciliation_results r
    where r.import_batch_id = b.id
      and r.phase = 'production_import'
      and r.metric_key = 'daily_sales_summaries_count'
  ) as successful_import_attempts
from public.data_import_batches b
where b.batch_key = :'batch_key';
