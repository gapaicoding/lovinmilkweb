begin;

drop policy if exists assets_operational_read on public.assets;
create policy assets_operational_read on public.assets
for select to authenticated
using (
  public.lm_is_active_super_admin()
  or (public.lm_is_active_admin() and deleted_at is null)
  or (
    public.lm_is_active_staff_or_above()
    and record_source = 'operational'
    and deleted_at is null
  )
);

drop policy if exists asset_depreciation_operational_read
  on public.asset_depreciation_entries;
create policy asset_depreciation_operational_read
on public.asset_depreciation_entries
for select to authenticated
using (
  exists (
    select 1
    from public.assets a
    where a.id = asset_id
      and (
        public.lm_is_active_super_admin()
        or (public.lm_is_active_admin() and a.deleted_at is null)
        or (
          public.lm_is_active_staff_or_above()
          and a.record_source = 'operational'
          and a.deleted_at is null
        )
      )
  )
);

commit;
