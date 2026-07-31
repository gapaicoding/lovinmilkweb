-- Final Arayya 2026 sellable catalog, inventory master, and BOM.
--
-- Business-data import only. Reference component costs in this manifest are
-- deliberately NOT written to inventory_cost_states and do not create stock,
-- purchases, movements, or historical Sales HPP.

begin;

create temp table arayya_categories (
  name text primary key
) on commit drop;

insert into arayya_categories(name) values
  ('Melukis'),
  ('Menghias'),
  ('Meronce');

create temp table arayya_products (
  category_name text not null,
  product_name text primary key,
  selling_price numeric(16,2) not null check (selling_price >= 0),
  reference_hpp numeric(18,4)
) on commit drop;

insert into arayya_products(category_name, product_name, selling_price, reference_hpp) values
  ('Melukis','Paket Melukis Kanvas Polos',29000,13920),
  ('Melukis','Paket Melukis Kanvas Angka',54000,30700),
  ('Melukis','Paket Melukis Kanvas Pola',34000,17420),
  ('Melukis','Paket Melukis Bucket Hat',39000,18320),
  ('Melukis','Paket Melukis Tote Bag',24000,11420),
  ('Melukis','Paket Melukis Pouch',24000,13420),
  ('Melukis','Paket Melukis Cermin',39000,21820),
  ('Melukis','Paket Melukis Beruang',34000,7560),
  ('Melukis','Paket Melukis Akrilik',34000,12360),
  ('Melukis','Paket Melukis Patung',19000,8470),
  ('Melukis','Paket Melukis Gerabah',34000,null),
  ('Melukis','Paket Melukis Pot Tanah Liat',39000,16420),
  ('Melukis','Paket Melukis Pot Gypsum',39000,12420),
  ('Melukis','Paket Melukis Kipas Pola',19000,9070),
  ('Melukis','Paket Melukis Coaster',29000,17420),
  ('Menghias','Paket Menghias Cermin',29000,20000),
  ('Meronce','Paket Meronce Manik-Manik',29000,10400);

create temp table arayya_items (
  item_name text primary key,
  reference_unit_cost numeric(18,4)
) on commit drop;

insert into arayya_items(item_name, reference_unit_cost) values
  ('Kanvas 20x20',6500),
  ('Kanvas Angka',29000),
  ('Kanvas Pola',10000),
  ('Bucket Hat',10900),
  ('Tote Bag',4000),
  ('Pouch',6000),
  ('Cermin Hexagon',14400),
  ('Ganci Beruang',5200),
  ('Ganci Akrilik',10000),
  ('Patung Gypsum',1050),
  ('Gerabah',null),
  ('Pot Tanah Liat',9000),
  ('Pot Gypsum',5000),
  ('Kipas Pola',1650),
  ('Coaster Gypsum',10000),
  ('Cermin Kotak',20000),
  ('Manik-Manik',6000),
  ('Benang',2200),
  ('Cat 12 Warna',2200),
  ('Kuas',660),
  ('Piring Palette',1700);

create temp table arayya_bom (
  product_name text not null references arayya_products(product_name),
  item_name text not null references arayya_items(item_name),
  quantity_required numeric(18,4) not null check (quantity_required > 0),
  primary key(product_name, item_name)
) on commit drop;

