begin;

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

  select * into v_category from public.cost_categories c where c.id = p_cost_category_id;
  if not found or not v_category.is_active or v_category.deleted_at is not null then
    raise exception 'Kategori biaya tidak aktif atau tidak ditemukan.' using errcode = 'P0001';
  end if;

  select * into v_outlet from public.outlets o where o.id = v_category.outlet_id;
  if not found or not v_outlet.is_active or v_outlet.deleted_at is not null then
    raise exception 'Outlet kategori biaya tidak aktif.' using errcode = 'P0001';
  end if;

  select rc.operational_reporting_start_date into v_cutover
  from public.outlet_reporting_configs rc
  where rc.outlet_id = v_outlet.id;
  if v_cutover is null then
    raise exception 'Konfigurasi awal periode operasional Outlet belum tersedia.'
      using errcode = 'P0001';
  end if;
  if p_expense_date < v_cutover then
    raise exception 'Pengeluaran operasional tidak boleh dicatat sebelum tanggal cutover %.', v_cutover
      using errcode = '22023';
  end if;

  if v_category.scope = 'subunit' then
    select * into v_subunit from public.business_subunits s where s.id = v_category.subunit_id;
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

revoke all on function public.stage7_resolve_expense(date,numeric,uuid) from public, anon;

commit;
