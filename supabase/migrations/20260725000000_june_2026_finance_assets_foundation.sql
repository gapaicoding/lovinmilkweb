-- LOVIN MILK - ADDITIVE DATABASE FOUNDATION
-- Batch scope: LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2
--
-- This migration creates 16 parallel tables and two reporting views. It does
-- not alter, truncate, delete from, or write to the legacy sales, expenses,
-- visitors, or visitor_visits tables.

begin;

set local timezone = 'Asia/Jakarta';
set local lock_timeout = '15s';
set local statement_timeout = '0';

-- -------------------------------------------------------------------
-- Fail closed when the existing application contract is incompatible.
-- No existing application table is modified by this preflight.
-- -------------------------------------------------------------------

do $foundation_preflight$
declare
  v_role_type_kind "char";
  v_role_type_category "char";
  v_missing_role text;
begin
  if to_regclass('public.profiles') is null
     or (
       select c.relkind not in ('r', 'p')
       from pg_catalog.pg_class c
       where c.oid = to_regclass('public.profiles')
     ) then
    raise exception
      'Foundation preflight failed: public.profiles must be a table.';
  end if;

  if to_regclass('public.products') is null
     or (
       select c.relkind not in ('r', 'p')
       from pg_catalog.pg_class c
       where c.oid = to_regclass('public.products')
     ) then
    raise exception
      'Foundation preflight failed: public.products must be a table.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
      and udt_name = 'uuid'
      and is_nullable = 'NO'
  ) then
    raise exception
      'Foundation preflight failed: public.profiles.id must be NOT NULL uuid.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid
     and a.attname = 'id'
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'p'
      and cardinality(c.conkey) = 1
  ) then
    raise exception
      'Foundation preflight failed: public.profiles.id must be the primary key.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'is_active'
      and udt_name = 'bool'
      and is_nullable = 'NO'
  ) then
    raise exception
      'Foundation preflight failed: public.profiles.is_active must be NOT NULL boolean.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'created_at'
      and udt_name = 'timestamptz'
      and is_nullable = 'NO'
  ) then
    raise exception
      'Foundation preflight failed: public.profiles.created_at must be NOT NULL timestamptz.';
  end if;

  select t.typtype, t.typcategory
  into v_role_type_kind, v_role_type_category
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_type t
    on t.oid = a.atttypid
  where a.attrelid = 'public.profiles'::regclass
    and a.attname = 'role'
    and not a.attisdropped;

  if not found
     or not (
       v_role_type_kind = 'e'
       or v_role_type_category = 'S'
     ) then
    raise exception
      'Foundation preflight failed: public.profiles.role must be an enum or string type.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
      and is_nullable = 'NO'
  ) then
    raise exception
      'Foundation preflight failed: public.profiles.role must be NOT NULL.';
  end if;

  if v_role_type_kind = 'e' then
    select required_role
    into v_missing_role
    from unnest(array['staff', 'admin', 'super_admin']) required(required_role)
    where not exists (
      select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_enum e
        on e.enumtypid = a.atttypid
      where a.attrelid = 'public.profiles'::regclass
        and a.attname = 'role'
        and e.enumlabel::text = required.required_role
    )
    limit 1;

    if v_missing_role is not null then
      raise exception
        'Foundation preflight failed: profiles.role enum lacks value %.',
        v_missing_role;
    end if;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'id'
      and udt_name = 'uuid'
      and is_nullable = 'NO'
  ) then
    raise exception
      'Foundation preflight failed: public.products.id must be NOT NULL uuid.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid
     and a.attname = 'id'
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.products'::regclass
      and c.contype in ('p', 'u')
      and cardinality(c.conkey) = 1
  ) then
    raise exception
      'Foundation preflight failed: public.products.id must be unique.';
  end if;

  if to_regprocedure('auth.uid()') is null then
    raise exception
      'Foundation preflight failed: auth.uid() is unavailable.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'pgcrypto'
  ) then
    raise exception
      'Foundation preflight failed: pgcrypto is required for gen_random_uuid().';
  end if;

  if exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) r(role_name)
    where not exists (
      select 1
      from pg_catalog.pg_roles pr
      where pr.rolname::text = r.role_name
    )
  ) then
    raise exception
      'Foundation preflight failed: required Supabase database roles are unavailable.';
  end if;
end;
$foundation_preflight$;

-- -------------------------------------------------------------------
-- Security and governance helper functions
-- -------------------------------------------------------------------

create or replace function public.lm_is_active_staff_or_above()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role::text in ('staff', 'admin', 'super_admin')
  );
$$;

create or replace function public.lm_is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role::text in ('admin', 'super_admin')
  );
$$;

create or replace function public.lm_is_active_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role::text = 'super_admin'
  );
$$;

revoke all on function public.lm_is_active_staff_or_above()
  from public, anon, authenticated;
revoke all on function public.lm_is_active_admin()
  from public, anon, authenticated;
revoke all on function public.lm_is_active_super_admin()
  from public, anon, authenticated;

grant execute on function public.lm_is_active_staff_or_above()
  to authenticated, service_role;
grant execute on function public.lm_is_active_admin()
  to authenticated, service_role;
grant execute on function public.lm_is_active_super_admin()
  to authenticated, service_role;

create or replace function public.lm_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function public.lm_set_updated_at()
  from public, anon, authenticated;

create or replace function public.lm_guard_import_batch_provenance()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if row(
    new.batch_key,
    new.description,
    new.facts_period_start,
    new.facts_period_end,
    new.assets_full,
    new.source_manifest,
    new.expected_metrics,
    new.created_at,
    new.created_by
  ) is distinct from row(
    old.batch_key,
    old.description,
    old.facts_period_start,
    old.facts_period_end,
    old.assets_full,
    old.source_manifest,
    old.expected_metrics,
    old.created_at,
    old.created_by
  ) then
    raise exception
      'Import batch provenance is immutable after insertion (batch_key=%).',
      old.batch_key;
  end if;

  return new;
end;
$$;

revoke all on function public.lm_guard_import_batch_provenance()
  from public, anon, authenticated;

-- -------------------------------------------------------------------
-- Import governance
-- -------------------------------------------------------------------

create table if not exists public.data_import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null unique,
  description text not null,
  facts_period_start date,
  facts_period_end date,
  assets_full boolean not null default false,
  status text not null default 'prepared'
    check (
      status in (
        'prepared',
        'staged',
        'importing',
        'imported',
        'reconciled',
        'failed',
        'rolled_back'
      )
    ),
  source_manifest jsonb not null default '{}'::jsonb,
  expected_metrics jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  check (
    facts_period_start is null
    or facts_period_end is null
    or facts_period_end >= facts_period_start
  )
);

create table if not exists public.data_coverage_periods (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.data_import_batches(id) on delete cascade,
  domain text not null,
  period_start date,
  period_end date,
  availability_status text not null,
  row_count bigint not null default 0 check (row_count >= 0),
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (
    import_batch_id,
    domain,
    period_start,
    period_end
  ),
  check (
    period_start is null
    or period_end is null
    or period_end >= period_start
  )
);

