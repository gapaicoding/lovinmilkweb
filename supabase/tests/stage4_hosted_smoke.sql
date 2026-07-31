-- Hosted Stage 4 smoke. All marked rows are rolled back by the inner exception
-- block before this function returns its evidence JSON.
create or replace function pg_temp.run_stage4_smoke()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_marker constant text := 'STAGE4-SMOKE-20260728-1915';
  v_admin uuid;
  v_staff uuid;
  v_super uuid;
  v_outlet uuid;
  v_subunit uuid;
  v_other_subunit uuid := gen_random_uuid();
  v_category uuid := gen_random_uuid();
  v_other_category uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_other_product uuid := gen_random_uuid();
  v_inactive_product uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_other_item uuid := gen_random_uuid();
  v_unused_item uuid := gen_random_uuid();
  v_opname_negative uuid;
  v_opname_positive uuid;
  v_balance numeric;
  v_failed boolean;
  v_evidence jsonb := '{}'::jsonb;
begin
  select id into strict v_admin from public.profiles where role = 'admin' and is_active limit 1;
  select id into strict v_staff from public.profiles where role = 'staff' and is_active limit 1;
  select id into strict v_super from public.profiles where role = 'super_admin' and is_active limit 1;
  select s.outlet_id, s.id into strict v_outlet, v_subunit
  from public.business_subunits s
  where s.inventory_enabled and s.is_active and s.deleted_at is null
  order by s.created_at limit 1;

  begin
    -- Isolated temporary business masters. The entire block is rolled back.
    insert into public.business_subunits(
      id, outlet_id, code, name, description, inventory_enabled, is_active
    ) values (
      v_other_subunit, v_outlet, v_marker || '-SUB', v_marker || ' Other Subunit',
      v_marker, true, true
    );
    insert into public.sales_categories(id, subunit_id, name, description, is_active)
    values
      (v_category, v_subunit, v_marker || ' Category', v_marker, true),
      (v_other_category, v_other_subunit, v_marker || ' Other Category', v_marker, true);
    insert into public.products(id, sales_category_id, name, sku, unit, selling_price, notes, is_active)
    values
      (v_product, v_category, v_marker || ' Product', v_marker || '-PRODUCT', 'pcs', 1, v_marker, true),
      (v_other_product, v_other_category, v_marker || ' Other Product',
       v_marker || '-OTHER-PRODUCT', 'pcs', 1, v_marker, true),
      (v_inactive_product, v_category, v_marker || ' Inactive Product',
       v_marker || '-INACTIVE-PRODUCT', 'pcs', 1, v_marker, false);

    -- STAFF: operational reads yes; all mutations/RPCs no.
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('role', 'authenticated', true);
    perform count(*) from public.v_inventory_balances;
    perform count(*) from public.inventory_movements;
    perform count(*) from public.product_inventory_requirements;

    v_failed := false;
    begin
      insert into public.inventory_items(
        id, outlet_id, subunit_id, code, name, unit, notes
      ) values (
        gen_random_uuid(), v_outlet, v_subunit, v_marker || '-STAFF',
        v_marker || ' Staff Forbidden', 'pcs', v_marker
      );
    exception when others then v_failed := true;
    end;
    if not v_failed then raise exception 'STAFF inventory insert unexpectedly succeeded'; end if;

    v_failed := false;
    begin
      perform public.create_inventory_adjustment(v_item, 1, v_marker, now());
    exception when others then v_failed := true;
    end;
    if not v_failed then raise exception 'STAFF adjustment unexpectedly succeeded'; end if;

    v_failed := false;
    begin
      perform public.post_stock_opname(
        v_outlet, v_subunit, current_date, '[]'::jsonb, v_marker
      );
    exception when others then v_failed := true;
    end;
    if not v_failed then raise exception 'STAFF opname unexpectedly succeeded'; end if;

    v_failed := false;
    begin
      insert into public.product_inventory_requirements(
        product_id, inventory_item_id, quantity_required
      ) values(v_product, v_item, 1);
    exception when others then v_failed := true;
    end;
    if not v_failed then raise exception 'STAFF BOM mutation unexpectedly succeeded'; end if;

    -- ADMIN: create/edit/archive, adjustment, opname and BOM management.
    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform set_config('role', 'authenticated', true);
    insert into public.inventory_items(
      id, outlet_id, subunit_id, code, name, unit, minimum_stock, notes,
      created_by, updated_by
    ) values
      (v_item, v_outlet, v_subunit, v_marker || '-ITEM', v_marker || ' Item',
       'pcs', 0, v_marker, v_admin, v_admin),
      (v_other_item, v_outlet, v_other_subunit, v_marker || '-CROSS',
       v_marker || ' Cross Item', 'pcs', 0, v_marker, v_admin, v_admin),
      (v_unused_item, v_outlet, v_subunit, v_marker || '-UNUSED',
       v_marker || ' Unused Item', 'pcs', 0, v_marker, v_admin, v_admin);
    update public.inventory_items set name = v_marker || ' Item Edited', updated_by = v_admin
    where id = v_item;

    perform public.create_inventory_adjustment(v_item, 10, v_marker || ' IN +10', now());
    select current_stock into v_balance from public.v_inventory_balances
    where inventory_item_id = v_item;
    if v_balance <> 10 then raise exception 'Adjustment +10 balance %, expected 10', v_balance; end if;
    perform public.create_inventory_adjustment(v_item, -3, v_marker || ' OUT -3', now());
    select current_stock into v_balance from public.v_inventory_balances
    where inventory_item_id = v_item;
    if v_balance <> 7 then raise exception 'Adjustment -3 balance %, expected 7', v_balance; end if;

    insert into public.product_inventory_requirements(
      product_id, inventory_item_id, quantity_required, created_by, updated_by
    ) values(v_product, v_item, 1, v_admin, v_admin);
    update public.product_inventory_requirements
    set quantity_required = 1.5, updated_by = v_admin
    where product_id = v_product and inventory_item_id = v_item;

    -- STAFF cannot edit/archive/delete an existing active item.
    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    perform set_config('role', 'authenticated', true);
    update public.inventory_items set name = v_marker || ' STAFF FORBIDDEN' where id = v_item;
    if exists (
      select 1 from public.inventory_items
      where id = v_item and name = v_marker || ' STAFF FORBIDDEN'
    ) then raise exception 'STAFF edit unexpectedly succeeded'; end if;
    v_failed := false;
    begin
      perform public.archive_inventory_item(v_item);
    exception when others then v_failed := true;
    end;
    if not v_failed then raise exception 'STAFF archive unexpectedly succeeded'; end if;
    delete from public.inventory_items where id = v_item;
    if not exists (select 1 from public.inventory_items where id = v_item)
      then raise exception 'STAFF hard delete unexpectedly succeeded'; end if;

    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform set_config('role', 'authenticated', true);

    v_failed := false;
    begin
      insert into public.product_inventory_requirements(product_id, inventory_item_id, quantity_required)
      values(v_product, v_other_item, 1);
    exception when sqlstate '23514' then v_failed := true;
    end;
    if not v_failed then raise exception 'Cross-Subunit BOM unexpectedly succeeded'; end if;

    v_failed := false;
    begin
      insert into public.product_inventory_requirements(product_id, inventory_item_id, quantity_required)
      values(v_inactive_product, v_item, 1);
    exception when sqlstate '23514' then v_failed := true;
    end;
    if not v_failed then raise exception 'Inactive Product BOM unexpectedly succeeded'; end if;

    update public.inventory_items
    set is_active = false, updated_by = v_admin where id = v_other_item;
    v_failed := false;
    begin
      insert into public.product_inventory_requirements(product_id, inventory_item_id, quantity_required)
      values(v_product, v_other_item, 1);
    exception when sqlstate '23514' then v_failed := true;
    end;
    if not v_failed then raise exception 'Inactive Inventory Item BOM unexpectedly succeeded'; end if;

    perform set_config('role', 'none', true);
    update public.sales_categories set is_active = false where id = v_category;
    perform set_config('role', 'authenticated', true);
    v_failed := false;
    begin
      insert into public.product_inventory_requirements(product_id, inventory_item_id, quantity_required)
      values(v_product, v_unused_item, 1);
    exception when sqlstate '23514' then v_failed := true;
    end;
    if not v_failed then raise exception 'Inactive Category BOM unexpectedly succeeded'; end if;
    perform set_config('role', 'none', true);
    update public.business_subunits set is_active = false where id = v_other_subunit;
    perform set_config('role', 'authenticated', true);
    v_failed := false;
    begin
      insert into public.product_inventory_requirements(product_id, inventory_item_id, quantity_required)
      values(v_other_product, v_other_item, 1);
    exception when sqlstate '23514' then v_failed := true;
    end;
    if not v_failed then raise exception 'Inactive Subunit BOM unexpectedly succeeded'; end if;

    v_opname_negative := public.post_stock_opname(
      v_outlet, v_subunit, current_date,
      jsonb_build_array(jsonb_build_object(
        'inventory_item_id', v_item, 'physical_quantity', 5
      )), v_marker || ' negative variance'
    );
    select current_stock into v_balance from public.v_inventory_balances
    where inventory_item_id = v_item;
    if v_balance <> 5 then raise exception 'Negative opname balance %, expected 5', v_balance; end if;
    if not exists (
      select 1 from public.stock_opname_items
      where stock_opname_id = v_opname_negative
        and system_quantity = 7 and physical_quantity = 5 and variance = -2
    ) then raise exception 'Negative opname snapshot mismatch'; end if;

    v_opname_positive := public.post_stock_opname(
      v_outlet, v_subunit, current_date,
      jsonb_build_array(jsonb_build_object(
        'inventory_item_id', v_item, 'physical_quantity', 8
      )), v_marker || ' positive variance'
    );
    select current_stock into v_balance from public.v_inventory_balances
    where inventory_item_id = v_item;
    if v_balance <> 8 then raise exception 'Positive opname balance %, expected 8', v_balance; end if;
    if not exists (
      select 1 from public.stock_opname_items
      where stock_opname_id = v_opname_positive
        and system_quantity = 5 and physical_quantity = 8 and variance = 3
    ) then raise exception 'Positive opname snapshot mismatch'; end if;

    -- Admin cannot restore, hard-delete, or void.
    perform public.archive_inventory_item(v_unused_item);
    -- RLS can reject these either with an error or a zero-row no-op because
    -- archived rows are intentionally invisible to Admin. Super assertions
    -- below prove the archived row was neither restored nor deleted.
    update public.inventory_items set deleted_at = null, deleted_by = null, updated_by = v_admin
    where id = v_unused_item;
    delete from public.inventory_items where id = v_unused_item;
    v_failed := false;
    begin
      perform public.void_stock_opname(v_opname_positive);
    exception when others then v_failed := true;
    end;
    if not v_failed then raise exception 'ADMIN void unexpectedly succeeded'; end if;

    -- SUPER ADMIN: archived visibility, restore/delete and void.
    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claim.sub', v_super::text, true);
    perform set_config('role', 'authenticated', true);
    if not exists (select 1 from public.inventory_items where id = v_unused_item and deleted_at is not null)
      then raise exception 'SUPER archived visibility failed'; end if;
    update public.inventory_items set deleted_at = null, deleted_by = null, updated_by = v_super
    where id = v_unused_item;
    perform public.archive_inventory_item(v_unused_item);
    delete from public.inventory_items where id = v_unused_item;
    if exists (select 1 from public.inventory_items where id = v_unused_item)
      then raise exception 'SUPER unused hard delete failed'; end if;

    perform public.void_stock_opname(v_opname_positive);
    select current_stock into v_balance from public.v_inventory_balances
    where inventory_item_id = v_item;
    if v_balance <> 5 then raise exception 'Void balance %, expected 5', v_balance; end if;
    if not exists (
      select 1 from public.stock_opnames where id = v_opname_positive and status = 'voided'
    ) then raise exception 'Void source state mismatch'; end if;
    if not exists (
      select 1 from public.inventory_movements
      where source_id = v_opname_positive and source_type = 'stock_opname'
        and quantity_delta = 3 and is_reversed and reversed_at is not null
    ) then raise exception 'Void ledger state mismatch'; end if;

    -- Used/historical item remains protected by FK RESTRICT.
    perform public.archive_inventory_item(v_item);
    v_failed := false;
    begin
      delete from public.inventory_items where id = v_item;
    exception when foreign_key_violation then v_failed := true;
    end;
    if not v_failed then raise exception 'Historical Inventory Item hard delete unexpectedly succeeded'; end if;

    v_evidence := jsonb_build_object(
      'marker', v_marker,
      'staff_read', 'PASS',
      'staff_mutations_rejected', 'PASS',
      'admin_capabilities', 'PASS',
      'super_capabilities', 'PASS',
      'adjustment', jsonb_build_object('initial', 0, 'after_in', 10, 'after_out', 7),
      'opname_negative', jsonb_build_object('before', 7, 'physical', 5, 'variance', -2, 'after', 5),
      'opname_positive', jsonb_build_object('before', 5, 'physical', 8, 'variance', 3, 'after', 8),
      'void', jsonb_build_object('before', 8, 'after', 5, 'source', 'voided', 'ledger', 'reversed'),
      'bom_same_subunit', 'PASS',
      'bom_cross_subunit_rejected', 'PASS',
      'bom_inactive_product_rejected', 'PASS',
      'bom_inactive_item_rejected', 'PASS',
      'bom_inactive_category_rejected', 'PASS',
      'bom_inactive_subunit_rejected', 'PASS',
      'historical_hard_delete_rejected', 'PASS'
    );

    -- Deliberately roll back every temporary row while retaining v_evidence.
    raise exception 'stage4_smoke_rollback' using errcode = 'P4004';
  exception when sqlstate 'P4004' then
    null;
  end;

  perform set_config('role', 'none', true);
  v_evidence := v_evidence || jsonb_build_object(
    'cleanup_remaining_rows', (
      select count(*) from (
        select id from public.inventory_items where code like v_marker || '%'
        union all select id from public.products where sku like v_marker || '%'
        union all select id from public.business_subunits where code like v_marker || '%'
        union all select id from public.stock_opnames where notes like v_marker || '%'
      ) leftovers
    )
  );
  return v_evidence;
end;
$$;

select pg_temp.run_stage4_smoke() as stage4_smoke_result;
