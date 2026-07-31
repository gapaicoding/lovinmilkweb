begin;

create or replace function public.lm_insert_purchase_revision(
  p_id uuid,p_outlet uuid,p_date date,p_revision integer,p_items jsonb
) returns numeric language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_row jsonb; v_item public.inventory_items%rowtype; v_subunit text;
  v_line int:=0; v_total numeric:=0; v_line_id uuid;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Minimal satu item pembelian wajib diisi.' using errcode='22023';
  end if;
  for v_row in select value from jsonb_array_elements(p_items) loop
    v_line:=v_line+1;
    select * into v_item from public.inventory_items
    where id=(v_row->>'inventory_item_id')::uuid and outlet_id=p_outlet
      and is_active and deleted_at is null for update;
    if not found or coalesce((v_row->>'quantity')::numeric,0)<=0
      or coalesce((v_row->>'unit_cost')::numeric,-1)<0 then
      raise exception 'Item pembelian tidak valid pada baris %.',v_line using errcode='22023';
    end if;
    select name into v_subunit from public.business_subunits
    where id=v_item.subunit_id and outlet_id=p_outlet and is_active
      and deleted_at is null and inventory_enabled;
    if not found then
      raise exception 'Subunit inventory tidak aktif pada baris %.',v_line using errcode='22023';
    end if;
    v_line_id:=gen_random_uuid();
    insert into public.purchase_transaction_items(
      id,purchase_transaction_id,revision,line_no,inventory_item_id,subunit_id,
      quantity,unit_cost,item_code_snapshot,item_name_snapshot,unit_snapshot,
      subunit_name_snapshot,notes,created_by
    ) values(
      v_line_id,p_id,p_revision,v_line,v_item.id,v_item.subunit_id,
      round((v_row->>'quantity')::numeric,4),round((v_row->>'unit_cost')::numeric,4),
      v_item.code,v_item.name,v_item.unit,v_subunit,nullif(btrim(v_row->>'notes'),''),auth.uid()
    );
    perform public.lm_post_purchase_cost(v_item.id,p_date,(v_row->>'quantity')::numeric,
      (v_row->>'unit_cost')::numeric,p_id,v_line_id,null);
    v_total:=v_total+round((v_row->>'quantity')::numeric*(v_row->>'unit_cost')::numeric,2);
  end loop;
  return round(v_total,2);
end $$;

