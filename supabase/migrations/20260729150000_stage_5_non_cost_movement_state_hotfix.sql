begin;

create or replace function public.lm_sync_non_cost_movement_state()
returns trigger language plpgsql security definer
set search_path=public,pg_catalog as $$
declare s public.inventory_cost_states; v_delta numeric; v_after numeric; v_value numeric;
begin
  if new.movement_type in ('purchase_in','sale_consumption') then return new; end if;
  if tg_op='INSERT' then
    if new.is_reversed then return new; end if;
    v_delta:=new.quantity_delta;
  elsif old.is_reversed=false and new.is_reversed=true then
    v_delta:=-new.quantity_delta;
  elsif old.is_reversed=true and new.is_reversed=false then
    v_delta:=new.quantity_delta;
  else
    return new;
  end if;
  s:=public.lm_lock_cost_state(new.inventory_item_id);
  v_after:=round(s.on_hand_quantity+v_delta,4);
  v_value:=case
    when v_after>0 and s.current_wac is not null then round(v_after*s.current_wac,4)
    else 0
  end;
  update public.inventory_cost_states set
    on_hand_quantity=v_after,inventory_value=v_value,
    last_effective_date=case when tg_op='INSERT' then new.effective_date else (
      select im.effective_date from public.inventory_movements im
      where im.inventory_item_id=new.inventory_item_id and not im.is_reversed and im.id<>new.id
      order by im.posting_sequence desc limit 1
    ) end,
    last_posting_sequence=case when tg_op='INSERT' then new.posting_sequence else (
      select im.posting_sequence from public.inventory_movements im
      where im.inventory_item_id=new.inventory_item_id and not im.is_reversed and im.id<>new.id
      order by im.posting_sequence desc limit 1
    ) end,
    updated_at=clock_timestamp()
  where inventory_item_id=new.inventory_item_id;
  if tg_op='INSERT' then
    new.quantity_before:=s.on_hand_quantity;
    new.quantity_after:=v_after;
    new.inventory_value_before:=s.inventory_value;
    new.inventory_value_after:=v_value;
    new.wac_before:=s.current_wac;
    new.wac_after:=s.current_wac;
    new.value_delta:=round(v_value-s.inventory_value,4);
    new.cost_status:=case when s.has_cost_basis then 'final' else 'provisional' end;
  end if;
  return new;
end $$;

-- BEFORE is required so the ledger row itself receives deterministic snapshots.
create trigger sync_non_cost_movement_state
before insert or update of is_reversed on public.inventory_movements
for each row execute function public.lm_sync_non_cost_movement_state();

create or replace function public.lm_assert_forward_cost_date(
  p_item_id uuid,p_effective_date date
) returns void language plpgsql security definer
set search_path=public,pg_catalog as $$
declare v_last date;
begin
  select max(effective_date) into v_last from public.inventory_movements
  where inventory_item_id=p_item_id and not is_reversed;
  if v_last is not null and p_effective_date<v_last then
    raise exception 'Transaksi tidak dapat diubah karena sudah terdapat aktivitas stok/HPP yang lebih baru untuk item terkait.'
      using errcode='23514';
  end if;
end $$;

revoke all on function public.lm_sync_non_cost_movement_state()
from public,anon,authenticated;

commit;
