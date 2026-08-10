-- Dashboard daily reporting hosted smoke.
-- Self-contained for Supabase SQL Editor. This smoke creates no business data.
-- Session/JWT impersonation follows the established Stage 4/5/6/7 smoke pattern.
set search_path = public, extensions, pg_temp;

create or replace function pg_temp.run_dashboard_daily_smoke()
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_start_date constant date := '2026-08-01';
  v_end_date constant date := '2026-08-10';
  v_outlet uuid;
  v_actor uuid;
  v_actor_role text;
  v_daily jsonb;
  v_outlet_report jsonb;
  v_row_count integer;
  v_daily_revenue numeric;
  v_daily_bills bigint;
  v_daily_quantity numeric;
  v_daily_visitors bigint;
  v_daily_lovin numeric;
  v_daily_arayya numeric;
  v_expected_visitors bigint;
  v_distinct_bills bigint;
  v_mixed_transactions bigint;
  v_unauthorized_rejected boolean := false;
  v_unauthorized_state text;
  v_result jsonb := '{}'::jsonb;
begin
  select o.id
  into v_outlet
  from public.outlets o
  where o.is_active
    and o.deleted_at is null
  order by
    case when lower(o.name) = 'kadirojo' then 0 else 1 end,
    case when o.is_default then 0 else 1 end,
    o.created_at,
    o.id
  limit 1;

  if v_outlet is null then
    raise exception 'Active/default Kadirojo Outlet was not found' using errcode = 'P0002';
  end if;

  select p.id, p.role::text
  into v_actor, v_actor_role
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.is_active
    and p.role in (
      'super_admin'::public.app_role,
      'admin'::public.app_role,
      'staff'::public.app_role
    )
  order by
    case p.role
      when 'super_admin'::public.app_role then 0
      when 'admin'::public.app_role then 1
      else 2
    end,
    p.created_at,
    p.id
  limit 1;

  if v_actor is null then
    raise exception 'No active Staff-or-above application user was found' using errcode = 'P0002';
  end if;

  -- The unauthenticated database role must not be able to execute the RPC.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('role', 'anon', true);
  begin
    perform public.get_dashboard_daily_series(v_outlet, v_start_date, v_end_date);
  exception
    when sqlstate '42501' then
      v_unauthorized_rejected := true;
      v_unauthorized_state := sqlstate;
  end;
  perform set_config('role', 'none', true);

  if not v_unauthorized_rejected then
    raise exception 'Anonymous Dashboard daily RPC execution was not rejected with 42501';
  end if;

  -- Impersonate the existing application user only for authenticated reads.
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);

  select public.get_dashboard_daily_series(v_outlet, v_start_date, v_end_date)
  into v_daily;
  select public.get_stage7_outlet_report(v_outlet, v_start_date, v_end_date)
  into v_outlet_report;

  select
    count(*)::integer,
    coalesce(sum((row_data->>'outlet_revenue')::numeric), 0),
    coalesce(sum((row_data->>'bill_count')::bigint), 0),
    coalesce(sum((row_data->>'quantity')::numeric), 0),
    coalesce(sum((row_data->>'visitor_count')::bigint), 0),
    coalesce(sum((row_data->>'lovin_revenue')::numeric), 0),
    coalesce(sum((row_data->>'arayya_revenue')::numeric), 0)
  into
    v_row_count,
    v_daily_revenue,
    v_daily_bills,
    v_daily_quantity,
    v_daily_visitors,
    v_daily_lovin,
    v_daily_arayya
  from jsonb_array_elements(coalesce(v_daily->'rows', '[]'::jsonb)) as rows(row_data);

  -- Independently reproduce the finalized Stage 7 operational visitor semantics.
  select coalesce(sum(
    case
      when vv.record_source = 'operational' then vv.adult_count + vv.child_count
      else 1
    end
  ), 0)::bigint
  into v_expected_visitors
  from public.visitor_visits vv
  where vv.deleted_at is null
    and (vv.record_source = 'legacy_manual' or vv.outlet_id = v_outlet)
    and coalesce(vv.visit_date, (vv.check_in_at at time zone 'Asia/Jakarta')::date)
      between v_start_date and v_end_date;

  select count(distinct st.id)::bigint
  into v_distinct_bills
  from public.sales_transactions st
  where st.outlet_id = v_outlet
    and st.deleted_at is null
    and st.transaction_date between v_start_date and v_end_date;

  select count(*)::bigint
  into v_mixed_transactions
  from (
    select st.id
    from public.sales_transactions st
    join public.sales_items si on si.sales_transaction_id = st.id
    where st.outlet_id = v_outlet
      and st.deleted_at is null
      and st.transaction_date between v_start_date and v_end_date
    group by st.id
    having count(distinct si.subunit_id) > 1
  ) mixed;

  if v_row_count = 0 then
    raise exception 'Dashboard daily RPC returned no daily rows';
  end if;
  if v_daily_revenue <> (v_outlet_report->>'revenue')::numeric then
    raise exception 'Revenue reconciliation failed: daily %, Outlet %',
      v_daily_revenue, v_outlet_report->>'revenue';
  end if;
  if v_daily_bills <> (v_outlet_report->>'bill_count')::bigint
     or v_daily_bills <> v_distinct_bills then
    raise exception 'Bill reconciliation failed: daily %, Outlet %, distinct headers %',
      v_daily_bills, v_outlet_report->>'bill_count', v_distinct_bills;
  end if;
  if v_daily_quantity <> (v_outlet_report->>'quantity')::numeric then
    raise exception 'Quantity reconciliation failed: daily %, Outlet %',
      v_daily_quantity, v_outlet_report->>'quantity';
  end if;
  if v_daily_visitors <> (v_outlet_report->>'visitor_count')::bigint
     or v_daily_visitors <> v_expected_visitors then
    raise exception 'Visitor reconciliation failed: daily %, Outlet %, expected %',
      v_daily_visitors, v_outlet_report->>'visitor_count', v_expected_visitors;
  end if;
  if v_daily_lovin + v_daily_arayya <> v_daily_revenue then
    raise exception 'Subunit revenue reconciliation failed: Lovin % + Arayya % <> Outlet %',
      v_daily_lovin, v_daily_arayya, v_daily_revenue;
  end if;
  if v_mixed_transactions < 1 then
    raise exception 'No existing mixed-Subunit transaction is available in the smoke range';
  end if;

  v_result := jsonb_build_object(
    'main_status', 'PASS',
    'authenticated_read', 'PASS',
    'unauthorized_rejected', 'PASS',
    'unauthorized_sqlstate', v_unauthorized_state,
    'revenue_reconciliation', 'PASS',
    'bill_reconciliation', 'PASS',
    'quantity_reconciliation', 'PASS',
    'visitor_reconciliation', 'PASS',
    'subunit_reconciliation', 'PASS',
    'mixed_transaction_bill_count', 'PASS',
    'cleanup', 'PASS',
    'outlet_id', v_outlet,
    'actor_id', v_actor,
    'actor_role', v_actor_role,
    'period_start', v_start_date,
    'period_end', v_end_date,
    'daily_row_count', v_row_count,
    'mixed_transaction_count', v_mixed_transactions
  );

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  return v_result;
exception
  when others then
    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', '', true);
    raise;
end $$;

with smoke_run as materialized (
  select pg_temp.run_dashboard_daily_smoke() as internal_results
)
select
  internal_results->>'main_status' as main_status,
  internal_results->>'authenticated_read' as authenticated_read,
  internal_results->>'unauthorized_rejected' as unauthorized_rejected,
  internal_results->>'revenue_reconciliation' as revenue_reconciliation,
  internal_results->>'bill_reconciliation' as bill_reconciliation,
  internal_results->>'quantity_reconciliation' as quantity_reconciliation,
  internal_results->>'visitor_reconciliation' as visitor_reconciliation,
  internal_results->>'subunit_reconciliation' as subunit_reconciliation,
  internal_results->>'mixed_transaction_bill_count' as mixed_transaction_bill_count,
  internal_results->>'cleanup' as cleanup,
  internal_results
from smoke_run;