create or replace function public.create_purchase_transaction(
  p_purchase_date date,p_items jsonb,p_supplier_id uuid default null,
  p_external_invoice_number text default null,p_notes text default null,p_outlet_id uuid default null
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id uuid:=gen_random_uuid(); v_outlet uuid; v_supplier text; v_total numeric;
begin
  if not public.lm_is_active_admin() then raise exception 'Admin atau Super Admin diperlukan.' using errcode='42501'; end if;
  if p_purchase_date is null then raise exception 'Tanggal pembelian wajib diisi.' using errcode='22023'; end if;
  select id into v_outlet from public.outlets where (p_outlet_id is null or id=p_outlet_id)
    and is_active and deleted_at is null order by created_at limit 1;
  if v_outlet is null then raise exception 'Outlet aktif tidak ditemukan.' using errcode='22023'; end if;
  if p_supplier_id is not null then
    select supplier_name into v_supplier from public.suppliers
    where id=p_supplier_id and is_active and deleted_at is null;
    if not found then raise exception 'Supplier aktif tidak ditemukan.' using errcode='22023'; end if;
  end if;
  insert into public.purchase_transactions(
    id,outlet_id,transaction_number,external_invoice_number,supplier_id,
    supplier_name_snapshot,purchase_date,notes,created_by,updated_by
  ) values(
    v_id,v_outlet,public.lm_generate_purchase_number(),
    nullif(btrim(p_external_invoice_number),''),p_supplier_id,v_supplier,p_purchase_date,
    nullif(btrim(p_notes),''),auth.uid(),auth.uid()
  );
  v_total:=public.lm_insert_purchase_revision(v_id,v_outlet,p_purchase_date,1,p_items);
  update public.purchase_transactions set total_amount=v_total where id=v_id;
  return v_id;
end $$;

create function public.update_purchase_transaction(
  p_transaction_id uuid,p_purchase_date date,p_items jsonb,p_supplier_id uuid default null,
  p_external_invoice_number text default null,p_notes text default null
) returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare h public.purchase_transactions%rowtype; v_supplier text; v_revision int; v_total numeric;
begin
  if not public.lm_is_active_admin() then raise exception 'Admin atau Super Admin diperlukan.' using errcode='42501'; end if;
  select * into h from public.purchase_transactions where id=p_transaction_id and deleted_at is null for update;
  if not found then raise exception 'Pembelian aktif tidak ditemukan.' using errcode='22023'; end if;
  perform public.lm_reverse_cost_source('purchase',h.id);
  if p_supplier_id is not null then
    select supplier_name into v_supplier from public.suppliers
    where id=p_supplier_id and is_active and deleted_at is null;
    if not found then raise exception 'Supplier aktif tidak ditemukan.' using errcode='22023'; end if;
  end if;
  update public.purchase_transaction_items set is_current=false,superseded_at=clock_timestamp()
  where purchase_transaction_id=h.id and is_current;
  v_revision:=h.revision+1;
  v_total:=public.lm_insert_purchase_revision(h.id,h.outlet_id,p_purchase_date,v_revision,p_items);
  update public.purchase_transactions set purchase_date=p_purchase_date,total_amount=v_total,
    supplier_id=p_supplier_id,supplier_name_snapshot=v_supplier,
    external_invoice_number=nullif(btrim(p_external_invoice_number),''),
    notes=nullif(btrim(p_notes),''),revision=v_revision,updated_at=clock_timestamp(),
    updated_by=auth.uid() where id=h.id;
  return true;
end $$;

create function public.soft_delete_purchase_transaction(p_transaction_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.lm_is_active_admin() then raise exception 'Admin atau Super Admin diperlukan.' using errcode='42501'; end if;
  if not exists(select 1 from public.purchase_transactions where id=p_transaction_id and deleted_at is null for update)
    then return false; end if;
  perform public.lm_reverse_cost_source('purchase',p_transaction_id);
  update public.purchase_transactions set deleted_at=clock_timestamp(),deleted_by=auth.uid(),
    updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_transaction_id;
  return true;
end $$;

create function public.restore_purchase_transaction(p_transaction_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare h public.purchase_transactions%rowtype; i public.purchase_transaction_items%rowtype;
begin
  if not public.lm_is_active_super_admin() then raise exception 'Hanya Super Admin yang dapat memulihkan pembelian.' using errcode='42501'; end if;
  select * into h from public.purchase_transactions where id=p_transaction_id and deleted_at is not null for update;
  if not found then return false; end if;
  for i in select * from public.purchase_transaction_items where purchase_transaction_id=h.id and is_current order by line_no loop
    perform public.lm_post_purchase_cost(i.inventory_item_id,h.purchase_date,i.quantity,i.unit_cost,h.id,i.id,h.transaction_number);
  end loop;
  update public.purchase_transactions set deleted_at=null,deleted_by=null,
    updated_at=clock_timestamp(),updated_by=auth.uid() where id=h.id;
  return true;
end $$;

create function public.hard_delete_purchase_transaction(p_transaction_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.lm_is_active_super_admin() then raise exception 'Hanya Super Admin yang dapat menghapus permanen pembelian.' using errcode='42501'; end if;
  if exists(select 1 from public.inventory_movements where source_type='purchase' and source_id=p_transaction_id) then
    raise exception 'Pembelian memiliki histori inventory/costing dan tidak dapat dihapus permanen.' using errcode='23503';
  end if;
  delete from public.purchase_transactions where id=p_transaction_id and deleted_at is not null;
  return found;
end $$;

create or replace function public.create_sales_transaction(
  p_transaction_date date,p_items jsonb,p_notes text default null,
  p_entry_source text default 'manual',p_outlet_id uuid default null
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id uuid;
begin
  v_id:=public.lm_stage2_create_sales_transaction(p_transaction_date,p_items,p_notes,p_entry_source,p_outlet_id);
  perform public.lm_post_sales_inventory(v_id);
  return v_id;
end $$;

create or replace function public.update_sales_transaction(
  p_transaction_id uuid,p_transaction_date date,p_items jsonb,p_notes text default null
) returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_result boolean;
begin
  perform public.lm_reverse_cost_source('sale',p_transaction_id);
  update public.sales_item_inventory_costs set reversed_at=clock_timestamp()
    where sales_transaction_id=p_transaction_id and reversed_at is null;
  v_result:=public.lm_stage2_update_sales_transaction(p_transaction_id,p_transaction_date,p_items,p_notes);
  perform public.lm_post_sales_inventory(p_transaction_id);
  return v_result;
end $$;

revoke all on function public.lm_insert_purchase_revision(uuid,uuid,date,integer,jsonb)
  from public,anon,authenticated;
revoke all on function public.update_purchase_transaction(uuid,date,jsonb,uuid,text,text),
  public.soft_delete_purchase_transaction(uuid),public.restore_purchase_transaction(uuid),
  public.hard_delete_purchase_transaction(uuid) from public,anon;
grant execute on function public.update_purchase_transaction(uuid,date,jsonb,uuid,text,text),
  public.soft_delete_purchase_transaction(uuid),public.restore_purchase_transaction(uuid),
  public.hard_delete_purchase_transaction(uuid) to authenticated;

commit;
