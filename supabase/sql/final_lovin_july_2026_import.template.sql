begin;

-- Generated from the normalized staging workbook by scripts/build-july-2026-import.ps1.
-- This immutable import follows the repository's established historical-import pattern.

alter table public.daily_sales_summaries
  add column if not exists total_sales_lovin_raw numeric(18,2),
  add column if not exists product_quantity_recorded numeric(14,3),
  add column if not exists product_detail_available boolean not null default true,
  add column if not exists source_notes text;

comment on column public.daily_sales_summaries.total_sales_lovin_raw is
  'Raw Lovin value as entered by the source; may be NULL when a resolved value is derivable.';
comment on column public.daily_sales_summaries.product_detail_available is
  'Whether dated product-quantity detail is present in the aggregate source.';

create temporary table july_menu(category_name text, product_name text, price numeric) on commit drop;
insert into july_menu values
__MENU_VALUES__;

create temporary table july_sales(
  sale_date date, bill_count integer, adult_visitors integer, child_visitors integer,
  visitor_total integer, total_sales numeric, arayya_sales numeric,
  lovin_raw numeric, lovin_resolved numeric, product_qty numeric,
  product_detail_available boolean, source_notes text
) on commit drop;
insert into july_sales values
__SALES_VALUES__;

create temporary table july_mapping(
  raw_name text, final_name text, category_name text, mapping_status text, is_free boolean
) on commit drop;
insert into july_mapping values
__MAPPING_VALUES__;

create temporary table july_quantities(
  sale_date date, raw_name text, quantity numeric, final_name text,
  category_name text, mapping_status text, is_free boolean
) on commit drop;
insert into july_quantities values
__QUANTITY_VALUES__;

do $$
declare
  v_outlet_id uuid;
  v_lovin_id uuid;
  v_arayya_id uuid;
  v_actor_id uuid;
begin
  select id into strict v_outlet_id from public.outlets
  where lower(btrim(name)) = 'kadirojo' and is_active and deleted_at is null;
  select id into strict v_lovin_id from public.business_subunits
  where outlet_id = v_outlet_id and lower(btrim(name)) = 'lovin milk' and deleted_at is null;
  select id into strict v_arayya_id from public.business_subunits
  where outlet_id = v_outlet_id and lower(btrim(name)) = 'arayya' and deleted_at is null;
  select id into strict v_actor_id from public.profiles
  where role = 'super_admin' and is_active order by created_at limit 1;

  if (select count(*) from july_menu) <> 43
     or (select count(distinct category_name) from july_menu) <> 10 then
    raise exception 'Final Lovin menu manifest is not 43 products / 10 categories.';
  end if;
  if (select coalesce(sum(total_sales),0) from july_sales) <> 23141159
     or (select coalesce(sum(arayya_sales),0) from july_sales) <> 1893000
     or (select coalesce(sum(lovin_raw),0) from july_sales) <> 19978159
     or (select coalesce(sum(lovin_resolved),0) from july_sales) <> 21248159
     or (select coalesce(sum(quantity),0) from july_quantities) <> 1122 then
    raise exception 'July staging totals do not match the locked source manifest.';
  end if;

  update public.business_subunits set inventory_enabled = false, updated_at = clock_timestamp()
  where id = v_lovin_id;
  update public.business_subunits set inventory_enabled = true, updated_at = clock_timestamp()
  where id = v_arayya_id;
  update public.outlet_reporting_configs
  set operational_reporting_start_date = date '2026-08-01', updated_at = clock_timestamp()
  where outlet_id = v_outlet_id;

  insert into public.sales_categories(name, description, subunit_id, is_active)
  select distinct category_name, 'Menu resmi Lovin Milk 2026', v_lovin_id, true
  from july_menu
  on conflict (subunit_id, lower(name)) do update
  set name = excluded.name, description = excluded.description,
      is_active = true, updated_at = clock_timestamp();

  update public.sales_categories c set is_active = false, updated_at = clock_timestamp()
  where c.subunit_id = v_lovin_id
    and not exists (select 1 from july_menu m where lower(m.category_name) = lower(c.name));

  update public.products p
  set name = m.product_name, selling_price = m.price, unit = 'pcs',
      sku = 'LM-' || upper(substr(md5(m.product_name),1,10)),
      sales_category_id = c.id, is_active = true, deleted_at = null, deleted_by = null,
      notes = 'Menu resmi Lovin Milk 2026', updated_at = clock_timestamp()
  from july_menu m
  join public.sales_categories c on c.subunit_id = v_lovin_id
    and lower(c.name) = lower(m.category_name)
  where p.id = (
    select p2.id from public.products p2
    join public.sales_categories c2 on c2.id = p2.sales_category_id
    where c2.subunit_id = v_lovin_id and lower(p2.name) = lower(m.product_name)
    order by p2.deleted_at nulls first, p2.created_at limit 1
  );

  insert into public.products(name, sku, unit, selling_price, sales_category_id, is_active, notes)
  select m.product_name, 'LM-' || upper(substr(md5(m.product_name),1,10)), 'pcs',
    m.price, c.id, true, 'Menu resmi Lovin Milk 2026'
  from july_menu m
  join public.sales_categories c on c.subunit_id = v_lovin_id
    and lower(c.name) = lower(m.category_name)
  where not exists (
    select 1 from public.products p join public.sales_categories pc on pc.id=p.sales_category_id
    where pc.subunit_id=v_lovin_id and lower(p.name)=lower(m.product_name)
  );

  update public.products p
  set is_active=false, deleted_at=coalesce(deleted_at,clock_timestamp()),
      deleted_by=coalesce(deleted_by,v_actor_id), updated_by=v_actor_id,
      updated_at=clock_timestamp()
  from public.sales_categories c
  where c.id=p.sales_category_id and c.subunit_id=v_lovin_id
    and not exists(select 1 from july_menu m where lower(m.product_name)=lower(p.name));

  if (select count(*) from public.products p join public.sales_categories c on c.id=p.sales_category_id
      where c.subunit_id=v_lovin_id and p.is_active and p.deleted_at is null) <> 43 then
    raise exception 'Active Lovin catalog did not reconcile to 43 products.';
  end if;
  if (select count(*) from public.sales_categories
      where subunit_id=v_lovin_id and is_active) <> 10 then
    raise exception 'Active Lovin categories did not reconcile to 10.';
  end if;
