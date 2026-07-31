-- ============================================================
-- VERIFY STAGE 2A
-- Multi-item Sales Transaction Foundation
-- ============================================================


-- ============================================================
-- 1. TABLES
-- ============================================================

select
  to_regclass(
    'public.sales_transactions'
  ) as sales_transactions,
  to_regclass(
    'public.sales_items'
  ) as sales_items,
  to_regclass(
    'public.sales'
  ) as legacy_sales;


-- Expected:
--
-- sales_transactions | sales_items | legacy_sales
-- ------------------------------------------------
-- sales_transactions | sales_items | sales


-- ============================================================
-- 2. ROW COUNTS
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
-- transaction_count = 0
-- item_count        = 0


-- ============================================================
-- 3. COLUMNS
-- ============================================================

select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default,
  is_generated,
  generation_expression
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'sales_transactions',
    'sales_items'
  )
order by
  table_name,
  ordinal_position;


-- ============================================================
-- 4. CONSTRAINTS
-- ============================================================

select
  conrelid::regclass as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.sales_transactions'::regclass,
  'public.sales_items'::regclass
)
order by
  conrelid::regclass::text,
  conname;


-- ============================================================
-- 5. INDEXES
-- ============================================================

select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'sales_transactions',
    'sales_items'
  )
order by
  tablename,
  indexname;


-- ============================================================
-- 6. TRIGGERS
-- ============================================================

select
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'sales_transactions',
    'sales_items'
  )
order by
  event_object_table,
  trigger_name,
  event_manipulation;


-- ============================================================
-- 7. RLS
-- ============================================================

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'sales_transactions',
    'sales_items'
  )
order by c.relname;


-- Expected:
--
-- rls_enabled = true


-- ============================================================
-- 8. POLICIES
-- ============================================================

select
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'sales_transactions',
    'sales_items'
  )
order by
  tablename,
  cmd,
  policyname;


-- Expected:
--
-- sales_transactions_select_staff | SELECT
-- sales_items_select_staff        | SELECT
--
-- TIDAK ADA INSERT / UPDATE / DELETE policy.


-- ============================================================
-- 9. AUTHENTICATED TABLE PRIVILEGES
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
-- 10. ANON MUST HAVE NO TABLE PRIVILEGE
-- ============================================================

select
  'sales_transactions'
    as table_name,

  has_table_privilege(
    'anon',
    'public.sales_transactions',
    'SELECT'
  ) as can_select,

  has_table_privilege(
    'anon',
    'public.sales_transactions',
    'INSERT'
  ) as can_insert,

  has_table_privilege(
    'anon',
    'public.sales_transactions',
    'UPDATE'
  ) as can_update,

  has_table_privilege(
    'anon',
    'public.sales_transactions',
    'DELETE'
  ) as can_delete

union all

select
  'sales_items',

  has_table_privilege(
    'anon',
    'public.sales_items',
    'SELECT'
  ),

  has_table_privilege(
    'anon',
    'public.sales_items',
    'INSERT'
  ),

  has_table_privilege(
    'anon',
    'public.sales_items',
    'UPDATE'
  ),

  has_table_privilege(
    'anon',
    'public.sales_items',
    'DELETE'
  );


-- Expected all FALSE.


-- ============================================================
-- 11. LEGACY SALES MUST STILL EXIST
-- ============================================================

select
  count(*) as legacy_sales_count
from public.sales;


-- Nilainya bebas.
-- Yang penting query berhasil dan table tidak di-drop.


-- ============================================================
-- 12. OWNERSHIP FUNCTION
-- ============================================================

select
  p.proname,
  pg_get_function_identity_arguments(
    p.oid
  ) as arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname =
    'lm_validate_sales_item_ownership';


-- Expected:
--
-- lm_validate_sales_item_ownership
-- security_definer = true


-- ============================================================
-- 13. HARD ASSERTIONS
-- ============================================================

do $$
declare
  v_transaction_count bigint;
  v_item_count bigint;
begin
  if to_regclass(
    'public.sales_transactions'
  ) is null then
    raise exception
      'VERIFY FAILED: sales_transactions missing.';
  end if;


  if to_regclass(
    'public.sales_items'
  ) is null then
    raise exception
      'VERIFY FAILED: sales_items missing.';
  end if;


  if to_regclass(
    'public.sales'
  ) is null then
    raise exception
      'VERIFY FAILED: legacy sales missing.';
  end if;


  select count(*)
  into v_transaction_count
  from public.sales_transactions;


  select count(*)
  into v_item_count
  from public.sales_items;


  if v_transaction_count <> 0 then
    raise exception
      'VERIFY FAILED: sales_transactions expected 0 rows, found %.',
      v_transaction_count;
  end if;


  if v_item_count <> 0 then
    raise exception
      'VERIFY FAILED: sales_items expected 0 rows, found %.',
      v_item_count;
  end if;


  if not exists (
    select 1
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname =
        'sales_transactions'
      and c.relrowsecurity = true
  ) then
    raise exception
      'VERIFY FAILED: RLS sales_transactions tidak aktif.';
  end if;


  if not exists (
    select 1
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname =
        'sales_items'
      and c.relrowsecurity = true
  ) then
    raise exception
      'VERIFY FAILED: RLS sales_items tidak aktif.';
  end if;


  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename =
        'sales_transactions'
      and policyname =
        'sales_transactions_select_staff'
      and cmd = 'SELECT'
  ) then
    raise exception
      'VERIFY FAILED: sales_transactions SELECT policy missing.';
  end if;


  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename =
        'sales_items'
      and policyname =
        'sales_items_select_staff'
      and cmd = 'SELECT'
  ) then
    raise exception
      'VERIFY FAILED: sales_items SELECT policy missing.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'INSERT'
  ) then
    raise exception
      'VERIFY FAILED: authenticated masih memiliki INSERT sales_transactions.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_items',
    'INSERT'
  ) then
    raise exception
      'VERIFY FAILED: authenticated masih memiliki INSERT sales_items.';
  end if;


  raise notice
    'STAGE 2A VERIFIED SUCCESSFULLY.';
end;
$$;