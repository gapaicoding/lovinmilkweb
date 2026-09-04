begin;

-- Physical state and canonical resolution are inspected before assuming an RLS cause.
select o.id as outlet_id, o.name, o.is_default, o.is_active, o.deleted_at, o.created_at
from public.outlets o
where o.is_default = true
order by o.created_at, o.id;

select
  f.id as form_version_id,
  f.outlet_id as form_outlet_id,
  o.name as outlet_name,
  f.version_number,
  f.is_active,
  count(q.id)::integer as question_count
from public.customer_interview_form_versions f
join public.outlets o on o.id = f.outlet_id
left join public.customer_interview_questions q on q.form_version_id = f.id
where f.is_active = true
group by f.id, f.outlet_id, o.name, f.version_number, f.is_active
order by f.outlet_id;

select public.lm_resolve_sales_outlet(null) as canonical_outlet_id;

select p.oid::regprocedure as function_name, pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.oid in (
  'public.lm_resolve_sales_outlet(uuid)'::regprocedure,
  'public.lm_is_active_staff_or_above()'::regprocedure
)
order by 1;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'customer_interview_form_versions',
    'customer_interview_questions',
    'customer_interviews',
    'customer_interview_answers'
  )
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'customer_interview_form_versions',
    'customer_interview_questions',
    'customer_interviews',
    'customer_interview_answers'
  )
order by table_name, grantee, privilege_type;

create temporary table wot_actor_results (
  actor_role text,
  actor_id uuid,
  helper_result boolean,
  resolved_outlet_id uuid,
  frontend_outlet_id uuid,
  visible_active_forms integer,
  visible_questions integer,
  visible_cross_outlet_forms integer,
  resolver_error text,
  form_read_error text,
  question_read_error text
) on commit drop;

do $diagnostic$
declare
  v_actor record;
  v_helper boolean;
  v_resolved uuid;
  v_canonical uuid := public.lm_resolve_sales_outlet(null);
  v_frontend uuid;
  v_forms integer;
  v_questions integer;
  v_cross integer;
  v_resolver_error text;
  v_form_error text;
  v_question_error text;
begin
  for v_actor in
    select distinct on (p.role::text) p.id, p.role::text as actor_role
    from public.profiles p
    where p.is_active = true
      and p.role::text in ('staff', 'admin', 'super_admin')
    order by p.role::text, p.created_at desc nulls last, p.id
  loop
    perform set_config('request.jwt.claim.sub', v_actor.id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;

    select public.lm_is_active_staff_or_above() into v_helper;
    select o.id into v_frontend
      from public.outlets o
      where o.is_default = true and o.is_active = true and o.deleted_at is null
      limit 1;

    begin
      select public.lm_resolve_sales_outlet(null) into v_resolved;
    exception when others then
      v_resolver_error := sqlstate || ': ' || sqlerrm;
    end;

    begin
      select count(*)::integer into v_forms
        from public.customer_interview_form_versions
        where is_active = true and outlet_id = v_canonical;
      select count(*)::integer into v_cross
        from public.customer_interview_form_versions
        where is_active = true and outlet_id <> v_canonical;
    exception when others then
      v_form_error := sqlstate || ': ' || sqlerrm;
    end;

    begin
      select count(*)::integer into v_questions
        from public.customer_interview_questions q
        where exists (
          select 1 from public.customer_interview_form_versions f
          where f.id = q.form_version_id and f.is_active = true and f.outlet_id = v_canonical
        );
    exception when others then
      v_question_error := sqlstate || ': ' || sqlerrm;
    end;

    reset role;
    insert into wot_actor_results values (
      v_actor.actor_role, v_actor.id, v_helper, v_resolved, v_frontend,
      v_forms, v_questions, v_cross,
      v_resolver_error, v_form_error, v_question_error
    );
  end loop;
end
$diagnostic$;

select jsonb_build_object(
  'default_outlets', (
    select jsonb_agg(to_jsonb(x) order by x.created_at, x.outlet_id)
    from (
      select o.id as outlet_id, o.name, o.is_default, o.is_active, o.deleted_at, o.created_at
      from public.outlets o where o.is_default = true
    ) x
  ),
  'active_forms', (
    select jsonb_agg(to_jsonb(x) order by x.form_outlet_id)
    from (
      select f.id as form_version_id, f.outlet_id as form_outlet_id, o.name as outlet_name,
        f.version_number, f.is_active, count(q.id)::integer as question_count
      from public.customer_interview_form_versions f
      join public.outlets o on o.id = f.outlet_id
      left join public.customer_interview_questions q on q.form_version_id = f.id
      where f.is_active = true
      group by f.id, f.outlet_id, o.name, f.version_number, f.is_active
    ) x
  ),
  'canonical_outlet_id', public.lm_resolve_sales_outlet(null),
  'authenticated_results', (
    select jsonb_agg(to_jsonb(r) order by r.actor_role) from wot_actor_results r
  ),
  'policies', (
    select jsonb_agg(to_jsonb(x) order by x.tablename, x.policyname)
    from (
      select tablename, policyname, roles, cmd, qual, with_check
      from pg_policies
      where schemaname = 'public'
        and tablename in (
          'customer_interview_form_versions', 'customer_interview_questions',
          'customer_interviews', 'customer_interview_answers'
        )
    ) x
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', p.oid::regprocedure::text,
      'definition', pg_get_functiondef(p.oid),
      'authenticated_can_execute', has_function_privilege('authenticated', p.oid, 'execute')
    ) order by p.oid::regprocedure::text)
    from pg_proc p
    where p.oid in (
      'public.lm_resolve_sales_outlet(uuid)'::regprocedure,
      'public.lm_is_active_staff_or_above()'::regprocedure
    )
  ),
  'table_grants', (
    select jsonb_agg(to_jsonb(x) order by x.table_name, x.grantee, x.privilege_type)
    from (
      select grantee, table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in (
          'customer_interview_form_versions', 'customer_interview_questions',
          'customer_interviews', 'customer_interview_answers'
        )
    ) x
  )
) as diagnosis;

rollback;
