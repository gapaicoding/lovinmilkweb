-- Read-only hosted assertions. No source workbook data is used or inserted.
do $$
declare v_outlet uuid; v_count integer; v_rows bigint;
begin
  select outlet_id into v_outlet from public.outlet_reporting_configs
  where operational_reporting_start_date=date '2026-08-01' order by created_at limit 1;
  if v_outlet is null then raise exception 'FAIL: target Outlet missing'; end if;
  select count(*) into v_count from public.cost_categories
  where outlet_id=v_outlet and is_active and deleted_at is null and scope='outlet' and subunit_id is null
    and name=any(array['Bahan Makanan/Minuman','Bahan Non Makan/Minum','Gas untuk Masak','Perlengkapan','Transport','Administrasi','Listrik']);
  if v_count<>7 then raise exception 'FAIL: expected 7 canonical categories, got %',v_count; end if;
  select count(*) into v_count from public.cost_categories
  where outlet_id=v_outlet and is_active and deleted_at is null
    and not (scope='outlet' and subunit_id is null and name=any(array['Bahan Makanan/Minuman','Bahan Non Makan/Minum','Gas untuk Masak','Perlengkapan','Transport','Administrasi','Listrik']));
  if v_count<>0 then raise exception 'FAIL: unexpected active categories: %',v_count; end if;
  select count(*) into v_rows from public.operational_expenses;
  if exists(select 1 from public.operational_expenses where item_name like 'SMOKE-OPEX-%') then raise exception 'FAIL: marker cleanup incomplete'; end if;
  raise notice 'PASS: canonical categories=7, operational expense rows=%, source workbook rows imported=0',v_rows;
end $$;
