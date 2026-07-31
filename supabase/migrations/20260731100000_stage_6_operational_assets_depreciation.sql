begin;

alter table public.assets
  add column if not exists outlet_id uuid references public.outlets(id) on delete restrict,
  add column if not exists subunit_id uuid references public.business_subunits(id) on delete restrict;

create index if not exists assets_outlet_idx on public.assets(outlet_id);
create index if not exists assets_subunit_idx on public.assets(subunit_id);

alter table public.assets
  drop constraint if exists assets_operational_ownership_check;
alter table public.assets
  add constraint assets_operational_ownership_check check (
    record_source <> 'operational'
    or (outlet_id is not null and subunit_id is not null)
  );

alter table public.asset_depreciation_entries
  drop constraint if exists asset_depreciation_entries_asset_id_fkey;
alter table public.asset_depreciation_entries
  add constraint asset_depreciation_entries_asset_id_fkey
  foreign key (asset_id) references public.assets(id) on delete restrict;

create or replace function public.lm_validate_operational_asset()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subunit public.business_subunits%rowtype;
  v_outlet public.outlets%rowtype;
  v_has_history boolean;
begin
  if new.record_source = 'operational' then
    if new.outlet_id is null or new.subunit_id is null then
      raise exception using errcode = '23514',
        message = 'Aset operasional wajib memiliki Outlet dan Subunit.';
    end if;

    select * into v_subunit from public.business_subunits where id = new.subunit_id;
    select * into v_outlet from public.outlets where id = new.outlet_id;

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
  end if;

  if new.residual_value > new.acquisition_cost then
    raise exception using errcode = '23514',
      message = 'Nilai residu tidak boleh melebihi nilai perolehan.';
  end if;

  if tg_op = 'UPDATE' then
    select exists(
      select 1 from public.asset_depreciation_entries d where d.asset_id = old.id
    ) into v_has_history;

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

drop trigger if exists assets_stage6_validate on public.assets;
create trigger assets_stage6_validate
before insert or update on public.assets
for each row execute function public.lm_validate_operational_asset();

create or replace function public.create_operational_asset(p_asset jsonb)
returns public.assets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.assets;
begin
  if not public.lm_is_active_admin() then
    raise exception using errcode = '42501', message = 'Hanya Admin yang dapat membuat aset.';
  end if;

  insert into public.assets (
    outlet_id, subunit_id, asset_category_id, asset_source_key, asset_code,
    asset_name, asset_name_normalized, acquisition_date, acquisition_cost,
    capitalization_threshold, capitalization_status, useful_life_months,
    residual_value, depreciation_method, depreciation_start_date, asset_status,
    brand, size, supplier_name_raw, location, notes, source_file, source_sheet,
    data_origin, record_source, accounting_policy_id, created_by, updated_by
  ) values (
    (p_asset->>'outlet_id')::uuid, (p_asset->>'subunit_id')::uuid,
    (p_asset->>'asset_category_id')::uuid,
    coalesce(nullif(p_asset->>'asset_source_key',''), 'STAGE6-' || gen_random_uuid()::text),
    upper(trim(p_asset->>'asset_code')), trim(p_asset->>'asset_name'),
    lower(regexp_replace(trim(p_asset->>'asset_name'), '\s+', ' ', 'g')),
    (p_asset->>'acquisition_date')::date, (p_asset->>'acquisition_cost')::numeric,
    coalesce((p_asset->>'capitalization_threshold')::numeric, 0), 'capitalized',
    (p_asset->>'useful_life_months')::integer,
    coalesce((p_asset->>'residual_value')::numeric, 0), 'straight_line',
    date_trunc('month', (p_asset->>'acquisition_date')::date)::date,
    coalesce(nullif(p_asset->>'asset_status',''), 'active'),
    nullif(trim(p_asset->>'brand'), ''), nullif(trim(p_asset->>'size'), ''),
    nullif(trim(p_asset->>'supplier_name_raw'), ''), nullif(trim(p_asset->>'location'), ''),
    nullif(trim(p_asset->>'notes'), ''), 'manual_web_entry', 'asset_peralatan',
    'actual', 'operational',
    (select id from public.asset_accounting_policies
     where deleted_at is null and is_active and effective_from <= (p_asset->>'acquisition_date')::date
     order by effective_from desc limit 1),
    auth.uid(), auth.uid()
  )
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.update_operational_asset(p_asset_id uuid, p_asset jsonb)
returns public.assets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.assets;
begin
  if not public.lm_is_active_admin() then
    raise exception using errcode = '42501', message = 'Hanya Admin yang dapat mengubah aset.';
  end if;
  update public.assets set
    outlet_id = coalesce((p_asset->>'outlet_id')::uuid, outlet_id),
    subunit_id = coalesce((p_asset->>'subunit_id')::uuid, subunit_id),
    asset_category_id = coalesce((p_asset->>'asset_category_id')::uuid, asset_category_id),
    asset_code = coalesce(upper(trim(p_asset->>'asset_code')), asset_code),
    asset_name = coalesce(trim(p_asset->>'asset_name'), asset_name),
    asset_name_normalized = coalesce(lower(regexp_replace(trim(p_asset->>'asset_name'), '\s+', ' ', 'g')), asset_name_normalized),
    acquisition_date = coalesce((p_asset->>'acquisition_date')::date, acquisition_date),
    acquisition_cost = coalesce((p_asset->>'acquisition_cost')::numeric, acquisition_cost),
    residual_value = coalesce((p_asset->>'residual_value')::numeric, residual_value),
    useful_life_months = coalesce((p_asset->>'useful_life_months')::integer, useful_life_months),
    depreciation_method = coalesce(nullif(p_asset->>'depreciation_method',''), depreciation_method),
    depreciation_start_date = coalesce(date_trunc('month', (p_asset->>'acquisition_date')::date)::date, depreciation_start_date),
    asset_status = coalesce(nullif(p_asset->>'asset_status',''), asset_status),
    brand = case when p_asset ? 'brand' then nullif(trim(p_asset->>'brand'),'') else brand end,
    size = case when p_asset ? 'size' then nullif(trim(p_asset->>'size'),'') else size end,
    supplier_name_raw = case when p_asset ? 'supplier_name_raw' then nullif(trim(p_asset->>'supplier_name_raw'),'') else supplier_name_raw end,
    location = case when p_asset ? 'location' then nullif(trim(p_asset->>'location'),'') else location end,
    notes = case when p_asset ? 'notes' then nullif(trim(p_asset->>'notes'),'') else notes end,
    updated_by = auth.uid()
  where id = p_asset_id and record_source = 'operational'
  returning * into v_row;
  if v_row.id is null then raise exception using errcode='P0002', message='Aset operasional tidak ditemukan.'; end if;
  return v_row;
