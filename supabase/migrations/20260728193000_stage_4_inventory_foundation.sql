-- Stage 4: generic inventory foundation.
-- Additive only: no existing business data is modified.

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  subunit_id uuid not null references public.business_subunits(id) on delete restrict,
  code text not null,
  name text not null,
  unit text not null,
  minimum_stock numeric(18,4) not null default 0 check (minimum_stock >= 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint inventory_items_code_not_blank check (btrim(code) <> ''),
  constraint inventory_items_name_not_blank check (btrim(name) <> ''),
  constraint inventory_items_unit_not_blank check (btrim(unit) <> '')
);

create unique index inventory_items_active_code_uidx
  on public.inventory_items(outlet_id, lower(code))
  where deleted_at is null;
create index inventory_items_subunit_idx
  on public.inventory_items(subunit_id) where deleted_at is null;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_at timestamptz not null default now(),
  movement_type text not null check (movement_type in (
    'opening', 'purchase_in', 'sale_consumption', 'adjustment',
    'stock_opname', 'reversal'
  )),
  quantity_delta numeric(18,4) not null check (quantity_delta <> 0),
  unit_cost numeric(18,4) check (unit_cost is null or unit_cost >= 0),
  source_type text,
  source_id uuid,
  source_line_id uuid,
  reference text,
  notes text,
  is_reversed boolean not null default false,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint inventory_movements_reversal_state check (
    (is_reversed = false and reversed_at is null and reversed_by is null)
    or (is_reversed = true and reversed_at is not null)
  )
);

create index inventory_movements_item_date_idx
  on public.inventory_movements(inventory_item_id, movement_at);
create unique index inventory_movements_source_uidx
  on public.inventory_movements(source_type, source_id, source_line_id, inventory_item_id)
  where source_type is not null and source_id is not null and is_reversed = false;

create table public.stock_opnames (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  subunit_id uuid not null references public.business_subunits(id) on delete restrict,
  opname_date date not null,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  voided_at timestamptz,
  voided_by uuid references auth.users(id)
);

create table public.stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  stock_opname_id uuid not null references public.stock_opnames(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  system_quantity numeric(18,4) not null,
  physical_quantity numeric(18,4) not null check (physical_quantity >= 0),
  variance numeric(18,4) generated always as
    (round(physical_quantity - system_quantity, 4)) stored,
  item_code_snapshot text not null,
  item_name_snapshot text not null,
  unit_snapshot text not null,
  unique(stock_opname_id, line_no),
  unique(stock_opname_id, inventory_item_id)
);

create table public.product_inventory_requirements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_required numeric(18,4) not null check (quantity_required > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique(product_id, inventory_item_id)
);

create or replace function public.lm_validate_inventory_item_ownership()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_outlet uuid; v_enabled boolean;
begin
  select outlet_id, inventory_enabled into v_outlet, v_enabled
  from public.business_subunits
  where id = new.subunit_id and deleted_at is null;
  if v_outlet is null or v_outlet <> new.outlet_id then
    raise exception 'Inventory Item harus memiliki Outlet yang sama dengan Subunit.'
      using errcode = '23514';
  end if;
  if not v_enabled then
    raise exception 'Inventory belum diaktifkan untuk Subunit ini.'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger validate_inventory_item_ownership
before insert or update of outlet_id, subunit_id on public.inventory_items
for each row execute function public.lm_validate_inventory_item_ownership();

create or replace function public.lm_validate_stock_opname_ownership()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_outlet uuid;
begin
  select outlet_id into v_outlet from public.business_subunits
  where id = new.subunit_id and deleted_at is null and inventory_enabled;
  if v_outlet is null or v_outlet <> new.outlet_id then
    raise exception 'Stock Opname harus memiliki Outlet dan Subunit inventory yang konsisten.'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger validate_stock_opname_ownership
before insert or update of outlet_id, subunit_id on public.stock_opnames
for each row execute function public.lm_validate_stock_opname_ownership();