insert into arayya_bom(product_name, item_name, quantity_required) values
  ('Paket Melukis Kanvas Polos','Kanvas 20x20',1),
  ('Paket Melukis Kanvas Polos','Cat 12 Warna',2),
  ('Paket Melukis Kanvas Polos','Kuas',2),
  ('Paket Melukis Kanvas Polos','Piring Palette',1),
  ('Paket Melukis Kanvas Angka','Kanvas Angka',1),
  ('Paket Melukis Kanvas Angka','Piring Palette',1),
  ('Paket Melukis Kanvas Pola','Kanvas Pola',1),
  ('Paket Melukis Kanvas Pola','Cat 12 Warna',2),
  ('Paket Melukis Kanvas Pola','Kuas',2),
  ('Paket Melukis Kanvas Pola','Piring Palette',1),
  ('Paket Melukis Bucket Hat','Bucket Hat',1),
  ('Paket Melukis Bucket Hat','Cat 12 Warna',2),
  ('Paket Melukis Bucket Hat','Kuas',2),
  ('Paket Melukis Bucket Hat','Piring Palette',1),
  ('Paket Melukis Tote Bag','Tote Bag',1),
  ('Paket Melukis Tote Bag','Cat 12 Warna',2),
  ('Paket Melukis Tote Bag','Kuas',2),
  ('Paket Melukis Tote Bag','Piring Palette',1),
  ('Paket Melukis Pouch','Pouch',1),
  ('Paket Melukis Pouch','Cat 12 Warna',2),
  ('Paket Melukis Pouch','Kuas',2),
  ('Paket Melukis Pouch','Piring Palette',1),
  ('Paket Melukis Cermin','Cermin Hexagon',1),
  ('Paket Melukis Cermin','Cat 12 Warna',2),
  ('Paket Melukis Cermin','Kuas',2),
  ('Paket Melukis Cermin','Piring Palette',1),
  ('Paket Melukis Beruang','Ganci Beruang',1),
  ('Paket Melukis Beruang','Kuas',1),
  ('Paket Melukis Beruang','Piring Palette',1),
  ('Paket Melukis Akrilik','Ganci Akrilik',1),
  ('Paket Melukis Akrilik','Kuas',1),
  ('Paket Melukis Akrilik','Piring Palette',1),
  ('Paket Melukis Patung','Patung Gypsum',1),
  ('Paket Melukis Patung','Cat 12 Warna',2),
  ('Paket Melukis Patung','Kuas',2),
  ('Paket Melukis Patung','Piring Palette',1),
  ('Paket Melukis Gerabah','Gerabah',1),
  ('Paket Melukis Gerabah','Cat 12 Warna',2),
  ('Paket Melukis Gerabah','Kuas',2),
  ('Paket Melukis Gerabah','Piring Palette',1),
  ('Paket Melukis Pot Tanah Liat','Pot Tanah Liat',1),
  ('Paket Melukis Pot Tanah Liat','Cat 12 Warna',2),
  ('Paket Melukis Pot Tanah Liat','Kuas',2),
  ('Paket Melukis Pot Tanah Liat','Piring Palette',1),
  ('Paket Melukis Pot Gypsum','Pot Gypsum',1),
  ('Paket Melukis Pot Gypsum','Cat 12 Warna',2),
  ('Paket Melukis Pot Gypsum','Kuas',2),
  ('Paket Melukis Pot Gypsum','Piring Palette',1),
  ('Paket Melukis Kipas Pola','Kipas Pola',1),
  ('Paket Melukis Kipas Pola','Cat 12 Warna',2),
  ('Paket Melukis Kipas Pola','Kuas',2),
  ('Paket Melukis Kipas Pola','Piring Palette',1),
  ('Paket Melukis Coaster','Coaster Gypsum',1),
  ('Paket Melukis Coaster','Cat 12 Warna',2),
  ('Paket Melukis Coaster','Kuas',2),
  ('Paket Melukis Coaster','Piring Palette',1),
  ('Paket Menghias Cermin','Cermin Kotak',1),
  ('Paket Meronce Manik-Manik','Manik-Manik',1),
  ('Paket Meronce Manik-Manik','Benang',2);

create temp table arayya_product_ids (
  product_name text primary key,
  product_id uuid not null unique
) on commit drop;

create temp table arayya_item_ids (
  item_name text primary key,
  inventory_item_id uuid not null unique
) on commit drop;

do $$
declare
  v_outlet_id uuid;
  v_arayya_id uuid;
  v_lovin_id uuid;
  v_actor_id uuid;
  v_category_id uuid;
  v_product_id uuid;
  v_item_id uuid;
  v_before_categories integer;
  v_before_products integer;
  v_before_items integer;
  v_before_bom integer;
  r record;