end $$;

insert into public.data_import_batches(
  batch_key, description, facts_period_start, facts_period_end, assets_full,
  status, source_manifest, expected_metrics, started_at, completed_at
) values (
  'LM-ACTUAL-JULY-2026-AGGREGATE',
  'Actual aggregate July 2026 revenue, visitor, known bill, and product quantity facts; no transaction composition or product financial facts.',
  date '2026-07-01', date '2026-07-31', false, 'importing',
  jsonb_build_object(
    'source_file','lovin_menu_final_dan_penjualan_juli_2026_staging.xlsx',
    'source_type','aggregate_actual','transaction_composition_available',false,
    'product_revenue_available',false,'product_hpp_available',false,
    'lovin_2026_07_19_resolution','total_sales_minus_arayya'
  ),
  jsonb_build_object(
    'daily_sales_summaries',31,'revenue',23141159,'arayya_revenue',1893000,
    'lovin_raw_revenue',19978159,'lovin_resolved_revenue',21248159,
    'known_bill_count',318,'adult_visitors',335,'child_visitors',273,
    'traffic_total',608,'product_quantity',1122,'mapped_quantity',1116,
    'unmatched_quantity',6,'free_quantity',10
  ), clock_timestamp(), null
)
on conflict (batch_key) do update set
  description=excluded.description, facts_period_start=excluded.facts_period_start,
  facts_period_end=excluded.facts_period_end, status='importing',
  source_manifest=excluded.source_manifest, expected_metrics=excluded.expected_metrics,
  started_at=clock_timestamp(), completed_at=null, updated_at=clock_timestamp();

delete from public.historical_product_daily_quantities q using public.data_import_batches b
where q.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
delete from public.historical_product_aliases a using public.data_import_batches b
where a.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
delete from public.historical_products p using public.data_import_batches b
where p.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
delete from public.customer_traffic_daily t using public.data_import_batches b
where t.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
delete from public.daily_sales_summaries s using public.data_import_batches b
where s.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
delete from public.data_coverage_periods c using public.data_import_batches b
where c.import_batch_id=b.id and b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';

