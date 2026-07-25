-- Read-only verification for:
--   20260724144000_harden_profile_authorization.sql
-- Run as a database administration role after applying the migration.

-- 1. Canonical role/status defaults and column types.
SELECT
  column_name,
  udt_schema,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('role', 'is_active')
ORDER BY ordinal_position;

-- Expected:
--   role      | public | app_role | NO | 'staff'::app_role
--   is_active | pg_catalog | bool | NO | false

-- 2. Table-level privileges. anon/PUBLIC must have none. authenticated must
-- only have SELECT at table level; UPDATE is granted at column level below.
SELECT
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

-- 3. authenticated UPDATE must be limited to full_name and avatar_url.
SELECT
  grantee,
  column_name,
  privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee, privilege_type, column_name;

-- Expected authenticated column UPDATE rows: avatar_url and full_name only.
-- Expected anon/PUBLIC rows: none.

-- 4. Effective privilege matrix (all columns remain SELECT-able after RLS;
-- only the two display columns are UPDATE-able).
SELECT
  pg_catalog.has_table_privilege(
    'anon',
    'public.profiles',
    'SELECT'
  ) AS anon_select,
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.profiles',
    'SELECT'
  ) AS authenticated_select,
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.profiles',
    'INSERT'
  ) AS authenticated_insert,
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.profiles',
    'DELETE'
  ) AS authenticated_delete,
  pg_catalog.has_column_privilege(
    'authenticated',
    'public.profiles',
    'full_name',
    'UPDATE'
  ) AS authenticated_update_full_name,
  pg_catalog.has_column_privilege(
    'authenticated',
    'public.profiles',
    'avatar_url',
    'UPDATE'
  ) AS authenticated_update_avatar_url,
  pg_catalog.has_column_privilege(
    'authenticated',
    'public.profiles',
    'role',
    'UPDATE'
  ) AS authenticated_update_role,
  pg_catalog.has_column_privilege(
    'authenticated',
    'public.profiles',
    'is_active',
    'UPDATE'
  ) AS authenticated_update_is_active;

-- Expected:
--   false, true, false, false, true, true, false, false

-- 5. Exactly two authenticated profile policies should remain.
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY policyname;

-- Expected policies:
--   profiles_select_own_or_super_admin | SELECT
--   profiles_update_own_display        | UPDATE

-- 6. RLS must remain enabled. FORCE is intentionally false because the
-- authorization RPC is SECURITY DEFINER and owned by the table owner.
SELECT
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relname = 'profiles';

-- Expected: true, false

-- 7. Function security mode, search_path, row_security, and ACL.
SELECT
  proc.proname,
  pg_catalog.pg_get_function_identity_arguments(proc.oid)
    AS identity_arguments,
  proc.prosecdef AS security_definer,
  proc.proconfig,
  proc.proacl
FROM pg_catalog.pg_proc AS proc
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = proc.pronamespace
WHERE namespace.nspname = 'public'
  AND proc.proname IN (
    'admin_update_profile_authorization',
    'current_user_is_active',
    'handle_new_user',
    'is_super_admin'
  )
ORDER BY proc.proname, identity_arguments;

-- 8. Effective EXECUTE privileges for exposed and trigger-only functions.
SELECT
  pg_catalog.has_function_privilege(
    'anon',
    'public.current_user_is_active()',
    'EXECUTE'
  ) AS anon_current_user_is_active,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_user_is_active()',
    'EXECUTE'
  ) AS authenticated_current_user_is_active,
  pg_catalog.has_function_privilege(
    'anon',
    'public.is_super_admin()',
    'EXECUTE'
  ) AS anon_is_super_admin,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.is_super_admin()',
    'EXECUTE'
  ) AS authenticated_is_super_admin,
  pg_catalog.has_function_privilege(
    'anon',
    'public.admin_update_profile_authorization(uuid,public.app_role,boolean)',
    'EXECUTE'
  ) AS anon_authorization_rpc,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_update_profile_authorization(uuid,public.app_role,boolean)',
    'EXECUTE'
  ) AS authenticated_authorization_rpc,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.handle_new_user()',
    'EXECUTE'
  ) AS authenticated_handle_new_user;

-- Expected:
--   false, true, false, true, false, true, false

-- 9. Signup source must explicitly use staff + inactive and ignore metadata
-- authorization fields.
SELECT pg_catalog.pg_get_functiondef(
  'public.handle_new_user()'::pg_catalog.regprocedure
) AS handle_new_user_definition;

-- 10. Confirm the auth signup trigger still points to handle_new_user.
SELECT
  trigger_entry.tgname,
  pg_catalog.pg_get_triggerdef(trigger_entry.oid, true) AS trigger_definition
FROM pg_catalog.pg_trigger AS trigger_entry
WHERE trigger_entry.tgrelid = 'auth.users'::pg_catalog.regclass
  AND NOT trigger_entry.tgisinternal
ORDER BY trigger_entry.tgname;

