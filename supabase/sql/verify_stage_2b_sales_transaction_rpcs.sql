-- ============================================================
-- VERIFY STAGE 2B
-- Sales Transaction RPC Engine
-- ============================================================


-- ============================================================
-- 1. FUNCTIONS
-- ============================================================

select
  p.proname,
  pg_get_function_identity_arguments(
    p.oid
  ) as arguments,
  p.prosecdef as security_definer

from pg_proc p

join pg_namespace n
  on n.oid =
    p.pronamespace

where n.nspname =
    'public'

  and p.proname in (
    'lm_generate_sales_transaction_number',
    'lm_resolve_sales_outlet',
    'lm_insert_sales_transaction_items',

    'create_sales_transaction',
    'update_sales_transaction',
    'soft_delete_sales_transaction',
    'restore_sales_transaction',
    'hard_delete_sales_transaction'
  )

order by
  p.proname;


-- Expected all:
-- security_definer = true


-- ============================================================
-- 2. SEQUENCE
-- ============================================================

select
  sequence_schema,
  sequence_name,
  data_type,
  start_value,
  increment

from information_schema.sequences

where sequence_schema =
    'public'

  and sequence_name =
    'sales_transaction_number_seq';


-- Expected one row.


-- ============================================================
-- 3. DIRECT TABLE PRIVILEGES
-- ============================================================

select
  'sales_transactions'
    as table_name,

  has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'SELECT'
  ) as can_select,

  has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'INSERT'
  ) as can_insert,

  has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'UPDATE'
  ) as can_update,

  has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'DELETE'
  ) as can_delete

union all

select
  'sales_items',

  has_table_privilege(
    'authenticated',
    'public.sales_items',
    'SELECT'
  ),

  has_table_privilege(
    'authenticated',
    'public.sales_items',
    'INSERT'
  ),

  has_table_privilege(
    'authenticated',
    'public.sales_items',
    'UPDATE'
  ),

  has_table_privilege(
    'authenticated',
    'public.sales_items',
    'DELETE'
  );


-- Expected:
--
--                     SELECT INSERT UPDATE DELETE
-- sales_transactions  true   false  false  false
-- sales_items         true   false  false  false


-- ============================================================
-- 4. PUBLIC RPC PRIVILEGES
-- ============================================================

select
  'create_sales_transaction'
    as function_name,

  has_function_privilege(
    'authenticated',
    'public.create_sales_transaction(date,jsonb,text,text,uuid)',
    'EXECUTE'
  ) as authenticated_execute,

  has_function_privilege(
    'anon',
    'public.create_sales_transaction(date,jsonb,text,text,uuid)',
    'EXECUTE'
  ) as anon_execute

union all

select
  'update_sales_transaction',

  has_function_privilege(
    'authenticated',
    'public.update_sales_transaction(uuid,date,jsonb,text)',
    'EXECUTE'
  ),

  has_function_privilege(
    'anon',
    'public.update_sales_transaction(uuid,date,jsonb,text)',
    'EXECUTE'
  )

union all

select
  'soft_delete_sales_transaction',

  has_function_privilege(
    'authenticated',
    'public.soft_delete_sales_transaction(uuid)',
    'EXECUTE'
  ),

  has_function_privilege(
    'anon',
    'public.soft_delete_sales_transaction(uuid)',
    'EXECUTE'
  )

union all

select
  'restore_sales_transaction',

  has_function_privilege(
    'authenticated',
    'public.restore_sales_transaction(uuid)',
    'EXECUTE'
  ),

  has_function_privilege(
    'anon',
    'public.restore_sales_transaction(uuid)',
    'EXECUTE'
  )

union all

select
  'hard_delete_sales_transaction',

  has_function_privilege(
    'authenticated',
    'public.hard_delete_sales_transaction(uuid)',
    'EXECUTE'
  ),

  has_function_privilege(
    'anon',
    'public.hard_delete_sales_transaction(uuid)',
    'EXECUTE'
  );


-- Expected:
--
-- authenticated_execute = true
-- anon_execute          = false


-- ============================================================
-- 5. INTERNAL HELPERS MUST NOT BE CLIENT EXECUTABLE
-- ============================================================

select
  'lm_generate_sales_transaction_number'
    as function_name,

  has_function_privilege(
    'authenticated',
    'public.lm_generate_sales_transaction_number()',
    'EXECUTE'
  ) as authenticated_execute,

  has_function_privilege(
    'anon',
    'public.lm_generate_sales_transaction_number()',
    'EXECUTE'
  ) as anon_execute

