-- Hosted Stage 5 accounting smoke.
-- All STAGE5-SMOKE rows live inside an exception subtransaction and are rolled
-- back before the evidence JSON is returned.
create or replace function pg_temp.run_stage5_smoke()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_marker constant text := 'STAGE5-SMOKE-20260729-1600';
  v_admin uuid;
  v_staff uuid;
  v_super uuid;
  v_outlet uuid;
  v_subunit uuid;
  v_category uuid := gen_random_uuid();
  v_other_subunit uuid := gen_random_uuid();
  v_other_category uuid := gen_random_uuid();
  v_other_product uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_item_x uuid := gen_random_uuid();
  v_item_y uuid := gen_random_uuid();
  v_no_cost_item uuid := gen_random_uuid();
  v_lifecycle_item uuid := gen_random_uuid();
  v_negative_item uuid := gen_random_uuid();
  v_other_item uuid := gen_random_uuid();
  v_purchase_1 uuid;
  v_purchase_2 uuid;
  v_sale uuid;
  v_provisional_sale uuid;
  v_lifecycle_purchase uuid;
  v_negative_sale uuid;
  v_mixed_sale uuid;
  v_safe_hard_delete_sale uuid;
  v_qty numeric;
  v_value numeric;
  v_wac numeric;
  v_hpp numeric;
  v_status text;
  v_failed boolean;
  v_error text;
  v_seq_1 bigint;
  v_seq_2 bigint;
  v_legacy_invoices bigint;
  v_legacy_items bigint;
  v_evidence jsonb := '{}'::jsonb;