-- -------------------------------------------------------------------
-- Actual daily revenue and aggregate traffic
-- -------------------------------------------------------------------

create table if not exists public.daily_sales_summaries (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.data_import_batches(id) on delete restrict,
  source_key text not null,
  sale_date date not null,
  date_raw text,
  day_name_raw text,
  bill_count integer check (bill_count is null or bill_count >= 0),
  membership_count integer
    check (membership_count is null or membership_count >= 0),
  coupon_count integer
    check (coupon_count is null or coupon_count >= 0),
  cashier text,
  adult_visitors integer
    check (adult_visitors is null or adult_visitors >= 0),
  child_visitors integer
    check (child_visitors is null or child_visitors >= 0),
  visitor_total integer
    check (visitor_total is null or visitor_total >= 0),
  qris_dretail numeric(18,2),
  qris_dynamic_bca numeric(18,2),
  qris_static_bca numeric(18,2),
  debit_edc_bca numeric(18,2),
  qris_static_bri numeric(18,2),
  cash numeric(18,2),
  total_sales numeric(18,2) not null check (total_sales >= 0),
  dine_in numeric(18,2),
  takeaway numeric(18,2),
  reservation numeric(18,2),
  opening_cash numeric(18,2),
  deposited_cash numeric(18,2),
  deposit_method text,
  closing_cash numeric(18,2),
  payment_sum numeric(18,2),
  total_sales_difference numeric(18,2),
  data_entry_status text,
  total_sales_arayya numeric(18,2),
  total_sales_lovin numeric(18,2),
  source_file text not null,
  source_sheet text not null,
  source_row integer,
  data_origin text not null default 'actual'
    check (data_origin in ('actual', 'adjusted', 'estimated')),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (import_batch_id, source_key),
  unique (import_batch_id, sale_date),
  check (
    visitor_total is null
    or adult_visitors is null
    or child_visitors is null
    or visitor_total = adult_visitors + child_visitors
  )
);

create index if not exists daily_sales_summaries_date_idx
  on public.daily_sales_summaries(sale_date);
create index if not exists daily_sales_summaries_batch_date_idx
  on public.daily_sales_summaries(import_batch_id, sale_date);

create table if not exists public.customer_traffic_daily (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.data_import_batches(id) on delete restrict,
  source_key text not null,
  traffic_date date not null,
  adult_visitors integer not null check (adult_visitors >= 0),
  child_visitors integer not null check (child_visitors >= 0),
  total_visitors integer not null check (total_visitors >= 0),
  bill_count integer check (bill_count is null or bill_count >= 0),
  source_file text not null,
  source_sheet text not null,
  source_row integer,
  data_origin text not null default 'actual'
    check (data_origin in ('actual', 'adjusted', 'estimated')),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (import_batch_id, source_key),
  unique (import_batch_id, traffic_date),
  check (total_visitors = adult_visitors + child_visitors)
);

create index if not exists customer_traffic_daily_date_idx
  on public.customer_traffic_daily(traffic_date);

-- -------------------------------------------------------------------
-- Historical product quantities without fabricated prices
-- -------------------------------------------------------------------

create table if not exists public.historical_products (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.data_import_batches(id) on delete restrict,
  historical_product_key text not null,
  canonical_name text not null,
  category_name text,
  mapping_status text not null,
  current_product_match_strategy text,
  current_product_id uuid
    references public.products(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint historical_products_batch_id_key
    unique (import_batch_id, id),
  unique (import_batch_id, historical_product_key)
);

create index if not exists historical_products_name_idx
  on public.historical_products(lower(canonical_name));

create table if not exists public.historical_product_aliases (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.data_import_batches(id) on delete restrict,
  historical_product_id uuid not null,
  alias_key text not null,
  alias_name text not null,
  normalized_alias text not null,
  spelling_normalized_alias text,
  mapping_status text not null,
  similarity_to_latest_menu numeric(8,5),
  occurrence_count integer not null default 0
    check (occurrence_count >= 0),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint historical_product_aliases_product_batch_fkey
    foreign key (import_batch_id, historical_product_id)
    references public.historical_products(import_batch_id, id)
    on delete cascade,
  unique (import_batch_id, alias_key)
);

create index if not exists historical_product_aliases_normalized_idx
  on public.historical_product_aliases(normalized_alias);
create index if not exists historical_product_aliases_product_batch_idx
  on public.historical_product_aliases(
    import_batch_id,
    historical_product_id
  );

create table if not exists public.historical_product_daily_quantities (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.data_import_batches(id) on delete restrict,
  historical_product_id uuid not null,
  source_key text not null,
  sale_date date not null,
  canonical_product_name text not null,
  category_name text,
  quantity numeric(14,3) not null check (quantity >= 0),
  is_free_menu boolean not null default false,
  raw_variants text,
  category_raw_variants text,
  source_file text not null,
  source_references text,
  data_origin text not null default 'actual'
    check (data_origin in ('actual', 'adjusted', 'estimated')),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint historical_product_daily_qty_product_batch_fkey
    foreign key (import_batch_id, historical_product_id)
    references public.historical_products(import_batch_id, id)
    on delete restrict,
  unique (import_batch_id, source_key)
);

create index if not exists historical_product_daily_qty_date_idx
  on public.historical_product_daily_quantities(sale_date);
create index if not exists historical_product_daily_qty_product_idx
  on public.historical_product_daily_quantities(
    import_batch_id,
    historical_product_id,
    sale_date
  );

-- -------------------------------------------------------------------
-- Suppliers and purchase invoices
-- -------------------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid
    references public.data_import_batches(id) on delete restrict,
  supplier_key text not null,
  supplier_name text not null,
  normalized_name text not null,
  phone text,
  address text,
  link text,
  contact_person text,
  source_type text,
  source_references text,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  unique (supplier_key)
);

create unique index if not exists suppliers_active_normalized_name_uidx
  on public.suppliers(normalized_name)
  where deleted_at is null;

create table if not exists public.supplier_items (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid
    references public.data_import_batches(id) on delete restrict,
  supplier_id uuid
    references public.suppliers(id) on delete restrict,
  supplier_item_key text not null,
  catalog_no text,
  item_name_raw text not null,
  item_name_normalized text not null,
  brand_raw text,
  size_raw text,
  price_raw text,
  reference_price numeric(18,2),
  price_parse_status text,
  financial_class text
    check (
      financial_class is null
      or financial_class in (
        'hpp',
        'operating_expense',
        'asset',
        'other'
      )
    ),
  classification_policy text,
  source_file text,
  source_sheet text,
  source_row integer,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  unique (supplier_item_key)
);

create index if not exists supplier_items_supplier_idx
  on public.supplier_items(supplier_id);
create index if not exists supplier_items_name_idx
  on public.supplier_items(item_name_normalized);

