begin;

create or replace function public.lm_reconcile_import_batch_internal(p_batch_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $function$
declare
  v_batch public.data_import_batches%rowtype;
  v_actual jsonb;
  v_key text;
  v_expected numeric;
  v_value numeric;
  v_passed boolean := true;
begin
  select * into v_batch from public.data_import_batches where id = p_batch_id for update;
  if not found then raise exception 'Import batch not found.' using errcode = 'P0002'; end if;

  select jsonb_build_object(
    'daily_sales_summaries', (select count(*) from public.daily_sales_summaries where import_batch_id = p_batch_id),
    'revenue', (select coalesce(sum(total_sales),0) from public.daily_sales_summaries where import_batch_id = p_batch_id),
    'historical_product_daily_quantities', (select count(*) from public.historical_product_daily_quantities where import_batch_id = p_batch_id),
    'product_quantity', (select coalesce(sum(quantity),0) from public.historical_product_daily_quantities where import_batch_id = p_batch_id),
    'purchase_items', (select count(*) from public.purchase_items where import_batch_id = p_batch_id and deleted_at is null),
    'purchase_invoices', (select count(*) from public.purchase_invoices where import_batch_id = p_batch_id and deleted_at is null),
    'purchase_total', (select coalesce(sum(amount),0) from public.purchase_items where import_batch_id = p_batch_id and deleted_at is null),
    'hpp', (select coalesce(sum(amount),0) from public.purchase_items where import_batch_id = p_batch_id and deleted_at is null and financial_class = 'hpp'),
    'operating_expense', (select coalesce(sum(amount),0) from public.purchase_items where import_batch_id = p_batch_id and deleted_at is null and financial_class = 'operating_expense'),
    'traffic_total', (select coalesce(sum(total_visitors),0) from public.customer_traffic_daily where import_batch_id = p_batch_id),
    'assets', (select count(*) from public.assets where import_batch_id = p_batch_id and deleted_at is null),
    'asset_register_total', (select coalesce(sum(acquisition_cost),0) from public.assets where import_batch_id = p_batch_id and deleted_at is null)
  ) into v_actual;

  for v_key, v_expected in
    select key, value::text::numeric from jsonb_each(v_batch.expected_metrics)
  loop
    v_value := coalesce((v_actual ->> v_key)::numeric, 0);
    if v_value is distinct from v_expected then v_passed := false; end if;
    insert into public.data_import_reconciliation_results (
      import_batch_id, phase, metric_key, expected_value, actual_value,
      passed, checked_at, details
    ) values (
      p_batch_id, 'admin_reconciliation', v_key, v_expected::text,
      v_value::text, v_value = v_expected, clock_timestamp(),
      jsonb_build_object('actor_id', (select auth.uid()), 'source', 'website')
    )
    on conflict (import_batch_id, phase, metric_key) do update set
      expected_value = excluded.expected_value,
      actual_value = excluded.actual_value,
      passed = excluded.passed,
      checked_at = excluded.checked_at,
      details = excluded.details;
  end loop;

  update public.data_import_batches set
    status = case when v_passed then 'reconciled' else 'imported' end,
    completed_at = case when v_passed then clock_timestamp() else null end,
    updated_at = clock_timestamp(),
    updated_by = coalesce((select auth.uid()), updated_by)
  where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id, 'passed', v_passed,
    'status', case when v_passed then 'reconciled' else 'imported' end,
    'expected', v_batch.expected_metrics, 'actual', v_actual
  );
end;
$function$;
revoke all on function public.lm_reconcile_import_batch_internal(uuid)
  from public, anon, authenticated;

create or replace function public.admin_run_batch_reconciliation(p_batch_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin or Super Admin access is required.' using errcode = '42501';
  end if;
  return public.lm_reconcile_import_batch_internal(p_batch_id);
end;
$function$;
revoke all on function public.admin_run_batch_reconciliation(uuid) from public, anon;
grant execute on function public.admin_run_batch_reconciliation(uuid)
  to authenticated, service_role;

-- Reconcile the protected baseline after the provenance-only backfill. This
-- fails the migration transaction if any locked metric changed.
do $reconcile_protected_batch$
declare
  v_batch_id uuid;
  v_result jsonb;
begin
  select id into v_batch_id from public.data_import_batches
  where batch_key = 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2';
  if v_batch_id is null then raise exception 'Protected June batch is missing.'; end if;
  v_result := public.lm_reconcile_import_batch_internal(v_batch_id);
  if coalesce((v_result ->> 'passed')::boolean, false) is not true then
    raise exception 'Protected June reconciliation failed: %', v_result;
  end if;
end;
$reconcile_protected_batch$;

commit;
