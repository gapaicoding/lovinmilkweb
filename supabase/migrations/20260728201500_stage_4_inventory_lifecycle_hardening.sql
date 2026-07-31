-- Stage 4 hotfix: enforce Admin soft-delete vs Super Admin restore boundary.

create or replace function public.lm_guard_inventory_item_lifecycle()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if old.deleted_at is distinct from new.deleted_at
     or old.deleted_by is distinct from new.deleted_by then
    if old.deleted_at is null and new.deleted_at is not null then
      if not public.lm_is_active_admin() then
        raise exception 'Admin atau Super Admin aktif diperlukan untuk mengarsipkan Inventory Item.'
          using errcode = '42501';
      end if;
      if new.deleted_by is distinct from auth.uid() then
        raise exception 'Pelaku arsip Inventory Item tidak valid.'
          using errcode = '42501';
      end if;
      new.is_active := false;
    elsif old.deleted_at is not null and new.deleted_at is null then
      if not public.lm_is_active_super_admin() then
        raise exception 'Hanya Super Admin aktif yang dapat memulihkan Inventory Item.'
          using errcode = '42501';
      end if;
      new.deleted_by := null;
    else
      raise exception 'Perubahan lifecycle Inventory Item tidak valid.'
        using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

create trigger guard_inventory_item_lifecycle
before update of deleted_at, deleted_by on public.inventory_items
for each row execute function public.lm_guard_inventory_item_lifecycle();

revoke all on function public.lm_guard_inventory_item_lifecycle() from public;