end;
$$;

create or replace function public.archive_operational_asset(p_asset_id uuid)
returns public.assets language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.assets;
begin
  if not public.lm_is_active_admin() then raise exception using errcode='42501', message='Hanya Admin yang dapat mengarsipkan aset.'; end if;
  update public.assets set deleted_at=clock_timestamp(), deleted_by=auth.uid(), updated_by=auth.uid()
  where id=p_asset_id and record_source='operational' and deleted_at is null returning * into v_row;
  if v_row.id is null then raise exception using errcode='P0002', message='Aset aktif tidak ditemukan.'; end if;
  return v_row;
end $$;

create or replace function public.restore_operational_asset(p_asset_id uuid)
returns public.assets language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.assets;
begin
  if not public.lm_is_active_super_admin() then raise exception using errcode='42501', message='Hanya Super Admin yang dapat memulihkan aset.'; end if;
  update public.assets set deleted_at=null, deleted_by=null, updated_by=auth.uid()
  where id=p_asset_id and record_source='operational' and deleted_at is not null returning * into v_row;
  if v_row.id is null then raise exception using errcode='P0002', message='Aset arsip tidak ditemukan.'; end if;
  return v_row;
end $$;

create or replace function public.hard_delete_operational_asset(p_asset_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.lm_is_active_super_admin() then raise exception using errcode='42501', message='Hanya Super Admin yang dapat menghapus permanen aset.'; end if;
  if exists(select 1 from public.asset_depreciation_entries where asset_id=p_asset_id) then
    raise exception using errcode='23503', message='Aset tidak dapat dihapus permanen karena memiliki histori depresiasi.';
  end if;
  delete from public.assets where id=p_asset_id and record_source='operational' and deleted_at is not null;
  if not found then raise exception using errcode='P0002', message='Aset arsip tidak ditemukan.'; end if;
end $$;

create or replace function public.generate_asset_depreciation(p_asset_id uuid, p_through_period date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset public.assets;
  v_target date := date_trunc('month', p_through_period)::date;
  v_start date;
  v_period date;
  v_index integer;
  v_amount numeric(18,2);
  v_accum numeric(18,2);
  v_base numeric(18,2);
  v_inserted integer := 0;
begin
  if not public.lm_is_active_admin() then
    raise exception using errcode='42501', message='Hanya Admin yang dapat mem-posting depresiasi.';
  end if;
  select * into v_asset from public.assets where id=p_asset_id and record_source='operational' for update;
  if v_asset.id is null then raise exception using errcode='P0002', message='Aset operasional tidak ditemukan.'; end if;
  v_start := date_trunc('month', v_asset.acquisition_date)::date;
  v_base := round(v_asset.acquisition_cost-v_asset.residual_value,2);
  if v_asset.capitalization_status <> 'capitalized' or v_target < v_start then return 0; end if;

  for v_index in 0..least(v_asset.useful_life_months-1,
      ((extract(year from age(v_target,v_start))*12)+extract(month from age(v_target,v_start)))::integer)
  loop
    v_period := (v_start + make_interval(months=>v_index))::date;
    if not exists(select 1 from public.asset_depreciation_entries where asset_id=p_asset_id and period_month=v_period) then
      v_amount := case when v_index=v_asset.useful_life_months-1
        then v_base - round(v_asset.monthly_depreciation*(v_asset.useful_life_months-1),2)
        else least(v_asset.monthly_depreciation, v_base-round(v_asset.monthly_depreciation*v_index,2)) end;
      v_accum := least(v_base, round(v_asset.monthly_depreciation*v_index,2)+v_amount);
      insert into public.asset_depreciation_entries(
        asset_id,period_month,depreciation_amount,accumulated_depreciation,
        ending_book_value,status,posted_at,notes,created_by
      ) values (
        p_asset_id,v_period,v_amount,v_accum,
        greatest(v_asset.residual_value,v_asset.acquisition_cost-v_accum),
        'posted',clock_timestamp(),'Depresiasi garis lurus bulanan',auth.uid()
      );
      v_inserted := v_inserted+1;
    end if;
  end loop;
  return v_inserted;
end $$;

create or replace function public.get_asset_book_values(p_as_of_period date)
returns table(
  asset_id uuid, outlet_id uuid, subunit_id uuid, acquisition_cost numeric,
  accumulated_depreciation numeric, book_value numeric
)
language sql stable security invoker set search_path = public, pg_temp as $$
  select a.id,a.outlet_id,a.subunit_id,a.acquisition_cost,
    coalesce(sum(d.depreciation_amount) filter(
      where d.status='posted' and d.period_month<=date_trunc('month',p_as_of_period)::date
    ),0)::numeric(18,2),
    greatest(a.residual_value,a.acquisition_cost-coalesce(sum(d.depreciation_amount) filter(
      where d.status='posted' and d.period_month<=date_trunc('month',p_as_of_period)::date
    ),0))::numeric(18,2)
  from public.assets a left join public.asset_depreciation_entries d on d.asset_id=a.id
  where a.record_source='operational'
  group by a.id
$$;

create or replace function public.get_asset_depreciation_summary(p_as_of_period date)
returns table(
  outlet_id uuid, subunit_id uuid, asset_count bigint, acquisition_cost numeric,
  accumulated_depreciation numeric, book_value numeric, period_depreciation numeric
)
language sql stable security invoker set search_path = public, pg_temp as $$
  select b.outlet_id,b.subunit_id,count(*)::bigint,sum(b.acquisition_cost)::numeric(18,2),
    sum(b.accumulated_depreciation)::numeric(18,2),sum(b.book_value)::numeric(18,2),
    coalesce(sum((select sum(d.depreciation_amount) from public.asset_depreciation_entries d
      where d.asset_id=b.asset_id and d.status='posted'
      and d.period_month=date_trunc('month',p_as_of_period)::date)),0)::numeric(18,2)
  from public.get_asset_book_values(p_as_of_period) b
  group by b.outlet_id,b.subunit_id
$$;

drop policy if exists assets_select_admin on public.assets;
drop policy if exists assets_select_authenticated on public.assets;
drop policy if exists assets_insert_admin on public.assets;
drop policy if exists assets_update_admin on public.assets;
drop policy if exists assets_delete_super_admin on public.assets;
create policy assets_operational_read on public.assets for select to authenticated
using (
  public.lm_is_active_admin()
  or (public.lm_is_active_staff_or_above() and record_source='operational' and deleted_at is null)
);

drop policy if exists asset_depreciation_entries_select_admin on public.asset_depreciation_entries;
drop policy if exists asset_depreciation_entries_select_authenticated on public.asset_depreciation_entries;
drop policy if exists asset_depreciation_entries_insert_admin on public.asset_depreciation_entries;
drop policy if exists asset_depreciation_entries_update_admin on public.asset_depreciation_entries;
drop policy if exists asset_depreciation_entries_delete_super_admin on public.asset_depreciation_entries;
create policy asset_depreciation_operational_read on public.asset_depreciation_entries for select to authenticated
using (
  exists(select 1 from public.assets a where a.id=asset_id and
    (public.lm_is_active_admin() or (public.lm_is_active_staff_or_above() and a.record_source='operational' and a.deleted_at is null)))
);

drop policy if exists asset_categories_select_admin on public.asset_categories;
create policy asset_categories_authenticated_read on public.asset_categories for select to authenticated
using (deleted_at is null or public.lm_is_active_super_admin());

revoke insert,update,delete on public.assets,public.asset_depreciation_entries from authenticated;
grant select on public.assets,public.asset_depreciation_entries,public.asset_categories to authenticated;

revoke all on function
  public.create_operational_asset(jsonb),
  public.update_operational_asset(uuid,jsonb),
  public.archive_operational_asset(uuid),
  public.restore_operational_asset(uuid),
  public.hard_delete_operational_asset(uuid),
  public.generate_asset_depreciation(uuid,date),
  public.get_asset_book_values(date),
  public.get_asset_depreciation_summary(date)
from public,anon;
grant execute on function
  public.create_operational_asset(jsonb),
  public.update_operational_asset(uuid,jsonb),
  public.archive_operational_asset(uuid),
  public.restore_operational_asset(uuid),
  public.hard_delete_operational_asset(uuid),
  public.generate_asset_depreciation(uuid,date),
  public.get_asset_book_values(date),
  public.get_asset_depreciation_summary(date)
to authenticated;

commit;
