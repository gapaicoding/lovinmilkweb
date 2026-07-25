begin;

-- A reconciled badge is valid only while every batch-scoped source remains
-- unchanged. Centralize invalidation so direct SQL, PostgREST, and RPC writes
-- all move a changed batch back to imported and leave an explicit audit flag.
create or replace function public.lm_mark_reconciled_batches_stale(
  p_batch_ids uuid[],
  p_source_relation text,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_changed_batch_id uuid;
begin
  for v_changed_batch_id in
    with changed as (
      update public.data_import_batches batch
      set
        status = 'imported',
        completed_at = null,
        updated_at = clock_timestamp(),
        updated_by = coalesce((select auth.uid()), batch.updated_by)
      where batch.id = any(coalesce(p_batch_ids, array[]::uuid[]))
        and batch.status = 'reconciled'
      returning batch.id
    )
    select changed.id
    from changed
  loop
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
    values (
      v_changed_batch_id,
      'manual_mutation',
      'batch_data_changed',
      'no_changes_after_reconciliation',
      'batch_data_changed',
      false,
      clock_timestamp(),
      jsonb_build_object(
        'reason',
        'Batch-scoped data changed after reconciliation.',
        'source_relation',
        p_source_relation,
        'operation',
        p_operation,
        'actor_id',
        (select auth.uid()),
        'reconciliation_invalidated',
        true,
        'invalidation_count',
        1
      )
    )
    on conflict (import_batch_id, phase, metric_key)
    do update
    set
      expected_value = excluded.expected_value,
      actual_value = excluded.actual_value,
      passed = false,
      checked_at = excluded.checked_at,
      details = existing.details || excluded.details || jsonb_build_object(
        'invalidation_count',
        case
          when coalesce(
            existing.details ->> 'invalidation_count',
            ''
          ) ~ '^[0-9]+$'
          then (existing.details ->> 'invalidation_count')::integer + 1
          else 1
        end
      );
  end loop;
end;
$function$;

revoke all on function public.lm_mark_reconciled_batches_stale(
  uuid[],
  text,
  text
) from public, anon, authenticated;

create or replace function public.lm_invalidate_batch_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $trigger$
declare
  v_batch_ids uuid[];
begin
  if tg_op = 'INSERT' then
    v_batch_ids := array[new.import_batch_id];
  elsif tg_op = 'DELETE' then
    v_batch_ids := array[old.import_batch_id];
  else
    v_batch_ids := array[new.import_batch_id, old.import_batch_id];
  end if;

  perform public.lm_mark_reconciled_batches_stale(
    v_batch_ids,
    tg_table_schema || '.' || tg_table_name,
    tg_op
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$trigger$;

revoke all on function public.lm_invalidate_batch_reconciliation()
  from public, anon, authenticated;

create or replace function public.lm_invalidate_asset_depreciation_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $trigger$
declare
  v_asset_ids uuid[];
  v_batch_ids uuid[];
begin
  if tg_op = 'INSERT' then
    v_asset_ids := array[new.asset_id];
  elsif tg_op = 'DELETE' then
    v_asset_ids := array[old.asset_id];
  else
    v_asset_ids := array[new.asset_id, old.asset_id];
  end if;

  select coalesce(
    array_agg(distinct asset.import_batch_id)
      filter (where asset.import_batch_id is not null),
    array[]::uuid[]
  )
  into v_batch_ids
  from public.assets asset
  where asset.id = any(v_asset_ids);

  perform public.lm_mark_reconciled_batches_stale(
    v_batch_ids,
    tg_table_schema || '.' || tg_table_name,
    tg_op
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$trigger$;

revoke all on function public.lm_invalidate_asset_depreciation_reconciliation()
  from public, anon, authenticated;

do $batch_triggers$
declare
  v_table text;
  v_tables constant text[] := array[
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
    'assets',
    'tax_entries',
    'owner_distributions'
  ];
begin
  foreach v_table in array v_tables loop
    execute format(
      'drop trigger if exists %I on public.%I',
      v_table || '_invalidate_reconciliation',
      v_table
    );

    execute format(
      'create trigger %I
       after insert or update or delete on public.%I
       for each row execute function public.lm_invalidate_batch_reconciliation()',
      v_table || '_invalidate_reconciliation',
      v_table
    );
  end loop;
end;
$batch_triggers$;

drop trigger if exists asset_depreciation_entries_invalidate_reconciliation
  on public.asset_depreciation_entries;
create trigger asset_depreciation_entries_invalidate_reconciliation
after insert or update or delete on public.asset_depreciation_entries
for each row
execute function public.lm_invalidate_asset_depreciation_reconciliation();

-- Migration 020 installed the purchase-only implementation. Its two triggers
-- now point to the generic function, so the narrow helper can be removed.
drop function if exists public.lm_invalidate_purchase_reconciliation();

do $postconditions$
declare
  v_expected_trigger_count constant integer := 14;
  v_actual_trigger_count integer;
begin
  select count(*)
  into v_actual_trigger_count
  from pg_catalog.pg_trigger trigger
  join pg_catalog.pg_class relation
    on relation.oid = trigger.tgrelid
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and (
      trigger.tgfoid = (
        'public.lm_invalidate_batch_reconciliation()'::regprocedure
      )
      or trigger.tgfoid = (
        'public.lm_invalidate_asset_depreciation_reconciliation()'::regprocedure
      )
    )
    and not trigger.tgisinternal
    and trigger.tgenabled <> 'D';

  if v_actual_trigger_count <> v_expected_trigger_count then
    raise exception
      'Batch invalidation postcondition failed: expected % triggers, found %.',
      v_expected_trigger_count,
      v_actual_trigger_count;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.lm_mark_reconciled_batches_stale(uuid[],text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.lm_invalidate_batch_reconciliation()',
    'EXECUTE'
  ) then
    raise exception
      'Batch invalidation postcondition failed: helper execution is exposed.';
  end if;
end;
$postconditions$;

comment on function public.lm_mark_reconciled_batches_stale(
  uuid[],
  text,
  text
) is
  'Marks reconciled batches stale after any batch-scoped source mutation and records a failed audit control.';

commit;
