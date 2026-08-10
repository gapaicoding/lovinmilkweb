begin;

create or replace function public.get_dashboard_daily_series(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  v_cutover date;
  v_rows jsonb;
  v_source text;
begin
  if not public.lm_is_active_staff_or_above() then
    raise exception 'Akses operasional diperlukan.' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Rentang laporan tidak valid.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.outlets
    where id = p_outlet_id and is_active and deleted_at is null
  ) then
    raise exception 'Outlet aktif tidak ditemukan.' using errcode = 'P0002';
  end if;

  select operational_reporting_start_date into v_cutover
  from public.outlet_reporting_configs where outlet_id = p_outlet_id;
  if v_cutover is null then
    raise exception 'Konfigurasi pelaporan Outlet belum tersedia.' using errcode = 'P0002';
  end if;

  with dates as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as report_date
  ), legacy as (
    select s.sale_date as report_date, s.total_sales::numeric as outlet_revenue,
      s.total_sales_lovin::numeric as lovin_revenue,
      s.total_sales_arayya::numeric as arayya_revenue,
      s.bill_count::bigint as bill_count,
      s.product_quantity_recorded::numeric as quantity,
      s.visitor_total::bigint as visitor_count,
      s.adult_visitors::bigint as visitor_adult,
      s.child_visitors::bigint as visitor_child
    from public.daily_sales_summaries s
    join public.data_import_batches b on b.id = s.import_batch_id
    where s.sale_date between p_start_date and least(p_end_date, v_cutover - 1)
      and b.batch_key = 'LM-ACTUAL-JULY-2026-AGGREGATE'
  ), sales_daily as (
    select st.transaction_date as report_date,
      coalesce(sum(si.amount), 0)::numeric as outlet_revenue,
      coalesce(sum(si.amount) filter (where lower(si.subunit_name_snapshot) = 'lovin milk'), 0)::numeric as lovin_revenue,
      coalesce(sum(si.amount) filter (where lower(si.subunit_name_snapshot) = 'arayya'), 0)::numeric as arayya_revenue,
      count(distinct st.id)::bigint as bill_count,
      coalesce(sum(si.quantity), 0)::numeric as quantity
    from public.sales_transactions st
    join public.sales_items si on si.sales_transaction_id = st.id
    where st.outlet_id = p_outlet_id and st.deleted_at is null
      and st.transaction_date between greatest(p_start_date, v_cutover) and p_end_date
    group by st.transaction_date
  ), visitor_daily as (
    select coalesce(vv.visit_date, (vv.check_in_at at time zone 'Asia/Jakarta')::date) as report_date,
      sum(case when vv.record_source = 'operational' then vv.adult_count + vv.child_count else 1 end)::bigint as visitor_count,
      sum(vv.adult_count)::bigint as visitor_adult,
      sum(vv.child_count)::bigint as visitor_child
    from public.visitor_visits vv
    where vv.deleted_at is null
      and (vv.record_source = 'legacy_manual' or vv.outlet_id = p_outlet_id)
      and coalesce(vv.visit_date, (vv.check_in_at at time zone 'Asia/Jakarta')::date)
        between greatest(p_start_date, v_cutover) and p_end_date
    group by 1
  ), operational as (
    select d.report_date,
      coalesce(s.outlet_revenue, 0) outlet_revenue,
      coalesce(s.lovin_revenue, 0) lovin_revenue,
      coalesce(s.arayya_revenue, 0) arayya_revenue,
      coalesce(s.bill_count, 0) bill_count,
      coalesce(s.quantity, 0) quantity,
      coalesce(v.visitor_count, 0) visitor_count,
      coalesce(v.visitor_adult, 0) visitor_adult,
      coalesce(v.visitor_child, 0) visitor_child
    from dates d
    left join sales_daily s using (report_date)
    left join visitor_daily v using (report_date)
    where d.report_date >= v_cutover
  ), combined as (
    select * from legacy
    union all
    select * from operational
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.report_date), '[]'::jsonb)
  into v_rows from combined c;

  v_source := case
    when p_end_date < v_cutover then 'legacy'
    when p_start_date >= v_cutover then 'operational'
    else 'mixed'
  end;
  return jsonb_build_object(
    'requested_start_date', p_start_date,
    'requested_end_date', p_end_date,
    'operational_cutover_date', v_cutover,
    'source_status', v_source,
    'rows', v_rows
  );
end $$;

revoke all on function public.get_dashboard_daily_series(uuid,date,date) from public, anon;
grant execute on function public.get_dashboard_daily_series(uuid,date,date) to authenticated;

comment on function public.get_dashboard_daily_series(uuid,date,date) is
  'Authoritative non-overlapping historical and operational daily Dashboard series.';

commit;