create table if not exists public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.data_import_batches(id) on delete restrict,
  invoice_source_key text not null,
  purchase_date date not null,
  supplier_id uuid
    references public.suppliers(id) on delete restrict,
  supplier_name_raw text,
  receipt_reference text,
  source_file text not null,
  source_sheet text not null,
  data_origin text not null default 'actual'
    check (data_origin in ('actual', 'adjusted', 'estimated')),
  status text not null default 'recorded'
    check (status in ('recorded', 'voided')),
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  constraint purchase_invoices_batch_id_key
    unique (import_batch_id, id),
  unique (import_batch_id, invoice_source_key)
);

create index if not exists purchase_invoices_date_idx
  on public.purchase_invoices(purchase_date);
create index if not exists purchase_invoices_supplier_idx
  on public.purchase_invoices(supplier_id, purchase_date);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.data_import_batches(id) on delete restrict,
  purchase_invoice_id uuid not null,
  line_source_key text not null,
  item_name_raw text not null,
  item_name_normalized text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text,
  unit_price numeric(18,2) not null check (unit_price >= 0),
  amount numeric(18,2) not null check (amount >= 0),
  calculated_total numeric(18,2),
  amount_difference numeric(18,2),
  source_category text,
  financial_class text not null
    check (
      financial_class in (
        'hpp',
        'operating_expense',
        'asset',
        'other'
      )
    ),
  classification_policy text,
  asset_tracking boolean not null default false,
  source_file text not null,
  source_sheet text not null,
  source_row integer,
  data_origin text not null default 'actual'
    check (data_origin in ('actual', 'adjusted', 'estimated')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  constraint purchase_items_invoice_batch_fkey
    foreign key (import_batch_id, purchase_invoice_id)
    references public.purchase_invoices(import_batch_id, id)
    on delete cascade,
  unique (import_batch_id, line_source_key)
);

create index if not exists purchase_items_invoice_idx
  on public.purchase_items(import_batch_id, purchase_invoice_id);
create index if not exists purchase_items_financial_class_idx
  on public.purchase_items(financial_class);
create index if not exists purchase_items_batch_class_idx
  on public.purchase_items(import_batch_id, financial_class);

-- -------------------------------------------------------------------
-- Assets and depreciation
-- -------------------------------------------------------------------

create table if not exists public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_useful_life_months integer
    check (
      default_useful_life_months is null
      or default_useful_life_months > 0
    ),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create unique index if not exists asset_categories_active_name_uidx
  on public.asset_categories(lower(name))
  where deleted_at is null;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid
    references public.data_import_batches(id) on delete restrict,
  asset_category_id uuid not null
    references public.asset_categories(id) on delete restrict,
  asset_source_key text,
  asset_code text not null,
  asset_name text not null,
  asset_name_normalized text not null,
  acquisition_date date not null,
  acquisition_cost numeric(18,2) not null
    check (acquisition_cost >= 0),
  original_source_cost text,
  capitalization_threshold numeric(18,2) not null default 1000000
    check (capitalization_threshold >= 0),
  capitalization_status text not null
    check (
      capitalization_status in (
        'capitalized',
        'tracking_only_expensed'
      )
    ),
  useful_life_months integer not null
    check (useful_life_months > 0),
  residual_value numeric(18,2) not null default 0
    check (residual_value >= 0),
  depreciation_method text not null default 'straight_line'
    check (depreciation_method = 'straight_line'),
  monthly_depreciation numeric(18,2)
    generated always as (
      case
        when capitalization_status = 'capitalized'
          and useful_life_months > 0
        then round(
          greatest(acquisition_cost - residual_value, 0)
          / useful_life_months,
          2
        )
        else 0
      end
    ) stored,
  depreciation_start_date date,
  asset_status text not null default 'active'
    check (
      asset_status in (
        'active',
        'under_repair',
        'fully_depreciated',
        'disposed',
        'lost'
      )
    ),
  brand text,
  size text,
  supplier_name_raw text,
  location text,
  notes text,
  source_file text,
  source_sheet text,
  source_row integer,
  adjustment_note text,
  data_origin text not null default 'actual'
    check (data_origin in ('actual', 'adjusted', 'estimated')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  check (residual_value <= acquisition_cost),
  check (
    capitalization_status <> 'capitalized'
    or acquisition_cost >= capitalization_threshold
  )
);

create unique index if not exists assets_active_code_uidx
  on public.assets(asset_code)
  where deleted_at is null;
create unique index if not exists assets_source_key_uidx
  on public.assets(import_batch_id, asset_source_key)
  where asset_source_key is not null;
create index if not exists assets_category_idx
  on public.assets(asset_category_id);
create index if not exists assets_acquisition_date_idx
  on public.assets(acquisition_date);

create table if not exists public.asset_depreciation_entries (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null
    references public.assets(id) on delete cascade,
  period_month date not null,
  depreciation_amount numeric(18,2) not null
    check (depreciation_amount >= 0),
  accumulated_depreciation numeric(18,2) not null
    check (accumulated_depreciation >= 0),
  ending_book_value numeric(18,2) not null
    check (ending_book_value >= 0),
  status text not null default 'posted'
    check (status in ('draft', 'posted', 'reversed')),
  posted_at timestamptz,
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (asset_id, period_month),
  check (period_month = date_trunc('month', period_month)::date)
);

create index if not exists asset_depreciation_period_idx
  on public.asset_depreciation_entries(period_month);

-- -------------------------------------------------------------------
-- Tax and owner distributions
-- -------------------------------------------------------------------

