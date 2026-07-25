-- Read-only remote schema and authorization audit for the June 2026 release.
-- This intentionally returns metadata only: no profile, visitor, or transaction rows.

set timezone = 'Asia/Jakarta';

with
required_objects(object_name) as (
  values
    ('public.profiles'),
    ('public.user_roles'),
    ('public.sales_categories'),
    ('public.products'),
    ('public.sales'),
    ('public.expense_categories'),
    ('public.expense_items'),
    ('public.expenses'),
    ('public.visitors'),
    ('public.visitor_visits')
),
objects as (
  select
    r.object_name,
    c.relkind,
    c.relrowsecurity,
    c.relforcerowsecurity
  from required_objects r
  left join pg_class c
    on c.oid = to_regclass(r.object_name)
),
profile_columns as (
  select
    ordinal_position,
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
),
critical_columns as (
  select
    table_name,
    column_name,
    data_type,
    udt_name,
    is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'sales',
      'expenses',
      'products',
      'expense_items',
      'visitors',
      'visitor_visits'
    )
),
enum_values as (
  select
    t.typname,
    e.enumlabel,
    e.enumsortorder
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
  where n.nspname = 'public'
    and t.typname = 'app_role'
),
critical_functions as (
  select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_userbyid(p.proowner) as owner_name,
    p.prosecdef as security_definer,
    p.proconfig,
    coalesce(p.proacl::text, '') as acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'has_role',
      'is_active_user',
      'current_user_is_active',
      'current_user_has_any_role',
      'current_user_is_product_manager',
      'is_admin_or_super_admin',
      'handle_new_user',
      'soft_delete_sale',
      'soft_delete_expense',
      'require_visitor_role',
      'insert_visitor_sales',
      'search_operational_visitors',
      'record_visitor_purchase',
      'add_visitor_purchase',
      'check_out_visitor',
      'list_visitor_visits',
      'list_visitors_admin'
    )
),
critical_policies as (
  select
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'profiles',
      'user_roles',
      'sales',
      'expenses',
      'visitors',
      'visitor_visits'
    )
),
profile_table_grants as (
  select grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'profiles'
),
profile_column_grants as (
  select grantee, column_name, privilege_type
  from information_schema.role_column_grants
  where table_schema = 'public'
    and table_name = 'profiles'
),
auth_user_triggers as (
  select
    tg.tgname as trigger_name,
    pn.nspname as function_schema,
    p.proname as function_name,
    pg_get_triggerdef(tg.oid, true) as trigger_definition
  from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = tg.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
  where n.nspname = 'auth'
    and c.relname = 'users'
    and not tg.tgisinternal
),
migration_history as (
  select
    case
      when to_regclass('supabase_migrations.schema_migrations') is null
        then 'absent'
      else 'present'
    end as history_state
)
select jsonb_pretty(
  jsonb_build_object(
    'database', jsonb_build_object(
      'name', current_database(),
      'role', current_user,
      'server_version', current_setting('server_version'),
      'timezone', current_setting('TimeZone')
    ),
    'objects', coalesce(
      (select jsonb_agg(to_jsonb(o) order by o.object_name) from objects o),
      '[]'::jsonb
    ),
    'profile_columns', coalesce(
      (
        select jsonb_agg(to_jsonb(c) order by c.ordinal_position)
        from profile_columns c
      ),
      '[]'::jsonb
    ),
    'critical_columns', coalesce(
      (
        select jsonb_agg(to_jsonb(c) order by c.table_name, c.column_name)
        from critical_columns c
      ),
      '[]'::jsonb
    ),
    'app_role_values', coalesce(
      (select jsonb_agg(to_jsonb(e) order by e.enumsortorder) from enum_values e),
      '[]'::jsonb
    ),
    'critical_functions', coalesce(
      (
        select jsonb_agg(to_jsonb(f) order by f.proname, f.identity_arguments)
        from critical_functions f
      ),
      '[]'::jsonb
    ),
    'critical_policies', coalesce(
      (
        select jsonb_agg(to_jsonb(p) order by p.tablename, p.policyname)
        from critical_policies p
      ),
      '[]'::jsonb
    ),
    'profile_table_grants', coalesce(
      (
        select jsonb_agg(to_jsonb(g) order by g.grantee, g.privilege_type)
        from profile_table_grants g
      ),
      '[]'::jsonb
    ),
    'profile_column_grants', coalesce(
      (
        select jsonb_agg(to_jsonb(g) order by g.grantee, g.column_name, g.privilege_type)
        from profile_column_grants g
      ),
      '[]'::jsonb
    ),
    'auth_user_triggers', coalesce(
      (
        select jsonb_agg(to_jsonb(t) order by t.trigger_name)
        from auth_user_triggers t
      ),
      '[]'::jsonb
    ),
    'migration_history_state', (
      select history_state from migration_history
    )
  )
) as audit;