begin
  select count(*) into v_legacy_invoices from public.purchase_invoices;
  select count(*) into v_legacy_items from public.purchase_items;
  select id into strict v_admin from public.profiles where role='admin' and is_active limit 1;
  select id into strict v_staff from public.profiles where role='staff' and is_active limit 1;
  select id into strict v_super from public.profiles where role='super_admin' and is_active limit 1;
  select outlet_id,id into strict v_outlet,v_subunit
  from public.business_subunits
  where inventory_enabled and is_active and deleted_at is null
  order by created_at limit 1;

  begin
    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('role','none',true);

    -- Active isolated masters.
    insert into public.business_subunits(
      id,outlet_id,code,name,description,inventory_enabled,is_active
    ) values(v_other_subunit,v_outlet,v_marker||'-SUB2',v_marker||' Subunit 2',v_marker,true,true);
    insert into public.sales_categories(id,subunit_id,name,description,is_active)
    values
      (v_category,v_subunit,v_marker||' Category',v_marker,true),
      (v_other_category,v_other_subunit,v_marker||' Category 2',v_marker,true);
    insert into public.products(id,sales_category_id,name,sku,unit,selling_price,notes,is_active)
    values
      (v_product,v_category,v_marker||' Product',v_marker||'-PRODUCT','pcs',25000,v_marker,true),
      (v_other_product,v_other_category,v_marker||' Product 2',v_marker||'-PRODUCT2','pcs',10000,v_marker,true);
    insert into public.inventory_items(
      id,outlet_id,subunit_id,code,name,unit,minimum_stock,notes,created_by,updated_by
    ) values
      (v_item_x,v_outlet,v_subunit,v_marker||'-X',v_marker||' Item X','pcs',0,v_marker,v_admin,v_admin),
      (v_item_y,v_outlet,v_subunit,v_marker||'-Y',v_marker||' Item Y','pcs',0,v_marker,v_admin,v_admin),
      (v_no_cost_item,v_outlet,v_subunit,v_marker||'-ZERO',v_marker||' No Cost','pcs',0,v_marker,v_admin,v_admin),
      (v_lifecycle_item,v_outlet,v_subunit,v_marker||'-LIFE',v_marker||' Lifecycle','pcs',0,v_marker,v_admin,v_admin),
      (v_negative_item,v_outlet,v_subunit,v_marker||'-NEG',v_marker||' Negative WAC','pcs',0,v_marker,v_admin,v_admin),
      (v_other_item,v_outlet,v_other_subunit,v_marker||'-OTHER',v_marker||' Other Subunit Item','pcs',0,v_marker,v_admin,v_admin);

    -- Staff can read but cannot mutate through RPC or raw writes.
    perform set_config('request.jwt.claim.sub',v_staff::text,true);
    perform set_config('role','authenticated',true);
    perform count(*) from public.purchase_transactions;
    perform count(*) from public.v_inventory_cost_balances;
    v_failed:=false;
    begin
      perform public.create_purchase_transaction(
        current_date,jsonb_build_array(jsonb_build_object(
          'inventory_item_id',v_item_x,'quantity',1,'unit_cost',1
        )),null,null,v_marker,v_outlet
      );
    exception when others then v_failed:=true; end;
    if not v_failed then raise exception 'STAFF purchase mutation unexpectedly succeeded'; end if;
    v_failed:=false;
    begin
      insert into public.purchase_transactions(
        outlet_id,transaction_number,purchase_date,created_by,updated_by
      ) values(v_outlet,v_marker||'-RAW',current_date,v_staff,v_staff);
    exception when others then v_failed:=true; end;
    if not v_failed then raise exception 'STAFF raw write unexpectedly succeeded'; end if;

    perform set_config('role','none',true);
    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    perform set_config('role','authenticated',true);

    -- Positive WAC: 10@5k then 10@15k.
    v_purchase_1:=public.create_purchase_transaction(
      current_date-2,
      jsonb_build_array(jsonb_build_object(
        'inventory_item_id',v_item_x,'quantity',10,'unit_cost',5000
      )),null,v_marker||'-INV-1',v_marker,v_outlet
    );
    select on_hand_quantity,inventory_value,current_wac
    into v_qty,v_value,v_wac from public.inventory_cost_states where inventory_item_id=v_item_x;
    if (v_qty,v_value,v_wac) is distinct from (10::numeric,50000::numeric,5000::numeric)
      then raise exception 'WAC purchase 1 mismatch: %, %, %',v_qty,v_value,v_wac; end if;

    v_purchase_2:=public.create_purchase_transaction(
      current_date-1,
      jsonb_build_array(
        jsonb_build_object('inventory_item_id',v_item_x,'quantity',10,'unit_cost',15000),
        jsonb_build_object('inventory_item_id',v_item_y,'quantity',2,'unit_cost',7500)
      ),null,v_marker||'-INV-2',v_marker,v_outlet
    );
    select on_hand_quantity,inventory_value,current_wac
    into v_qty,v_value,v_wac from public.inventory_cost_states where inventory_item_id=v_item_x;
    if (v_qty,v_value,v_wac) is distinct from (20::numeric,200000::numeric,10000::numeric)
      then raise exception 'Positive WAC mismatch: %, %, %',v_qty,v_value,v_wac; end if;
    if (select total_amount from public.purchase_transactions where id=v_purchase_2) <> 165000
      then raise exception 'Server purchase total mismatch'; end if;
    if not exists(
      select 1 from public.inventory_movements m
      join public.purchase_transaction_items i on i.id=m.source_line_id
      where m.source_type='purchase' and m.source_id=v_purchase_2
        and i.purchase_transaction_id=v_purchase_2 and m.unit_cost is not null
        and m.value_delta is not null
    ) then raise exception 'Purchase ledger traceability missing'; end if;

    -- Same-date operations are ordered by the database sequence.
    select posting_sequence into v_seq_1 from public.inventory_movements
    where source_id=v_purchase_2 and inventory_item_id=v_item_x and not is_reversed;
    perform public.create_purchase_transaction(
      current_date-1,jsonb_build_array(jsonb_build_object(
        'inventory_item_id',v_item_y,'quantity',1,'unit_cost',7500
      )),null,v_marker||'-SAME-DATE',v_marker,v_outlet
    );
    select max(posting_sequence) into v_seq_2 from public.inventory_movements
    where inventory_item_id=v_item_y and effective_date=current_date-1 and not is_reversed;
    if v_seq_2 <= v_seq_1 then raise exception 'Same-date posting order is not monotonic'; end if;

    -- Purchase update/archive/restore reconciliation on an isolated timeline.
    v_lifecycle_purchase:=public.create_purchase_transaction(
      current_date,jsonb_build_array(jsonb_build_object(
        'inventory_item_id',v_lifecycle_item,'quantity',10,'unit_cost',5000
      )),null,v_marker||'-LIFECYCLE',v_marker,v_outlet
    );
    perform public.update_purchase_transaction(
      v_lifecycle_purchase,current_date,jsonb_build_array(jsonb_build_object(
        'inventory_item_id',v_lifecycle_item,'quantity',6,'unit_cost',5000
      )),null,v_marker||'-LIFECYCLE',v_marker
    );
    if (select on_hand_quantity from public.inventory_cost_states
        where inventory_item_id=v_lifecycle_item)<>6
      or (select total_amount from public.purchase_transactions where id=v_lifecycle_purchase)<>30000
      then raise exception 'Purchase update reconciliation mismatch'; end if;
    perform public.soft_delete_purchase_transaction(v_lifecycle_purchase);
    if (select on_hand_quantity from public.inventory_cost_states
        where inventory_item_id=v_lifecycle_item)<>0
      then raise exception 'Purchase archive did not reverse stock'; end if;
    v_failed:=false;
    begin perform public.restore_purchase_transaction(v_lifecycle_purchase);
    exception when others then v_failed:=true; end;
    if not v_failed then raise exception 'ADMIN purchase restore unexpectedly succeeded'; end if;
    perform set_config('role','none',true);
    perform set_config('request.jwt.claim.sub',v_super::text,true);
    perform set_config('role','authenticated',true);
    perform public.restore_purchase_transaction(v_lifecycle_purchase);
    if (select on_hand_quantity from public.inventory_cost_states
        where inventory_item_id=v_lifecycle_item)<>6
      then raise exception 'Purchase restore duplicated/missed stock'; end if;
    perform public.soft_delete_purchase_transaction(v_lifecycle_purchase);
    v_failed:=false;
    begin perform public.hard_delete_purchase_transaction(v_lifecycle_purchase);
    exception when foreign_key_violation then v_failed:=true; end;
    if not v_failed then raise exception 'Historical purchase hard delete unexpectedly succeeded'; end if;
    perform public.restore_purchase_transaction(v_lifecycle_purchase);
    perform set_config('role','none',true);
    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    perform set_config('role','authenticated',true);

    -- BOM and final historical HPP.
    insert into public.product_inventory_requirements(
      product_id,inventory_item_id,quantity_required,created_by,updated_by
    ) values(v_product,v_item_x,1,v_admin,v_admin);
    v_sale:=public.create_sales_transaction(
      current_date,
      jsonb_build_array(jsonb_build_object(
        'product_id',v_product,'quantity',2,'unit_price',25000
      )),v_marker,'manual',v_outlet
    );
    select hpp_amount,hpp_status into v_hpp,v_status from public.sales_items
    where sales_transaction_id=v_sale;
    if v_hpp<>20000 or v_status<>'final' then
      raise exception 'Persisted HPP mismatch: %, %',v_hpp,v_status; end if;
    if (select total_amount from public.sales_transactions where id=v_sale)<>50000
      then raise exception 'Revenue mismatch'; end if;
    if (select total_amount-sum(hpp_amount) from public.sales_transactions
        join public.sales_items on sales_transaction_id=sales_transactions.id
        where sales_transactions.id=v_sale group by total_amount)<>30000
      then raise exception 'Gross profit mismatch'; end if;
    if (select on_hand_quantity from public.inventory_cost_states where inventory_item_id=v_item_x)<>18
      then raise exception 'Sale stock consumption mismatch'; end if;

    -- BOM change does not rewrite old component/HPP.
    update public.product_inventory_requirements set quantity_required=2,updated_by=v_admin
    where product_id=v_product and inventory_item_id=v_item_x;
    if (select hpp_amount from public.sales_items where sales_transaction_id=v_sale)<>20000
      or (select consumed_quantity from public.sales_item_inventory_costs
          where sales_transaction_id=v_sale and reversed_at is null)<>2
      then raise exception 'Historical HPP changed after BOM edit'; end if;

    -- Sale update is allowed while it is the latest activity and replaces effect.
    perform public.update_sales_transaction(
      v_sale,current_date,
      jsonb_build_array(jsonb_build_object(
        'product_id',v_product,'quantity',3,'unit_price',25000
      )),v_marker
    );
    if (select on_hand_quantity from public.inventory_cost_states where inventory_item_id=v_item_x)<>14
      then raise exception 'Sales update contribution duplicated'; end if;
    if (select count(*) from public.inventory_movements
        where source_type='sale' and source_id=v_sale and not is_reversed)<>1
      then raise exception 'Sales update active ledger duplication'; end if;

    -- Soft delete and restore are exact once.
    perform public.soft_delete_sales_transaction(v_sale);
    if (select on_hand_quantity from public.inventory_cost_states where inventory_item_id=v_item_x)<>20
      then raise exception 'Sales archive did not reverse stock'; end if;
    perform set_config('role','none',true);
    perform set_config('request.jwt.claim.sub',v_super::text,true);
    perform set_config('role','authenticated',true);
    perform public.restore_sales_transaction(v_sale);
    if (select on_hand_quantity from public.inventory_cost_states where inventory_item_id=v_item_x)<>14
      then raise exception 'Sales restore duplicated/missed stock'; end if;

    -- A later purchase closes the earlier sale and purchase timeline.
    perform set_config('role','none',true);
    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    perform set_config('role','authenticated',true);
    perform public.create_purchase_transaction(
      current_date,jsonb_build_array(jsonb_build_object(
        'inventory_item_id',v_item_x,'quantity',1,'unit_cost',12000
      )),null,v_marker||'-LATER',v_marker,v_outlet
    );
    v_failed:=false; v_error:=null;
    begin
      perform public.update_sales_transaction(
        v_sale,current_date,jsonb_build_array(jsonb_build_object(
          'product_id',v_product,'quantity',1,'unit_price',25000
        )),v_marker
      );
    exception when others then v_failed:=true; v_error:=sqlerrm; end;
    if not v_failed or position('aktivitas stok/HPP yang lebih baru' in coalesce(v_error,''))=0
      then raise exception 'Closed timeline sale update was not rejected: %',v_error; end if;
    v_failed:=false;
    begin perform public.soft_delete_purchase_transaction(v_purchase_1);
    exception when others then v_failed:=true; end;
    if not v_failed then raise exception 'Closed timeline purchase archive unexpectedly succeeded'; end if;
    v_failed:=false;
    begin
      perform public.create_purchase_transaction(
        current_date-5,jsonb_build_array(jsonb_build_object(
          'inventory_item_id',v_item_x,'quantity',1,'unit_cost',1
        )),null,v_marker||'-BACKDATED',v_marker,v_outlet
      );
    exception when others then v_failed:=true; end;
    if not v_failed then raise exception 'Backdated purchase unexpectedly succeeded'; end if;

    -- Established WAC remains the basis while stock becomes negative.
    delete from public.product_inventory_requirements where product_id=v_product;
    perform public.create_purchase_transaction(
      current_date,jsonb_build_array(jsonb_build_object(
        'inventory_item_id',v_negative_item,'quantity',1,'unit_cost',5000
      )),null,v_marker||'-NEG-COST',v_marker,v_outlet
    );
    insert into public.product_inventory_requirements(
      product_id,inventory_item_id,quantity_required,created_by,updated_by
    ) values(v_product,v_negative_item,1,v_admin,v_admin);
    v_negative_sale:=public.create_sales_transaction(
      current_date,jsonb_build_array(jsonb_build_object(
        'product_id',v_product,'quantity',3,'unit_price',25000
      )),v_marker||' negative final','manual',v_outlet
    );
    if (select on_hand_quantity from public.inventory_cost_states
        where inventory_item_id=v_negative_item)<>-2
      or (select hpp_amount from public.sales_items where sales_transaction_id=v_negative_sale)<>15000
      or (select hpp_status from public.sales_items where sales_transaction_id=v_negative_sale)<>'final'
      then raise exception 'Established-WAC negative consumption mismatch'; end if;

    -- No basis => HPP zero and explicitly provisional.
    delete from public.product_inventory_requirements where product_id=v_product;
    insert into public.product_inventory_requirements(
      product_id,inventory_item_id,quantity_required,created_by,updated_by
    ) values(v_product,v_no_cost_item,1,v_admin,v_admin);
    v_provisional_sale:=public.create_sales_transaction(
      current_date,jsonb_build_array(jsonb_build_object(
        'product_id',v_product,'quantity',2,'unit_price',25000
      )),v_marker||' provisional','manual',v_outlet
    );
    select hpp_amount,hpp_status into v_hpp,v_status from public.sales_items
    where sales_transaction_id=v_provisional_sale;
    if v_hpp<>0 or v_status<>'provisional' then
      raise exception 'No-basis provisional HPP mismatch: %, %',v_hpp,v_status; end if;
    if (select on_hand_quantity from public.inventory_cost_states where inventory_item_id=v_no_cost_item)<>-2
      then raise exception 'Negative stock was clamped'; end if;
    perform public.create_purchase_transaction(
      current_date,jsonb_build_array(jsonb_build_object(
        'inventory_item_id',v_no_cost_item,'quantity',1,'unit_cost',8000
      )),null,v_marker||'-STILL-NEGATIVE',v_marker,v_outlet
    );
    select on_hand_quantity,current_wac into v_qty,v_wac from public.inventory_cost_states
    where inventory_item_id=v_no_cost_item;
    if v_qty<>-1 or v_wac is not null then
      raise exception 'Negative-to-negative receipt policy mismatch: %, %',v_qty,v_wac; end if;
    perform public.create_purchase_transaction(
      current_date,jsonb_build_array(jsonb_build_object(
        'inventory_item_id',v_no_cost_item,'quantity',10,'unit_cost',8000
      )),null,v_marker||'-RESTORE-POSITIVE',v_marker,v_outlet
    );
    select on_hand_quantity,current_wac,inventory_value into v_qty,v_wac,v_value
    from public.inventory_cost_states where inventory_item_id=v_no_cost_item;
    if (v_qty,v_wac,v_value) is distinct from (9::numeric,8000::numeric,72000::numeric)
      then raise exception 'Negative-to-positive reset mismatch: %, %, %',v_qty,v_wac,v_value; end if;
    if (select hpp_amount from public.sales_items where sales_transaction_id=v_provisional_sale)<>0
      or (select hpp_status from public.sales_items where sales_transaction_id=v_provisional_sale)<>'provisional'
      then raise exception 'Later purchase repriced provisional sale'; end if;

    -- Mixed-Subunit purchase and Stage 2 sale remain item-attributed.
    perform public.create_purchase_transaction(
      current_date,jsonb_build_array(
        jsonb_build_object('inventory_item_id',v_no_cost_item,'quantity',1,'unit_cost',8000),
        jsonb_build_object('inventory_item_id',v_other_item,'quantity',2,'unit_cost',3000)
      ),null,v_marker||'-MIXED-PURCHASE',v_marker,v_outlet
    );
    if (select count(distinct i.subunit_id) from public.purchase_transaction_items i
        join public.purchase_transactions p on p.id=i.purchase_transaction_id
        where p.external_invoice_number=v_marker||'-MIXED-PURCHASE' and i.is_current)<>2
      then raise exception 'Mixed-Subunit purchase attribution failed'; end if;
    v_mixed_sale:=public.create_sales_transaction(
      current_date,jsonb_build_array(
        jsonb_build_object('product_id',v_product,'quantity',1,'unit_price',25000),
        jsonb_build_object('product_id',v_other_product,'quantity',1,'unit_price',10000)
      ),v_marker||' mixed sale','manual',v_outlet
    );
    if (select count(distinct subunit_id) from public.sales_items
        where sales_transaction_id=v_mixed_sale)<>2
      or (select count(*) from public.sales_item_inventory_costs
          where sales_transaction_id=v_mixed_sale and reversed_at is null)<>1
      then raise exception 'Mixed-Subunit sale/BOM behavior failed'; end if;

    -- Stage 2 hard delete remains available when no inventory/HPP dependency exists.
    v_safe_hard_delete_sale:=public.create_sales_transaction(
      current_date,jsonb_build_array(jsonb_build_object(
        'product_id',v_other_product,'quantity',1,'unit_price',10000
      )),v_marker||' safe hard delete','manual',v_outlet
    );
    perform public.soft_delete_sales_transaction(v_safe_hard_delete_sale);
    perform set_config('role','none',true);
    perform set_config('request.jwt.claim.sub',v_super::text,true);
    perform set_config('role','authenticated',true);
    v_failed:=public.hard_delete_sales_transaction(v_safe_hard_delete_sale);
    if not v_failed
      or exists(select 1 from public.sales_items where sales_transaction_id=v_safe_hard_delete_sale)
      or exists(select 1 from public.sales_item_inventory_costs where sales_transaction_id=v_safe_hard_delete_sale)
      then raise exception 'Accounting-safe Stage 2 hard delete failed: result %, header %, items %, costs %',
        v_failed,
        exists(select 1 from public.sales_transactions where id=v_safe_hard_delete_sale),
        exists(select 1 from public.sales_items where sales_transaction_id=v_safe_hard_delete_sale),
        exists(select 1 from public.sales_item_inventory_costs where sales_transaction_id=v_safe_hard_delete_sale);
    end if;
    perform set_config('role','none',true);
    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    perform set_config('role','authenticated',true);

    -- Role lifecycle restrictions.
    perform set_config('role','none',true);
    perform set_config('request.jwt.claim.sub',v_staff::text,true);
    perform set_config('role','authenticated',true);
    v_failed:=false;
    begin perform public.soft_delete_purchase_transaction(v_purchase_2);
    exception when others then v_failed:=true; end;
    if not v_failed then raise exception 'STAFF archive purchase unexpectedly succeeded'; end if;

    v_evidence:=jsonb_build_object(
      'marker',v_marker,
      'positive_wac','PASS',
      'server_total','PASS',
      'purchase_traceability','PASS',
      'same_date_order','effective_date + posting_sequence PASS',
      'sales_consumption','PASS',
      'persisted_hpp','PASS',
      'gross_profit','PASS',
      'bom_historical_stability','PASS',
      'sales_update_reconciliation','PASS',
      'sales_archive_restore','PASS',
      'purchase_update_reconciliation','PASS',
      'purchase_archive_restore','PASS',
      'historical_purchase_hard_delete_rejected','PASS',
      'closed_timeline','PASS',
      'negative_stock','PASS',
      'negative_stock_established_wac','PASS',
      'provisional_hpp','PASS',
      'no_retroactive_repricing','PASS',
      'negative_to_negative','PASS',
      'negative_to_positive_reset','PASS',
      'staff_enforcement','PASS'
      ,'mixed_subunit_purchase','PASS'
      ,'mixed_subunit_sale','PASS'
      ,'stage2_safe_hard_delete','PASS'
    );
    raise exception 'stage5_smoke_rollback' using errcode='P5005';
  exception when sqlstate 'P5005' then null;
  end;

  perform set_config('role','none',true);
  if (select count(*) from public.purchase_invoices)<>v_legacy_invoices
    or (select count(*) from public.purchase_items)<>v_legacy_items then
    raise exception 'Legacy purchase counts changed';
  end if;
  v_evidence:=v_evidence||jsonb_build_object(
    'legacy_purchase_invoices',v_legacy_invoices,
    'legacy_purchase_items',v_legacy_items,
    'cleanup_remaining_rows',(
      select count(*) from (
        select id from public.purchase_transactions where transaction_number like v_marker||'%'
        union all select id from public.inventory_items where code like v_marker||'%'
        union all select id from public.products where sku like v_marker||'%'
        union all select id from public.sales_transactions where notes like v_marker||'%'
      ) x
    )
  );
  return v_evidence;
end;
$$;

select pg_temp.run_stage5_smoke() as stage5_smoke_result;