begin
  select id into strict v_outlet_id
  from public.outlets
  where lower(btrim(name)) = 'kadirojo' and is_active and deleted_at is null;

  select id into strict v_arayya_id
  from public.business_subunits
  where outlet_id = v_outlet_id and lower(btrim(name)) = 'arayya'
    and is_active and deleted_at is null;

  select id into strict v_lovin_id
  from public.business_subunits
  where outlet_id = v_outlet_id and lower(btrim(name)) = 'lovin milk'
    and is_active and deleted_at is null;

  select id into strict v_actor_id
  from public.profiles
  where role = 'super_admin' and is_active
  order by created_at
  limit 1;

  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_actor_id::text,'role','authenticated')::text,
    true
  );

  select count(*) into v_before_categories
  from public.sales_categories where subunit_id = v_arayya_id and is_active;
  select count(*) into v_before_products
  from public.products p join public.sales_categories c on c.id = p.sales_category_id
  where c.subunit_id = v_arayya_id and p.is_active and p.deleted_at is null;
  select count(*) into v_before_items
  from public.inventory_items
  where subunit_id = v_arayya_id and is_active and deleted_at is null;
  select count(*) into v_before_bom
  from public.product_inventory_requirements pir
  join public.products p on p.id = pir.product_id
  join public.sales_categories c on c.id = p.sales_category_id
  where c.subunit_id = v_arayya_id and p.is_active and p.deleted_at is null;

  raise notice 'Arayya before import: categories=%, products=%, items=%, BOM=%',
    v_before_categories, v_before_products, v_before_items, v_before_bom;

  if (select count(*) from arayya_categories) <> 3
     or (select count(*) from arayya_products) <> 17
     or (select count(*) from arayya_items) <> 21
     or (select count(*) from arayya_bom) <> 59 then
    raise exception 'Arayya source manifest count mismatch.';
  end if;

  if exists (select 1 from arayya_bom where quantity_required <= 0) then
    raise exception 'Arayya BOM manifest contains a non-positive quantity.';
  end if;

  update public.business_subunits
  set inventory_enabled = true, updated_at = clock_timestamp(), updated_by = v_actor_id
  where id = v_arayya_id;

  update public.business_subunits
  set inventory_enabled = false, updated_at = clock_timestamp(), updated_by = v_actor_id
  where id = v_lovin_id;

  insert into public.sales_categories(name, description, subunit_id, is_active, created_by, updated_by)
  select name, 'Kategori penjualan resmi Arayya 2026', v_arayya_id, true, v_actor_id, v_actor_id
  from arayya_categories
  on conflict (subunit_id, lower(name)) do update
  set name = excluded.name,
      description = excluded.description,
      is_active = true,
      updated_by = v_actor_id,
      updated_at = clock_timestamp();

  update public.sales_categories c
  set is_active = false, updated_by = v_actor_id, updated_at = clock_timestamp()
  where c.subunit_id = v_arayya_id
    and not exists (
      select 1 from arayya_categories m where lower(btrim(m.name)) = lower(btrim(c.name))
    );

  for r in select * from arayya_products order by product_name loop
    select p.id into v_product_id
    from public.products p
    join public.sales_categories c on c.id = p.sales_category_id
    where c.subunit_id = v_arayya_id
      and regexp_replace(lower(p.name),'[^a-z0-9]+','','g') =
          regexp_replace(lower(r.product_name),'[^a-z0-9]+','','g')
    order by
      exists(select 1 from public.sales_items si where si.product_id = p.id) desc,
      (p.deleted_at is null) desc,
      p.created_at
    limit 1;

    select id into strict v_category_id
    from public.sales_categories
    where subunit_id = v_arayya_id and lower(name) = lower(r.category_name);

    if v_product_id is null then
      insert into public.products(
        name, sku, unit, selling_price, sales_category_id, is_active, notes,
        created_by, updated_by
      ) values (
        r.product_name, 'ARY-' || upper(substr(md5(r.product_name),1,10)), 'pcs',
        r.selling_price, v_category_id, true,
        'Master resmi Arayya 2026; reference HPP bukan WAC operasional.',
        v_actor_id, v_actor_id
      ) returning id into v_product_id;
    else
      update public.products
      set name = r.product_name,
          sku = 'ARY-' || upper(substr(md5(r.product_name),1,10)),
          unit = 'pcs',
          selling_price = r.selling_price,
          sales_category_id = v_category_id,
          is_active = true,
          deleted_at = null,
          deleted_by = null,
          notes = 'Master resmi Arayya 2026; reference HPP bukan WAC operasional.',
          updated_by = v_actor_id,
          updated_at = clock_timestamp()
      where id = v_product_id;
    end if;

    insert into arayya_product_ids(product_name, product_id)
    values (r.product_name, v_product_id);
    v_product_id := null;
  end loop;

  update public.products p
  set is_active = false,
      deleted_at = coalesce(p.deleted_at, clock_timestamp()),
      deleted_by = coalesce(p.deleted_by, v_actor_id),
      updated_by = v_actor_id,
      updated_at = clock_timestamp()
  from public.sales_categories c
  where c.id = p.sales_category_id
    and c.subunit_id = v_arayya_id
    and not exists (select 1 from arayya_product_ids m where m.product_id = p.id);

  for r in select * from arayya_items order by item_name loop
    select i.id into v_item_id
    from public.inventory_items i
    where i.subunit_id = v_arayya_id
      and regexp_replace(lower(i.name),'[^a-z0-9]+','','g') =
          regexp_replace(lower(r.item_name),'[^a-z0-9]+','','g')
    order by
      exists(select 1 from public.inventory_movements im where im.inventory_item_id = i.id) desc,
      (i.deleted_at is null) desc,
      i.created_at
    limit 1;

    if v_item_id is null then
      insert into public.inventory_items(
        outlet_id, subunit_id, code, name, unit, minimum_stock, is_active, notes,
        created_by, updated_by
      ) values (
        v_outlet_id, v_arayya_id,
        'ARY-' || upper(substr(md5(r.item_name),1,10)),
        r.item_name, 'buah', 0, true,
        'Master komponen resmi Arayya 2026; biaya referensi tidak menjadi WAC.',
        v_actor_id, v_actor_id
      ) returning id into v_item_id;
    else
      update public.inventory_items
      set outlet_id = v_outlet_id,
          subunit_id = v_arayya_id,
          name = r.item_name,
          unit = 'buah',
          is_active = true,
          deleted_at = null,
          deleted_by = null,
          notes = 'Master komponen resmi Arayya 2026; biaya referensi tidak menjadi WAC.',
          updated_by = v_actor_id,
          updated_at = clock_timestamp()
      where id = v_item_id;
    end if;

    insert into public.inventory_cost_states(inventory_item_id)
    values (v_item_id)
    on conflict (inventory_item_id) do nothing;

    insert into arayya_item_ids(item_name, inventory_item_id)
    values (r.item_name, v_item_id);
    v_item_id := null;
  end loop;

  update public.inventory_items i
  set is_active = false,
      deleted_at = coalesce(i.deleted_at, clock_timestamp()),
      deleted_by = coalesce(i.deleted_by, v_actor_id),
      updated_by = v_actor_id,
      updated_at = clock_timestamp()
  where i.subunit_id = v_arayya_id
    and not exists (select 1 from arayya_item_ids m where m.inventory_item_id = i.id);

  delete from public.product_inventory_requirements pir
  using arayya_product_ids p
  where pir.product_id = p.product_id;

  insert into public.product_inventory_requirements(
    product_id, inventory_item_id, quantity_required, created_by, updated_by
  )
  select p.product_id, i.inventory_item_id, b.quantity_required, v_actor_id, v_actor_id
  from arayya_bom b
  join arayya_product_ids p on p.product_name = b.product_name
  join arayya_item_ids i on i.item_name = b.item_name
  on conflict (product_id, inventory_item_id) do update
  set quantity_required = excluded.quantity_required,
      updated_by = v_actor_id,
      updated_at = clock_timestamp();

  if (select count(*) from public.sales_categories
      where subunit_id = v_arayya_id and is_active) <> 3 then
    raise exception 'Active Arayya categories did not reconcile to 3.';
  end if;

  if (select count(*) from public.products p
      join public.sales_categories c on c.id = p.sales_category_id
      where c.subunit_id = v_arayya_id and p.is_active and p.deleted_at is null) <> 17 then
    raise exception 'Active Arayya products did not reconcile to 17.';
  end if;

  if (select count(*) from public.inventory_items
      where subunit_id = v_arayya_id and is_active and deleted_at is null) <> 21 then
    raise exception 'Active Arayya inventory items did not reconcile to 21.';
  end if;

  if (select count(*) from public.product_inventory_requirements pir
      join arayya_product_ids p on p.product_id = pir.product_id) <> 59 then
    raise exception 'Arayya BOM did not reconcile to 59 positive mappings.';
  end if;

  if exists (
    select 1
    from public.product_inventory_requirements pir
    join arayya_product_ids p on p.product_id = pir.product_id
    join public.products pr on pr.id = pir.product_id
    join public.sales_categories c on c.id = pr.sales_category_id
    join public.inventory_items i on i.id = pir.inventory_item_id
    where c.subunit_id <> i.subunit_id
       or c.subunit_id <> v_arayya_id
       or i.deleted_at is not null or not i.is_active
       or pr.deleted_at is not null or not pr.is_active
       or not c.is_active
  ) then
    raise exception 'Arayya BOM ownership or active-master invariant failed.';
  end if;

  if exists (
    select 1
    from arayya_products p
    join arayya_product_ids pi on pi.product_name = p.product_name
    join public.products actual on actual.id = pi.product_id
    where actual.selling_price <> p.selling_price
  ) then
    raise exception 'Arayya selling-price reconciliation failed.';
  end if;

  if exists (
    select 1
    from arayya_products p
    join (
      select b.product_name,
             sum(b.quantity_required * i.reference_unit_cost) as calculated_hpp,
             bool_and(i.reference_unit_cost is not null) as all_costs_known
      from arayya_bom b
      join arayya_items i on i.item_name = b.item_name
      group by b.product_name
    ) calc on calc.product_name = p.product_name
    where (p.reference_hpp is not null and
           (not calc.all_costs_known or calc.calculated_hpp <> p.reference_hpp))
       or (p.product_name = 'Paket Melukis Gerabah' and
           (p.reference_hpp is not null or calc.all_costs_known))
  ) then
    raise exception 'Arayya reference HPP reconciliation failed.';
  end if;

  if exists (
    select 1 from public.business_subunits
    where id = v_arayya_id and not inventory_enabled
  ) or exists (
    select 1 from public.business_subunits
    where id = v_lovin_id and inventory_enabled
  ) then
    raise exception 'Subunit inventory capability reconciliation failed.';
  end if;

  raise notice 'Arayya final import: categories=3, products=17, items=21, BOM=59; no stock or accounting facts created.';
end $$;

commit;