-- Expected on_auth_user_created -> public.handle_new_user()

-- 11. Operational invariant. The returned count must be >= 1.
SELECT
  COUNT(*) AS active_super_admin_count
FROM public.profiles
WHERE role = 'super_admin'::public.app_role
  AND is_active;

-- 12. Fail-closed assertions. The queries above are useful for inspection;
-- this block makes the verification command itself fail on any regression.
DO $authorization_assertions$
DECLARE
  v_handle_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
      AND udt_schema = 'public'
      AND udt_name = 'app_role'
      AND is_nullable = 'NO'
      AND column_default LIKE '%staff%'
  ) THEN
    RAISE EXCEPTION
      'Authorization verification failed: profiles.role default/type is unsafe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'is_active'
      AND udt_name = 'bool'
      AND is_nullable = 'NO'
      AND column_default = 'false'
  ) THEN
    RAISE EXCEPTION
      'Authorization verification failed: profiles.is_active default is unsafe.';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.profiles', 'SELECT')
    OR pg_catalog.has_table_privilege('anon', 'public.profiles', 'INSERT')
    OR pg_catalog.has_table_privilege('anon', 'public.profiles', 'UPDATE')
    OR pg_catalog.has_table_privilege('anon', 'public.profiles', 'DELETE')
  THEN
    RAISE EXCEPTION
      'Authorization verification failed: anon has profiles privileges.';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
    'authenticated',
    'public.profiles',
    'SELECT'
  )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.profiles',
      'INSERT'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.profiles',
      'DELETE'
    )
    OR NOT pg_catalog.has_column_privilege(
      'authenticated',
      'public.profiles',
      'full_name',
      'UPDATE'
    )
    OR NOT pg_catalog.has_column_privilege(
      'authenticated',
      'public.profiles',
      'avatar_url',
      'UPDATE'
    )
    OR pg_catalog.has_column_privilege(
      'authenticated',
      'public.profiles',
      'role',
      'UPDATE'
    )
    OR pg_catalog.has_column_privilege(
      'authenticated',
      'public.profiles',
      'is_active',
      'UPDATE'
    )
  THEN
    RAISE EXCEPTION
      'Authorization verification failed: authenticated profile ACL is unsafe.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  ) <> 2
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname = 'profiles_select_own_or_super_admin'
        AND cmd = 'SELECT'
        AND roles::text[] = ARRAY['authenticated']::text[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname = 'profiles_update_own_display'
        AND cmd = 'UPDATE'
        AND roles::text[] = ARRAY['authenticated']::text[]
    )
  THEN
    RAISE EXCEPTION
      'Authorization verification failed: canonical profile policies differ.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation
    WHERE relation.oid = 'public.profiles'::regclass
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'Authorization verification failed: profiles RLS is disabled.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc proc
    WHERE proc.oid IN (
      'public.admin_update_profile_authorization(uuid,public.app_role,boolean)'::regprocedure,
      'public.current_user_is_active()'::regprocedure,
      'public.handle_new_user()'::regprocedure,
      'public.is_super_admin()'::regprocedure
    )
      AND (
        NOT proc.prosecdef
        OR NOT (
          coalesce(proc.proconfig, '{}'::text[])
          @> ARRAY[
            'search_path=pg_catalog, pg_temp',
            'row_security=off'
          ]::text[]
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Authorization verification failed: function security settings differ.';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'public.current_user_is_active()',
    'EXECUTE'
  )
    OR pg_catalog.has_function_privilege(
      'anon',
      'public.is_super_admin()',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'anon',
      'public.admin_update_profile_authorization(uuid,public.app_role,boolean)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.current_user_is_active()',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.is_super_admin()',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.admin_update_profile_authorization(uuid,public.app_role,boolean)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.handle_new_user()',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION
      'Authorization verification failed: function EXECUTE ACL differs.';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.handle_new_user()'::regprocedure
  )
  INTO v_handle_definition;

  IF v_handle_definition NOT LIKE '%''staff''::public.app_role%'
    OR v_handle_definition NOT LIKE '%false%'
    OR v_handle_definition LIKE '%raw_user_meta_data ->> ''role''%'
    OR v_handle_definition LIKE '%raw_user_meta_data ->> ''is_active''%'
  THEN
    RAISE EXCEPTION
      'Authorization verification failed: signup function is unsafe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger trigger
    WHERE trigger.tgrelid = 'auth.users'::regclass
      AND NOT trigger.tgisinternal
      AND trigger.tgfoid = 'public.handle_new_user()'::regprocedure
  ) THEN
    RAISE EXCEPTION
      'Authorization verification failed: signup trigger is missing.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.profiles
    WHERE role = 'super_admin'::public.app_role
      AND is_active
  ) < 1 THEN
    RAISE EXCEPTION
      'Authorization verification failed: no active Super Admin remains.';
  END IF;

  RAISE NOTICE
    'PROFILE AUTHORIZATION HARDENING VERIFICATION PASSED.';
END;
$authorization_assertions$;
