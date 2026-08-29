-- Supplier Master V2: catalog CRUD, supplier inputter snapshots, and safe legacy reset.
begin;

alter table public.operational_inputter_settings drop constraint operational_inputter_settings_section_check;
alter table public.operational_inputter_settings add constraint operational_inputter_settings_section_check
  check (section in ('sales', 'expenses', 'suppliers'));
comment on column public.operational_inputter_settings.section is 'Operational section: sales, expenses, or suppliers.';

alter table public.suppliers add column outlet_id uuid references public.outlets(id) on delete restrict;
alter table public.suppliers add column inputter_name text;
alter table public.supplier_items add column outlet_id uuid references public.outlets(id) on delete restrict;
alter table public.supplier_items add column inputter_name text;
alter table public.suppliers add constraint suppliers_inputter_name_check
  check (inputter_name is null or (btrim(inputter_name) <> '' and char_length(btrim(inputter_name)) <= 100));
alter table public.supplier_items add constraint supplier_items_inputter_name_check
  check (inputter_name is null or (btrim(inputter_name) <> '' and char_length(btrim(inputter_name)) <= 100));
alter table public.supplier_items add constraint supplier_items_price_raw_length_check
  check (price_raw is null or char_length(price_raw) <= 500);

-- Approved reset, bounded to supplier master data. Purchase rows are never deleted.
delete from public.supplier_items;
delete from public.suppliers s
where not exists (select 1 from public.purchase_invoices pi where pi.supplier_id = s.id)
  and not exists (select 1 from public.purchase_transactions pt where pt.supplier_id = s.id);
update public.suppliers s set is_active = false, deleted_at = coalesce(deleted_at, clock_timestamp())
where exists (select 1 from public.purchase_invoices pi where pi.supplier_id = s.id)
   or exists (select 1 from public.purchase_transactions pt where pt.supplier_id = s.id);

alter table public.supplier_items alter column supplier_id set not null;
create index if not exists suppliers_outlet_name_idx on public.suppliers(outlet_id, supplier_name);
create index if not exists supplier_items_outlet_supplier_idx on public.supplier_items(outlet_id, supplier_id);

create or replace function public.lm_get_active_operational_inputter(p_outlet_id uuid, p_section text)
returns text language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v_outlet uuid; v_name text;
begin
  if p_section is null or p_section not in ('sales','expenses','suppliers') then
    raise exception 'Bagian penginput tidak valid.' using errcode='22023';
  end if;
  v_outlet := public.lm_resolve_sales_outlet(p_outlet_id);
  select btrim(inputter_name) into v_name from public.operational_inputter_settings
    where outlet_id=v_outlet and section=p_section;
  if v_name is null then raise exception '%', case p_section
    when 'sales' then 'Nama penginput Penjualan belum diatur.'
    when 'expenses' then 'Nama penginput Pengeluaran belum diatur.'
    when 'suppliers' then 'Nama penginput Supplier belum diatur.' end using errcode='P0001'; end if;
  return v_name;
end $$;

create or replace function public.get_operational_inputter(p_section text, p_outlet_id uuid default null)
returns table(outlet_id uuid, section text, inputter_name text) language plpgsql stable security definer
set search_path=public,pg_catalog as $$ declare v_outlet uuid; begin
  perform public.require_visitor_role(array['staff','admin','super_admin']);
  if p_section is null or p_section not in ('sales','expenses','suppliers') then raise exception 'Bagian penginput tidak valid.' using errcode='22023'; end if;
  v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);
  return query select v_outlet,p_section,(select btrim(s.inputter_name) from public.operational_inputter_settings s where s.outlet_id=v_outlet and s.section=p_section);
end $$;