insert into public.daily_sales_summaries(
  import_batch_id,source_key,sale_date,date_raw,bill_count,adult_visitors,
  child_visitors,visitor_total,total_sales,total_sales_arayya,total_sales_lovin,
  total_sales_lovin_raw,product_quantity_recorded,product_detail_available,
  source_notes,source_file,source_sheet,source_row,data_origin,data_entry_status
)
select b.id,'july-sales-'||to_char(s.sale_date,'YYYY-MM-DD'),s.sale_date,to_char(s.sale_date,'DD/MM/YYYY'),
  s.bill_count,s.adult_visitors,s.child_visitors,s.visitor_total,s.total_sales,
  s.arayya_sales,s.lovin_resolved,s.lovin_raw,s.product_qty,s.product_detail_available,
  s.source_notes,'lovin_menu_final_dan_penjualan_juli_2026_staging.xlsx','Sales_Harian_Juli',
  extract(day from s.sale_date)::integer+1,'actual',
  case when s.bill_count is null and s.total_sales>0 then 'partial_bill_coverage'
       when not s.product_detail_available and s.total_sales>0 then 'partial_product_coverage'
       else 'recorded' end
from july_sales s cross join public.data_import_batches b
where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';

insert into public.customer_traffic_daily(
  import_batch_id,source_key,traffic_date,adult_visitors,child_visitors,total_visitors,
  bill_count,source_file,source_sheet,source_row,data_origin
)
select b.id,'july-traffic-'||to_char(s.sale_date,'YYYY-MM-DD'),s.sale_date,
  s.adult_visitors,s.child_visitors,s.visitor_total,s.bill_count,
  'lovin_menu_final_dan_penjualan_juli_2026_staging.xlsx','Sales_Harian_Juli',
  extract(day from s.sale_date)::integer+1,'actual'
from july_sales s cross join public.data_import_batches b
where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE'
  and s.adult_visitors is not null and s.child_visitors is not null and s.visitor_total is not null;

insert into public.historical_products(
  import_batch_id,historical_product_key,canonical_name,category_name,mapping_status,
  current_product_match_strategy,current_product_id
)
select b.id,'july-product-'||substr(md5(coalesce(m.final_name,m.raw_name)),1,20),
  coalesce(m.final_name,m.raw_name),max(m.category_name),
  case when max(m.mapping_status)='UNMATCHED_HISTORICAL' then 'unmatched_historical' else 'mapped_final_menu' end,
  case when max(m.mapping_status)='UNMATCHED_HISTORICAL' then null else 'staging_authoritative_mapping' end,
  max(p.id::text)::uuid
from july_mapping m cross join public.data_import_batches b
left join public.sales_categories c on lower(c.name)=lower(m.category_name)
left join public.business_subunits su on su.id=c.subunit_id and lower(su.name)='lovin milk'
left join public.products p on p.sales_category_id=c.id and lower(p.name)=lower(m.final_name) and su.id is not null
where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE'
group by b.id,coalesce(m.final_name,m.raw_name)
on conflict (import_batch_id,historical_product_key) do nothing;

insert into public.historical_product_aliases(
  import_batch_id,historical_product_id,alias_key,alias_name,normalized_alias,
  spelling_normalized_alias,mapping_status,occurrence_count
)
select b.id,h.id,'july-alias-'||substr(md5(m.raw_name),1,20),m.raw_name,lower(btrim(m.raw_name)),
  lower(btrim(m.raw_name)),lower(m.mapping_status),count(q.raw_name)
from july_mapping m cross join public.data_import_batches b
join public.historical_products h on h.import_batch_id=b.id
 and h.canonical_name=coalesce(m.final_name,m.raw_name)
left join july_quantities q on q.raw_name=m.raw_name
where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE'
group by b.id,h.id,m.raw_name,m.mapping_status;

insert into public.historical_product_daily_quantities(
  import_batch_id,historical_product_id,source_key,sale_date,canonical_product_name,
  category_name,quantity,is_free_menu,raw_variants,category_raw_variants,
  source_file,source_references,data_origin
)
select b.id,h.id,'july-qty-'||to_char(q.sale_date,'YYYY-MM-DD')||'-'||substr(md5(q.raw_name),1,16),
  q.sale_date,coalesce(q.final_name,q.raw_name),q.category_name,q.quantity,q.is_free,q.raw_name,
  q.category_name,'lovin_menu_final_dan_penjualan_juli_2026_staging.xlsx',
  'Qty_Produk_Juli; Mapping_Produk','actual'
