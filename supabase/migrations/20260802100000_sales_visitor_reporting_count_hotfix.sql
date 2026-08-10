-- Visitor attendance count hotfix for the Stage 7 Outlet report.
-- Revenue/HPP/expense logic and the 2026-08-01 cutover remain unchanged.

begin;

create or replace function public.get_stage7_outlet_report(
  p_outlet_id uuid, p_start_date date, p_end_date date
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  v_cutover date; v_legacy_start date; v_legacy_end date;
  v_operational_start date; v_operational_end date;
  v_legacy_revenue numeric; v_legacy_hpp numeric; v_legacy_opex numeric;
  v_legacy_bills bigint; v_legacy_visitors bigint; v_legacy_qty numeric;
  v_revenue numeric; v_hpp numeric; v_opex numeric; v_depreciation numeric;
  v_bills bigint; v_qty numeric; v_visitors bigint; v_provisional_count bigint;
  v_provisional_revenue numeric; v_source text;
begin
  if not public.lm_is_active_staff_or_above() then
    raise exception 'Akses operasional diperlukan.' using errcode='42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Rentang laporan tidak valid.' using errcode='22023';
  end if;
  select operational_reporting_start_date into v_cutover
  from public.outlet_reporting_configs where outlet_id=p_outlet_id;
  if v_cutover is null then raise exception 'Konfigurasi pelaporan Outlet belum tersedia.' using errcode='P0001'; end if;

  v_legacy_start:=p_start_date; v_legacy_end:=least(p_end_date,v_cutover-1);
  v_operational_start:=greatest(p_start_date,v_cutover); v_operational_end:=p_end_date;

  if v_legacy_start<=v_legacy_end then
    select coalesce(sum(total_sales),0),coalesce(sum(bill_count),0),
      coalesce(sum(visitor_total),0)
    into v_legacy_revenue,v_legacy_bills,v_legacy_visitors
    from public.daily_sales_summaries where sale_date between v_legacy_start and v_legacy_end;
    select coalesce(sum(quantity),0) into v_legacy_qty
    from public.historical_product_daily_quantities
    where sale_date between v_legacy_start and v_legacy_end;
    select coalesce(sum(i.amount) filter(where i.financial_class='hpp'),0),
      coalesce(sum(i.amount) filter(where i.financial_class='operating_expense'),0)
    into v_legacy_hpp,v_legacy_opex
    from public.purchase_items i join public.purchase_invoices h on h.id=i.purchase_invoice_id
    where h.purchase_date between v_legacy_start and v_legacy_end
      and h.status='recorded' and h.deleted_at is null and i.deleted_at is null;
  else
    v_legacy_revenue:=0;v_legacy_hpp:=0;v_legacy_opex:=0;v_legacy_bills:=0;
    v_legacy_visitors:=0;v_legacy_qty:=0;
  end if;

  if v_operational_start<=v_operational_end then
    select coalesce(sum(si.amount),0),coalesce(sum(si.hpp_amount),0),
      coalesce(sum(si.quantity),0),count(*) filter(where si.hpp_status='provisional'),
      coalesce(sum(si.amount) filter(where si.hpp_status='provisional'),0)
    into v_revenue,v_hpp,v_qty,v_provisional_count,v_provisional_revenue
    from public.sales_transactions st join public.sales_items si on si.sales_transaction_id=st.id
    where st.outlet_id=p_outlet_id and st.deleted_at is null
      and st.transaction_date between v_operational_start and v_operational_end;
    select count(*) into v_bills from public.sales_transactions
    where outlet_id=p_outlet_id and deleted_at is null
      and transaction_date between v_operational_start and v_operational_end;
    select coalesce(sum(amount),0) into v_opex from public.operational_expenses
    where outlet_id=p_outlet_id and deleted_at is null
      and expense_date between v_operational_start and v_operational_end;
    select coalesce(sum(d.depreciation_amount),0) into v_depreciation
    from public.asset_depreciation_entries d join public.assets a on a.id=d.asset_id
    where a.outlet_id=p_outlet_id and a.record_source='operational'
      and d.status='posted'
      and d.period_month between date_trunc('month',v_operational_start)::date
                             and date_trunc('month',v_operational_end)::date;

    -- Operational visits use authoritative adult + child attendance. Existing
    -- legacy rows have no reliable head-count split and preserve the previous
    -- one-visit/one-count reporting behavior instead of inventing values.
    select coalesce(sum(
      case
        when vv.record_source='operational'
          then vv.adult_count + vv.child_count
        else 1
      end
    ),0)::bigint into v_visitors
    from public.visitor_visits vv
    where vv.deleted_at is null
      and (vv.record_source='legacy_manual' or vv.outlet_id=p_outlet_id)
      and coalesce(vv.visit_date,(vv.check_in_at at time zone 'Asia/Jakarta')::date)
          between v_operational_start and v_operational_end;
  else
    v_revenue:=0;v_hpp:=0;v_qty:=0;v_bills:=0;v_opex:=0;v_depreciation:=0;
    v_visitors:=0;v_provisional_count:=0;v_provisional_revenue:=0;
  end if;

  v_source:=case
    when p_end_date<v_cutover then 'legacy'
    when p_start_date>=v_cutover then 'operational'
    else 'mixed' end;
  return jsonb_build_object(
    'requested_start_date',p_start_date,'requested_end_date',p_end_date,
    'operational_cutover_date',v_cutover,'source_status',v_source,
    'legacy_coverage_start',case when v_legacy_start<=v_legacy_end then v_legacy_start end,
    'legacy_coverage_end',case when v_legacy_start<=v_legacy_end then v_legacy_end end,
    'operational_coverage_start',case when v_operational_start<=v_operational_end then v_operational_start end,
    'operational_coverage_end',case when v_operational_start<=v_operational_end then v_operational_end end,
    'revenue',v_legacy_revenue+v_revenue,'hpp',v_legacy_hpp+v_hpp,
    'gross_profit',v_legacy_revenue+v_revenue-v_legacy_hpp-v_hpp,
    'operational_expense',v_legacy_opex+v_opex,'depreciation',v_depreciation,
    'operating_profit',v_legacy_revenue+v_revenue-v_legacy_hpp-v_hpp-v_legacy_opex-v_opex-v_depreciation,
    'bill_count',v_legacy_bills+v_bills,'quantity',v_legacy_qty+v_qty,
    'visitor_count',v_legacy_visitors+v_visitors,
    'has_provisional_hpp',v_provisional_count>0,
    'provisional_hpp_item_count',v_provisional_count,
    'provisional_hpp_revenue',v_provisional_revenue
  );
end $$;

comment on function public.get_stage7_outlet_report(uuid,date,date) is
  'Stage 7 Outlet report; operational visitor_count sums visit attendance while legacy counts remain aggregate-authoritative.';

revoke all on function public.get_stage7_outlet_report(uuid,date,date)
  from public, anon;
grant execute on function public.get_stage7_outlet_report(uuid,date,date)
  to authenticated;

commit;
