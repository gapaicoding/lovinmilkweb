\set ON_ERROR_STOP on

\if :{?batch_key}
\else
  \set batch_key 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2'
\endif

-- Pass -v snapshot_key=LM-PRE-JUNE-FOUNDATION-... to pin the Phase 7
-- baseline. If omitted, the latest completed snapshot is used.
\if :{?snapshot_key}
\else
  \set snapshot_key ''
\endif

\echo 'Reconciling production batch' :batch_key

begin;

set role postgres;
set local timezone = 'Asia/Jakarta';
set local lock_timeout = '15s';
set local statement_timeout = '0';
set local application_name = 'lovin-milk-june-2026-production-reconciliation';

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
    'staging.finance_summary_import'
  ];
begin
  foreach v_relation in array v_required loop
    if to_regclass(v_relation) is null then
      raise exception
        'Production reconciliation aborted: required relation % is missing.',
        v_relation;
    end if;
  end loop;
end;
$relations_preflight$;

create temporary table _june_production_reconciliation_context (
  import_batch_id uuid primary key,
  batch_key text not null,
  prior_status text not null,
  requested_snapshot_key text,
  snapshot_run_id uuid,
  resolved_snapshot_key text
) on commit preserve rows;

insert into _june_production_reconciliation_context (
  import_batch_id,
  batch_key,
  prior_status,
  requested_snapshot_key
)
select
  id,
  batch_key,
  status,
  nullif(:'snapshot_key', '')
from public.data_import_batches
where batch_key = :'batch_key'
  and facts_period_start = date '2026-06-01'
  and facts_period_end = date '2026-06-30'
  and assets_full = true;

do $context_preflight$
declare
  v_requested text;
  v_run_id uuid;
  v_snapshot_key text;
  v_status text;
begin
  if (
    select count(*)
    from _june_production_reconciliation_context
  ) <> 1 then
    raise exception
      'Production reconciliation aborted: approved batch scope was not found.';
  end if;

  select prior_status, requested_snapshot_key
  into v_status, v_requested
  from _june_production_reconciliation_context;

  if v_status not in ('imported', 'reconciled') then
    raise exception
      'Production reconciliation aborted: batch status % is not reconcilable.',
      v_status;
  end if;

  if
    to_regclass('backup.lm_snapshot_runs') is not null
    and to_regclass('backup.lm_snapshot_table_metrics') is not null
  then
    if v_requested is null then
      select run_id, snapshot_key
      into v_run_id, v_snapshot_key
      from backup.lm_snapshot_runs
      where status = 'completed'
        and project_ref = 'baukcqccetzzwzgpbnoj'
      order by completed_at desc nulls last, started_at desc
      limit 1;
    else
      select run_id, snapshot_key
      into v_run_id, v_snapshot_key
      from backup.lm_snapshot_runs
      where status = 'completed'
        and project_ref = 'baukcqccetzzwzgpbnoj'
        and snapshot_key = v_requested
      limit 1;
    end if;
  end if;

  update _june_production_reconciliation_context
  set
    snapshot_run_id = v_run_id,
    resolved_snapshot_key = v_snapshot_key;
end;
$context_preflight$;

create temporary table _june_production_reconciliation_checks (
  metric_key text primary key,
  expected_value text,
  actual_value text,
  passed boolean not null,
  details jsonb not null default '{}'::jsonb
) on commit preserve rows;

-- Cardinalities for every imported production dataset.
insert into _june_production_reconciliation_checks (
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
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'daily_sales_summaries_count', 30, count(*)
  from public.daily_sales_summaries d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'customer_traffic_daily_count', 30, count(*)
  from public.customer_traffic_daily d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'historical_products_count', 61, count(*)
  from public.historical_products d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'historical_product_aliases_count', 68, count(*)
  from public.historical_product_aliases d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'historical_product_daily_quantities_count', 656, count(*)
  from public.historical_product_daily_quantities d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'suppliers_count', 9, count(*)
  from public.suppliers d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'supplier_items_count', 20, count(*)
  from public.supplier_items d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'purchase_invoices_count', 343, count(*)
  from public.purchase_invoices d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'purchase_items_count', 344, count(*)
  from public.purchase_items d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'assets_count', 21, count(*)
  from public.assets d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'asset_categories_count', 3, count(distinct d.asset_category_id)
  from public.assets d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
) as cardinalities;

