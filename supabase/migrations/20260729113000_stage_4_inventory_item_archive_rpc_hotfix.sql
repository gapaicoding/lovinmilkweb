-- Stage 4 hotfix: archive must not require Admin to gain SELECT visibility
-- over the archived row. The existing SELECT policy intentionally hides it.
create or replace function public.archive_inventory_item(
  p_inventory_item_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin atau Super Admin aktif diperlukan.'
      using errcode = '42501';
  end if;

  update public.inventory_items
  set
    deleted_at = now(),
    deleted_by = auth.uid(),
    updated_by = auth.uid()
  where id = p_inventory_item_id
    and deleted_at is null;

  if not found then
    raise exception 'Inventory Item aktif tidak ditemukan.'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.archive_inventory_item(uuid) from public;
grant execute on function public.archive_inventory_item(uuid) to authenticated;
