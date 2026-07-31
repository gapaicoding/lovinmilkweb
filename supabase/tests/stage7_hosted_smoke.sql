-- Stage 7 hosted smoke. All STAGE7-SMOKE fixtures are rolled back deliberately.
-- Execute as one SQL Editor/Management API session.
set search_path = public, extensions, pg_temp;

create or replace function pg_temp.run_stage7_smoke()
returns jsonb language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_marker constant text := 'STAGE7-SMOKE-20260731';
  v_admin uuid; v_staff uuid; v_super uuid;
  v_outlet uuid:=gen_random_uuid(); v_sub_a uuid:=gen_random_uuid(); v_sub_b uuid:=gen_random_uuid();
  v_sales_cat_a uuid:=gen_random_uuid(); v_sales_cat_b uuid:=gen_random_uuid();
  v_product_a uuid:=gen_random_uuid(); v_product_b uuid:=gen_random_uuid();
  v_cost_shared uuid:=gen_random_uuid(); v_cost_direct uuid:=gen_random_uuid();
  v_cost_inactive uuid:=gen_random_uuid(); v_asset_category uuid:=gen_random_uuid();
  v_asset uuid;
  v_sale_one uuid:=gen_random_uuid(); v_sale_two uuid:=gen_random_uuid();
  v_expense_shared uuid; v_expense_direct uuid; v_report jsonb; v_sub_report jsonb;
  v_failed boolean; v_state text; v_legacy_revenue numeric; v_legacy_qty numeric; v_legacy_traffic numeric;
  v_legacy_purchase numeric; v_legacy_hpp numeric; v_legacy_opex numeric;
  v_result jsonb:='{}'::jsonb;