create table if not exists public.tax_entries (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid
    references public.data_import_batches(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  tax_type text not null,
  amount numeric(18,2) not null check (amount >= 0),
  status text not null default 'recorded'
    check (
      status in (
        'recorded',
        'estimated',
        'paid',
        'voided'
      )
    ),
  payment_date date,
  notes text,
  source_reference text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  check (period_end >= period_start)
);

create index if not exists tax_entries_period_idx
  on public.tax_entries(period_start, period_end);

create table if not exists public.owner_distributions (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid
    references public.data_import_batches(id) on delete restrict,
  distribution_date date not null,
  amount numeric(18,2) not null check (amount > 0),
  recipient text,
  distribution_type text not null default 'dividend'
    check (
      distribution_type in (
        'dividend',
        'owner_withdrawal',
        'profit_distribution'
      )
    ),
  status text not null default 'recorded'
    check (status in ('recorded', 'paid', 'voided')),
  notes text,
  source_reference text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create index if not exists owner_distributions_date_idx
  on public.owner_distributions(distribution_date);

-- -------------------------------------------------------------------
-- Verify pre-existing/partially-created foundation objects.
-- CREATE TABLE IF NOT EXISTS is intentionally paired with these checks
-- so an incompatible object cannot be silently accepted.
-- -------------------------------------------------------------------

do $verify_foundation_tables$
declare
  v_table text;
  v_column text;
  v_columns text[];
  v_udt text;
  v_not_null boolean;
  v_delete_action "char";
begin
  for v_table, v_columns in
    select expected.table_name, expected.required_columns
    from (
      values
        (
          'data_import_batches',
          array[
            'id', 'batch_key', 'description', 'facts_period_start',
            'facts_period_end', 'assets_full', 'status', 'source_manifest',
            'expected_metrics', 'started_at', 'completed_at', 'created_at',
            'updated_at', 'created_by', 'updated_by'
          ]::text[]
        ),
        (
          'data_coverage_periods',
          array[
            'id', 'import_batch_id', 'domain', 'period_start', 'period_end',
            'availability_status', 'row_count', 'notes', 'created_at',
            'created_by'
          ]::text[]
        ),
        (
          'daily_sales_summaries',
          array[
            'id', 'import_batch_id', 'source_key', 'sale_date', 'date_raw',
            'day_name_raw', 'bill_count', 'membership_count', 'coupon_count',
            'cashier', 'adult_visitors', 'child_visitors', 'visitor_total',
            'qris_dretail', 'qris_dynamic_bca', 'qris_static_bca',
            'debit_edc_bca', 'qris_static_bri', 'cash', 'total_sales',
            'dine_in', 'takeaway', 'reservation', 'opening_cash',
            'deposited_cash', 'deposit_method', 'closing_cash',
            'payment_sum', 'total_sales_difference', 'data_entry_status',
            'total_sales_arayya', 'total_sales_lovin', 'source_file',
            'source_sheet', 'source_row', 'data_origin', 'created_at',
            'created_by'
          ]::text[]
        ),
        (
          'customer_traffic_daily',
          array[
            'id', 'import_batch_id', 'source_key', 'traffic_date',
            'adult_visitors', 'child_visitors', 'total_visitors',
            'bill_count', 'source_file', 'source_sheet', 'source_row',
            'data_origin', 'created_at', 'created_by'
          ]::text[]
        ),
        (
          'historical_products',
          array[
            'id', 'import_batch_id', 'historical_product_key',
            'canonical_name', 'category_name', 'mapping_status',
            'current_product_match_strategy', 'current_product_id',
            'created_at', 'updated_at', 'created_by', 'updated_by'
          ]::text[]
        ),
        (
          'historical_product_aliases',
          array[
            'id', 'import_batch_id', 'historical_product_id', 'alias_key',
            'alias_name', 'normalized_alias', 'spelling_normalized_alias',
            'mapping_status', 'similarity_to_latest_menu',
            'occurrence_count', 'created_at', 'created_by'
          ]::text[]
        ),
        (
          'historical_product_daily_quantities',
          array[
            'id', 'import_batch_id', 'historical_product_id', 'source_key',
            'sale_date', 'canonical_product_name', 'category_name',
            'quantity', 'is_free_menu', 'raw_variants',
            'category_raw_variants', 'source_file', 'source_references',
            'data_origin', 'created_at', 'created_by'
          ]::text[]
        ),
        (
          'suppliers',
          array[
            'id', 'import_batch_id', 'supplier_key', 'supplier_name',
            'normalized_name', 'phone', 'address', 'link', 'contact_person',
            'source_type', 'source_references', 'is_active', 'created_at',
            'updated_at', 'created_by', 'updated_by', 'deleted_at',
            'deleted_by'
          ]::text[]
        ),
        (
          'supplier_items',
          array[
            'id', 'import_batch_id', 'supplier_id', 'supplier_item_key',
            'catalog_no', 'item_name_raw', 'item_name_normalized',
            'brand_raw', 'size_raw', 'price_raw', 'reference_price',
            'price_parse_status', 'financial_class',
            'classification_policy', 'source_file', 'source_sheet',
            'source_row', 'is_active', 'created_at', 'updated_at',
            'created_by', 'updated_by', 'deleted_at', 'deleted_by'
          ]::text[]
        ),
        (
          'purchase_invoices',
          array[
            'id', 'import_batch_id', 'invoice_source_key', 'purchase_date',
            'supplier_id', 'supplier_name_raw', 'receipt_reference',
            'source_file', 'source_sheet', 'data_origin', 'status', 'notes',
            'created_at', 'updated_at', 'created_by', 'updated_by',
            'deleted_at', 'deleted_by'
          ]::text[]
        ),
        (
          'purchase_items',
          array[
            'id', 'import_batch_id', 'purchase_invoice_id',
            'line_source_key', 'item_name_raw', 'item_name_normalized',
            'quantity', 'unit', 'unit_price', 'amount', 'calculated_total',
            'amount_difference', 'source_category', 'financial_class',
            'classification_policy', 'asset_tracking', 'source_file',
            'source_sheet', 'source_row', 'data_origin', 'created_at',
            'updated_at', 'created_by', 'updated_by', 'deleted_at',
            'deleted_by'
          ]::text[]
        ),
        (
          'asset_categories',
          array[
            'id', 'name', 'default_useful_life_months', 'description',
            'is_active', 'created_at', 'updated_at', 'created_by',
            'updated_by', 'deleted_at', 'deleted_by'
          ]::text[]
        ),
        (
          'assets',
          array[
            'id', 'import_batch_id', 'asset_category_id',
            'asset_source_key', 'asset_code', 'asset_name',
            'asset_name_normalized', 'acquisition_date',
            'acquisition_cost', 'original_source_cost',
            'capitalization_threshold', 'capitalization_status',
            'useful_life_months', 'residual_value', 'depreciation_method',
            'monthly_depreciation', 'depreciation_start_date',
            'asset_status', 'brand', 'size', 'supplier_name_raw',
            'location', 'notes', 'source_file', 'source_sheet',
            'source_row', 'adjustment_note', 'data_origin', 'created_at',
            'updated_at', 'created_by', 'updated_by', 'deleted_at',
            'deleted_by'
          ]::text[]
        ),
        (
          'asset_depreciation_entries',
          array[
            'id', 'asset_id', 'period_month', 'depreciation_amount',
            'accumulated_depreciation', 'ending_book_value', 'status',
            'posted_at', 'notes', 'created_at', 'created_by'
          ]::text[]
        ),
        (
          'tax_entries',
          array[
            'id', 'import_batch_id', 'period_start', 'period_end',
            'tax_type', 'amount', 'status', 'payment_date', 'notes',
            'source_reference', 'created_at', 'updated_at', 'created_by',
            'updated_by', 'deleted_at', 'deleted_by'
          ]::text[]
        ),
        (
          'owner_distributions',
          array[
            'id', 'import_batch_id', 'distribution_date', 'amount',
            'recipient', 'distribution_type', 'status', 'notes',
            'source_reference', 'created_at', 'updated_at', 'created_by',
            'updated_by', 'deleted_at', 'deleted_by'
          ]::text[]
        )
    ) expected(table_name, required_columns)
  loop
    if to_regclass('public.' || v_table) is null
       or (
         select c.relkind not in ('r', 'p')
         from pg_catalog.pg_class c
         where c.oid = to_regclass('public.' || v_table)
       ) then
      raise exception
        'Foundation definition check failed: public.% is not a table.',
        v_table;
    end if;

    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_table
        and c.column_name = 'id'
        and c.udt_name = 'uuid'
        and c.is_nullable = 'NO'
    ) or not exists (
      select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a
        on a.attrelid = c.conrelid
       and a.attname = 'id'
       and a.attnum = any (c.conkey)
      where c.conrelid = to_regclass('public.' || v_table)
        and c.contype = 'p'
        and cardinality(c.conkey) = 1
    ) then
      raise exception
        'Foundation definition check failed: public.%.id must be a uuid primary key.',
        v_table;
    end if;

    foreach v_column in array v_columns loop
      if not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = v_table
          and c.column_name = v_column
      ) then
        raise exception
          'Foundation definition check failed: public.%.% is missing.',
          v_table,
          v_column;
      end if;
    end loop;
  end loop;

  for v_table, v_column, v_udt, v_not_null in
    select *
    from (
      values
        ('data_import_batches', 'id', 'uuid', true),
        ('data_import_batches', 'batch_key', 'text', true),
        ('data_import_batches', 'status', 'text', true),
        ('daily_sales_summaries', 'import_batch_id', 'uuid', true),
        ('daily_sales_summaries', 'sale_date', 'date', true),
        ('daily_sales_summaries', 'total_sales', 'numeric', true),
        ('customer_traffic_daily', 'import_batch_id', 'uuid', true),
        ('customer_traffic_daily', 'traffic_date', 'date', true),
        ('historical_products', 'import_batch_id', 'uuid', true),
        ('historical_product_aliases', 'import_batch_id', 'uuid', true),
        ('historical_product_aliases', 'historical_product_id', 'uuid', true),
        (
          'historical_product_daily_quantities',
          'import_batch_id',
          'uuid',
          true
        ),
        (
          'historical_product_daily_quantities',
          'historical_product_id',
          'uuid',
          true
        ),
        ('purchase_invoices', 'import_batch_id', 'uuid', true),
        ('purchase_invoices', 'status', 'text', true),
        ('purchase_items', 'import_batch_id', 'uuid', true),
        ('purchase_items', 'purchase_invoice_id', 'uuid', true),
        ('purchase_items', 'amount', 'numeric', true),
        ('assets', 'id', 'uuid', true),
        ('assets', 'import_batch_id', 'uuid', false),
        ('assets', 'monthly_depreciation', 'numeric', false),
        ('asset_depreciation_entries', 'asset_id', 'uuid', true),
        ('asset_depreciation_entries', 'period_month', 'date', true),
        ('asset_depreciation_entries', 'status', 'text', true)
    ) critical(table_name, column_name, udt_name, must_be_not_null)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_table
        and c.column_name = v_column
        and c.udt_name = v_udt
        and (
          not v_not_null
          or c.is_nullable = 'NO'
        )
    ) then
      raise exception
        'Foundation definition check failed: incompatible public.%.%.',
        v_table,
        v_column;
    end if;
  end loop;

  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'assets'
      and c.column_name = 'monthly_depreciation'
      and c.is_generated = 'ALWAYS'
  ) then
    raise exception
      'Foundation definition check failed: assets.monthly_depreciation must be generated.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.historical_product_aliases'::regclass
      and c.confrelid = 'public.historical_products'::regclass
      and c.contype = 'f'
      and c.confdeltype = 'c'
      and (
        select array_agg(a.attname::text order by k.ordinality)
        from unnest(c.conkey) with ordinality k(attnum, ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = k.attnum
      ) = array['import_batch_id', 'historical_product_id']
      and (
        select array_agg(a.attname::text order by k.ordinality)
        from unnest(c.confkey) with ordinality k(attnum, ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid = c.confrelid
         and a.attnum = k.attnum
      ) = array['import_batch_id', 'id']
  ) then
    raise exception
      'Foundation definition check failed: alias parent must belong to the same batch.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid =
      'public.historical_product_daily_quantities'::regclass
      and c.confrelid = 'public.historical_products'::regclass
      and c.contype = 'f'
      and c.confdeltype = 'r'
      and (
        select array_agg(a.attname::text order by k.ordinality)
        from unnest(c.conkey) with ordinality k(attnum, ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = k.attnum
      ) = array['import_batch_id', 'historical_product_id']
      and (
        select array_agg(a.attname::text order by k.ordinality)
        from unnest(c.confkey) with ordinality k(attnum, ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid = c.confrelid
         and a.attnum = k.attnum
      ) = array['import_batch_id', 'id']
  ) then
    raise exception
      'Foundation definition check failed: quantity parent must belong to the same batch.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.purchase_items'::regclass
      and c.confrelid = 'public.purchase_invoices'::regclass
      and c.contype = 'f'
      and c.confdeltype = 'c'
      and (
        select array_agg(a.attname::text order by k.ordinality)
        from unnest(c.conkey) with ordinality k(attnum, ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = k.attnum
      ) = array['import_batch_id', 'purchase_invoice_id']
      and (
        select array_agg(a.attname::text order by k.ordinality)
        from unnest(c.confkey) with ordinality k(attnum, ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid = c.confrelid
         and a.attnum = k.attnum
      ) = array['import_batch_id', 'id']
  ) then
    raise exception
      'Foundation definition check failed: invoice item parent must belong to the same batch.';
  end if;

  for v_table, v_delete_action in
    select *
    from (
      values
        ('data_coverage_periods', 'c'::"char"),
        ('daily_sales_summaries', 'r'::"char"),
        ('customer_traffic_daily', 'r'::"char"),
        ('historical_products', 'r'::"char"),
        ('historical_product_aliases', 'r'::"char"),
        ('historical_product_daily_quantities', 'r'::"char"),
        ('suppliers', 'r'::"char"),
        ('supplier_items', 'r'::"char"),
        ('purchase_invoices', 'r'::"char"),
        ('purchase_items', 'r'::"char"),
        ('assets', 'r'::"char"),
        ('tax_entries', 'r'::"char"),
        ('owner_distributions', 'r'::"char")
    ) expected(table_name, delete_action)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('public.' || v_table)
        and c.confrelid = 'public.data_import_batches'::regclass
        and c.contype = 'f'
        and c.confdeltype = v_delete_action
        and (
          select array_agg(a.attname::text order by k.ordinality)
          from unnest(c.conkey) with ordinality k(attnum, ordinality)
          join pg_catalog.pg_attribute a
            on a.attrelid = c.conrelid
           and a.attnum = k.attnum
        ) = array['import_batch_id']
        and (
          select array_agg(a.attname::text order by k.ordinality)
          from unnest(c.confkey) with ordinality k(attnum, ordinality)
          join pg_catalog.pg_attribute a
            on a.attrelid = c.confrelid
           and a.attnum = k.attnum
        ) = array['id']
    ) then
      raise exception
        'Foundation definition check failed: public.% has an incompatible batch foreign key.',
        v_table;
    end if;
  end loop;
end;
$verify_foundation_tables$;

-- -------------------------------------------------------------------
-- Updated-at and immutable-provenance triggers
-- -------------------------------------------------------------------

do $triggers$
declare
  v_table text;
  v_tables constant text[] := array[
    'data_import_batches',
    'historical_products',
    'suppliers',
    'supplier_items',
    'purchase_invoices',
    'purchase_items',
    'asset_categories',
    'assets',
    'tax_entries',
    'owner_distributions'
  ];
begin
  foreach v_table in array v_tables loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'set_' || v_table || '_updated_at',
      v_table
    );

    execute format(
      'create trigger %I
       before update on public.%I
       for each row execute function public.lm_set_updated_at()',
      'set_' || v_table || '_updated_at',
      v_table
    );
  end loop;

  drop trigger if exists guard_data_import_batch_provenance
    on public.data_import_batches;
  create trigger guard_data_import_batch_provenance
    before update on public.data_import_batches
    for each row
    execute function public.lm_guard_import_batch_provenance();
end;
$triggers$;

-- -------------------------------------------------------------------
-- RLS policies
--
-- Operational aggregate data:
--   active staff/admin/super_admin may SELECT;
--   active admin/super_admin may INSERT/UPDATE;
--   active super_admin may DELETE.
--
-- Financial, supplier, purchase, asset, tax, and import-governance data:
--   active admin/super_admin may SELECT/INSERT/UPDATE;
--   active super_admin may DELETE.
-- -------------------------------------------------------------------

do $rls$
declare
  v_table text;
  v_policy text;
  v_operational constant text[] := array[
    'daily_sales_summaries',
    'customer_traffic_daily',
    'historical_products',
    'historical_product_aliases',
    'historical_product_daily_quantities'
  ];
  v_financial constant text[] := array[
    'data_import_batches',
    'data_coverage_periods',
    'suppliers',
    'supplier_items',
    'purchase_invoices',
    'purchase_items',
    'asset_categories',
    'assets',
    'asset_depreciation_entries',
    'tax_entries',
    'owner_distributions'
  ];
begin
  -- Target objects are new to this foundation. Remove any policies left by a
  -- partial/manual attempt so no permissive policy can survive a replay.
  for v_table, v_policy in
    select p.tablename, p.policyname
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename::text = any (v_operational || v_financial)
  loop
    execute format(
      'drop policy %I on public.%I',
      v_policy,
      v_table
    );
  end loop;

  foreach v_table in array v_operational loop
    execute format(
      'alter table public.%I enable row level security',
      v_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_select_staff',
      v_table
    );
    execute format(
      'create policy %I on public.%I
       for select to authenticated
       using (public.lm_is_active_staff_or_above())',
      v_table || '_select_staff',
      v_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_insert_admin',
      v_table
    );
    execute format(
      'create policy %I on public.%I
       for insert to authenticated
       with check (public.lm_is_active_admin())',
      v_table || '_insert_admin',
      v_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_update_admin',
      v_table
    );
    execute format(
      'create policy %I on public.%I
       for update to authenticated
       using (public.lm_is_active_admin())
       with check (public.lm_is_active_admin())',
      v_table || '_update_admin',
      v_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_delete_super_admin',
      v_table
    );
    execute format(
      'create policy %I on public.%I
       for delete to authenticated
       using (public.lm_is_active_super_admin())',
      v_table || '_delete_super_admin',
      v_table
    );
  end loop;

  foreach v_table in array v_financial loop
    execute format(
      'alter table public.%I enable row level security',
      v_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_select_admin',
      v_table
    );
    execute format(
      'create policy %I on public.%I
       for select to authenticated
       using (public.lm_is_active_admin())',
      v_table || '_select_admin',
      v_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_insert_admin',
      v_table
    );
    execute format(
      'create policy %I on public.%I
       for insert to authenticated
       with check (public.lm_is_active_admin())',
      v_table || '_insert_admin',
      v_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_update_admin',
      v_table
    );
    execute format(
      'create policy %I on public.%I
       for update to authenticated
       using (public.lm_is_active_admin())
       with check (public.lm_is_active_admin())',
      v_table || '_update_admin',
      v_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_delete_super_admin',
      v_table
    );
    execute format(
      'create policy %I on public.%I
       for delete to authenticated
       using (public.lm_is_active_super_admin())',
      v_table || '_delete_super_admin',
      v_table
    );
  end loop;
end;
$rls$;

-- Revoke defaults/pre-existing grants first. RLS is a second layer and does
-- not replace object privileges.
revoke all on table
  public.data_import_batches,
  public.data_coverage_periods,
  public.daily_sales_summaries,
  public.customer_traffic_daily,
  public.historical_products,
  public.historical_product_aliases,
  public.historical_product_daily_quantities,
  public.suppliers,
  public.supplier_items,
  public.purchase_invoices,
  public.purchase_items,
  public.asset_categories,
  public.assets,
  public.asset_depreciation_entries,
  public.tax_entries,
  public.owner_distributions
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.data_import_batches,
  public.data_coverage_periods,
  public.daily_sales_summaries,
  public.customer_traffic_daily,
  public.historical_products,
  public.historical_product_aliases,
  public.historical_product_daily_quantities,
  public.suppliers,
  public.supplier_items,
  public.purchase_invoices,
  public.purchase_items,
  public.asset_categories,
  public.assets,
  public.asset_depreciation_entries,
  public.tax_entries,
  public.owner_distributions
to authenticated;

grant all on table
  public.data_import_batches,
  public.data_coverage_periods,
  public.daily_sales_summaries,
  public.customer_traffic_daily,
  public.historical_products,
  public.historical_product_aliases,
  public.historical_product_daily_quantities,
  public.suppliers,
  public.supplier_items,
  public.purchase_invoices,
  public.purchase_items,
  public.asset_categories,
  public.assets,
  public.asset_depreciation_entries,
  public.tax_entries,
  public.owner_distributions
to service_role;

-- -------------------------------------------------------------------
-- Reporting views
-- -------------------------------------------------------------------

create or replace view public.v_asset_book_values
with (security_invoker = true)
as
select
  a.id as asset_id,
  a.asset_code,
  a.asset_name,
  ac.name as asset_category,
  a.acquisition_date,
  a.acquisition_cost,
  a.capitalization_status,
  a.useful_life_months,
  a.monthly_depreciation,
  coalesce(
    sum(de.depreciation_amount),
    0
  )::numeric(18,2) as accumulated_depreciation,
  greatest(
    a.acquisition_cost
    - coalesce(sum(de.depreciation_amount), 0),
    a.residual_value
  )::numeric(18,2) as current_book_value,
  a.asset_status,
  a.import_batch_id
from public.assets a
join public.asset_categories ac
  on ac.id = a.asset_category_id
 and ac.deleted_at is null
left join public.asset_depreciation_entries de
  on de.asset_id = a.id
 and de.status = 'posted'
where a.deleted_at is null
group by
  a.id,
  a.asset_code,
  a.asset_name,
  ac.name,
  a.acquisition_date,
  a.acquisition_cost,
  a.capitalization_status,
  a.useful_life_months,
  a.monthly_depreciation,
  a.residual_value,
  a.asset_status,
  a.import_batch_id;

create or replace view public.v_financial_statement_monthly
with (security_invoker = true)
as
with months as (
  select
    import_batch_id,
    date_trunc('month', sale_date)::date as month_start
  from public.daily_sales_summaries

  union

  select
    inv.import_batch_id,
    date_trunc('month', inv.purchase_date)::date
  from public.purchase_invoices inv
  where inv.status = 'recorded'
    and inv.deleted_at is null
    and exists (
      select 1
      from public.purchase_items item
      where item.import_batch_id = inv.import_batch_id
        and item.purchase_invoice_id = inv.id
        and item.deleted_at is null
    )

  union

  select
    a.import_batch_id,
    de.period_month
  from public.asset_depreciation_entries de
  join public.assets a
    on a.id = de.asset_id
  where a.import_batch_id is not null
    and a.deleted_at is null
    and de.status = 'posted'

  union

  select
    import_batch_id,
    date_trunc('month', period_start)::date
  from public.tax_entries
  where deleted_at is null
    and status in ('recorded', 'paid')

  union

  select
    import_batch_id,
    date_trunc('month', distribution_date)::date
  from public.owner_distributions
  where deleted_at is null
    and status in ('recorded', 'paid')
),
revenue as (
  select
    import_batch_id,
    date_trunc('month', sale_date)::date as month_start,
    sum(total_sales)::numeric(18,2) as revenue
  from public.daily_sales_summaries
  group by 1, 2
),
purchase_values as (
  select
    item.import_batch_id,
    date_trunc('month', inv.purchase_date)::date as month_start,
    sum(item.amount)
      filter (where item.financial_class = 'hpp')::numeric(18,2) as hpp,
    sum(item.amount)
      filter (
        where item.financial_class = 'operating_expense'
      )::numeric(18,2) as operating_expense
  from public.purchase_items item
  join public.purchase_invoices inv
    on inv.import_batch_id = item.import_batch_id
   and inv.id = item.purchase_invoice_id
  where item.deleted_at is null
    and inv.deleted_at is null
    and inv.status = 'recorded'
  group by 1, 2
),
depreciation as (
  select
    a.import_batch_id,
    de.period_month as month_start,
    sum(de.depreciation_amount)::numeric(18,2) as depreciation
  from public.asset_depreciation_entries de
  join public.assets a
    on a.id = de.asset_id
  where a.import_batch_id is not null
    and a.deleted_at is null
    and de.status = 'posted'
  group by 1, 2
),
tax as (
  select
    import_batch_id,
    date_trunc('month', period_start)::date as month_start,
    sum(amount)
      filter (
        where status in ('recorded', 'paid')
          and deleted_at is null
      )::numeric(18,2) as tax_amount,
    count(*)
      filter (
        where status in ('recorded', 'paid')
          and deleted_at is null
      ) > 0 as tax_recorded
  from public.tax_entries
  group by 1, 2
),
distribution as (
  select
    import_batch_id,
    date_trunc('month', distribution_date)::date as month_start,
    sum(amount)
      filter (
        where status in ('recorded', 'paid')
          and deleted_at is null
      )::numeric(18,2) as dividend_amount,
    count(*)
      filter (
        where status in ('recorded', 'paid')
          and deleted_at is null
      ) > 0 as dividend_recorded
  from public.owner_distributions
  group by 1, 2
),
base as (
  select
    m.import_batch_id,
    m.month_start,
    coalesce(r.revenue, 0)::numeric(18,2) as revenue,
    coalesce(p.hpp, 0)::numeric(18,2) as hpp,
    coalesce(p.operating_expense, 0)::numeric(18,2)
      as operating_expense,
    coalesce(d.depreciation, 0)::numeric(18,2) as depreciation,
    t.tax_amount,
    coalesce(t.tax_recorded, false) as tax_recorded,
    dist.dividend_amount,
    coalesce(dist.dividend_recorded, false) as dividend_recorded
  from months m
  left join revenue r
    on r.import_batch_id = m.import_batch_id
   and r.month_start = m.month_start
  left join purchase_values p
    on p.import_batch_id = m.import_batch_id
   and p.month_start = m.month_start
  left join depreciation d
    on d.import_batch_id = m.import_batch_id
   and d.month_start = m.month_start
  left join tax t
    on t.import_batch_id = m.import_batch_id
   and t.month_start = m.month_start
  left join distribution dist
    on dist.import_batch_id = m.import_batch_id
   and dist.month_start = m.month_start
)
select
  b.import_batch_id,
  ib.batch_key,
  b.month_start,
  b.revenue,
  b.hpp,
  (b.revenue - b.hpp)::numeric(18,2) as gross_profit,
  b.operating_expense,
  (
    b.revenue
    - b.hpp
    - b.operating_expense
  )::numeric(18,2) as ebitda,
  b.depreciation,
  (
    b.revenue
    - b.hpp
    - b.operating_expense
    - b.depreciation
  )::numeric(18,2) as ebit_operating_profit,
  b.tax_amount,
  b.tax_recorded,
  (
    b.revenue
    - b.hpp
    - b.operating_expense
    - b.depreciation
  )::numeric(18,2) as net_income_provisional_before_tax,
  case
    when b.tax_recorded
    then (
      b.revenue
      - b.hpp
      - b.operating_expense
      - b.depreciation
      - coalesce(b.tax_amount, 0)
    )::numeric(18,2)
    else null
  end as net_income_final,
  b.dividend_amount,
  b.dividend_recorded,
  case
    when b.tax_recorded and b.dividend_recorded
    then (
      b.revenue
      - b.hpp
      - b.operating_expense
      - b.depreciation
      - coalesce(b.tax_amount, 0)
      - coalesce(b.dividend_amount, 0)
    )::numeric(18,2)
    else null
  end as retained_earnings_final,
  case
    when not b.tax_recorded then 'provisional_before_tax'
    when not b.dividend_recorded
      then 'net_income_final_dividend_not_supplied'
    else 'final'
  end as statement_status
from base b
join public.data_import_batches ib
  on ib.id = b.import_batch_id;

revoke all on table public.v_asset_book_values
  from public, anon, authenticated, service_role;
revoke all on table public.v_financial_statement_monthly
  from public, anon, authenticated, service_role;

grant select on table public.v_asset_book_values
  to authenticated, service_role;
grant select on table public.v_financial_statement_monthly
  to authenticated, service_role;

-- -------------------------------------------------------------------
-- Register the approved batch only when absent. A replay never rewrites
-- provenance or moves an imported/reconciled batch back to prepared.
-- -------------------------------------------------------------------

insert into public.data_import_batches (
  batch_key,
  description,
  facts_period_start,
  facts_period_end,
  assets_full,
  status,
  source_manifest,
  expected_metrics
)
values (
  'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2',
  'Actual Lovin Milk facts for 1–30 June 2026 with full available asset register',
  date '2026-06-01',
  date '2026-06-30',
  true,
  'prepared',
  jsonb_build_object(
    'source_files_frozen', 6,
    'dummy_data_allowed', false,
    'marketing_imported', false,
    'membership_identity_imported', false
  ),
  jsonb_build_object(
    'daily_sales_summaries', 30,
    'revenue', 30011000,
    'historical_product_daily_quantities', 656,
    'product_quantity', 1358,
    'purchase_items', 344,
    'purchase_invoices', 343,
    'purchase_total', 11535298,
    'hpp', 10488538,
    'operating_expense', 1046760,
    'traffic_total', 827,
    'assets', 21,
    'asset_register_total', 870145
  )
)
on conflict (batch_key) do nothing;

do $assert_approved_batch$
declare
  v_batch public.data_import_batches%rowtype;
  v_expected_source_manifest constant jsonb := jsonb_build_object(
    'source_files_frozen', 6,
    'dummy_data_allowed', false,
    'marketing_imported', false,
    'membership_identity_imported', false
  );
  v_expected_metrics constant jsonb := jsonb_build_object(
    'daily_sales_summaries', 30,
    'revenue', 30011000,
    'historical_product_daily_quantities', 656,
    'product_quantity', 1358,
    'purchase_items', 344,
    'purchase_invoices', 343,
    'purchase_total', 11535298,
    'hpp', 10488538,
    'operating_expense', 1046760,
    'traffic_total', 827,
    'assets', 21,
    'asset_register_total', 870145
  );
begin
  select *
  into v_batch
  from public.data_import_batches
  where batch_key = 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2';

  if not found then
    raise exception
      'Approved batch assertion failed: expected batch is absent.';
  end if;

  if v_batch.description is distinct from
       'Actual Lovin Milk facts for 1–30 June 2026 with full available asset register'
     or v_batch.facts_period_start is distinct from date '2026-06-01'
     or v_batch.facts_period_end is distinct from date '2026-06-30'
     or v_batch.assets_full is distinct from true
     or v_batch.source_manifest is distinct from v_expected_source_manifest
     or v_batch.expected_metrics is distinct from v_expected_metrics then
    raise exception
      'Approved batch assertion failed: existing provenance differs from the locked package; no values were overwritten.';
  end if;

  if v_batch.status not in (
    'prepared',
    'staged',
    'importing',
    'imported',
    'reconciled'
  ) then
    raise exception
      'Approved batch assertion failed: unsafe lifecycle status %.',
      v_batch.status;
  end if;
end;
$assert_approved_batch$;

-- -------------------------------------------------------------------
-- Final structural and access-control assertions
-- -------------------------------------------------------------------

do $foundation_postconditions$
declare
  v_table text;
  v_tables constant text[] := array[
    'data_import_batches',
    'data_coverage_periods',
    'daily_sales_summaries',
    'customer_traffic_daily',
    'historical_products',
    'historical_product_aliases',
    'historical_product_daily_quantities',
    'suppliers',
    'supplier_items',
    'purchase_invoices',
    'purchase_items',
    'asset_categories',
    'assets',
    'asset_depreciation_entries',
    'tax_entries',
    'owner_distributions'
  ];
begin
  if cardinality(v_tables) <> 16 then
    raise exception
      'Foundation postcondition failed: internal table manifest is not 16.';
  end if;

  foreach v_table in array v_tables loop
    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname::text = v_table
        and c.relkind in ('r', 'p')
        and c.relrowsecurity
    ) then
      raise exception
        'Foundation postcondition failed: public.% is missing RLS.',
        v_table;
    end if;

    if has_table_privilege(
         'anon',
         format('public.%I', v_table),
         'SELECT'
       )
       or has_table_privilege(
         'anon',
         format('public.%I', v_table),
         'INSERT'
       )
       or has_table_privilege(
         'anon',
         format('public.%I', v_table),
         'UPDATE'
       )
       or has_table_privilege(
         'anon',
         format('public.%I', v_table),
         'DELETE'
       )
       or has_table_privilege(
         'anon',
         format('public.%I', v_table),
         'TRUNCATE'
       )
       or has_table_privilege(
         'anon',
         format('public.%I', v_table),
         'REFERENCES'
       )
       or has_table_privilege(
         'anon',
         format('public.%I', v_table),
         'TRIGGER'
       ) then
      raise exception
        'Foundation postcondition failed: anon retains privilege on public.%.',
        v_table;
    end if;

    if not (
      has_table_privilege(
        'authenticated',
        format('public.%I', v_table),
        'SELECT'
      )
      and has_table_privilege(
        'authenticated',
        format('public.%I', v_table),
        'INSERT'
      )
      and has_table_privilege(
        'authenticated',
        format('public.%I', v_table),
        'UPDATE'
      )
      and has_table_privilege(
        'authenticated',
        format('public.%I', v_table),
        'DELETE'
      )
    ) then
      raise exception
        'Foundation postcondition failed: authenticated grants incomplete on public.%.',
        v_table;
    end if;

    if not (
      has_table_privilege(
        'service_role',
        format('public.%I', v_table),
        'SELECT'
      )
      and has_table_privilege(
        'service_role',
        format('public.%I', v_table),
        'INSERT'
      )
      and has_table_privilege(
        'service_role',
        format('public.%I', v_table),
        'UPDATE'
      )
      and has_table_privilege(
        'service_role',
        format('public.%I', v_table),
        'DELETE'
      )
    ) then
      raise exception
        'Foundation postcondition failed: service_role grants incomplete on public.%.',
        v_table;
    end if;

    if (
      select count(*)
      from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename::text = v_table
        and p.roles = array['authenticated'::name]
        and p.cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ) <> 4 then
      raise exception
        'Foundation postcondition failed: public.% does not have exactly four authenticated-only policies.',
        v_table;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'v_asset_book_values'
      and c.relkind = 'v'
      and coalesce(c.reloptions, array[]::text[])
          @> array['security_invoker=true']
  ) or not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'v_financial_statement_monthly'
      and c.relkind = 'v'
      and coalesce(c.reloptions, array[]::text[])
          @> array['security_invoker=true']
  ) then
    raise exception
      'Foundation postcondition failed: both reporting views must be security_invoker views.';
  end if;

  if has_table_privilege(
       'anon',
       'public.v_asset_book_values',
       'SELECT'
     )
     or has_table_privilege(
       'anon',
       'public.v_financial_statement_monthly',
       'SELECT'
     ) then
    raise exception
      'Foundation postcondition failed: anon retains reporting-view access.';
  end if;
end;
$foundation_postconditions$;

commit;