create or replace function public.lm_validate_bom_ownership()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_product_subunit uuid; v_item_subunit uuid;
begin
  select c.subunit_id into v_product_subunit
  from public.products p join public.sales_categories c on c.id = p.sales_category_id
  where p.id = new.product_id and p.deleted_at is null;
  select subunit_id into v_item_subunit from public.inventory_items
  where id = new.inventory_item_id and deleted_at is null;
  if v_product_subunit is null or v_item_subunit is null
     or v_product_subunit <> v_item_subunit then
    raise exception 'Inventory Item harus berasal dari Subunit yang sama dengan Product.'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger validate_bom_ownership
before insert or update of product_id, inventory_item_id
on public.product_inventory_requirements
for each row execute function public.lm_validate_bom_ownership();

create or replace view public.v_inventory_balances
with (security_invoker = true) as
select i.id as inventory_item_id, i.outlet_id, i.subunit_id, i.code, i.name,
  i.unit, i.minimum_stock, i.is_active, i.deleted_at,
  coalesce(sum(m.quantity_delta) filter (where not m.is_reversed), 0)::numeric(18,4)
    as current_stock,
  coalesce(sum(
    case when not m.is_reversed and m.quantity_delta > 0 and m.unit_cost is not null
      then m.quantity_delta * m.unit_cost else 0 end
  ), 0)::numeric(18,4) as recorded_inbound_value
from public.inventory_items i
left join public.inventory_movements m on m.inventory_item_id = i.id
group by i.id;

