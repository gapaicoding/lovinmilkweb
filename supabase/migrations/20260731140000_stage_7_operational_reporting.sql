begin;

-- Stage 7 keeps the reconciled legacy period and the operational ledger
-- physically separate. This table is source-selection policy, not data
-- migration or deletion.
create table public.outlet_reporting_configs (
  outlet_id uuid primary key references public.outlets(id) on delete restrict,
  operational_reporting_start_date date not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

comment on table public.outlet_reporting_configs is
  'Per-Outlet boundary between reconciled legacy reporting and operational reporting.';

insert into public.outlet_reporting_configs(outlet_id, operational_reporting_start_date)
select id, date '2026-07-01'
from public.outlets
where lower(btrim(name)) = 'kadirojo'
on conflict (outlet_id) do update
set operational_reporting_start_date = excluded.operational_reporting_start_date,
    updated_at = clock_timestamp();

alter table public.outlet_reporting_configs enable row level security;
create policy outlet_reporting_configs_read
on public.outlet_reporting_configs for select to authenticated
using (public.lm_is_active_staff_or_above());
create policy outlet_reporting_configs_super_admin_write
on public.outlet_reporting_configs for all to authenticated
using (public.lm_is_active_super_admin())
with check (public.lm_is_active_super_admin());
grant select on public.outlet_reporting_configs to authenticated;
revoke insert, update, delete on public.outlet_reporting_configs from authenticated;

create table public.operational_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  amount numeric(30,2) not null check (amount > 0),
  cost_category_id uuid not null references public.cost_categories(id) on delete restrict,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  subunit_id uuid references public.business_subunits(id) on delete restrict,
  category_name_snapshot text not null check (btrim(category_name_snapshot) <> ''),
  scope_snapshot text not null check (scope_snapshot in ('outlet','subunit')),
  outlet_name_snapshot text not null check (btrim(outlet_name_snapshot) <> ''),
  subunit_name_snapshot text,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  constraint operational_expenses_scope_ownership check (
    (scope_snapshot = 'outlet' and subunit_id is null and subunit_name_snapshot is null)
    or
    (scope_snapshot = 'subunit' and subunit_id is not null
      and btrim(subunit_name_snapshot) <> '')
  )
);

create index operational_expenses_outlet_date_active_idx
  on public.operational_expenses(outlet_id, expense_date) where deleted_at is null;
create index operational_expenses_subunit_date_active_idx
  on public.operational_expenses(subunit_id, expense_date)
  where deleted_at is null and subunit_id is not null;
create index operational_expenses_category_idx
  on public.operational_expenses(cost_category_id);

comment on table public.operational_expenses is
  'Authoritative Stage 7 single-record operational expenses. Legacy public.expenses remains historical.';

create or replace function public.stage7_resolve_expense(
  p_expense_date date,
  p_amount numeric,
  p_cost_category_id uuid
)
returns table(
  outlet_id uuid,
  subunit_id uuid,
  category_name text,
  category_scope text,
  outlet_name text,
  subunit_name text
)
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  v_category public.cost_categories%rowtype;
  v_outlet public.outlets%rowtype;
  v_subunit public.business_subunits%rowtype;
  v_cutover date;
begin
  if p_expense_date is null or p_amount is null or p_amount <= 0 then
    raise exception 'Tanggal dan nominal pengeluaran yang lebih besar dari nol wajib diisi.'
      using errcode = '22023';
  end if;

  select * into v_category from public.cost_categories where id = p_cost_category_id;
  if not found or not v_category.is_active or v_category.deleted_at is not null then
    raise exception 'Kategori biaya tidak aktif atau tidak ditemukan.' using errcode = 'P0001';
  end if;

  select * into v_outlet from public.outlets where id = v_category.outlet_id;
  if not found or not v_outlet.is_active or v_outlet.deleted_at is not null then
    raise exception 'Outlet kategori biaya tidak aktif.' using errcode = 'P0001';
  end if;

  select operational_reporting_start_date into v_cutover
  from public.outlet_reporting_configs where outlet_id = v_outlet.id;
  if v_cutover is null then
    raise exception 'Konfigurasi awal periode operasional Outlet belum tersedia.'
      using errcode = 'P0001';
  end if;
  if p_expense_date < v_cutover then
    raise exception 'Pengeluaran operasional tidak boleh dicatat sebelum tanggal cutover %.', v_cutover
      using errcode = '22023';
  end if;

  if v_category.scope = 'subunit' then
    select * into v_subunit from public.business_subunits where id = v_category.subunit_id;
    if not found or not v_subunit.is_active or v_subunit.deleted_at is not null
       or v_subunit.outlet_id <> v_outlet.id then
      raise exception 'Subunit kategori biaya tidak aktif atau ownership tidak valid.'
        using errcode = 'P0001';
    end if;
  elsif v_category.scope <> 'outlet' or v_category.subunit_id is not null then
    raise exception 'Scope kategori biaya tidak valid.' using errcode = 'P0001';
  end if;

  return query select v_outlet.id,
    case when v_category.scope = 'subunit' then v_subunit.id else null end,
    v_category.name, v_category.scope, v_outlet.name,
    case when v_category.scope = 'subunit' then v_subunit.name else null end;
