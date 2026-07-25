\set ON_ERROR_STOP on

begin;

set local role postgres;

do $verify_definition$
begin
  if to_regprocedure(
    'public.get_operational_dashboard_month(date,text)'
  ) is null then
    raise exception 'Operational dashboard RPC is missing.';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_operational_dashboard_month(date,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks EXECUTE on operational dashboard RPC.';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_operational_dashboard_month(date,text)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute operational dashboard RPC.';
  end if;
end;
$verify_definition$;

do $verify_result$
declare
  v_revenue numeric;
  v_bill_count bigint;
  v_visitors bigint;
  v_product_quantity numeric;
  v_source_days bigint;
begin
  -- Definition-level verification runs as postgres. Role/JWT behavior is
  -- exercised separately by the release RLS matrix.
  select
    coalesce(sum(s.total_sales), 0),
    coalesce(sum(s.bill_count), 0)
  into v_revenue, v_bill_count
  from public.daily_sales_summaries s
  join public.data_import_batches b
    on b.id = s.import_batch_id
  where b.batch_key = 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2'
    and s.sale_date between date '2026-06-01' and date '2026-06-30';

  select
    coalesce(sum(t.total_visitors), 0),
    count(distinct t.traffic_date)
  into v_visitors, v_source_days
  from public.customer_traffic_daily t
  join public.data_import_batches b
    on b.id = t.import_batch_id
  where b.batch_key = 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2'
    and t.traffic_date between date '2026-06-01' and date '2026-06-30';

  select coalesce(sum(q.quantity), 0)
  into v_product_quantity
  from public.historical_product_daily_quantities q
  join public.data_import_batches b
    on b.id = q.import_batch_id
  where b.batch_key = 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2'
    and q.sale_date between date '2026-06-01' and date '2026-06-30';

  if v_revenue <> 30011000
    or v_bill_count <> 342
    or v_visitors <> 827
    or v_product_quantity <> 1358
    or v_source_days <> 30
  then
    raise exception
      'Operational source totals do not match approved controls.';
  end if;
end;
$verify_result$;

rollback;

\echo 'Operational dashboard RPC definition and source controls passed.'
