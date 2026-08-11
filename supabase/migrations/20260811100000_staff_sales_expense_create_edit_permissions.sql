begin;

-- Broaden only operational create/update authorization. The existing function
-- bodies remain authoritative for validation, locking, accounting, inventory,
-- audit fields, and raw-write guards.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_updated_definition text;
begin
  foreach v_signature in array array[
    'public.lm_stage2_create_sales_transaction(date,jsonb,text,text,uuid)',
    'public.lm_stage2_update_sales_transaction(uuid,date,jsonb,text)',
    'public.create_operational_expense(date,text,numeric,text,numeric,numeric,uuid,text,text,text)',
    'public.update_operational_expense(uuid,date,text,numeric,text,numeric,numeric,uuid,text,text,text)'
  ] loop
    select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;

    if v_definition is null then
      raise exception 'Required function is missing: %', v_signature;
    end if;

    v_updated_definition := replace(
      v_definition,
      'if not public.lm_is_active_admin() then',
      'if not public.lm_is_active_staff_or_above() then'
    );

    if v_updated_definition = v_definition then
      raise exception 'Expected Admin authorization guard was not found in %', v_signature;
    end if;

    if length(v_definition) - length(replace(v_definition, 'if not public.lm_is_active_admin() then', ''))
       <> length('if not public.lm_is_active_admin() then') then
      raise exception 'Expected exactly one Admin authorization guard in %', v_signature;
    end if;

    execute v_updated_definition;
  end loop;
end;
$migration$;

commit;
