begin;

create sequence public.inventory_cost_posting_seq;
create sequence public.purchase_transaction_number_seq;

alter table public.inventory_movements
  add column effective_date date,
  add column posting_sequence bigint,
  add column value_delta numeric(30,4),
  add column quantity_before numeric(18,4),
  add column quantity_after numeric(18,4),
  add column inventory_value_before numeric(30,4),
  add column inventory_value_after numeric(30,4),
  add column wac_before numeric(18,4),
  add column wac_after numeric(18,4),
  add column cost_status text;

update public.inventory_movements
set effective_date = movement_at::date,
    posting_sequence = nextval('public.inventory_cost_posting_seq')
where effective_date is null;

alter table public.inventory_movements
  alter column effective_date set not null,
  alter column effective_date set default current_date,
  alter column posting_sequence set not null,
  alter column posting_sequence set default nextval('public.inventory_cost_posting_seq'),
  add constraint inventory_movements_cost_status_check
    check (cost_status is null or cost_status in ('final','provisional'));

create unique index inventory_movements_posting_sequence_uidx
  on public.inventory_movements(posting_sequence);
create index inventory_movements_cost_timeline_idx
  on public.inventory_movements(inventory_item_id, effective_date, posting_sequence)
  where not is_reversed;

create table public.inventory_cost_states (
  inventory_item_id uuid primary key references public.inventory_items(id) on delete restrict,
  on_hand_quantity numeric(18,4) not null default 0,
  inventory_value numeric(30,4) not null default 0,
  current_wac numeric(18,4),
  has_cost_basis boolean not null default false,
  last_effective_date date,
  last_posting_sequence bigint,
  updated_at timestamptz not null default clock_timestamp(),
  constraint inventory_cost_states_value_nonnegative check (inventory_value >= 0),
  constraint inventory_cost_states_wac_nonnegative check (current_wac is null or current_wac >= 0)
);

insert into public.inventory_cost_states(inventory_item_id, on_hand_quantity)
select ii.id, coalesce(sum(im.quantity_delta) filter (where not im.is_reversed), 0)
from public.inventory_items ii
left join public.inventory_movements im on im.inventory_item_id = ii.id
group by ii.id;