union all

select
  'lm_resolve_sales_outlet',

  has_function_privilege(
    'authenticated',
    'public.lm_resolve_sales_outlet(uuid)',
    'EXECUTE'
  ),

  has_function_privilege(
    'anon',
    'public.lm_resolve_sales_outlet(uuid)',
    'EXECUTE'
  )

union all

select
  'lm_insert_sales_transaction_items',

  has_function_privilege(
    'authenticated',
    'public.lm_insert_sales_transaction_items(uuid,uuid,jsonb)',
    'EXECUTE'
  ),

  has_function_privilege(
    'anon',
    'public.lm_insert_sales_transaction_items(uuid,uuid,jsonb)',
    'EXECUTE'
  );


-- Expected:
--
-- semuanya FALSE


-- ============================================================
-- 6. RLS MUST REMAIN ENABLED
-- ============================================================

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled

from pg_class c

join pg_namespace n
  on n.oid =
    c.relnamespace

where n.nspname =
    'public'

  and c.relname in (
    'sales_transactions',
    'sales_items'
  )

order by c.relname;


-- Expected both TRUE.


-- ============================================================
-- 7. TABLES STILL EMPTY BEFORE LIVE RPC TEST
-- ============================================================

select
  (
    select count(*)
    from public.sales_transactions
  ) as transaction_count,

  (
    select count(*)
    from public.sales_items
  ) as item_count;


-- Expected:
--
-- 0 / 0
--
-- selama belum ada test transaksi lewat aplikasi/RPC.


-- ============================================================
-- 8. LEGACY SALES STILL EXISTS
-- ============================================================

select
  to_regclass(
    'public.sales'
  ) as legacy_sales;


-- Expected:
--
-- sales


-- ============================================================
-- 9. HARD ASSERTIONS
-- ============================================================

do $$
begin
  if to_regprocedure(
    'public.create_sales_transaction(date,jsonb,text,text,uuid)'
  ) is null then
    raise exception
      'VERIFY FAILED: create_sales_transaction missing.';
  end if;


  if to_regprocedure(
    'public.update_sales_transaction(uuid,date,jsonb,text)'
  ) is null then
    raise exception
      'VERIFY FAILED: update_sales_transaction missing.';
  end if;


  if to_regprocedure(
    'public.soft_delete_sales_transaction(uuid)'
  ) is null then
    raise exception
      'VERIFY FAILED: soft_delete_sales_transaction missing.';
  end if;


  if to_regprocedure(
    'public.restore_sales_transaction(uuid)'
  ) is null then
    raise exception
      'VERIFY FAILED: restore_sales_transaction missing.';
  end if;


  if to_regprocedure(
    'public.hard_delete_sales_transaction(uuid)'
  ) is null then
    raise exception
      'VERIFY FAILED: hard_delete_sales_transaction missing.';
  end if;


  if not has_function_privilege(
    'authenticated',
    'public.create_sales_transaction(date,jsonb,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'VERIFY FAILED: create RPC tidak executable oleh authenticated.';
  end if;


  if has_function_privilege(
    'anon',
    'public.create_sales_transaction(date,jsonb,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'VERIFY FAILED: create RPC executable oleh anon.';
  end if;


  if has_function_privilege(
    'authenticated',
    'public.lm_insert_sales_transaction_items(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'VERIFY FAILED: internal cart writer dapat dipanggil authenticated.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'INSERT'
  )
    or has_table_privilege(
      'authenticated',
      'public.sales_transactions',
      'UPDATE'
    )
    or has_table_privilege(
      'authenticated',
      'public.sales_transactions',
      'DELETE'
    )
  then
    raise exception
      'VERIFY FAILED: authenticated memiliki direct write sales_transactions.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_items',
    'INSERT'
  )
    or has_table_privilege(
      'authenticated',
      'public.sales_items',
      'UPDATE'
    )
    or has_table_privilege(
      'authenticated',
      'public.sales_items',
      'DELETE'
    )
  then
    raise exception
      'VERIFY FAILED: authenticated memiliki direct write sales_items.';
  end if;


  if to_regclass(
    'public.sales'
  ) is null then
    raise exception
      'VERIFY FAILED: legacy sales hilang.';
  end if;


  raise notice
    'STAGE 2B VERIFIED SUCCESSFULLY.';
end;
$$;