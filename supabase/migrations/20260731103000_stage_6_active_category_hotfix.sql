begin;

create or replace function public.lm_validate_operational_asset()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subunit public.business_subunits%rowtype;
  v_outlet public.outlets%rowtype;
  v_category public.asset_categories%rowtype;
  v_has_history boolean;
begin
  if new.record_source = 'operational' then
    if new.outlet_id is null or new.subunit_id is null then
      raise exception using errcode = '23514',
        message = 'Aset operasional wajib memiliki Outlet dan Subunit.';
    end if;
    select * into v_subunit from public.business_subunits where id = new.subunit_id;
    select * into v_outlet from public.outlets where id = new.outlet_id;
    select * into v_category from public.asset_categories where id = new.asset_category_id;
    if v_subunit.id is null or v_subunit.outlet_id <> new.outlet_id then
      raise exception using errcode = '23514',
        message = 'Subunit aset tidak berada pada Outlet yang dipilih.';
    end if;
    if tg_op = 'INSERT' and
       (not v_subunit.is_active or v_subunit.deleted_at is not null
        or v_outlet.id is null or not v_outlet.is_active or v_outlet.deleted_at is not null) then
      raise exception using errcode = '23514',
        message = 'Outlet dan Subunit harus aktif untuk aset baru.';
    end if;
    if tg_op = 'INSERT' and
       (v_category.id is null or not v_category.is_active or v_category.deleted_at is not null) then
      raise exception using errcode = '23514',
        message = 'Kategori aset harus aktif untuk aset baru.';
    end if;
  end if;
  if new.residual_value > new.acquisition_cost then
    raise exception using errcode = '23514',
      message = 'Nilai residu tidak boleh melebihi nilai perolehan.';
  end if;
  if tg_op = 'UPDATE' then
    select exists(select 1 from public.asset_depreciation_entries d where d.asset_id = old.id)
    into v_has_history;
    if v_has_history and (
      new.acquisition_date is distinct from old.acquisition_date
      or new.acquisition_cost is distinct from old.acquisition_cost
      or new.residual_value is distinct from old.residual_value
      or new.useful_life_months is distinct from old.useful_life_months
      or new.depreciation_method is distinct from old.depreciation_method
      or new.capitalization_status is distinct from old.capitalization_status
      or new.depreciation_start_date is distinct from old.depreciation_start_date
      or new.outlet_id is distinct from old.outlet_id
      or new.subunit_id is distinct from old.subunit_id
    ) then
      raise exception using errcode = 'P0001',
        message = 'Dasar depresiasi tidak dapat diubah karena aset telah memiliki histori depresiasi.';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.lm_validate_operational_asset() from public, anon, authenticated;
commit;