create or replace function public.create_inventory_adjustment(
  p_inventory_item_id uuid, p_quantity_delta numeric, p_notes text default null,
  p_movement_at timestamptz default now()
) returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin atau Super Admin aktif diperlukan.' using errcode = '42501';
  end if;
  if p_quantity_delta is null or round(p_quantity_delta,4) = 0 then
    raise exception 'Perubahan stok harus bukan nol.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.inventory_items
    where id = p_inventory_item_id and deleted_at is null and is_active) then
    raise exception 'Inventory Item aktif tidak ditemukan.' using errcode = '22023';
  end if;
  insert into public.inventory_movements(
    inventory_item_id, movement_at, movement_type, quantity_delta, notes, created_by
  ) values (
    p_inventory_item_id, coalesce(p_movement_at, now()), 'adjustment',
    round(p_quantity_delta,4), nullif(btrim(p_notes),''), auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.post_stock_opname(
  p_outlet_id uuid, p_subunit_id uuid, p_opname_date date,
  p_items jsonb, p_notes text default null
) returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_opname_id uuid; v_row jsonb; v_item_id uuid; v_physical numeric;
  v_system numeric; v_line integer := 0; v_item public.inventory_items%rowtype;
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin atau Super Admin aktif diperlukan.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Stock Opname membutuhkan minimal satu item.' using errcode = '22023';
  end if;
  insert into public.stock_opnames(outlet_id, subunit_id, opname_date, notes, created_by, updated_by)
  values(p_outlet_id, p_subunit_id, p_opname_date, nullif(btrim(p_notes),''), auth.uid(), auth.uid())
  returning id into v_opname_id;
  for v_row in select value from jsonb_array_elements(p_items) loop
    v_line := v_line + 1;
    v_item_id := (v_row->>'inventory_item_id')::uuid;
    v_physical := round((v_row->>'physical_quantity')::numeric,4);
    select * into v_item from public.inventory_items
      where id = v_item_id and outlet_id = p_outlet_id and subunit_id = p_subunit_id
        and deleted_at is null and is_active for update;
    if not found or v_physical < 0 then
      raise exception 'Item opname tidak valid pada baris %.', v_line using errcode = '22023';
    end if;
    select coalesce(sum(quantity_delta) filter(where not is_reversed),0)
      into v_system from public.inventory_movements where inventory_item_id = v_item_id;
    insert into public.stock_opname_items(
      stock_opname_id, line_no, inventory_item_id, system_quantity,
      physical_quantity, item_code_snapshot, item_name_snapshot, unit_snapshot
    ) values (
      v_opname_id, v_line, v_item_id, v_system, v_physical,
      v_item.code, v_item.name, v_item.unit
    );
    if round(v_physical-v_system,4) <> 0 then
      insert into public.inventory_movements(
        inventory_item_id, movement_type, quantity_delta, source_type,
        source_id, source_line_id, reference, created_by
      ) values (
        v_item_id, 'stock_opname', round(v_physical-v_system,4), 'stock_opname',
        v_opname_id, v_item_id, p_opname_date::text, auth.uid()
      );
    end if;
  end loop;
  return v_opname_id;
end $$;

create or replace function public.void_stock_opname(p_stock_opname_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.lm_is_active_super_admin() then
    raise exception 'Super Admin aktif diperlukan.' using errcode = '42501';
  end if;
  update public.stock_opnames set status='voided', voided_at=now(),
    voided_by=auth.uid(), updated_at=now(), updated_by=auth.uid()
  where id=p_stock_opname_id and status='posted';
  if not found then raise exception 'Stock Opname aktif tidak ditemukan.' using errcode='22023'; end if;
  update public.inventory_movements set is_reversed=true, reversed_at=now(), reversed_by=auth.uid()
  where source_type='stock_opname' and source_id=p_stock_opname_id and not is_reversed;
end $$;

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.stock_opnames enable row level security;
alter table public.stock_opname_items enable row level security;
alter table public.product_inventory_requirements enable row level security;

create policy inventory_items_read on public.inventory_items for select to authenticated
  using (public.lm_is_active_staff_or_above() and
    (deleted_at is null or public.lm_is_active_super_admin()));
create policy inventory_items_admin_insert on public.inventory_items for insert to authenticated
  with check (public.lm_is_active_admin());
create policy inventory_items_admin_update on public.inventory_items for update to authenticated
  using (public.lm_is_active_admin())
  with check (public.lm_is_active_admin());
create policy inventory_items_super_delete on public.inventory_items for delete to authenticated
  using (public.lm_is_active_super_admin()
    and deleted_at is not null);

create policy inventory_movements_read on public.inventory_movements for select to authenticated
  using (public.lm_is_active_staff_or_above());
create policy stock_opnames_read on public.stock_opnames for select to authenticated
  using (public.lm_is_active_staff_or_above());
create policy stock_opname_items_read on public.stock_opname_items for select to authenticated
  using (public.lm_is_active_staff_or_above());
create policy bom_read on public.product_inventory_requirements for select to authenticated
  using (public.lm_is_active_staff_or_above());
create policy bom_admin_insert on public.product_inventory_requirements for insert to authenticated
  with check (public.lm_is_active_admin());
create policy bom_admin_update on public.product_inventory_requirements for update to authenticated
  using (public.lm_is_active_admin())
  with check (public.lm_is_active_admin());
create policy bom_admin_delete on public.product_inventory_requirements for delete to authenticated
  using (public.lm_is_active_admin());

grant select on public.inventory_items, public.inventory_movements,
  public.stock_opnames, public.stock_opname_items,
  public.product_inventory_requirements, public.v_inventory_balances to authenticated;
grant insert, update, delete on public.inventory_items,
  public.product_inventory_requirements to authenticated;
revoke all on public.inventory_movements, public.stock_opnames,
  public.stock_opname_items from anon, authenticated;
grant select on public.inventory_movements, public.stock_opnames,
  public.stock_opname_items to authenticated;

revoke all on function public.lm_validate_inventory_item_ownership() from public;
revoke all on function public.lm_validate_stock_opname_ownership() from public;
revoke all on function public.lm_validate_bom_ownership() from public;
revoke all on function public.create_inventory_adjustment(uuid,numeric,text,timestamptz) from public;
revoke all on function public.post_stock_opname(uuid,uuid,date,jsonb,text) from public;
revoke all on function public.void_stock_opname(uuid) from public;
grant execute on function public.create_inventory_adjustment(uuid,numeric,text,timestamptz) to authenticated;
grant execute on function public.post_stock_opname(uuid,uuid,date,jsonb,text) to authenticated;
grant execute on function public.void_stock_opname(uuid) to authenticated;

create trigger inventory_items_updated_at before update on public.inventory_items
for each row execute function public.update_updated_at_column();
create trigger bom_updated_at before update on public.product_inventory_requirements
for each row execute function public.update_updated_at_column();