-- Source totals plus all required finance derivations.
insert into _june_production_reconciliation_checks (
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
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'bill_count_total', 342, coalesce(sum(d.bill_count), 0)
  from public.daily_sales_summaries d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'adult_visitors_total', 421, coalesce(sum(d.adult_visitors), 0)
  from public.customer_traffic_daily d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'child_visitors_total', 406, coalesce(sum(d.child_visitors), 0)
  from public.customer_traffic_daily d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'visitor_total', 827, coalesce(sum(d.total_visitors), 0)
  from public.customer_traffic_daily d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'product_quantity_total', 1358, coalesce(sum(d.quantity), 0)
  from public.historical_product_daily_quantities d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id

  union all
  select 'purchase_total', 11535298.00, coalesce(sum(d.amount), 0)
  from public.purchase_items d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null

  union all
  select 'hpp_total', 10488538.00, coalesce(sum(d.amount), 0)
  from public.purchase_items d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
    and d.financial_class = 'hpp'

  union all
  select 'operating_expense_total', 1046760.00, coalesce(sum(d.amount), 0)
  from public.purchase_items d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
    and d.financial_class = 'operating_expense'

  union all
  select
    'gross_profit',
    19522462.00,
    (
      select coalesce(sum(d.total_sales), 0)
      from public.daily_sales_summaries d
      join _june_production_reconciliation_context c
        on c.import_batch_id = d.import_batch_id
    ) - (
      select coalesce(sum(d.amount), 0)
      from public.purchase_items d
      join _june_production_reconciliation_context c
        on c.import_batch_id = d.import_batch_id
      where d.deleted_at is null
        and d.financial_class = 'hpp'
    )

  union all
  select
    'ebitda',
    18475702.00,
    (
      select coalesce(sum(d.total_sales), 0)
      from public.daily_sales_summaries d
      join _june_production_reconciliation_context c
        on c.import_batch_id = d.import_batch_id
    ) - (
      select coalesce(sum(d.amount), 0)
      from public.purchase_items d
      join _june_production_reconciliation_context c
        on c.import_batch_id = d.import_batch_id
      where d.deleted_at is null
        and d.financial_class in ('hpp', 'operating_expense')
    )

  union all
  select
    'depreciation_june_2026',
    0,
    coalesce(sum(de.depreciation_amount), 0)
  from public.asset_depreciation_entries de
  join public.assets a
    on a.id = de.asset_id
  join _june_production_reconciliation_context c
    on c.import_batch_id = a.import_batch_id
  where de.period_month = date '2026-06-01'
    and de.status = 'posted'

  union all
  select
    'ebit_operating_profit',
    18475702.00,
    (
      select coalesce(sum(d.total_sales), 0)
      from public.daily_sales_summaries d
      join _june_production_reconciliation_context c
        on c.import_batch_id = d.import_batch_id
    ) - (
      select coalesce(sum(d.amount), 0)
      from public.purchase_items d
      join _june_production_reconciliation_context c
        on c.import_batch_id = d.import_batch_id
      where d.deleted_at is null
        and d.financial_class in ('hpp', 'operating_expense')
    ) - (
      select coalesce(sum(de.depreciation_amount), 0)
      from public.asset_depreciation_entries de
      join public.assets a
        on a.id = de.asset_id
      join _june_production_reconciliation_context c
        on c.import_batch_id = a.import_batch_id
      where de.period_month = date '2026-06-01'
        and de.status = 'posted'
    )

  union all
  select 'asset_register_total', 870145.00, coalesce(sum(d.acquisition_cost), 0)
  from public.assets d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
) as totals;

