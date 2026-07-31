-- Stage 4 hotfix: new BOM mappings require active current master data.

create or replace function public.lm_validate_bom_ownership()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  v_product_subunit uuid;
  v_item_subunit uuid;
begin
  select c.subunit_id
    into v_product_subunit
  from public.products p
  join public.sales_categories c
    on c.id = p.sales_category_id
  join public.business_subunits s
    on s.id = c.subunit_id
  where p.id = new.product_id
    and p.deleted_at is null
    and p.is_active
    and c.is_active
    and s.deleted_at is null
    and s.is_active;

  select i.subunit_id
    into v_item_subunit
  from public.inventory_items i
  where i.id = new.inventory_item_id
    and i.deleted_at is null
    and i.is_active;

  if v_product_subunit is null or v_item_subunit is null then
    raise exception 'Product dan Inventory Item harus aktif untuk requirement baru.'
      using errcode = '23514';
  end if;

  if v_product_subunit <> v_item_subunit then
    raise exception 'Inventory Item harus berasal dari Subunit yang sama dengan Product.'
      using errcode = '23514';
  end if;

  return new;
end $$;

revoke all on function public.lm_validate_bom_ownership() from public;