end $$;

create or replace function public.stage7_reject_raw_expense_write()
returns trigger language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if current_setting('app.stage7_expense_rpc', true) <> 'on' then
    raise exception 'Perubahan pengeluaran operasional wajib melalui RPC resmi.'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger operational_expenses_rpc_write_guard
before insert or update on public.operational_expenses
for each row execute function public.stage7_reject_raw_expense_write();

create or replace function public.create_operational_expense(
  p_expense_date date, p_amount numeric, p_cost_category_id uuid, p_notes text default null
) returns public.operational_expenses
language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare v_resolved record; v_result public.operational_expenses;
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin atau Super Admin diperlukan.' using errcode = '42501';
  end if;
  select * into v_resolved
  from public.stage7_resolve_expense(p_expense_date,p_amount,p_cost_category_id);
  perform set_config('app.stage7_expense_rpc','on',true);
  insert into public.operational_expenses(
    expense_date,amount,cost_category_id,outlet_id,subunit_id,
    category_name_snapshot,scope_snapshot,outlet_name_snapshot,subunit_name_snapshot,
    notes,created_by,updated_by
  ) values (
    p_expense_date,round(p_amount,2),p_cost_category_id,v_resolved.outlet_id,v_resolved.subunit_id,
    v_resolved.category_name,v_resolved.category_scope,v_resolved.outlet_name,
    v_resolved.subunit_name,nullif(btrim(p_notes),''),
    auth.uid(),auth.uid()
  ) returning * into v_result;
  return v_result;
end $$;

create or replace function public.update_operational_expense(
  p_id uuid, p_expense_date date, p_amount numeric, p_cost_category_id uuid,
  p_notes text default null
) returns public.operational_expenses
language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare v_resolved record; v_result public.operational_expenses;
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin atau Super Admin diperlukan.' using errcode = '42501';
  end if;
  if not exists(select 1 from public.operational_expenses where id=p_id and deleted_at is null) then
    raise exception 'Pengeluaran aktif tidak ditemukan.' using errcode = 'P0002';
  end if;
  select * into v_resolved
  from public.stage7_resolve_expense(p_expense_date,p_amount,p_cost_category_id);
  perform set_config('app.stage7_expense_rpc','on',true);
  update public.operational_expenses set
    expense_date=p_expense_date,amount=round(p_amount,2),cost_category_id=p_cost_category_id,
    outlet_id=v_resolved.outlet_id,subunit_id=v_resolved.subunit_id,
    category_name_snapshot=v_resolved.category_name,scope_snapshot=v_resolved.category_scope,
    outlet_name_snapshot=v_resolved.outlet_name,subunit_name_snapshot=v_resolved.subunit_name,
    notes=nullif(btrim(p_notes),''),updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=p_id returning * into v_result;
  return v_result;
end $$;

create or replace function public.archive_operational_expense(p_id uuid)
returns public.operational_expenses
language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare v_result public.operational_expenses;
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin atau Super Admin diperlukan.' using errcode='42501';
  end if;
  perform set_config('app.stage7_expense_rpc','on',true);
  update public.operational_expenses set deleted_at=clock_timestamp(),deleted_by=auth.uid(),
    updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=p_id and deleted_at is null returning * into v_result;
  if v_result.id is null then raise exception 'Pengeluaran aktif tidak ditemukan.' using errcode='P0002'; end if;
  return v_result;
end $$;

create or replace function public.restore_operational_expense(p_id uuid)
returns public.operational_expenses
language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare v_old public.operational_expenses; v_resolved record; v_result public.operational_expenses;
begin
  if not public.lm_is_active_super_admin() then
    raise exception 'Super Admin diperlukan.' using errcode='42501';
  end if;
  select * into v_old from public.operational_expenses where id=p_id and deleted_at is not null;
  if not found then raise exception 'Pengeluaran terarsip tidak ditemukan.' using errcode='P0002'; end if;
  select * into v_resolved
  from public.stage7_resolve_expense(v_old.expense_date,v_old.amount,v_old.cost_category_id);
  perform set_config('app.stage7_expense_rpc','on',true);
  update public.operational_expenses set deleted_at=null,deleted_by=null,
    updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=p_id returning * into v_result;
  return v_result;
end $$;