-- Scope, relationship, uniqueness, no-fabrication, and arithmetic checks.
insert into _june_production_reconciliation_checks (
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
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.sale_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'product_quantities_outside_june', count(*), 'date_scope'
  from public.historical_product_daily_quantities d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.sale_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'purchase_invoices_outside_june', count(*), 'date_scope'
  from public.purchase_invoices d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
    and d.purchase_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'traffic_outside_june', count(*), 'date_scope'
  from public.customer_traffic_daily d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.traffic_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'orphan_aliases', count(*), 'relationship'
  from public.historical_product_aliases a
  join _june_production_reconciliation_context c
    on c.import_batch_id = a.import_batch_id
  left join public.historical_products p
    on p.id = a.historical_product_id
   and p.import_batch_id = c.import_batch_id
  where p.id is null

  union all
  select 'orphan_product_quantities', count(*), 'relationship'
  from public.historical_product_daily_quantities q
  join _june_production_reconciliation_context c
    on c.import_batch_id = q.import_batch_id
  left join public.historical_products p
    on p.id = q.historical_product_id
   and p.import_batch_id = c.import_batch_id
  where p.id is null

  union all
  select 'orphan_supplier_items', count(*), 'relationship'
  from public.supplier_items si
  join _june_production_reconciliation_context c
    on c.import_batch_id = si.import_batch_id
  left join public.suppliers s
    on s.id = si.supplier_id
   and s.import_batch_id = c.import_batch_id
  where si.deleted_at is null
    and s.id is null

  union all
  select 'cross_batch_purchase_suppliers', count(*), 'relationship'
  from public.purchase_invoices inv
  join _june_production_reconciliation_context c
    on c.import_batch_id = inv.import_batch_id
  join public.suppliers s
    on s.id = inv.supplier_id
  where inv.deleted_at is null
    and s.import_batch_id <> c.import_batch_id

  union all
  select 'orphan_purchase_items', count(*), 'relationship'
  from public.purchase_items pi
  join _june_production_reconciliation_context c
    on c.import_batch_id = pi.import_batch_id
  left join public.purchase_invoices inv
    on inv.id = pi.purchase_invoice_id
   and inv.import_batch_id = c.import_batch_id
  where pi.deleted_at is null
    and inv.id is null

  union all
  select 'duplicate_daily_sales_source_keys', count(*), 'uniqueness'
  from (
    select d.source_key
    from public.daily_sales_summaries d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    group by d.source_key
    having count(*) > 1
  ) as duplicate_keys

  union all
  select 'duplicate_historical_product_keys', count(*), 'uniqueness'
  from (
    select d.historical_product_key
    from public.historical_products d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    group by d.historical_product_key
    having count(*) > 1
  ) as duplicate_keys

  union all
  select 'duplicate_alias_keys', count(*), 'uniqueness'
  from (
    select d.alias_key
    from public.historical_product_aliases d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    group by d.alias_key
    having count(*) > 1
  ) as duplicate_keys

  union all
  select 'duplicate_quantity_source_keys', count(*), 'uniqueness'
  from (
    select d.source_key
    from public.historical_product_daily_quantities d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    group by d.source_key
    having count(*) > 1
  ) as duplicate_keys

  union all
  select 'duplicate_invoice_source_keys', count(*), 'uniqueness'
  from (
    select d.invoice_source_key
    from public.purchase_invoices d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    group by d.invoice_source_key
    having count(*) > 1
  ) as duplicate_keys

  union all
  select 'duplicate_purchase_line_source_keys', count(*), 'uniqueness'
  from (
    select d.line_source_key
    from public.purchase_items d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    group by d.line_source_key
    having count(*) > 1
  ) as duplicate_keys

  union all
  select 'duplicate_traffic_source_keys', count(*), 'uniqueness'
  from (
    select d.source_key
    from public.customer_traffic_daily d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    group by d.source_key
    having count(*) > 1
  ) as duplicate_keys

  union all
  select 'duplicate_asset_source_keys', count(*), 'uniqueness'
  from (
    select d.asset_source_key
    from public.assets d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    where d.deleted_at is null
    group by d.asset_source_key
    having count(*) > 1
  ) as duplicate_keys

  union all
  select 'duplicate_asset_codes', count(*), 'uniqueness'
  from (
    select d.asset_code
    from public.assets d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    where d.deleted_at is null
    group by d.asset_code
    having count(*) > 1
  ) as duplicate_keys

  union all
  select 'invalid_purchase_financial_classes', count(*), 'quality'
  from public.purchase_items pi
  join _june_production_reconciliation_context c
    on c.import_batch_id = pi.import_batch_id
  where pi.deleted_at is null
    and pi.financial_class not in ('hpp', 'operating_expense')

  union all
  select 'purchase_amount_formula_mismatches', count(*), 'quality'
  from public.purchase_items pi
  join _june_production_reconciliation_context c
    on c.import_batch_id = pi.import_batch_id
  where pi.deleted_at is null
    and pi.amount_difference
      is distinct from pi.amount - pi.calculated_total

  union all
  select 'traffic_arithmetic_mismatches', count(*), 'quality'
  from public.customer_traffic_daily d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.total_visitors <> d.adult_visitors + d.child_visitors

  union all
  select 'forbidden_estimated_origins', count(*), 'quality'
  from (
    select d.data_origin
    from public.daily_sales_summaries d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    union all
    select d.data_origin
    from public.customer_traffic_daily d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    union all
    select d.data_origin
    from public.historical_product_daily_quantities d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    union all
    select d.data_origin
    from public.purchase_invoices d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    where d.deleted_at is null
    union all
    select d.data_origin
    from public.purchase_items d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    where d.deleted_at is null
    union all
    select d.data_origin
    from public.assets d
    join _june_production_reconciliation_context c
      on c.import_batch_id = d.import_batch_id
    where d.deleted_at is null
  ) as origins
  where data_origin not in ('actual', 'adjusted')

  union all
  select 'assets_not_tracking_only_expensed', count(*), 'asset_policy'
  from public.assets a
  join _june_production_reconciliation_context c
    on c.import_batch_id = a.import_batch_id
  where a.deleted_at is null
    and a.capitalization_status <> 'tracking_only_expensed'

  union all
  select 'assets_with_nonzero_monthly_depreciation', count(*), 'asset_policy'
  from public.assets a
  join _june_production_reconciliation_context c
    on c.import_batch_id = a.import_batch_id
  where a.deleted_at is null
    and a.monthly_depreciation <> 0

  union all
  select 'tracking_assets_with_depreciation_entries', count(*), 'no_fabrication'
  from public.asset_depreciation_entries de
  join public.assets a
    on a.id = de.asset_id
  join _june_production_reconciliation_context c
    on c.import_batch_id = a.import_batch_id
  where a.capitalization_status = 'tracking_only_expensed'

  union all
  select 'tax_entries_created', count(*), 'no_fabrication'
  from public.tax_entries t
  join _june_production_reconciliation_context c
    on c.import_batch_id = t.import_batch_id
  where t.deleted_at is null

  union all
  select 'owner_distributions_created', count(*), 'no_fabrication'
  from public.owner_distributions d
  join _june_production_reconciliation_context c
    on c.import_batch_id = d.import_batch_id
  where d.deleted_at is null
) as zero_checks;

