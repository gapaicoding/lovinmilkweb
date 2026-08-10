begin;

alter table public.operational_expenses
  add column if not exists item_name text,
  add column if not exists quantity numeric(20,4),
  add column if not exists unit text,
  add column if not exists unit_price numeric(30,2),
  add column if not exists receipt_reference text,
  add column if not exists vendor_name text;

alter table public.operational_expenses
  add constraint operational_expenses_item_name_detail_check
    check (item_name is null or (btrim(item_name) <> '' and char_length(btrim(item_name)) <= 200)),
  add constraint operational_expenses_quantity_detail_check check (quantity is null or quantity > 0),
  add constraint operational_expenses_unit_detail_check
    check (unit is null or (btrim(unit) <> '' and char_length(btrim(unit)) <= 50)),
  add constraint operational_expenses_unit_price_detail_check check (unit_price is null or unit_price >= 0),
  add constraint operational_expenses_receipt_detail_check
    check (receipt_reference is null or char_length(btrim(receipt_reference)) <= 100),
  add constraint operational_expenses_vendor_detail_check
    check (vendor_name is null or char_length(btrim(vendor_name)) <= 150);

create index if not exists operational_expenses_active_search_idx
  on public.operational_expenses (outlet_id, expense_date desc, cost_category_id)
  where deleted_at is null;

do $$
declare
  v_outlet_id uuid;
  v_name text;
  v_keep uuid;
  v_names constant text[] := array[
    'Bahan Makanan/Minuman','Bahan Non Makan/Minum','Gas untuk Masak',
    'Perlengkapan','Transport','Administrasi','Listrik'
  ];
begin
  select outlet_id into v_outlet_id
  from public.outlet_reporting_configs
  where operational_reporting_start_date = date '2026-08-01'
  order by created_at limit 1;
  if v_outlet_id is null then
    raise exception 'Outlet operasional dengan cutover 2026-08-01 tidak ditemukan.';
  end if;

  foreach v_name in array v_names loop
    select id into v_keep from public.cost_categories
    where outlet_id=v_outlet_id and lower(btrim(name))=lower(v_name)
    order by (scope='outlet' and subunit_id is null) desc, created_at, id limit 1;
    if v_keep is null then
      insert into public.cost_categories(name,description,outlet_id,scope,subunit_id,is_active)
      values(v_name,'Kategori pengeluaran operasional Outlet',v_outlet_id,'outlet',null,true)
      returning id into v_keep;
    else
      update public.cost_categories set name=v_name,scope='outlet',subunit_id=null,
        is_active=true,deleted_at=null,deleted_by=null,updated_at=clock_timestamp()
      where id=v_keep;
    end if;
    update public.cost_categories set is_active=false,deleted_at=coalesce(deleted_at,clock_timestamp())
    where outlet_id=v_outlet_id and id<>v_keep and lower(btrim(name))=lower(v_name);
  end loop;

  update public.cost_categories set is_active=false
  where outlet_id=v_outlet_id and deleted_at is null and is_active
    and not (name = any(v_names) and scope='outlet' and subunit_id is null);
end $$;

create or replace function public.stage7_resolve_outlet_expense_detail(
  p_expense_date date, p_amount numeric, p_cost_category_id uuid,
  p_item_name text, p_quantity numeric, p_unit text, p_unit_price numeric
) returns table(outlet_id uuid,category_name text,category_scope text,outlet_name text)
language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp set row_security=off as $$
declare v_category public.cost_categories%rowtype; v_outlet public.outlets%rowtype;
begin
  if p_expense_date is null then raise exception 'Tanggal wajib diisi.' using errcode='22023'; end if;
  if nullif(btrim(p_item_name),'') is null then raise exception 'Nama barang wajib diisi.' using errcode='22023'; end if;
  if char_length(btrim(p_item_name))>200 then raise exception 'Nama barang maksimal 200 karakter.' using errcode='22023'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Jumlah harus lebih dari 0.' using errcode='22023'; end if;
  if nullif(btrim(p_unit),'') is null or char_length(btrim(p_unit))>50 then raise exception 'Satuan ukuran tidak valid.' using errcode='22023'; end if;
  if p_unit_price is null or p_unit_price<0 then raise exception 'Harga satuan tidak valid.' using errcode='22023'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Harga total harus lebih dari 0.' using errcode='22023'; end if;
  select * into v_category from public.cost_categories where id=p_cost_category_id;
  if not found or not v_category.is_active or v_category.deleted_at is not null
    or v_category.scope<>'outlet' or v_category.subunit_id is not null then
    raise exception 'Kategori pengeluaran tidak valid.' using errcode='22023';
  end if;
  select * into v_outlet from public.outlets where id=v_category.outlet_id and deleted_at is null and is_active;
  if not found then raise exception 'Outlet kategori tidak aktif.' using errcode='22023'; end if;
  return query select v_outlet.id,v_category.name,'outlet'::text,v_outlet.name;
