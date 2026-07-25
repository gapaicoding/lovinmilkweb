-- Post-migration gate for the additive June foundation.
-- The snapshot key is intentionally explicit: selecting an arbitrary "latest"
-- snapshot could compare against the wrong release baseline.

set timezone = 'Asia/Jakarta';

do $verify$
declare
  v_table text;
  v_current_count bigint;
  v_current_checksum text;
  v_expected_count bigint;
  v_expected_checksum text;
  v_snapshot_run uuid;
  v_batch_id uuid;
  v_old_tables constant text[] := array[
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
  v_new_tables constant text[] := array[
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
  select run_id
  into strict v_snapshot_run
  from backup.lm_snapshot_runs
  where snapshot_key = 'LM-PRE-JUNE-FOUNDATION-20260725-130419425'
    and project_ref = 'baukcqccetzzwzgpbnoj'
    and status = 'completed';

  foreach v_table in array v_new_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception
        'Foundation verification failed: public.% is missing.',
        v_table;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = v_table
        and relation.relkind in ('r', 'p')
        and relation.relrowsecurity
    ) then
      raise exception
        'Foundation verification failed: RLS is not enabled on public.%.',
        v_table;
    end if;

    if pg_catalog.has_table_privilege(
      'anon',
      format('public.%I', v_table),
      'SELECT'
    )
      or pg_catalog.has_table_privilege(
        'anon',
        format('public.%I', v_table),
        'INSERT'
      )
      or pg_catalog.has_table_privilege(
        'anon',
        format('public.%I', v_table),
        'UPDATE'
      )
      or pg_catalog.has_table_privilege(
        'anon',
        format('public.%I', v_table),
        'DELETE'
      )
    then
      raise exception
        'Foundation verification failed: anon has access to public.%.',
        v_table;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = 'public.v_asset_book_values'::regclass
      and relation.relkind = 'v'
      and coalesce(relation.reloptions, '{}'::text[])
        @> array['security_invoker=true']
  ) then
    raise exception
      'Foundation verification failed: v_asset_book_values is not a security-invoker view.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid =
      'public.v_financial_statement_monthly'::regclass
      and relation.relkind = 'v'
      and coalesce(relation.reloptions, '{}'::text[])
        @> array['security_invoker=true']
  ) then
    raise exception
      'Foundation verification failed: v_financial_statement_monthly is not a security-invoker view.';
  end if;

  foreach v_table in array v_old_tables loop
    select row_count, row_checksum_md5
    into strict v_expected_count, v_expected_checksum
    from backup.lm_snapshot_table_metrics
    where run_id = v_snapshot_run
      and source_schema = 'public'
      and source_table = v_table;

    execute format('select count(*) from public.%I', v_table)
    into v_current_count;

    execute format(
      $checksum$
        select md5(
          coalesce(
            string_agg(
              md5(to_jsonb(source_row)::text),
              '' order by md5(to_jsonb(source_row)::text)
            ),
            ''
          )
        )
        from public.%I source_row
      $checksum$,
      v_table
    )
    into v_current_checksum;

    if v_current_count <> v_expected_count then
      raise exception
        'Legacy table public.% count changed: expected %, found %.',
        v_table,
        v_expected_count,
        v_current_count;
    end if;

    if v_current_checksum is distinct from v_expected_checksum then
      raise exception
        'Legacy table public.% checksum changed.',
        v_table;
    end if;
  end loop;

  select id
  into strict v_batch_id
  from public.data_import_batches
  where batch_key = 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2'
    and facts_period_start = date '2026-06-01'
    and facts_period_end = date '2026-06-30'
    and assets_full
    and status = 'prepared';

  if exists (
    select 1 from public.daily_sales_summaries
    where import_batch_id = v_batch_id
    union all
    select 1 from public.purchase_invoices
    where import_batch_id = v_batch_id
    union all
    select 1 from public.purchase_items
    where import_batch_id = v_batch_id
    union all
    select 1 from public.assets
    where import_batch_id = v_batch_id
  ) then
    raise exception
      'Foundation verification failed: target batch already contains imported rows.';
  end if;

  raise notice
    'POST-MIGRATION VERIFICATION PASSED. Old tables unchanged.';
end;
$verify$;

select
  batch_key,
  facts_period_start,
  facts_period_end,
  assets_full,
  status
from public.data_import_batches
where batch_key = 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2';
