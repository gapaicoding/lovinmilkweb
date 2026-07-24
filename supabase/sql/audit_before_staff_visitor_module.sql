-- READ ONLY. Jalankan sebelum migration Sprint 5 dan simpan hasilnya.
BEGIN TRANSACTION READ ONLY;

SELECT current_database(), current_user, now();

SELECT n.nspname schema_name, t.typname type_name, e.enumlabel, e.enumsortorder
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
LEFT JOIN pg_enum e ON e.enumtypid=t.oid
WHERE n.nspname='public' AND t.typname='app_role'
ORDER BY e.enumsortorder;

SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN (
  'profiles','user_roles','sales','expenses','products','visitors','visitor_visits'
)
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass table_name, conname, contype, pg_get_constraintdef(oid) definition
FROM pg_constraint
WHERE conrelid = ANY (
  array_remove(ARRAY[
    to_regclass('public.profiles'),
    to_regclass('public.user_roles'),
    to_regclass('public.sales'),
    to_regclass('public.expenses'),
    to_regclass('public.products'),
    to_regclass('public.visitors'),
    to_regclass('public.visitor_visits')
  ], NULL)
)
ORDER BY conrelid::regclass::text, conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('profiles','user_roles','sales','expenses','products','visitors','visitor_visits')
ORDER BY tablename,indexname;

SELECT event_object_table, trigger_name, action_timing, event_manipulation, action_statement
FROM information_schema.triggers WHERE trigger_schema='public'
AND event_object_table IN (
  'sales','expenses','products','profiles','user_roles','visitors','visitor_visits'
)
ORDER BY event_object_table,trigger_name;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public'
AND tablename IN ('profiles','user_roles','sales','expenses','products','visitors','visitor_visits')
ORDER BY tablename,policyname;

SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args,
  p.prosecdef security_definer, p.proconfig, pg_get_functiondef(p.oid) definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (
  p.proname ILIKE '%role%' OR p.proname ILIKE '%admin%'
  OR p.proname ILIKE '%active%' OR p.proname IN (
    'soft_delete_sale','soft_delete_expense','current_user_is_active','is_super_admin'
  )
) ORDER BY p.proname;

SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee='authenticated'
AND table_name IN ('profiles','user_roles','sales','expenses','products','visitors','visitor_visits')
ORDER BY table_name,privilege_type;

SELECT routine_name, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema='public' AND grantee='authenticated'
ORDER BY routine_name,privilege_type;

SELECT c.relname, c.relrowsecurity rls_enabled, c.relforcerowsecurity rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
  'profiles','user_roles','sales','expenses','products','visitors','visitor_visits'
);

-- Tidak melakukan SELECT langsung dari user_roles/profiles.role karena keduanya
-- merupakan object opsional. Metadata kolom dan enum di atas tetap menunjukkan
-- implementasi role tanpa menyebabkan audit gagal saat object belum tersedia.
ROLLBACK;