create table public.purchase_transactions (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  transaction_number text not null unique,
  external_invoice_number text,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  supplier_name_snapshot text,
  purchase_date date not null,
  total_amount numeric(30,2) not null default 0 check (total_amount >= 0),
  notes text,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create table public.purchase_transaction_items (
  id uuid primary key default gen_random_uuid(),
  purchase_transaction_id uuid not null references public.purchase_transactions(id) on delete restrict,
  revision integer not null check (revision > 0),
  line_no integer not null check (line_no > 0),
  is_current boolean not null default true,
  superseded_at timestamptz,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  subunit_id uuid not null references public.business_subunits(id) on delete restrict,
  quantity numeric(18,4) not null check (quantity > 0),
  unit_cost numeric(18,4) not null check (unit_cost >= 0),
  amount numeric(30,2) generated always as (round(quantity * unit_cost, 2)) stored,
  item_code_snapshot text not null,
  item_name_snapshot text not null,
  unit_snapshot text not null,
  subunit_name_snapshot text not null,
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  unique(purchase_transaction_id, revision, line_no)
);

create unique index purchase_transaction_items_current_item_uidx
  on public.purchase_transaction_items(purchase_transaction_id, inventory_item_id)
  where is_current;
create index purchase_transaction_items_subunit_idx
  on public.purchase_transaction_items(subunit_id) where is_current;

alter table public.sales_items
  add column unit_hpp numeric(18,4) not null default 0,
  add column hpp_amount numeric(30,2) not null default 0,
  add column hpp_status text not null default 'final'
    check (hpp_status in ('final','provisional'));

create table public.sales_item_inventory_costs (
  id uuid primary key default gen_random_uuid(),
  sales_transaction_id uuid not null references public.sales_transactions(id) on delete restrict,
  sales_item_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  requirement_quantity numeric(18,4) not null check (requirement_quantity > 0),
  consumed_quantity numeric(18,4) not null check (consumed_quantity > 0),
  unit_cost numeric(18,4) not null check (unit_cost >= 0),
  cost_amount numeric(30,2) not null check (cost_amount >= 0),
  cost_status text not null check (cost_status in ('final','provisional')),
  item_code_snapshot text not null,
  item_name_snapshot text not null,
  unit_snapshot text not null,
  created_at timestamptz not null default clock_timestamp(),
  reversed_at timestamptz,
  unique(sales_item_id, inventory_item_id, reversed_at)
);

create or replace function public.lm_lock_cost_state(p_item_id uuid)
returns public.inventory_cost_states language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_state public.inventory_cost_states;
begin
  insert into public.inventory_cost_states(inventory_item_id, on_hand_quantity)
  select ii.id, coalesce(sum(im.quantity_delta) filter(where not im.is_reversed),0)
  from public.inventory_items ii left join public.inventory_movements im
    on im.inventory_item_id=ii.id
  where ii.id=p_item_id group by ii.id
  on conflict(inventory_item_id) do nothing;
  select * into v_state from public.inventory_cost_states
  where inventory_item_id=p_item_id for update;
  if not found then raise exception 'Inventory Item tidak ditemukan.' using errcode='22023'; end if;
  return v_state;
end $$;

create or replace function public.lm_assert_forward_cost_date(
  p_item_id uuid, p_effective_date date
) returns void language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_last date;
begin
  select max(effective_date) into v_last from public.inventory_movements
  where inventory_item_id=p_item_id and not is_reversed
    and movement_type in ('purchase_in','sale_consumption');
  if v_last is not null and p_effective_date < v_last then
    raise exception 'Transaksi tidak dapat diubah karena sudah terdapat aktivitas stok/HPP yang lebih baru untuk item terkait.'
      using errcode='23514';
  end if;
end $$;

create or replace function public.lm_post_purchase_cost(
  p_item_id uuid, p_date date, p_quantity numeric, p_unit_cost numeric,
  p_source_id uuid, p_source_line_id uuid, p_reference text
) returns uuid language plpgsql security definer
set search_path = public, pg_catalog as $$
declare s public.inventory_cost_states; v_after numeric; v_value numeric; v_wac numeric;
  v_seq bigint; v_id uuid;
begin
  perform public.lm_assert_forward_cost_date(p_item_id,p_date);
  s := public.lm_lock_cost_state(p_item_id);
  v_after := round(s.on_hand_quantity+p_quantity,4);
  if s.on_hand_quantity > 0 then
    v_value := round(s.inventory_value + p_quantity*p_unit_cost,4);
    v_wac := case when v_after>0 then round(v_value/v_after,4) else s.current_wac end;
  elsif v_after > 0 then
    v_wac := round(p_unit_cost,4); v_value := round(v_after*v_wac,4);
  else
    v_wac := s.current_wac; v_value := 0;
  end if;
  v_seq := nextval('public.inventory_cost_posting_seq');
  insert into public.inventory_movements(
    inventory_item_id,movement_at,effective_date,posting_sequence,movement_type,
    quantity_delta,unit_cost,value_delta,source_type,source_id,source_line_id,reference,
    quantity_before,quantity_after,inventory_value_before,inventory_value_after,
    wac_before,wac_after,cost_status,created_by
  ) values(
    p_item_id,clock_timestamp(),p_date,v_seq,'purchase_in',round(p_quantity,4),
    round(p_unit_cost,4),round(p_quantity*p_unit_cost,4),'purchase',p_source_id,
    p_source_line_id,p_reference,s.on_hand_quantity,v_after,s.inventory_value,v_value,
    s.current_wac,v_wac,'final',auth.uid()
  ) returning id into v_id;
  update public.inventory_cost_states set on_hand_quantity=v_after,inventory_value=v_value,
    current_wac=v_wac,has_cost_basis=(has_cost_basis or v_after>0),
    last_effective_date=p_date,last_posting_sequence=v_seq,updated_at=clock_timestamp()
  where inventory_item_id=p_item_id;
  return v_id;
end $$;

create or replace function public.lm_post_sale_cost(
  p_item_id uuid, p_date date, p_quantity numeric,
  p_source_id uuid, p_source_line_id uuid, p_reference text
) returns table(movement_id uuid,unit_cost numeric,cost_amount numeric,cost_status text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare s public.inventory_cost_states; v_after numeric; v_value numeric; v_cost numeric;
  v_status text; v_seq bigint; v_id uuid;
begin
  perform public.lm_assert_forward_cost_date(p_item_id,p_date);
  s := public.lm_lock_cost_state(p_item_id);
  v_cost := case when s.has_cost_basis then coalesce(s.current_wac,0) else 0 end;
  v_status := case when s.has_cost_basis then 'final' else 'provisional' end;
  v_after := round(s.on_hand_quantity-p_quantity,4);
  v_value := case when v_after>0 then round(v_after*v_cost,4) else 0 end;
  v_seq := nextval('public.inventory_cost_posting_seq');
  insert into public.inventory_movements(
    inventory_item_id,movement_at,effective_date,posting_sequence,movement_type,
    quantity_delta,unit_cost,value_delta,source_type,source_id,source_line_id,reference,
    quantity_before,quantity_after,inventory_value_before,inventory_value_after,
    wac_before,wac_after,cost_status,created_by
  ) values(
    p_item_id,clock_timestamp(),p_date,v_seq,'sale_consumption',-round(p_quantity,4),
    v_cost,-round(p_quantity*v_cost,4),'sale',p_source_id,p_source_line_id,p_reference,
    s.on_hand_quantity,v_after,s.inventory_value,v_value,s.current_wac,s.current_wac,
    v_status,auth.uid()
  ) returning id into v_id;
  update public.inventory_cost_states set on_hand_quantity=v_after,inventory_value=v_value,
    last_effective_date=p_date,last_posting_sequence=v_seq,updated_at=clock_timestamp()
  where inventory_item_id=p_item_id;
  return query select v_id,v_cost,round(p_quantity*v_cost,2),v_status;
end $$;

create or replace function public.lm_reverse_cost_source(p_source_type text,p_source_id uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare m public.inventory_movements%rowtype; s public.inventory_cost_states;
begin
  for m in select * from public.inventory_movements
    where source_type=p_source_type and source_id=p_source_id and not is_reversed
      and movement_type in ('purchase_in','sale_consumption')
    order by posting_sequence desc
  loop
    s := public.lm_lock_cost_state(m.inventory_item_id);
    if s.last_posting_sequence is distinct from m.posting_sequence then
      raise exception 'Transaksi tidak dapat diubah karena sudah terdapat aktivitas stok/HPP yang lebih baru untuk item terkait.'
        using errcode='23514';
    end if;
    update public.inventory_movements set is_reversed=true,reversed_at=clock_timestamp(),
      reversed_by=auth.uid() where id=m.id;
    update public.inventory_cost_states set
      on_hand_quantity=m.quantity_before,inventory_value=coalesce(m.inventory_value_before,0),
      current_wac=m.wac_before,has_cost_basis=(m.wac_before is not null),
      last_effective_date=(select effective_date from public.inventory_movements
        where inventory_item_id=m.inventory_item_id and not is_reversed
          and movement_type in ('purchase_in','sale_consumption')
        order by posting_sequence desc limit 1),
      last_posting_sequence=(select posting_sequence from public.inventory_movements
        where inventory_item_id=m.inventory_item_id and not is_reversed
          and movement_type in ('purchase_in','sale_consumption')
        order by posting_sequence desc limit 1),
      updated_at=clock_timestamp()
    where inventory_item_id=m.inventory_item_id;
  end loop;
end $$;

create or replace function public.lm_generate_purchase_number()
returns text language sql security definer set search_path=public,pg_catalog as $$
  select 'PUR-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.purchase_transaction_number_seq')::text,6,'0')
$$;

create or replace function public.create_purchase_transaction(
  p_purchase_date date,p_items jsonb,p_supplier_id uuid default null,
  p_external_invoice_number text default null,p_notes text default null,p_outlet_id uuid default null
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id uuid:=gen_random_uuid(); v_outlet uuid; v_supplier text; v_row jsonb;
  v_item public.inventory_items%rowtype; v_subunit text; v_line int:=0; v_total numeric:=0; v_line_id uuid;
begin
  if not public.lm_is_active_admin() then raise exception 'Admin atau Super Admin diperlukan.' using errcode='42501'; end if;
  if p_purchase_date is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0
    then raise exception 'Tanggal dan minimal satu item pembelian wajib diisi.' using errcode='22023'; end if;
  select id into v_outlet from public.outlets where (p_outlet_id is null or id=p_outlet_id)
    and is_active and deleted_at is null order by created_at limit 1;
  if v_outlet is null then raise exception 'Outlet aktif tidak ditemukan.' using errcode='22023'; end if;
  if p_supplier_id is not null then
    select supplier_name into v_supplier from public.suppliers where id=p_supplier_id and is_active and deleted_at is null;
    if not found then raise exception 'Supplier aktif tidak ditemukan.' using errcode='22023'; end if;
  end if;
  insert into public.purchase_transactions(id,outlet_id,transaction_number,external_invoice_number,
    supplier_id,supplier_name_snapshot,purchase_date,notes,created_by,updated_by)
  values(v_id,v_outlet,public.lm_generate_purchase_number(),nullif(btrim(p_external_invoice_number),''),
    p_supplier_id,v_supplier,p_purchase_date,nullif(btrim(p_notes),''),auth.uid(),auth.uid());
  for v_row in select value from jsonb_array_elements(p_items) loop
    v_line:=v_line+1;
    select * into v_item from public.inventory_items where id=(v_row->>'inventory_item_id')::uuid
      and outlet_id=v_outlet and is_active and deleted_at is null for update;
    if not found or coalesce((v_row->>'quantity')::numeric,0)<=0 or coalesce((v_row->>'unit_cost')::numeric,-1)<0
      then raise exception 'Item pembelian tidak valid pada baris %.',v_line using errcode='22023'; end if;
    select name into v_subunit from public.business_subunits where id=v_item.subunit_id
      and outlet_id=v_outlet and is_active and deleted_at is null and inventory_enabled;
    if not found then raise exception 'Subunit inventory tidak aktif pada baris %.',v_line using errcode='22023'; end if;
    v_line_id:=gen_random_uuid();
    insert into public.purchase_transaction_items(id,purchase_transaction_id,revision,line_no,
      inventory_item_id,subunit_id,quantity,unit_cost,item_code_snapshot,item_name_snapshot,
      unit_snapshot,subunit_name_snapshot,notes,created_by)
    values(v_line_id,v_id,1,v_line,v_item.id,v_item.subunit_id,round((v_row->>'quantity')::numeric,4),
      round((v_row->>'unit_cost')::numeric,4),v_item.code,v_item.name,v_item.unit,v_subunit,
      nullif(btrim(v_row->>'notes'),''),auth.uid());
    perform public.lm_post_purchase_cost(v_item.id,p_purchase_date,(v_row->>'quantity')::numeric,
      (v_row->>'unit_cost')::numeric,v_id,v_line_id,null);
    v_total:=v_total+round((v_row->>'quantity')::numeric*(v_row->>'unit_cost')::numeric,2);
  end loop;
  update public.purchase_transactions set total_amount=v_total where id=v_id;
  return v_id;
end $$;

create or replace function public.lm_post_sales_inventory(p_transaction_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare h public.sales_transactions%rowtype; si public.sales_items%rowtype; r record; c record;
  v_hpp numeric; v_status text;
begin
  select * into h from public.sales_transactions where id=p_transaction_id;
  for si in select * from public.sales_items where sales_transaction_id=p_transaction_id order by line_no loop
    v_hpp:=0; v_status:='final';
    for r in select pir.*,ii.code,ii.name,ii.unit from public.product_inventory_requirements pir
      join public.inventory_items ii on ii.id=pir.inventory_item_id
      where pir.product_id=si.product_id
    loop
      select * into c from public.lm_post_sale_cost(r.inventory_item_id,h.transaction_date,
        round(si.quantity*r.quantity_required,4),h.id,si.id,h.transaction_number);
      insert into public.sales_item_inventory_costs(sales_transaction_id,sales_item_id,product_id,
        inventory_item_id,requirement_quantity,consumed_quantity,unit_cost,cost_amount,cost_status,
        item_code_snapshot,item_name_snapshot,unit_snapshot)
      values(h.id,si.id,si.product_id,r.inventory_item_id,r.quantity_required,
        round(si.quantity*r.quantity_required,4),c.unit_cost,c.cost_amount,c.cost_status,r.code,r.name,r.unit);
      v_hpp:=v_hpp+c.cost_amount;
      if c.cost_status='provisional' then v_status:='provisional'; end if;
    end loop;
    update public.sales_items set hpp_amount=round(v_hpp,2),
      unit_hpp=case when si.quantity>0 then round(v_hpp/si.quantity,4) else 0 end,
      hpp_status=v_status where id=si.id;
  end loop;
end $$;

create or replace function public.lm_sales_inventory_lifecycle()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if tg_op='UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    perform public.lm_reverse_cost_source('sale',new.id);
    update public.sales_item_inventory_costs set reversed_at=clock_timestamp()
      where sales_transaction_id=new.id and reversed_at is null;
  elsif tg_op='UPDATE' and old.deleted_at is not null and new.deleted_at is null then
    perform public.lm_post_sales_inventory(new.id);
  elsif tg_op='DELETE' and exists(select 1 from public.sales_item_inventory_costs where sales_transaction_id=old.id) then
    raise exception 'Transaksi memiliki histori inventory/HPP dan tidak dapat dihapus permanen.' using errcode='23503';
  end if;
  return coalesce(new,old);
end $$;

create trigger sales_inventory_lifecycle
before update of deleted_at or delete on public.sales_transactions
for each row execute function public.lm_sales_inventory_lifecycle();

-- Wrap existing sales RPC behavior without changing its public signature.
alter function public.create_sales_transaction(date,jsonb,text,text,uuid) rename to lm_stage2_create_sales_transaction;
create function public.create_sales_transaction(date,jsonb,text,text,uuid)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id uuid;
begin
  v_id:=public.lm_stage2_create_sales_transaction($1,$2,$3,$4,$5);
  perform public.lm_post_sales_inventory(v_id);
  return v_id;
end $$;

alter function public.update_sales_transaction(uuid,date,jsonb,text) rename to lm_stage2_update_sales_transaction;
create function public.update_sales_transaction(uuid,date,jsonb,text)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_result boolean;
begin
  perform public.lm_reverse_cost_source('sale',$1);
  update public.sales_item_inventory_costs set reversed_at=clock_timestamp()
    where sales_transaction_id=$1 and reversed_at is null;
  v_result:=public.lm_stage2_update_sales_transaction($1,$2,$3,$4);
  perform public.lm_post_sales_inventory($1);
  return v_result;
end $$;

create or replace view public.v_inventory_cost_balances as
select ii.id inventory_item_id,ii.outlet_id,ii.subunit_id,ii.code,ii.name,ii.unit,
  cs.on_hand_quantity,cs.inventory_value,cs.current_wac,cs.has_cost_basis,
  cs.last_effective_date,cs.updated_at
from public.inventory_items ii join public.inventory_cost_states cs on cs.inventory_item_id=ii.id;

alter table public.inventory_cost_states enable row level security;
alter table public.purchase_transactions enable row level security;
alter table public.purchase_transaction_items enable row level security;
alter table public.sales_item_inventory_costs enable row level security;

create policy inventory_cost_states_read on public.inventory_cost_states for select to authenticated
using(public.lm_is_active_staff_or_above());
create policy purchase_transactions_read on public.purchase_transactions for select to authenticated
using(public.lm_is_active_staff_or_above() and (deleted_at is null or public.lm_is_active_super_admin()));
create policy purchase_transaction_items_read on public.purchase_transaction_items for select to authenticated
using(public.lm_is_active_staff_or_above() and exists(select 1 from public.purchase_transactions p
  where p.id=purchase_transaction_id and (p.deleted_at is null or public.lm_is_active_super_admin())));
create policy sales_item_inventory_costs_read on public.sales_item_inventory_costs for select to authenticated
using(public.lm_is_active_staff_or_above() and exists(select 1 from public.sales_transactions s
  where s.id=sales_transaction_id and (s.deleted_at is null or public.lm_is_active_super_admin())));

revoke all on public.inventory_cost_states,public.purchase_transactions,
  public.purchase_transaction_items,public.sales_item_inventory_costs from anon;
revoke insert,update,delete,truncate,references,trigger on public.inventory_cost_states,
  public.purchase_transactions,public.purchase_transaction_items,public.sales_item_inventory_costs from authenticated;
grant select on public.inventory_cost_states,public.purchase_transactions,
  public.purchase_transaction_items,public.sales_item_inventory_costs,public.v_inventory_cost_balances to authenticated;

revoke all on function public.lm_lock_cost_state(uuid),public.lm_assert_forward_cost_date(uuid,date),
  public.lm_post_purchase_cost(uuid,date,numeric,numeric,uuid,uuid,text),
  public.lm_post_sale_cost(uuid,date,numeric,uuid,uuid,text),
  public.lm_reverse_cost_source(text,uuid),public.lm_post_sales_inventory(uuid),
  public.lm_sales_inventory_lifecycle() from public,anon,authenticated;
revoke all on function public.create_purchase_transaction(date,jsonb,uuid,text,text,uuid),
  public.create_sales_transaction(date,jsonb,text,text,uuid),
  public.update_sales_transaction(uuid,date,jsonb,text) from public,anon;
grant execute on function public.create_purchase_transaction(date,jsonb,uuid,text,text,uuid),
  public.create_sales_transaction(date,jsonb,text,text,uuid),
  public.update_sales_transaction(uuid,date,jsonb,text) to authenticated;

comment on table public.purchase_transactions is
  'Stage 5 operational inventory purchases. Legacy purchase_invoices remain separate.';
comment on table public.inventory_cost_states is
  'Moving WAC state under closed-timeline policy. Same-date order uses posting_sequence.';

commit;