end $$;

create or replace function public.create_operational_expense(
  p_expense_date date,p_item_name text,p_quantity numeric,p_unit text,p_unit_price numeric,
  p_amount numeric,p_cost_category_id uuid,p_receipt_reference text default null,
  p_vendor_name text default null,p_notes text default null
) returns public.operational_expenses language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp set row_security=off as $$
declare v record; v_result public.operational_expenses;
begin
  if not public.lm_is_active_admin() then raise exception 'Admin atau Super Admin diperlukan.' using errcode='42501'; end if;
  select * into v from public.stage7_resolve_outlet_expense_detail(p_expense_date,p_amount,p_cost_category_id,p_item_name,p_quantity,p_unit,p_unit_price);
  perform set_config('app.stage7_expense_rpc','on',true);
  insert into public.operational_expenses(expense_date,item_name,quantity,unit,unit_price,amount,
    cost_category_id,outlet_id,subunit_id,category_name_snapshot,scope_snapshot,
    outlet_name_snapshot,subunit_name_snapshot,receipt_reference,vendor_name,notes,created_by,updated_by)
  values(p_expense_date,btrim(p_item_name),p_quantity,btrim(p_unit),round(p_unit_price,2),round(p_amount,2),
    p_cost_category_id,v.outlet_id,null,v.category_name,'outlet',v.outlet_name,null,
    nullif(btrim(p_receipt_reference),''),nullif(btrim(p_vendor_name),''),nullif(btrim(p_notes),''),auth.uid(),auth.uid())
  returning * into v_result; return v_result;
end $$;

create or replace function public.update_operational_expense(
  p_id uuid,p_expense_date date,p_item_name text,p_quantity numeric,p_unit text,p_unit_price numeric,
  p_amount numeric,p_cost_category_id uuid,p_receipt_reference text default null,
  p_vendor_name text default null,p_notes text default null
) returns public.operational_expenses language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp set row_security=off as $$
declare v record; v_result public.operational_expenses;
begin
  if not public.lm_is_active_admin() then raise exception 'Admin atau Super Admin diperlukan.' using errcode='42501'; end if;
  if not exists(select 1 from public.operational_expenses where id=p_id and deleted_at is null) then raise exception 'Pengeluaran aktif tidak ditemukan.' using errcode='P0002'; end if;
  select * into v from public.stage7_resolve_outlet_expense_detail(p_expense_date,p_amount,p_cost_category_id,p_item_name,p_quantity,p_unit,p_unit_price);
  perform set_config('app.stage7_expense_rpc','on',true);
  update public.operational_expenses set expense_date=p_expense_date,item_name=btrim(p_item_name),
    quantity=p_quantity,unit=btrim(p_unit),unit_price=round(p_unit_price,2),amount=round(p_amount,2),
    cost_category_id=p_cost_category_id,outlet_id=v.outlet_id,subunit_id=null,
    category_name_snapshot=v.category_name,scope_snapshot='outlet',outlet_name_snapshot=v.outlet_name,
    subunit_name_snapshot=null,receipt_reference=nullif(btrim(p_receipt_reference),''),
    vendor_name=nullif(btrim(p_vendor_name),''),notes=nullif(btrim(p_notes),''),
    updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id returning * into v_result;
  return v_result;
end $$;

revoke all on function public.stage7_resolve_outlet_expense_detail(date,numeric,uuid,text,numeric,text,numeric) from public,anon,authenticated;
revoke execute on function public.create_operational_expense(date,numeric,uuid,text),
  public.update_operational_expense(uuid,date,numeric,uuid,text) from authenticated;
revoke all on function public.create_operational_expense(date,text,numeric,text,numeric,numeric,uuid,text,text,text),
  public.update_operational_expense(uuid,date,text,numeric,text,numeric,numeric,uuid,text,text,text) from public,anon;
grant execute on function public.create_operational_expense(date,text,numeric,text,numeric,numeric,uuid,text,text,text),
  public.update_operational_expense(uuid,date,text,numeric,text,numeric,numeric,uuid,text,text,text) to authenticated;

commit;
