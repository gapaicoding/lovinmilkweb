\set ON_ERROR_STOP on

\if :{?batch_key}
\else
  \set batch_key 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2'
\endif

\echo 'Reconciling private staging batch' :batch_key

begin;

set role postgres;
set local timezone = 'Asia/Jakarta';
set local lock_timeout = '15s';
set local statement_timeout = '0';
set local application_name = 'lovin-milk-june-2026-staging-reconciliation';

select pg_advisory_xact_lock(
  hashtextextended('lovin-milk:june-import:' || :'batch_key', 0)
);

create temporary table _june_staging_reconciliation_context
on commit preserve rows
as
select
  id as import_batch_id,
  batch_key,
  status as prior_status
from public.data_import_batches
where batch_key = :'batch_key'
  and facts_period_start = date '2026-06-01'
  and facts_period_end = date '2026-06-30'
  and assets_full = true;

do $preflight$
declare
  v_relation text;
  v_required constant text[] := array[
    'public.data_import_reconciliation_results',
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
  if (
    select count(*)
    from _june_staging_reconciliation_context
  ) <> 1 then
    raise exception
      'Staging reconciliation aborted: approved batch scope was not found.';
  end if;

  foreach v_relation in array v_required loop
    if to_regclass(v_relation) is null then
      raise exception
        'Staging reconciliation aborted: required relation % is missing.',
        v_relation;
    end if;
  end loop;
end;
$preflight$;

create temporary table _june_staging_reconciliation_checks (
  metric_key text primary key,
  expected_value text,
  actual_value text,
  passed boolean not null,
  details jsonb not null default '{}'::jsonb
) on commit preserve rows;

-- Required dataset cardinalities.
insert into _june_staging_reconciliation_checks (
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
    'asset_categories_count'::text as metric_key,
    3::numeric as expected_value,
    count(*)::numeric as actual_value
  from staging.asset_categories_import
  where import_batch_key = :'batch_key'

  union all
  select 'assets_count', 21, count(*)
  from staging.assets_import
  where import_batch_key = :'batch_key'

  union all
  select 'customer_traffic_daily_count', 30, count(*)
  from staging.customer_traffic_daily_import
  where import_batch_key = :'batch_key'

  union all
  select 'daily_sales_summaries_count', 30, count(*)
  from staging.daily_sales_summaries_import
  where import_batch_key = :'batch_key'

  union all
  select 'data_coverage_count', 7, count(*)
  from staging.data_coverage_import
  where import_batch_key = :'batch_key'

  union all
  select 'finance_summary_count', 1, count(*)
  from staging.finance_summary_import
  where import_batch_key = :'batch_key'

  union all
  select 'historical_product_aliases_count', 68, count(*)
  from staging.historical_product_aliases_import
  where import_batch_key = :'batch_key'

  union all
  select 'historical_product_daily_quantities_count', 656, count(*)
  from staging.historical_product_daily_quantities_import
  where import_batch_key = :'batch_key'

  union all
  select 'historical_products_count', 61, count(*)
  from staging.historical_products_import
  where import_batch_key = :'batch_key'

  union all
  select 'purchase_items_count', 344, count(*)
  from staging.purchases_import
  where import_batch_key = :'batch_key'

  union all
  select 'purchase_invoices_count', 343, count(distinct invoice_source_key)
  from staging.purchases_import
  where import_batch_key = :'batch_key'

  union all
  select 'supplier_items_count', 20, count(*)
  from staging.supplier_items_import
  where import_batch_key = :'batch_key'

  union all
  select 'suppliers_count', 9, count(*)
  from staging.suppliers_import
  where import_batch_key = :'batch_key'
) as cardinalities;

-- Required source totals and derived finance values.
insert into _june_staging_reconciliation_checks (
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
  jsonb_build_object('kind', 'total', 'currency', is_currency)
from (
  select
    'revenue_total'::text as metric_key,
    30011000.00::numeric as expected_value,
    coalesce(sum(total_sales), 0)::numeric as actual_value,
    true as is_currency
  from staging.daily_sales_summaries_import
  where import_batch_key = :'batch_key'

  union all
  select
    'bill_count_total',
    342,
    coalesce(sum(bill_count), 0),
    false
  from staging.daily_sales_summaries_import
  where import_batch_key = :'batch_key'

  union all
  select
    'adult_visitors_total',
    421,
    coalesce(sum(adult_visitors), 0),
    false
  from staging.customer_traffic_daily_import
  where import_batch_key = :'batch_key'

  union all
  select
    'child_visitors_total',
    406,
    coalesce(sum(child_visitors), 0),
    false
  from staging.customer_traffic_daily_import
  where import_batch_key = :'batch_key'

  union all
  select
    'visitor_total',
    827,
    coalesce(sum(total_visitors), 0),
    false
  from staging.customer_traffic_daily_import
  where import_batch_key = :'batch_key'

  union all
  select
    'product_quantity_total',
    1358,
    coalesce(sum(quantity), 0),
    false
  from staging.historical_product_daily_quantities_import
  where import_batch_key = :'batch_key'

  union all
  select
    'purchase_total',
    11535298.00,
    coalesce(sum(total_amount), 0),
    true
  from staging.purchases_import
  where import_batch_key = :'batch_key'

  union all
  select
    'hpp_total',
    10488538.00,
    coalesce(sum(total_amount), 0),
    true
  from staging.purchases_import
  where import_batch_key = :'batch_key'
    and financial_class_final = 'hpp'

  union all
  select
    'operating_expense_total',
    1046760.00,
    coalesce(sum(total_amount), 0),
    true
  from staging.purchases_import
  where import_batch_key = :'batch_key'
    and financial_class_final = 'operating_expense'

  union all
  select
    'gross_profit',
    19522462.00,
    (
      select coalesce(sum(total_sales), 0)
      from staging.daily_sales_summaries_import
      where import_batch_key = :'batch_key'
    ) - (
      select coalesce(sum(total_amount), 0)
      from staging.purchases_import
      where import_batch_key = :'batch_key'
        and financial_class_final = 'hpp'
    ),
    true

  union all
  select
    'ebitda',
    18475702.00,
    (
      select coalesce(sum(total_sales), 0)
      from staging.daily_sales_summaries_import
      where import_batch_key = :'batch_key'
    ) - (
      select coalesce(sum(total_amount), 0)
      from staging.purchases_import
      where import_batch_key = :'batch_key'
        and financial_class_final in ('hpp', 'operating_expense')
    ),
    true

  union all
  select
    'depreciation_june_2026',
    0,
    coalesce(sum(monthly_depreciation), 0),
    true
  from staging.assets_import
  where import_batch_key = :'batch_key'
    and capitalization_status = 'capitalized'

  union all
  select
    'ebit_operating_profit',
    18475702.00,
    (
      select coalesce(sum(total_sales), 0)
      from staging.daily_sales_summaries_import
      where import_batch_key = :'batch_key'
    ) - (
      select coalesce(sum(total_amount), 0)
      from staging.purchases_import
      where import_batch_key = :'batch_key'
        and financial_class_final in ('hpp', 'operating_expense')
    ) - (
      select coalesce(sum(monthly_depreciation), 0)
      from staging.assets_import
      where import_batch_key = :'batch_key'
        and capitalization_status = 'capitalized'
    ),
    true

  union all
  select
    'asset_register_total',
    870145.00,
    coalesce(sum(acquisition_cost), 0),
    true
  from staging.assets_import
  where import_batch_key = :'batch_key'
) as totals;

-- Dates, relationships, uniqueness, and source-quality failures are expected
-- to be zero. Asset dates are intentionally excluded from the June-only rule.
insert into _june_staging_reconciliation_checks (
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
  from staging.daily_sales_summaries_import
  where import_batch_key = :'batch_key'
    and date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'product_quantities_outside_june', count(*), 'date_scope'
  from staging.historical_product_daily_quantities_import
  where import_batch_key = :'batch_key'
    and sale_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'purchases_outside_june', count(*), 'date_scope'
  from staging.purchases_import
  where import_batch_key = :'batch_key'
    and purchase_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'traffic_outside_june', count(*), 'date_scope'
  from staging.customer_traffic_daily_import
  where import_batch_key = :'batch_key'
    and traffic_date not between date '2026-06-01' and date '2026-06-30'

  union all
  select 'finance_summary_wrong_period', count(*), 'date_scope'
  from staging.finance_summary_import
  where import_batch_key = :'batch_key'
    and (
      period_start <> date '2026-06-01'
      or period_end <> date '2026-06-30'
    )

  union all
  select 'june_coverage_wrong_period', count(*), 'date_scope'
  from staging.data_coverage_import
  where import_batch_key = :'batch_key'
    and domain <> 'assets'
    and (
      period_start <> date '2026-06-01'
      or period_end <> date '2026-06-30'
    )

  union all
  select 'asset_coverage_wrong_period', count(*), 'date_scope'
  from staging.data_coverage_import
  where import_batch_key = :'batch_key'
    and domain = 'assets'
    and (
      period_start <> date '2026-01-10'
      or period_end <> date '2026-07-07'
    )

  union all
  select 'aliases_without_parent_product', count(*), 'relationship'
  from staging.historical_product_aliases_import a
  where a.import_batch_key = :'batch_key'
    and not exists (
      select 1
      from staging.historical_products_import p
      where p.import_batch_key = a.import_batch_key
        and p.historical_product_key = a.historical_product_key
    )

  union all
  select 'quantities_without_parent_product', count(*), 'relationship'
  from staging.historical_product_daily_quantities_import q
  where q.import_batch_key = :'batch_key'
    and not exists (
      select 1
      from staging.historical_products_import p
      where p.import_batch_key = q.import_batch_key
        and p.historical_product_key = q.historical_product_key
    )

  union all
  select 'purchases_with_unknown_supplier_key', count(*), 'relationship'
  from staging.purchases_import p
  where p.import_batch_key = :'batch_key'
    and nullif(btrim(p.supplier_key), '') is not null
    and not exists (
      select 1
      from staging.suppliers_import s
      where s.import_batch_key = p.import_batch_key
        and s.supplier_key = p.supplier_key
    )

  union all
  select 'supplier_items_without_supplier', count(*), 'relationship'
  from staging.supplier_items_import si
  where si.import_batch_key = :'batch_key'
    and not exists (
      select 1
      from staging.suppliers_import s
      where s.import_batch_key = si.import_batch_key
        and s.supplier_key = si.supplier_key
    )

  union all
  select 'assets_without_category', count(*), 'relationship'
  from staging.assets_import a
  where a.import_batch_key = :'batch_key'
    and not exists (
      select 1
      from staging.asset_categories_import c
      where c.import_batch_key = a.import_batch_key
        and c.category_name = a.asset_category
    )

  union all
  select 'duplicate_daily_sales_source_keys', count(*), 'uniqueness'
  from (
    select source_key
    from staging.daily_sales_summaries_import
    where import_batch_key = :'batch_key'
    group by source_key
    having count(*) > 1
  ) as duplicates

  union all
  select 'duplicate_historical_product_keys', count(*), 'uniqueness'
  from (
    select historical_product_key
    from staging.historical_products_import
    where import_batch_key = :'batch_key'
    group by historical_product_key
    having count(*) > 1
  ) as duplicates

  union all
  select 'duplicate_alias_keys', count(*), 'uniqueness'
  from (
    select alias_key
    from staging.historical_product_aliases_import
    where import_batch_key = :'batch_key'
    group by alias_key
    having count(*) > 1
  ) as duplicates

  union all
  select 'duplicate_quantity_source_keys', count(*), 'uniqueness'
  from (
    select source_key
    from staging.historical_product_daily_quantities_import
    where import_batch_key = :'batch_key'
    group by source_key
    having count(*) > 1
  ) as duplicates

  union all
  select 'duplicate_purchase_line_source_keys', count(*), 'uniqueness'
  from (
    select line_source_key
    from staging.purchases_import
    where import_batch_key = :'batch_key'
    group by line_source_key
    having count(*) > 1
  ) as duplicates

  union all
  select 'duplicate_supplier_keys', count(*), 'uniqueness'
  from (
    select supplier_key
    from staging.suppliers_import
    where import_batch_key = :'batch_key'
    group by supplier_key
    having count(*) > 1
  ) as duplicates

  union all
  select 'duplicate_supplier_item_keys', count(*), 'uniqueness'
  from (
    select supplier_item_key
    from staging.supplier_items_import
    where import_batch_key = :'batch_key'
    group by supplier_item_key
    having count(*) > 1
  ) as duplicates

  union all
  select 'duplicate_traffic_source_keys', count(*), 'uniqueness'
  from (
    select source_key
    from staging.customer_traffic_daily_import
    where import_batch_key = :'batch_key'
    group by source_key
    having count(*) > 1
  ) as duplicates

  union all
  select 'duplicate_asset_source_keys', count(*), 'uniqueness'
  from (
    select asset_source_key
    from staging.assets_import
    where import_batch_key = :'batch_key'
    group by asset_source_key
    having count(*) > 1
  ) as duplicates

  union all
  select 'duplicate_asset_codes', count(*), 'uniqueness'
  from (
    select asset_code
    from staging.assets_import
    where import_batch_key = :'batch_key'
    group by asset_code
    having count(*) > 1
  ) as duplicates

  union all
  select 'negative_product_quantities', count(*), 'quality'
  from staging.historical_product_daily_quantities_import
  where import_batch_key = :'batch_key'
    and quantity < 0

  union all
  select 'nonpositive_purchase_quantities', count(*), 'quality'
  from staging.purchases_import
  where import_batch_key = :'batch_key'
    and quantity <= 0

  union all
  select 'negative_purchase_unit_prices', count(*), 'quality'
  from staging.purchases_import
  where import_batch_key = :'batch_key'
    and unit_price < 0

  union all
  select 'negative_purchase_amounts', count(*), 'quality'
  from staging.purchases_import
  where import_batch_key = :'batch_key'
    and total_amount < 0

  union all
  select 'invalid_purchase_financial_classes', count(*), 'quality'
  from staging.purchases_import
  where import_batch_key = :'batch_key'
    and financial_class_final not in ('hpp', 'operating_expense')

  union all
  select 'purchase_amount_formula_mismatches', count(*), 'quality'
  from staging.purchases_import
  where import_batch_key = :'batch_key'
    and amount_difference
      is distinct from total_amount - calculated_total

  union all
  select 'inconsistent_invoice_headers', count(*), 'quality'
  from (
    select invoice_source_key
    from staging.purchases_import
    where import_batch_key = :'batch_key'
    group by invoice_source_key
    having
      min(purchase_date) is distinct from max(purchase_date)
      or min(coalesce(supplier_key, '<NULL>'))
        is distinct from max(coalesce(supplier_key, '<NULL>'))
      or min(coalesce(supplier_name_raw, '<NULL>'))
        is distinct from max(coalesce(supplier_name_raw, '<NULL>'))
      or min(coalesce(receipt_reference, '<NULL>'))
        is distinct from max(coalesce(receipt_reference, '<NULL>'))
      or min(source_file) is distinct from max(source_file)
      or min(source_sheet) is distinct from max(source_sheet)
      or min(data_origin) is distinct from max(data_origin)
  ) as inconsistent

  union all
  select 'traffic_arithmetic_mismatches', count(*), 'quality'
  from staging.customer_traffic_daily_import
  where import_batch_key = :'batch_key'
    and total_visitors <> adult_visitors + child_visitors

  union all
  select 'daily_traffic_arithmetic_mismatches', count(*), 'quality'
  from staging.daily_sales_summaries_import
  where import_batch_key = :'batch_key'
    and visitor_total is not null
    and adult_visitors is not null
    and child_visitors is not null
    and visitor_total <> adult_visitors + child_visitors

  union all
  select 'forbidden_estimated_or_synthetic_origins', count(*), 'quality'
  from (
    select data_origin
    from staging.daily_sales_summaries_import
    where import_batch_key = :'batch_key'
    union all
    select data_origin
    from staging.historical_product_daily_quantities_import
    where import_batch_key = :'batch_key'
    union all
    select data_origin
    from staging.purchases_import
    where import_batch_key = :'batch_key'
    union all
    select data_origin
    from staging.customer_traffic_daily_import
    where import_batch_key = :'batch_key'
    union all
    select data_origin
    from staging.assets_import
    where import_batch_key = :'batch_key'
    union all
    select data_origin
    from staging.finance_summary_import
    where import_batch_key = :'batch_key'
  ) as origins
  where data_origin not in ('actual', 'adjusted')

  union all
  select 'assets_not_tracking_only_expensed', count(*), 'quality'
  from staging.assets_import
  where import_batch_key = :'batch_key'
    and capitalization_status <> 'tracking_only_expensed'

  union all
  select 'assets_with_nonzero_depreciation', count(*), 'quality'
  from staging.assets_import
  where import_batch_key = :'batch_key'
    and monthly_depreciation <> 0

  union all
  select 'assets_with_invalid_useful_life', count(*), 'quality'
  from staging.assets_import
  where import_batch_key = :'batch_key'
    and useful_life_months <= 0

  union all
  select 'finance_summary_formula_mismatches', count(*), 'quality'
  from staging.finance_summary_import
  where import_batch_key = :'batch_key'
    and (
      revenue - hpp <> gross_profit
      or gross_profit - operating_expense <> ebitda
      or ebitda - depreciation <> ebit_operating_profit
    )

  union all
  select 'finance_summary_tax_policy_mismatches', count(*), 'quality'
  from staging.finance_summary_import
  where import_batch_key = :'batch_key'
    and (tax_status <> 'not_supplied' or tax_amount is not null)

  union all
  select 'finance_summary_dividend_policy_mismatches', count(*), 'quality'
  from staging.finance_summary_import
  where import_batch_key = :'batch_key'
    and (dividend_status <> 'not_supplied' or dividend_amount is not null)
) as zero_checks;

-- The approved source deliberately leaves supplier_key blank rather than
-- inventing mappings. These counts document, rather than reject, that choice.
insert into _june_staging_reconciliation_checks (
  metric_key,
  expected_value,
  actual_value,
  passed,
  details
)
select
  'purchase_lines_without_supplier_key',
  '323',
  count(*)::text,
  count(*) = 323,
  jsonb_build_object(
    'kind', 'documented_nullable_relationship',
    'reason', 'No proven supplier mapping in approved source'
  )
from staging.purchases_import
where import_batch_key = :'batch_key'
  and nullif(btrim(supplier_key), '') is null

union all

select
  'purchase_invoices_without_supplier_key',
  '322',
  count(distinct invoice_source_key)::text,
  count(distinct invoice_source_key) = 322,
  jsonb_build_object(
    'kind', 'documented_nullable_relationship',
    'reason', 'No proven supplier mapping in approved source'
  )
from staging.purchases_import
where import_batch_key = :'batch_key'
  and nullif(btrim(supplier_key), '') is null;

-- The finance control CSV must exactly equal independently aggregated staging.
with staging_actual as (
  select
    (
      select coalesce(sum(total_sales), 0)
      from staging.daily_sales_summaries_import
      where import_batch_key = :'batch_key'
    ) as revenue,
    (
      select coalesce(sum(total_amount), 0)
      from staging.purchases_import
      where import_batch_key = :'batch_key'
        and financial_class_final = 'hpp'
    ) as hpp,
    (
      select coalesce(sum(total_amount), 0)
      from staging.purchases_import
      where import_batch_key = :'batch_key'
        and financial_class_final = 'operating_expense'
    ) as operating_expense,
    (
      select coalesce(sum(monthly_depreciation), 0)
      from staging.assets_import
      where import_batch_key = :'batch_key'
        and capitalization_status = 'capitalized'
    ) as depreciation
),
mismatches as (
  select count(*)::bigint as mismatch_count
  from staging.finance_summary_import f
  cross join staging_actual a
  where f.import_batch_key = :'batch_key'
    and (
      f.revenue is distinct from a.revenue
      or f.hpp is distinct from a.hpp
      or f.gross_profit is distinct from a.revenue - a.hpp
      or f.operating_expense is distinct from a.operating_expense
      or f.ebitda
        is distinct from a.revenue - a.hpp - a.operating_expense
      or f.depreciation is distinct from a.depreciation
      or f.ebit_operating_profit
        is distinct from (
          a.revenue - a.hpp - a.operating_expense - a.depreciation
        )
      or f.net_income_provisional
        is distinct from (
          a.revenue - a.hpp - a.operating_expense - a.depreciation
        )
      or f.retained_earnings_provisional
        is distinct from (
          a.revenue - a.hpp - a.operating_expense - a.depreciation
        )
      or f.net_income_status <> 'provisional_before_tax'
      or f.tax_status <> 'not_supplied'
      or f.tax_amount is not null
      or f.dividend_status <> 'not_supplied'
      or f.dividend_amount is not null
    )
)
insert into _june_staging_reconciliation_checks (
  metric_key,
  expected_value,
  actual_value,
  passed,
  details
)
select
  'finance_summary_matches_staging_calculation',
  '0',
  mismatch_count::text,
  mismatch_count = 0,
  jsonb_build_object('kind', 'control_total')
from mismatches;

-- Replace only this batch/phase's audit rows, never another batch's results.
delete from public.data_import_reconciliation_results r
using _june_staging_reconciliation_context c
where r.import_batch_id = c.import_batch_id
  and r.phase = 'staging';

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
  'staging',
  ch.metric_key,
  ch.expected_value,
  ch.actual_value,
  ch.passed,
  clock_timestamp(),
  ch.details
from _june_staging_reconciliation_context c
cross join _june_staging_reconciliation_checks ch;

update public.data_import_batches b
set
  status = case
    when b.status in ('imported', 'reconciled') then b.status
    else 'staged'
  end,
  updated_at = clock_timestamp()
from _june_staging_reconciliation_context c
where b.id = c.import_batch_id
  and not exists (
    select 1
    from _june_staging_reconciliation_checks
    where not passed
  );

commit;

-- Client-side reports contain no credentials or source rows.
\pset tuples_only on
\pset format unaligned
\o reports/phase10_staging_reconciliation.json
select jsonb_pretty(
  jsonb_build_object(
    'batch_key',
    (select batch_key from _june_staging_reconciliation_context),
    'phase',
    'staging',
    'passed',
    coalesce(
      (select bool_and(passed) from _june_staging_reconciliation_checks),
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
      from _june_staging_reconciliation_checks
    )
  )
);
\o

\o reports/phase10_staging_reconciliation.md
select
  '# Phase 10 - Staging Reconciliation'
  || E'\n\n'
  || '- Batch: `'
  || (select batch_key from _june_staging_reconciliation_context)
  || E'`\n'
  || '- Status: **'
  || case
    when (
      select coalesce(bool_and(passed), false)
      from _june_staging_reconciliation_checks
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
        coalesce(expected_value, 'null'),
        coalesce(actual_value, 'null'),
        case when passed then 'yes' else 'no' end
      ),
      E'\n'
      order by metric_key
    )
    from _june_staging_reconciliation_checks
  );
\o
\pset tuples_only off
\pset format aligned

select
  metric_key,
  expected_value,
  actual_value,
  passed
from _june_staging_reconciliation_checks
order by passed, metric_key;

do $final_result$
declare
  v_failed bigint;
begin
  select count(*)
  into v_failed
  from _june_staging_reconciliation_checks
  where not passed;

  if v_failed > 0 then
    raise exception
      'STAGING RECONCILIATION FAILED: % metric(s) failed. Audit and local reports were saved.',
      v_failed;
  end if;

  raise notice 'STAGING RECONCILIATION PASSED.';
end;
$final_result$;