create or replace function public.set_operational_inputter(p_section text,p_inputter_name text,p_outlet_id uuid default null)
returns table(outlet_id uuid,section text,inputter_name text) language plpgsql volatile security definer
set search_path=public,pg_catalog as $$ declare v_outlet uuid; v_actor uuid; v_name text; begin
  if p_section is null or p_section not in ('sales','expenses','suppliers') then raise exception 'Bagian penginput tidak valid.' using errcode='22023'; end if;
  if p_section='suppliers' then v_actor:=public.require_visitor_role(array['admin','super_admin']);
  else v_actor:=public.require_visitor_role(array['staff','admin','super_admin']); end if;
  v_name:=btrim(p_inputter_name); if v_name is null or v_name='' then raise exception 'Nama penginput wajib diisi.' using errcode='22023'; end if;
  if char_length(v_name)>100 then raise exception 'Nama penginput maksimal 100 karakter.' using errcode='22023'; end if;
  v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);
  insert into public.operational_inputter_settings(outlet_id,section,inputter_name,created_by,updated_by)
    values(v_outlet,p_section,v_name,v_actor,v_actor) on conflict(outlet_id,section) do update
    set inputter_name=excluded.inputter_name,updated_at=clock_timestamp(),updated_by=v_actor;
  return query select v_outlet,p_section,v_name;
end $$;

create or replace function public.lm_preserve_supplier_inputter_snapshot() returns trigger language plpgsql
security definer set search_path=public,pg_catalog as $$ begin new.inputter_name:=old.inputter_name; return new; end $$;

create or replace function public.lm_snapshot_supplier_inputter_on_insert()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_outlet uuid;
begin
  v_outlet:=public.lm_resolve_sales_outlet(new.outlet_id);
  new.outlet_id:=v_outlet;
  new.inputter_name:=public.lm_get_active_operational_inputter(v_outlet,'suppliers');
  return new;
end $$;

create or replace function public.lm_snapshot_supplier_item_inputter_on_insert()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_supplier_outlet uuid; v_requested_outlet uuid;
begin
  select public.lm_resolve_sales_outlet(s.outlet_id)
    into v_supplier_outlet
  from public.suppliers s
  where s.id=new.supplier_id
    and s.deleted_at is null;

  if v_supplier_outlet is null then
    raise exception 'Supplier tidak valid untuk Item Supplier.' using errcode='23503';
  end if;

  if new.outlet_id is not null then
    v_requested_outlet:=public.lm_resolve_sales_outlet(new.outlet_id);
    if v_requested_outlet<>v_supplier_outlet then
      raise exception 'Outlet Item Supplier tidak sesuai dengan Supplier.' using errcode='23503';
    end if;
  end if;

  new.outlet_id:=v_supplier_outlet;
  new.inputter_name:=public.lm_get_active_operational_inputter(v_supplier_outlet,'suppliers');
  return new;
end $$;

create trigger suppliers_snapshot_inputter
before insert on public.suppliers
for each row execute function public.lm_snapshot_supplier_inputter_on_insert();
create trigger supplier_items_snapshot_inputter
before insert on public.supplier_items
for each row execute function public.lm_snapshot_supplier_item_inputter_on_insert();

create trigger suppliers_preserve_inputter before update of inputter_name on public.suppliers
for each row execute function public.lm_preserve_supplier_inputter_snapshot();
create trigger supplier_items_preserve_inputter before update of inputter_name on public.supplier_items
for each row execute function public.lm_preserve_supplier_inputter_snapshot();

