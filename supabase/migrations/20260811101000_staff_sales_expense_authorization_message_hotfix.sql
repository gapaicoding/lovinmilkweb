begin;

-- Keep create/update denial messages aligned with their Staff+ authorization.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_updated_definition text;
  v_old_message text;
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

    v_old_message := case v_signature
      when 'public.lm_stage2_create_sales_transaction(date,jsonb,text,text,uuid)'
        then '''Anda tidak memiliki izin membuat transaksi penjualan.'''
      when 'public.lm_stage2_update_sales_transaction(uuid,date,jsonb,text)'
        then '''Anda tidak memiliki izin mengubah transaksi penjualan.'''
      else '''Admin atau Super Admin diperlukan.'''
    end;

    v_updated_definition := replace(v_definition, v_old_message, '''Akses operasional diperlukan.''');

    if v_updated_definition = v_definition then
      raise exception 'Expected outdated authorization message was not found in %', v_signature;
    end if;

    execute v_updated_definition;
  end loop;
end;
$migration$;

commit;