create or replace function public.hard_delete_operational_expense(p_id uuid)
returns uuid language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  if not public.lm_is_active_super_admin() then
    raise exception 'Super Admin diperlukan.' using errcode='42501';
  end if;
  if not exists(select 1 from public.operational_expenses where id=p_id and deleted_at is not null) then
    raise exception 'Pengeluaran harus diarsipkan sebelum dihapus permanen.' using errcode='P0001';
  end if;
  delete from public.operational_expenses where id=p_id;
  return p_id;
end $$;

alter table public.operational_expenses enable row level security;
create policy operational_expenses_read on public.operational_expenses
for select to authenticated using (
  public.lm_is_active_super_admin()
  or (public.lm_is_active_staff_or_above() and deleted_at is null)
);
grant select on public.operational_expenses to authenticated;
revoke insert, update, delete on public.operational_expenses from authenticated;

-- One shared server-side source for Dashboard and Outlet financial reporting.
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
    select count(*) into v_visitors from public.visitor_visits
    where deleted_at is null
      and (check_in_at at time zone 'Asia/Jakarta')::date
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

create or replace function public.get_stage7_subunit_report(
  p_subunit_id uuid, p_start_date date, p_end_date date
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare v_subunit public.business_subunits%rowtype; v_cutover date; v_start date;
  v_revenue numeric;v_hpp numeric;v_expense numeric;v_dep numeric;v_qty numeric;
  v_involvement bigint;v_provisional bigint;v_provisional_revenue numeric;
begin
  if not public.lm_is_active_staff_or_above() then raise exception 'Akses operasional diperlukan.' using errcode='42501'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Rentang laporan tidak valid.' using errcode='22023'; end if;
  select * into v_subunit from public.business_subunits where id=p_subunit_id;
  if not found then raise exception 'Subunit tidak ditemukan.' using errcode='P0002'; end if;
  select operational_reporting_start_date into v_cutover from public.outlet_reporting_configs where outlet_id=v_subunit.outlet_id;
  v_start:=greatest(p_start_date,v_cutover);
  if v_start>p_end_date then
    return jsonb_build_object('requested_start_date',p_start_date,'requested_end_date',p_end_date,
      'operational_cutover_date',v_cutover,'source_status','unavailable',
      'financial_available',false,'message','Data keuangan per Subunit tersedia mulai periode operasional.');
  end if;
  select coalesce(sum(si.amount),0),coalesce(sum(si.hpp_amount),0),coalesce(sum(si.quantity),0),
    count(*) filter(where si.hpp_status='provisional'),
    coalesce(sum(si.amount) filter(where si.hpp_status='provisional'),0),
    count(distinct st.id)
  into v_revenue,v_hpp,v_qty,v_provisional,v_provisional_revenue,v_involvement
  from public.sales_transactions st join public.sales_items si on si.sales_transaction_id=st.id
  where st.deleted_at is null and si.subunit_id=p_subunit_id and st.transaction_date between v_start and p_end_date;
  select coalesce(sum(amount),0) into v_expense from public.operational_expenses
  where deleted_at is null and subunit_id=p_subunit_id and expense_date between v_start and p_end_date;
  select coalesce(sum(d.depreciation_amount),0) into v_dep
  from public.asset_depreciation_entries d join public.assets a on a.id=d.asset_id
  where a.subunit_id=p_subunit_id and a.record_source='operational' and d.status='posted'
    and d.period_month between date_trunc('month',v_start)::date and date_trunc('month',p_end_date)::date;
  return jsonb_build_object('requested_start_date',p_start_date,'requested_end_date',p_end_date,
    'operational_cutover_date',v_cutover,'operational_coverage_start',v_start,
    'operational_coverage_end',p_end_date,'source_status',
    case when p_start_date<v_cutover then 'partial_operational' else 'operational' end,
    'financial_available',true,'revenue',v_revenue,'hpp',v_hpp,
    'gross_profit',v_revenue-v_hpp,'direct_operational_expense',v_expense,
    'attributable_depreciation',v_dep,'contribution_before_shared_outlet_cost',
    v_revenue-v_hpp-v_expense-v_dep,'quantity',v_qty,
    'transaction_involvement_count',v_involvement,'transaction_count_additive',false,
    'has_provisional_hpp',v_provisional>0,'provisional_hpp_item_count',v_provisional,
    'provisional_hpp_revenue',v_provisional_revenue);
end $$;

create or replace function public.get_stage7_product_report(
  p_outlet_id uuid, p_start_date date, p_end_date date, p_subunit_id uuid default null
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare v_cutover date;v_legacy_end date;v_operational_start date;v_rows jsonb;v_legacy_rows jsonb;
begin
  if not public.lm_is_active_admin() then raise exception 'Admin atau Super Admin diperlukan.' using errcode='42501'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Rentang laporan tidak valid.' using errcode='22023'; end if;
  select operational_reporting_start_date into v_cutover from public.outlet_reporting_configs where outlet_id=p_outlet_id;
  v_legacy_end:=least(p_end_date,v_cutover-1);v_operational_start:=greatest(p_start_date,v_cutover);
  if p_start_date<=v_legacy_end and p_subunit_id is null then
    select coalesce(jsonb_agg(jsonb_build_object('product_id',null,'product_name',canonical_product_name,
      'category_name',category_name,'quantity',qty,'revenue',null,'hpp',null,'gross_profit',null,
      'financial_available',false,'source_status','legacy') order by qty desc),'[]'::jsonb)
    into v_legacy_rows from (select canonical_product_name,category_name,sum(quantity) qty
      from public.historical_product_daily_quantities where sale_date between p_start_date and v_legacy_end
      group by canonical_product_name,category_name) x;
  else v_legacy_rows:='[]'::jsonb; end if;
  if v_operational_start<=p_end_date then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.revenue desc),'[]'::jsonb) into v_rows
    from (select si.product_id,si.product_name_snapshot product_name,
      si.category_name_snapshot category_name,si.subunit_id,si.subunit_name_snapshot subunit_name,
      sum(si.quantity) quantity,sum(si.amount) revenue,sum(si.hpp_amount) hpp,
      sum(si.amount)-sum(si.hpp_amount) gross_profit,
      case when sum(si.amount)=0 then null else
        round((sum(si.amount)-sum(si.hpp_amount))*100/sum(si.amount),2) end margin_percent,
      bool_or(si.hpp_status='provisional') has_provisional_hpp,
      count(*) filter(where si.hpp_status='provisional') provisional_hpp_item_count,
      true financial_available,'operational' source_status
    from public.sales_transactions st join public.sales_items si on si.sales_transaction_id=st.id
    where st.outlet_id=p_outlet_id and st.deleted_at is null
      and st.transaction_date between v_operational_start and p_end_date
      and (p_subunit_id is null or si.subunit_id=p_subunit_id)
    group by si.product_id,si.product_name_snapshot,si.category_name_snapshot,
      si.subunit_id,si.subunit_name_snapshot) x;
  else v_rows:='[]'::jsonb; end if;
  return jsonb_build_object('requested_start_date',p_start_date,'requested_end_date',p_end_date,
    'operational_cutover_date',v_cutover,'source_status',case when p_end_date<v_cutover then 'legacy'
      when p_start_date>=v_cutover then 'operational' else 'mixed' end,
    'historical_financial_metrics_available',false,'legacy_rows',v_legacy_rows,'operational_rows',v_rows);