begin
  select id into strict v_admin from public.profiles where role='admin' and is_active order by created_at limit 1;
  select id into strict v_staff from public.profiles where role='staff' and is_active order by created_at limit 1;
  select id into strict v_super from public.profiles where role='super_admin' and is_active order by created_at limit 1;
  select coalesce(sum(total_sales),0) into v_legacy_revenue from public.daily_sales_summaries where sale_date between '2026-06-01' and '2026-06-30';
  select coalesce(sum(quantity),0) into v_legacy_qty from public.historical_product_daily_quantities where sale_date between '2026-06-01' and '2026-06-30';
  select coalesce(sum(total_visitors),0) into v_legacy_traffic from public.customer_traffic_daily where traffic_date between '2026-06-01' and '2026-06-30';
  select coalesce(sum(i.amount),0),
    coalesce(sum(i.amount) filter(where i.financial_class='hpp'),0),
    coalesce(sum(i.amount) filter(where i.financial_class='operating_expense'),0)
  into v_legacy_purchase,v_legacy_hpp,v_legacy_opex
  from public.purchase_items i join public.purchase_invoices h on h.id=i.purchase_invoice_id
  where h.purchase_date between '2026-06-01' and '2026-06-30'
    and h.status='recorded' and h.deleted_at is null and i.deleted_at is null;

  begin
    -- Isolated master fixtures are created by the session owner, not through
    -- operational-role raw-write permissions.
    insert into public.outlets(id,code,name,timezone,is_default,is_active,created_by,updated_by)
    values(v_outlet,v_marker||'-OUTLET',v_marker||' Outlet','Asia/Jakarta',false,true,v_admin,v_admin);
    insert into public.outlet_reporting_configs(outlet_id,operational_reporting_start_date)
    values(v_outlet,'2026-07-01');
    insert into public.business_subunits(id,outlet_id,code,name,inventory_enabled,is_active,created_by,updated_by)
    values
      (v_sub_a,v_outlet,v_marker||'-SUB-A',v_marker||' Subunit A',true,true,v_admin,v_admin),
      (v_sub_b,v_outlet,v_marker||'-SUB-B',v_marker||' Subunit B',true,true,v_admin,v_admin);
    insert into public.sales_categories(id,subunit_id,name,is_active,created_by,updated_by)
    values
      (v_sales_cat_a,v_sub_a,v_marker||' Category A',true,v_admin,v_admin),
      (v_sales_cat_b,v_sub_b,v_marker||' Category B',true,v_admin,v_admin);
    insert into public.products(id,sales_category_id,name,sku,unit,selling_price,is_active,created_by,updated_by)
    values
      (v_product_a,v_sales_cat_a,v_marker||' Product A',v_marker||'-PA','pcs',100,true,v_admin,v_admin),
      (v_product_b,v_sales_cat_b,v_marker||' Product B',v_marker||'-PB','pcs',200,true,v_admin,v_admin);
    insert into public.cost_categories(id,name,scope,outlet_id,subunit_id,is_active,created_by,updated_by)
    values
      (v_cost_shared,v_marker||' Shared Cost','outlet',v_outlet,null,true,v_admin,v_admin),
      (v_cost_direct,v_marker||' Direct Cost','subunit',v_outlet,v_sub_a,true,v_admin,v_admin),
      (v_cost_inactive,v_marker||' Inactive Cost','outlet',v_outlet,null,false,v_admin,v_admin);
    insert into public.asset_categories(
      id,name,default_useful_life_months,description,is_active,created_by,updated_by
    ) values(v_asset_category,v_marker||' Asset Category',12,v_marker,true,v_admin,v_admin);

    -- Operational Sales fixture: two headers (two Outlet bills), including one
    -- mixed-Subunit bill. Item-level amounts/HPP deliberately prove additivity.
    insert into public.sales_transactions(id,outlet_id,transaction_number,transaction_date,total_amount,created_by,updated_by)
    values
      (v_sale_one,v_outlet,v_marker||'-SALE-1','2026-07-10',300,v_admin,v_admin),
      (v_sale_two,v_outlet,v_marker||'-SALE-2','2026-07-11',100,v_admin,v_admin);
    insert into public.sales_items(
      sales_transaction_id,line_no,product_id,sales_category_id,subunit_id,quantity,unit_price,
      product_name_snapshot,product_sku_snapshot,category_name_snapshot,subunit_name_snapshot,
      unit_snapshot,hpp_amount,unit_hpp,hpp_status
    ) values
      (v_sale_one,1,v_product_a,v_sales_cat_a,v_sub_a,1,100,v_marker||' Product A',v_marker||'-PA',v_marker||' Category A',v_marker||' Subunit A','pcs',40,40,'final'),
      (v_sale_one,2,v_product_b,v_sales_cat_b,v_sub_b,1,200,v_marker||' Product B',v_marker||'-PB',v_marker||' Category B',v_marker||' Subunit B','pcs',80,80,'final'),
      (v_sale_two,1,v_product_a,v_sales_cat_a,v_sub_a,1,100,v_marker||' Product A',v_marker||'-PA',v_marker||' Category A',v_marker||' Subunit A','pcs',0,0,'provisional');

    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('role','authenticated',true);
    select id into v_expense_shared from public.create_operational_expense('2026-07-10',30,v_cost_shared,v_marker);
    select id into v_expense_direct from public.create_operational_expense('2026-07-10',20,v_cost_direct,v_marker);
    select id into v_asset from public.create_operational_asset(jsonb_build_object(
      'outlet_id',v_outlet,'subunit_id',v_sub_a,'asset_category_id',v_asset_category,
      'asset_source_key',v_marker||'-ASSET','asset_code',v_marker||'-ASSET',
      'asset_name',v_marker||' Asset','acquisition_date','2026-07-01',
      'acquisition_cost',1200,'residual_value',0,'useful_life_months',12,'asset_status','active'
    ));
    perform public.generate_asset_depreciation(v_asset,'2026-07-01');
    v_result:=v_result||jsonb_build_object('admin_expense_create','PASS');

    -- Ownership snapshots are resolved by the backend.
    if not exists(select 1 from public.operational_expenses where id=v_expense_shared and outlet_id=v_outlet and subunit_id is null and scope_snapshot='outlet')
       or not exists(select 1 from public.operational_expenses where id=v_expense_direct and outlet_id=v_outlet and subunit_id=v_sub_a and scope_snapshot='subunit') then
      raise exception 'Expense category ownership/snapshot resolution failed';
    end if;
    v_result:=v_result||jsonb_build_object('expense_scope_ownership','PASS');

    -- Cutover is authoritative and uses a precise validation contract.
    v_failed:=false;v_state:=null;
    begin perform public.create_operational_expense('2026-06-30',10,v_cost_shared,v_marker);
    exception when others then v_failed:=true;v_state:=sqlstate; end;
    if not v_failed or v_state<>'22023' then raise exception 'Cutover expected 22023, received %',v_state; end if;
    v_failed:=false;v_state:=null;
    begin perform public.create_operational_expense('2026-07-12',10,v_cost_inactive,v_marker);
    exception when others then v_failed:=true;v_state:=sqlstate; end;
    if not v_failed or v_state<>'P0001' then raise exception 'Inactive category expected P0001, received %',v_state; end if;
    v_result:=v_result||jsonb_build_object('expense_cutover','PASS','inactive_category','PASS');

    select public.get_stage7_outlet_report(v_outlet,'2026-07-01','2026-07-31') into v_report;
    if (v_report->>'source_status')<>'operational'
      or (v_report->>'revenue')::numeric<>400
      or (v_report->>'hpp')::numeric<>120
      or (v_report->>'gross_profit')::numeric<>280
      or (v_report->>'operational_expense')::numeric<>50
      or (v_report->>'depreciation')::numeric<>100
      or (v_report->>'operating_profit')::numeric<>130
      or (v_report->>'bill_count')::bigint<>2
      or (v_report->>'quantity')::numeric<>3
      or (v_report->>'provisional_hpp_item_count')::bigint<>1
      or not (v_report->>'has_provisional_hpp')::boolean then
      raise exception 'Outlet operational formula failed: %',v_report;
    end if;
    v_result:=v_result||jsonb_build_object('revenue_hpp_gp_opex_profit','PASS','depreciation','PASS','bills_qty','PASS','provisional_hpp','PASS');

    select public.get_stage7_subunit_report(v_sub_a,'2026-07-01','2026-07-31') into v_sub_report;
    if (v_sub_report->>'revenue')::numeric<>200 or (v_sub_report->>'hpp')::numeric<>40
      or (v_sub_report->>'direct_operational_expense')::numeric<>20
      or (v_sub_report->>'attributable_depreciation')::numeric<>100
      or (v_sub_report->>'contribution_before_shared_outlet_cost')::numeric<>40
      or (v_sub_report->>'transaction_involvement_count')::bigint<>2
      or (v_sub_report->>'transaction_count_additive')::boolean then
      raise exception 'Subunit contribution/non-additivity failed: %',v_sub_report;
    end if;
    v_result:=v_result||jsonb_build_object('subunit_contribution','PASS','shared_opex_not_allocated','PASS','mixed_subunit_non_additive','PASS');

    -- Historical, operational, and mixed provenance; June reconciled metrics
    -- must remain byte-for-byte numerically unchanged.
    if (public.get_stage7_outlet_report(v_outlet,'2026-06-01','2026-06-30')->>'source_status')<>'legacy'
      or (public.get_stage7_outlet_report(v_outlet,'2026-06-15','2026-07-15')->>'source_status')<>'mixed' then
      raise exception 'Source boundary metadata failed';
    end if;
    if v_legacy_revenue<>30011000 or v_legacy_qty<>1358 or v_legacy_traffic<>827
      or v_legacy_purchase<>11535298 or v_legacy_hpp<>10488538 or v_legacy_opex<>1046760
      or v_legacy_revenue<>coalesce((select sum(total_sales) from public.daily_sales_summaries where sale_date between '2026-06-01' and '2026-06-30'),0)
      or v_legacy_qty<>coalesce((select sum(quantity) from public.historical_product_daily_quantities where sale_date between '2026-06-01' and '2026-06-30'),0)
      or v_legacy_traffic<>coalesce((select sum(total_visitors) from public.customer_traffic_daily where traffic_date between '2026-06-01' and '2026-06-30'),0) then
      raise exception 'Legacy baseline changed';
    end if;
    v_result:=v_result||jsonb_build_object('legacy_boundary','PASS','cross_boundary','PASS','legacy_preserved','PASS');

    -- Staff can report/read, but valid operational mutations are rejected.
    perform set_config('request.jwt.claim.sub',v_staff::text,true);
    perform public.get_stage7_outlet_report(v_outlet,'2026-07-01','2026-07-31');
    v_failed:=false;v_state:=null;
    begin perform public.create_operational_expense('2026-07-12',10,v_cost_shared,v_marker);
    exception when others then v_failed:=true;v_state:=sqlstate; end;
    if not v_failed or v_state<>'42501' then raise exception 'Staff mutation expected 42501, received %',v_state; end if;
    v_failed:=false;v_state:=null;
    begin
      insert into public.operational_expenses(
        expense_date,amount,cost_category_id,outlet_id,category_name_snapshot,
        scope_snapshot,outlet_name_snapshot,notes
      ) values('2026-07-12',10,v_cost_shared,v_outlet,v_marker,'outlet',v_marker,v_marker);
    exception when others then v_failed:=true;v_state:=sqlstate; end;
    if not v_failed or v_state<>'42501' then raise exception 'Staff raw write expected 42501, received %',v_state; end if;
    v_result:=v_result||jsonb_build_object('staff_role','PASS');

    -- Admin cannot restore/hard delete.
    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    perform public.archive_operational_expense(v_expense_direct);
    select public.get_stage7_outlet_report(v_outlet,'2026-07-01','2026-07-31') into v_report;
    if (v_report->>'operational_expense')::numeric<>30 then raise exception 'Archived expense still reported';end if;
    v_failed:=false;begin perform public.restore_operational_expense(v_expense_direct);exception when sqlstate '42501' then v_failed:=true;end;
    if not v_failed then raise exception 'Admin restore was not rejected';end if;
    v_failed:=false;begin perform public.hard_delete_operational_expense(v_expense_direct);exception when sqlstate '42501' then v_failed:=true;end;
    if not v_failed then raise exception 'Admin hard delete was not rejected';end if;
    v_result:=v_result||jsonb_build_object('admin_role','PASS');

    -- Super Admin sees/restores and may hard-delete only after archive.
    perform set_config('request.jwt.claim.sub',v_super::text,true);
    perform public.restore_operational_expense(v_expense_direct);
    select public.get_stage7_outlet_report(v_outlet,'2026-07-01','2026-07-31') into v_report;
    if (v_report->>'operational_expense')::numeric<>50 then raise exception 'Restored expense not reported exactly once';end if;
    perform public.archive_operational_expense(v_expense_direct);
    perform public.hard_delete_operational_expense(v_expense_direct);
    v_result:=v_result||jsonb_build_object('super_admin_role','PASS','expense_lifecycle','PASS');

    perform set_config('role','none',true);
    raise exception 'stage7_smoke_rollback' using errcode='P7007';
  exception when sqlstate 'P7007' then null;
  end;
  perform set_config('role','none',true);

  if exists(select 1 from public.outlets where code like v_marker||'%')
    or exists(select 1 from public.business_subunits where code like v_marker||'%')
    or exists(select 1 from public.products where sku like v_marker||'%')
    or exists(select 1 from public.cost_categories where name like v_marker||'%')
    or exists(select 1 from public.sales_transactions where transaction_number like v_marker||'%')
    or exists(select 1 from public.operational_expenses where notes like v_marker||'%')
    or exists(select 1 from public.assets where asset_code like v_marker||'%')
    or exists(select 1 from public.asset_depreciation_entries where asset_id=v_asset) then
    raise exception 'Stage 7 smoke cleanup failed';
  end if;
  return v_result||jsonb_build_object('cleanup','PASS','legacy_revenue',v_legacy_revenue,
    'legacy_product_qty',v_legacy_qty,'legacy_traffic',v_legacy_traffic,
    'legacy_purchase_total',v_legacy_purchase,'legacy_hpp',v_legacy_hpp,'legacy_opex',v_legacy_opex);
end $$;

with smoke_run as materialized (
  select pg_temp.run_stage7_smoke() internal_results
)
select
  case when internal_results->>'cleanup'='PASS' then 'PASS' else 'FAIL' end main_stage7_invariant_status,
  internal_results
from smoke_run;