create or replace function public.save_supplier_with_items(p_supplier jsonb,p_items jsonb,p_supplier_id uuid default null,p_outlet_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid; v_outlet uuid; v_inputter text; v_id uuid; v_name text; v_item jsonb; v_item_id uuid; v_seen uuid[]:=array[]::uuid[];
begin
  v_actor:=public.require_visitor_role(array['admin','super_admin']); v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);
  v_name:=btrim(p_supplier->>'supplier_name'); if coalesce(v_name,'')='' then raise exception 'Nama Toko / Supplier wajib diisi.' using errcode='22023'; end if;
  if char_length(v_name)>300 then raise exception 'Nama Toko / Supplier maksimal 300 karakter.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'Minimal satu Barang Supplier wajib diisi.' using errcode='22023'; end if;
  if p_supplier_id is null then
    v_inputter:=public.lm_get_active_operational_inputter(v_outlet,'suppliers'); v_id:=gen_random_uuid();
    insert into public.suppliers(id,outlet_id,supplier_key,supplier_name,normalized_name,phone,address,link,contact_person,source_type,source_references,is_active,inputter_name,created_by,updated_by)
    values(v_id,v_outlet,'SUP-MANUAL-'||replace(v_id::text,'-',''),v_name,lower(regexp_replace(v_name,'\s+',' ','g')),nullif(btrim(p_supplier->>'phone'),''),nullif(btrim(p_supplier->>'address'),''),nullif(btrim(p_supplier->>'link'),''),nullif(btrim(p_supplier->>'contact_person'),''),nullif(btrim(p_supplier->>'source_type'),''),nullif(btrim(p_supplier->>'source_references'),''),coalesce((p_supplier->>'is_active')::boolean,true),v_inputter,v_actor,v_actor);
  else
    v_id:=p_supplier_id; update public.suppliers set supplier_name=v_name,normalized_name=lower(regexp_replace(v_name,'\s+',' ','g')),phone=nullif(btrim(p_supplier->>'phone'),''),address=nullif(btrim(p_supplier->>'address'),''),link=nullif(btrim(p_supplier->>'link'),''),contact_person=nullif(btrim(p_supplier->>'contact_person'),''),source_type=nullif(btrim(p_supplier->>'source_type'),''),source_references=nullif(btrim(p_supplier->>'source_references'),''),is_active=coalesce((p_supplier->>'is_active')::boolean,true),updated_at=clock_timestamp(),updated_by=v_actor where id=v_id and outlet_id=v_outlet and deleted_at is null;
    if not found then raise exception 'Supplier tidak ditemukan.' using errcode='P0002'; end if;
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if coalesce(btrim(v_item->>'product_name'),'')='' then raise exception 'Nama Produk wajib diisi.' using errcode='22023'; end if;
    if char_length(btrim(v_item->>'product_name'))>300 then raise exception 'Nama Produk maksimal 300 karakter.' using errcode='22023'; end if;
    if char_length(coalesce(btrim(v_item->>'unit_price_text'),''))>500 then raise exception 'Harga Satuan maksimal 500 karakter.' using errcode='22023'; end if;
    v_item_id:=case when coalesce(v_item->>'id','')~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (v_item->>'id')::uuid else gen_random_uuid() end;
    if exists(select 1 from public.supplier_items where id=v_item_id and supplier_id=v_id and deleted_at is not null) then
      v_item_id:=gen_random_uuid();
    end if;
    v_seen:=array_append(v_seen,v_item_id);
    if exists(select 1 from public.supplier_items where id=v_item_id and supplier_id=v_id and deleted_at is null) then
      update public.supplier_items set item_name_raw=btrim(v_item->>'product_name'),item_name_normalized=lower(regexp_replace(btrim(v_item->>'product_name'),'\s+',' ','g')),brand_raw=nullif(btrim(v_item->>'brand_name'),''),size_raw=nullif(btrim(v_item->>'product_size'),''),price_raw=nullif(btrim(v_item->>'unit_price_text'),''),updated_at=clock_timestamp(),updated_by=v_actor where id=v_item_id and supplier_id=v_id and deleted_at is null;
    else
      v_inputter:=public.lm_get_active_operational_inputter(v_outlet,'suppliers');
      insert into public.supplier_items(id,supplier_id,outlet_id,supplier_item_key,item_name_raw,item_name_normalized,brand_raw,size_raw,price_raw,inputter_name,created_by,updated_by)
      values(v_item_id,v_id,v_outlet,'SUP-ITEM-'||replace(v_item_id::text,'-',''),btrim(v_item->>'product_name'),lower(regexp_replace(btrim(v_item->>'product_name'),'\s+',' ','g')),nullif(btrim(v_item->>'brand_name'),''),nullif(btrim(v_item->>'product_size'),''),nullif(btrim(v_item->>'unit_price_text'),''),v_inputter,v_actor,v_actor);
    end if;
  end loop;
  update public.supplier_items set deleted_at=clock_timestamp(),deleted_by=v_actor,is_active=false,updated_at=clock_timestamp(),updated_by=v_actor where supplier_id=v_id and deleted_at is null and not(id=any(v_seen));
  return v_id;
end $$;

revoke all on function public.save_supplier_with_items(jsonb,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_supplier_with_items(jsonb,jsonb,uuid,uuid) to authenticated;
revoke all on function public.lm_preserve_supplier_inputter_snapshot() from public,anon,authenticated;
revoke all on function public.lm_snapshot_supplier_inputter_on_insert() from public,anon,authenticated;
revoke all on function public.lm_snapshot_supplier_item_inputter_on_insert() from public,anon,authenticated;
commit;
