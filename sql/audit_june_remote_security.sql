-- Compact read-only security and migration-evidence audit.

set timezone = 'Asia/Jakarta';

with
profile_policies as (
  select policyname, cmd, roles, qual, with_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
),
profile_grants as (
  select
    grantee,
    array_agg(privilege_type order by privilege_type) as privileges
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'profiles'
    and grantee in ('anon', 'authenticated', 'service_role')
  group by grantee
),
authorization_column_grants as (
  select grantee, column_name, privilege_type
  from information_schema.role_column_grants
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name in ('role', 'is_active')
    and privilege_type in ('INSERT', 'UPDATE')
    and grantee in ('anon', 'authenticated')
),
function_security as (
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
auth_triggers as (
  select
    tg.tgname as trigger_name,
    pn.nspname as function_schema,
    p.proname as function_name
  from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = tg.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
  where n.nspname = 'auth'
    and c.relname = 'users'
    and not tg.tgisinternal
),
handle_new_user_definition as (
  select pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'handle_new_user'
    and pg_get_function_identity_arguments(p.oid) = ''
),
migration_evidence as (
  select jsonb_build_object(
    '20260722072548', jsonb_build_object(
      'app_role', to_regtype('public.app_role') is not null,
      'profiles', to_regclass('public.profiles') is not null,
      'sales_categories', to_regclass('public.sales_categories') is not null,
      'expense_categories', to_regclass('public.expense_categories') is not null,
      'sales', to_regclass('public.sales') is not null,
      'expenses', to_regclass('public.expenses') is not null,
      'has_role', to_regprocedure('public.has_role(uuid,public.app_role)') is not null,
      'is_active_user', to_regprocedure('public.is_active_user(uuid)') is not null,
      'handle_new_user', to_regprocedure('public.handle_new_user()') is not null,
      'auth_trigger', exists (select 1 from auth_triggers)
    ),
    '20260722072609', jsonb_build_object(
      'has_role_public_execute_revoked',
        not exists (
          select 1
          from information_schema.routine_privileges
          where routine_schema = 'public'
            and routine_name = 'has_role'
            and grantee = 'PUBLIC'
            and privilege_type = 'EXECUTE'
        ),
      'is_active_user_public_execute_revoked',
        not exists (
          select 1
          from information_schema.routine_privileges
          where routine_schema = 'public'
            and routine_name = 'is_active_user'
            and grantee = 'PUBLIC'
            and privilege_type = 'EXECUTE'
        ),
      'handle_new_user_authenticated_execute_revoked',
        not has_function_privilege(
          'authenticated',
          'public.handle_new_user()',
          'EXECUTE'
        )
    ),
    '20260724143000', jsonb_build_object(
      'staff_enum', exists (
        select 1
        from pg_enum e
        where e.enumtypid = 'public.app_role'::regtype
          and e.enumlabel = 'staff'
      ),
      'current_user_has_any_role',
        to_regprocedure('public.current_user_has_any_role(text[])') is not null,
      'soft_delete_sale',
        to_regprocedure('public.soft_delete_sale(uuid)') is not null,
      'soft_delete_expense',
        to_regprocedure('public.soft_delete_expense(uuid)') is not null
    ),
    '20260724143100', jsonb_build_object(
      'visitors', to_regclass('public.visitors') is not null,
      'visitor_visits', to_regclass('public.visitor_visits') is not null,
      'sales_visitor_visit_id', exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'sales'
          and column_name = 'visitor_visit_id'
      ),
      'sales_entry_source', exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'sales'
          and column_name = 'entry_source'
      )
    ),
    '20260724143200', jsonb_build_object(
      'require_visitor_role',
        to_regprocedure('public.require_visitor_role(text[])') is not null,
      'insert_visitor_sales',
        exists (
          select 1 from function_security where proname = 'insert_visitor_sales'
        ),
      'search_operational_visitors',
        exists (
          select 1 from function_security where proname = 'search_operational_visitors'
        ),
      'record_visitor_purchase',
        exists (
          select 1 from function_security where proname = 'record_visitor_purchase'
        ),
      'list_visitor_visits',
        exists (
          select 1 from function_security where proname = 'list_visitor_visits'
        ),
      'list_visitors_admin',
        exists (
          select 1 from function_security where proname = 'list_visitors_admin'
        )
    )
  ) as evidence
)
select jsonb_pretty(
  jsonb_build_object(
    'profile_policies', coalesce(
      (
        select jsonb_agg(to_jsonb(p) order by p.policyname)
        from profile_policies p
      ),
      '[]'::jsonb
    ),
    'profile_grants', coalesce(
      (
        select jsonb_agg(to_jsonb(g) order by g.grantee)
        from profile_grants g
      ),
      '[]'::jsonb
    ),
    'authorization_column_grants', coalesce(
      (
        select jsonb_agg(
          to_jsonb(g)
          order by g.grantee, g.column_name, g.privilege_type
        )
        from authorization_column_grants g
      ),
      '[]'::jsonb
    ),
    'function_security', coalesce(
      (
        select jsonb_agg(
          to_jsonb(f)
          order by f.proname, f.identity_arguments
        )
        from function_security f
      ),
      '[]'::jsonb
    ),
    'auth_triggers', coalesce(
      (
        select jsonb_agg(to_jsonb(t) order by t.trigger_name)
        from auth_triggers t
      ),
      '[]'::jsonb
    ),
    'handle_new_user_definition', (
      select definition from handle_new_user_definition
    ),
    'migration_evidence', (
      select evidence from migration_evidence
    )
  )
) as audit;