-- Document the intentionally nullable supplier relationship in production.
insert into _june_production_reconciliation_checks (
  metric_key,
  expected_value,
  actual_value,
  passed,
  details
)
select
  'purchase_invoices_without_supplier',
  '322',
  count(*)::text,
  count(*) = 322,
  jsonb_build_object(
    'kind', 'documented_nullable_relationship',
    'reason', 'No proven supplier mapping in approved source'
  )
from public.purchase_invoices inv
join _june_production_reconciliation_context c
  on c.import_batch_id = inv.import_batch_id
where inv.deleted_at is null
  and inv.supplier_id is null;

-- Exact June financial statement semantics, including explicit unknown tax,
-- unknown dividend, and provisional (not final net-income) status.
with finance_view as (
  select v.*
  from public.v_financial_statement_monthly v
  join _june_production_reconciliation_context c
    on c.import_batch_id = v.import_batch_id
  where v.month_start = date '2026-06-01'
),
finance_control as (
  select f.*
  from staging.finance_summary_import f
  join _june_production_reconciliation_context c
    on c.batch_key = f.import_batch_key
  where f.period_start = date '2026-06-01'
    and f.period_end = date '2026-06-30'
),
comparison as (
  select count(*)::bigint as mismatch_count
  from finance_view v
  cross join finance_control f
  where
    v.revenue is distinct from 30011000.00
    or v.hpp is distinct from 10488538.00
    or v.gross_profit is distinct from 19522462.00
    or v.operating_expense is distinct from 1046760.00
    or v.ebitda is distinct from 18475702.00
    or v.depreciation is distinct from 0
    or v.ebit_operating_profit is distinct from 18475702.00
    or v.tax_recorded is distinct from false
    or v.tax_amount is not null
    or v.net_income_final is not null
    or v.net_income_provisional_before_tax is distinct from 18475702.00
    or v.dividend_recorded is distinct from false
    or v.dividend_amount is not null
    or v.retained_earnings_final is not null
    or v.statement_status <> 'provisional_before_tax'
    or v.revenue is distinct from f.revenue
    or v.hpp is distinct from f.hpp
    or v.gross_profit is distinct from f.gross_profit
    or v.operating_expense is distinct from f.operating_expense
    or v.ebitda is distinct from f.ebitda
    or v.depreciation is distinct from f.depreciation
    or v.ebit_operating_profit is distinct from f.ebit_operating_profit
)
insert into _june_production_reconciliation_checks (
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
  'finance_control_row_count',
  '1',
  (select count(*)::text from finance_control),
  (select count(*) = 1 from finance_control),
  jsonb_build_object('kind', 'control_source')
union all
select
  'financial_view_exact_and_matches_control',
  '0',
  mismatch_count::text,
  mismatch_count = 0
    and (select count(*) = 1 from finance_view)
    and (select count(*) = 1 from finance_control),
  jsonb_build_object(
    'kind', 'reporting_view',
    'statement_status', 'provisional_before_tax',
    'tax_recorded', false,
    'dividend_recorded', false
  )
from comparison;

with asset_view as (
  select v.*
  from public.v_asset_book_values v
  join _june_production_reconciliation_context c
    on c.import_batch_id = v.import_batch_id
)
insert into _june_production_reconciliation_checks (
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

-- The production import audit increments only after a completely successful
-- atomic commit. At least two attempts therefore prove the requested rerun.
insert into _june_production_reconciliation_checks (
  metric_key,
  expected_value,
  actual_value,
  passed,
  details
)
select
  'successful_import_attempts',
  '>=2',
  coalesce((r.details ->> 'attempt_count'), '0'),
  coalesce((r.details ->> 'attempt_count')::integer, 0) >= 2,
  jsonb_build_object('kind', 'idempotency_rerun')
from _june_production_reconciliation_context c
left join public.data_import_reconciliation_results r
  on r.import_batch_id = c.import_batch_id
 and r.phase = 'production_import'
 and r.metric_key = 'daily_sales_summaries_count';

-- Resolve and compare every old-table count/checksum against the pinned (or
-- latest completed) Phase 7 snapshot.
insert into _june_production_reconciliation_checks (
  metric_key,
  expected_value,
  actual_value,
  passed,
  details
)
select
  'old_snapshot_available',
  coalesce(requested_snapshot_key, '<latest completed>'),
  coalesce(resolved_snapshot_key, '<missing>'),
  snapshot_run_id is not null,
  jsonb_build_object(
    'kind', 'old_table_snapshot',
    'requested_snapshot_key', requested_snapshot_key,
    'resolved_snapshot_key', resolved_snapshot_key
  )
from _june_production_reconciliation_context;

do $old_table_checks$
declare
  v_run_id uuid;
  v_snapshot_key text;
  v_table text;
  v_expected_count bigint;
  v_expected_checksum text;
  v_actual_count bigint;
  v_actual_checksum text;
  v_tables constant text[] := array[
    'profiles',
    'sales_categories',
    'products',
    'sales',
    'expense_categories',
    'expense_items',
    'expenses',
    'visitors',
    'visitor_visits'
  ];
begin
  select snapshot_run_id, resolved_snapshot_key
  into v_run_id, v_snapshot_key
  from _june_production_reconciliation_context;

  if v_run_id is null then
    return;
  end if;

  foreach v_table in array v_tables loop
    select row_count, row_checksum_md5
    into v_expected_count, v_expected_checksum
    from backup.lm_snapshot_table_metrics
    where run_id = v_run_id
      and source_schema = 'public'
      and source_table = v_table;

    if not found or to_regclass(format('public.%I', v_table)) is null then
      insert into _june_production_reconciliation_checks (
        metric_key,
        expected_value,
        actual_value,
        passed,
        details
      )
      values (
        'old_table_' || v_table || '_unchanged',
        'snapshot metric and live table',
        '<missing>',
        false,
        jsonb_build_object(
          'kind', 'old_table_snapshot',
          'snapshot_key', v_snapshot_key,
          'source_table', v_table
        )
      );
      continue;
    end if;

    execute format(
      'select count(*) from public.%I',
      v_table
    )
    into v_actual_count;

    execute format(
      $checksum$
        select md5(
          coalesce(
            string_agg(
              md5(to_jsonb(t)::text),
              '' order by md5(to_jsonb(t)::text)
            ),
            ''
          )
        )
        from public.%I t
      $checksum$,
      v_table
    )
    into v_actual_checksum;

    insert into _june_production_reconciliation_checks (
      metric_key,
      expected_value,
      actual_value,
      passed,
      details
    )
    values (
      'old_table_' || v_table || '_unchanged',
      format(
        'count=%s;checksum=%s',
        v_expected_count,
        v_expected_checksum
      ),
      format(
        'count=%s;checksum=%s',
        v_actual_count,
        v_actual_checksum
      ),
      v_actual_count = v_expected_count
        and v_actual_checksum is not distinct from v_expected_checksum,
      jsonb_build_object(
        'kind', 'old_table_snapshot',
        'snapshot_key', v_snapshot_key,
        'source_table', v_table
      )
    );
  end loop;
end;
$old_table_checks$;

-- Replace only the target batch's final reconciliation metrics.
delete from public.data_import_reconciliation_results r
using _june_production_reconciliation_context c
where r.import_batch_id = c.import_batch_id
  and r.phase = 'production';

insert into public.data_import_reconciliation_results (
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
  'production',
  ch.metric_key,
  ch.expected_value,
  ch.actual_value,
  ch.passed,
  clock_timestamp(),
  ch.details
from _june_production_reconciliation_context c
cross join _june_production_reconciliation_checks ch;

-- A previously reconciled batch is downgraded to imported if a later rerun
-- detects drift. Only a completely passing run may set reconciled.
update public.data_import_batches b
set
  status = case
    when not exists (
      select 1
      from _june_production_reconciliation_checks
      where not passed
    ) then 'reconciled'
    else 'imported'
  end,
  completed_at = clock_timestamp(),
  updated_at = clock_timestamp()
from _june_production_reconciliation_context c
where b.id = c.import_batch_id;

commit;

-- Client-side reports contain aggregate metrics only.
\pset tuples_only on
\pset format unaligned
\o reports/phase12_production_reconciliation.json
select jsonb_pretty(
  jsonb_build_object(
    'batch_key',
    (select batch_key from _june_production_reconciliation_context),
    'snapshot_key',
    (
      select resolved_snapshot_key
      from _june_production_reconciliation_context
    ),
    'phase',
    'production',
    'passed',
    coalesce(
      (
        select bool_and(passed)
        from _june_production_reconciliation_checks
      ),
      false
    ),
    'metrics',
    (
      select jsonb_agg(
        jsonb_build_object(
          'metric_key', metric_key,
          'expected_value', expected_value,
          'actual_value', actual_value,
          'passed', passed,
          'details', details
        )
        order by metric_key
      )
      from _june_production_reconciliation_checks
    )
  )
);
\o

\o reports/phase12_production_reconciliation.md
select
  '# Phase 12 - Production Reconciliation'
  || E'\n\n'
  || '- Batch: `'
  || (select batch_key from _june_production_reconciliation_context)
  || E'`\n'
  || '- Snapshot: `'
  || coalesce(
    (
      select resolved_snapshot_key
      from _june_production_reconciliation_context
    ),
    '<missing>'
  )
  || E'`\n'
  || '- Status: **'
  || case
    when (
      select coalesce(bool_and(passed), false)
      from _june_production_reconciliation_checks
    ) then 'PASSED'
    else 'FAILED'
  end
  || E'**\n\n'
  || E'| Metric | Expected | Actual | Passed |\n'
  || E'|---|---:|---:|:---:|\n'
  || (
    select string_agg(
      format(
        '| %s | %s | %s | %s |',
        metric_key,
        replace(coalesce(expected_value, 'null'), '|', E'\\|'),
        replace(coalesce(actual_value, 'null'), '|', E'\\|'),
        case when passed then 'yes' else 'no' end
      ),
      E'\n'
      order by metric_key
    )
    from _june_production_reconciliation_checks
  );
\o
\pset tuples_only off
\pset format aligned

select
  metric_key,
  expected_value,
  actual_value,
  passed
from _june_production_reconciliation_checks
order by passed, metric_key;

do $final_result$
declare
  v_failed bigint;
begin
  select count(*)
  into v_failed
  from _june_production_reconciliation_checks
  where not passed;

  if v_failed > 0 then
    raise exception
      'PRODUCTION RECONCILIATION FAILED: % metric(s) failed. Audit and local reports were saved.',
      v_failed;
  end if;

  raise notice
    'PRODUCTION RECONCILIATION PASSED. Batch status is reconciled.';
end;
$final_result$;
