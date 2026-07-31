-- Read-only Stage 4 structural verification.
do $$
declare v_missing text;
begin
  select string_agg(name, ', ') into v_missing
  from unnest(array[
    'inventory_items','inventory_movements','stock_opnames',
    'stock_opname_items','product_inventory_requirements','v_inventory_balances'
  ]) name where to_regclass('public.'||name) is null;
  if v_missing is not null then
    raise exception 'Stage 4 objects missing: %', v_missing;
  end if;
  if has_table_privilege('anon','public.inventory_items','select')
     or has_table_privilege('authenticated','public.inventory_movements','insert')
     or has_table_privilege('authenticated','public.stock_opnames','insert') then
    raise exception 'Stage 4 table grants are unsafe.';
  end if;
  if to_regprocedure('public.create_inventory_adjustment(uuid,numeric,text,timestamp with time zone)') is null
     or to_regprocedure('public.post_stock_opname(uuid,uuid,date,jsonb,text)') is null then
    raise exception 'Stage 4 RPC missing.';
  end if;
end $$;