from july_quantities q cross join public.data_import_batches b
join public.historical_products h on h.import_batch_id=b.id
 and h.canonical_name=coalesce(q.final_name,q.raw_name)
where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';

insert into public.data_coverage_periods(import_batch_id,domain,period_start,period_end,availability_status,row_count,notes)
select id,v.domain,date '2026-07-01',date '2026-07-31',v.status,v.row_count,v.notes
from public.data_import_batches cross join (values
  ('outlet_revenue','available',31::bigint,'Daily actual aggregate; authoritative for Outlet revenue.'),
  ('subunit_revenue','available_with_one_derived_value',31::bigint,'Lovin 19 July resolved as total minus Arayya; raw value remains NULL.'),
  ('bill_count','partial',30::bigint,'9 July is NULL; monthly 318 means bills recorded, not proven full coverage.'),
  ('visitor_count','available',29::bigint,'608 visitors recorded.'),
  ('product_quantity','partial',391::bigint,'1,122 qty recorded; 30 July has no product detail; 6 qty unmatched.'),
  ('product_revenue','unavailable',0::bigint,'No item-level revenue source.'),
  ('transaction_composition','unavailable',0::bigint,'No individual bill/item composition source.'),
  ('july_financial_costs','unavailable',0::bigint,'No authoritative HPP/OPEX/depreciation source for July.')
) v(domain,status,row_count,notes)
where batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';

update public.data_import_batches set status='imported',completed_at=clock_timestamp(),updated_at=clock_timestamp()
where batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';

create or replace function public.get_july_actual_daily(p_start_date date,p_end_date date)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public,pg_temp set row_security=off
as $$
  select jsonb_build_object(
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'date',s.sale_date,'total_sales',s.total_sales,'lovin_sales',s.total_sales_lovin,
      'lovin_sales_raw',s.total_sales_lovin_raw,'arayya_sales',s.total_sales_arayya,
      'bill_count',s.bill_count,'adult_visitors',s.adult_visitors,'child_visitors',s.child_visitors,
      'visitor_total',s.visitor_total,'product_quantity',s.product_quantity_recorded,
      'product_detail_available',s.product_detail_available,'source_notes',s.source_notes
    ) order by s.sale_date),'[]'::jsonb),
    'known_bill_count',coalesce(sum(s.bill_count),0),'bill_coverage_complete',bool_and(s.bill_count is not null or s.total_sales=0),
    'product_detail_coverage_complete',bool_and(s.product_detail_available or s.total_sales=0),
    'transaction_composition_available',false,'product_financial_metrics_available',false,
    'july_financial_costs_available',false,'mapped_quantity',1116,'unmatched_quantity',6,'free_quantity',10
  ) from public.daily_sales_summaries s join public.data_import_batches b on b.id=s.import_batch_id
  where b.batch_key='LM-ACTUAL-JULY-2026-AGGREGATE' and s.sale_date between p_start_date and p_end_date
$$;
revoke all on function public.get_july_actual_daily(date,date) from public,anon;
grant execute on function public.get_july_actual_daily(date,date) to authenticated;

do $$
declare v_batch uuid;
begin
  select id into strict v_batch from public.data_import_batches where batch_key='LM-ACTUAL-JULY-2026-AGGREGATE';
  if (select sum(total_sales) from public.daily_sales_summaries where import_batch_id=v_batch)<>23141159
    or (select sum(total_sales_arayya) from public.daily_sales_summaries where import_batch_id=v_batch)<>1893000
    or (select sum(total_sales_lovin) from public.daily_sales_summaries where import_batch_id=v_batch)<>21248159
    or (select sum(adult_visitors) from public.daily_sales_summaries where import_batch_id=v_batch)<>335
    or (select sum(child_visitors) from public.daily_sales_summaries where import_batch_id=v_batch)<>273
    or (select sum(quantity) from public.historical_product_daily_quantities where import_batch_id=v_batch)<>1122
    or (select bill_count from public.daily_sales_summaries where import_batch_id=v_batch and sale_date='2026-07-09') is not null
    or (select product_detail_available from public.daily_sales_summaries where import_batch_id=v_batch and sale_date='2026-07-30') then
    raise exception 'Final July import reconciliation failed.';
  end if;
end $$;

commit;