end $$;

create or replace function public.get_stage7_current_inventory_report(p_outlet_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
set row_security=off
as $$
declare v_result jsonb;
begin
  if not public.lm_is_active_staff_or_above() then
    raise exception 'Akses operasional diperlukan.' using errcode='42501';
  end if;
  select jsonb_build_object('position_status','current','as_of',clock_timestamp(),
      'quantity',coalesce(sum(s.on_hand_quantity),0),
      'inventory_value',coalesce(sum(s.inventory_value),0),
      'items_without_cost_basis',count(*) filter(where not s.has_cost_basis),
      'item_count',count(*))
  into v_result
  from public.inventory_cost_states s join public.inventory_items i on i.id=s.inventory_item_id
  where i.outlet_id=p_outlet_id and i.deleted_at is null;
  return v_result;
end $$;

revoke all on function public.stage7_resolve_expense(date,numeric,uuid),
  public.stage7_reject_raw_expense_write(),
  public.create_operational_expense(date,numeric,uuid,text),
  public.update_operational_expense(uuid,date,numeric,uuid,text),
  public.archive_operational_expense(uuid),
  public.restore_operational_expense(uuid),
  public.hard_delete_operational_expense(uuid),
  public.get_stage7_outlet_report(uuid,date,date),
  public.get_stage7_subunit_report(uuid,date,date),
  public.get_stage7_product_report(uuid,date,date,uuid),
  public.get_stage7_current_inventory_report(uuid)
from public, anon;

grant execute on function
  public.create_operational_expense(date,numeric,uuid,text),
  public.update_operational_expense(uuid,date,numeric,uuid,text),
  public.archive_operational_expense(uuid),
  public.restore_operational_expense(uuid),
  public.hard_delete_operational_expense(uuid),
  public.get_stage7_outlet_report(uuid,date,date),
  public.get_stage7_subunit_report(uuid,date,date),
  public.get_stage7_product_report(uuid,date,date,uuid),
  public.get_stage7_current_inventory_report(uuid)
to authenticated;

commit;
