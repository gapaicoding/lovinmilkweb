-- Batch-scoped operational dashboard for Staff, Admin, and Super Admin.
--
-- The function exposes only aggregate operational measures. SECURITY DEFINER
-- is intentional: Staff cannot read import-governance rows, so an invoker view
-- could not safely select the approved batch without either returning no data
-- or granting access to sensitive batch metadata.

create or replace function public.get_operational_dashboard_month(
  p_month_start date,
  p_batch_key text
)
returns table (
  revenue numeric,
  bill_count bigint,
  visitors bigint,
  product_quantity numeric,
  source_days bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public.lm_is_active_staff_or_above() then
    raise exception 'Active Staff, Admin, or Super Admin access is required.'
      using errcode = '42501';
  end if;

  if p_month_start is null
    or p_month_start <> date_trunc('month', p_month_start)::date
  then
    raise exception 'p_month_start must be the first day of a month.'
      using errcode = '22023';
  end if;

  if p_batch_key is null or btrim(p_batch_key) = '' then
    raise exception 'p_batch_key is required.'
      using errcode = '22023';
  end if;

  return query
  with selected_batch as (
    select b.id
    from public.data_import_batches b
    where b.batch_key = p_batch_key
      and b.status = 'reconciled'
  ),
  sales as (
    select
      coalesce(sum(s.total_sales), 0)::numeric as revenue,
      coalesce(sum(s.bill_count), 0)::bigint as bill_count,
      count(distinct s.sale_date)::bigint as source_days
    from public.daily_sales_summaries s
    join selected_batch b
      on b.id = s.import_batch_id
    where s.sale_date >= p_month_start
      and s.sale_date < (p_month_start + interval '1 month')::date
  ),
  traffic as (
    select
      coalesce(sum(t.total_visitors), 0)::bigint as visitors,
      count(distinct t.traffic_date)::bigint as source_days
    from public.customer_traffic_daily t
    join selected_batch b
      on b.id = t.import_batch_id
    where t.traffic_date >= p_month_start
      and t.traffic_date < (p_month_start + interval '1 month')::date
  ),
  quantities as (
    select
      coalesce(sum(q.quantity), 0)::numeric as product_quantity
    from public.historical_product_daily_quantities q
    join selected_batch b
      on b.id = q.import_batch_id
    where q.sale_date >= p_month_start
      and q.sale_date < (p_month_start + interval '1 month')::date
  )
  select
    sales.revenue,
    sales.bill_count,
    traffic.visitors,
    quantities.product_quantity,
    greatest(sales.source_days, traffic.source_days)::bigint
  from sales
  cross join traffic
  cross join quantities;
end;
$function$;

revoke all on function public.get_operational_dashboard_month(date, text)
  from public, anon, authenticated;

grant execute on function public.get_operational_dashboard_month(date, text)
  to authenticated, service_role;

comment on function public.get_operational_dashboard_month(date, text) is
  'Returns batch-scoped monthly operational aggregates without exposing financial-detail or import-governance rows.';
