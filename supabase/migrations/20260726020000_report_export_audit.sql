begin;

create or replace function public.record_report_export(
  p_report_type text,
  p_start_date date,
  p_end_date date,
  p_filters jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_allowed_reports constant text[] := array[
    'financial', 'sales', 'visitors', 'expenses', 'purchases',
    'products', 'suppliers', 'assets', 'depreciation'
  ];
begin
  if not public.lm_is_active_staff_or_above() then
    raise exception 'Active Staff, Admin, or Super Admin access is required.'
      using errcode = '42501';
  end if;
  if p_report_type is null or not (p_report_type = any(v_allowed_reports)) then
    raise exception 'Unknown report type.' using errcode = '22023';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Invalid export date range.' using errcode = '22023';
  end if;
  if p_report_type in ('financial', 'purchases', 'suppliers', 'assets', 'depreciation')
     and not public.lm_is_active_admin() then
    raise exception 'Admin or Super Admin access is required for this export.'
      using errcode = '42501';
  end if;

  insert into public.business_audit_log (
    entity_type,
    entity_id,
    operation,
    before_data,
    after_data,
    reason,
    actor_id,
    occurred_at
  )
  values (
    'report_export',
    gen_random_uuid(),
    'export',
    null,
    jsonb_build_object(
      'report_type', p_report_type,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'filters', coalesce(p_filters, '{}'::jsonb),
      'timezone', 'Asia/Jakarta'
    ),
    'User initiated Excel export',
    auth.uid(),
    clock_timestamp()
  );
end;
$function$;

revoke all on function public.record_report_export(text, date, date, jsonb)
  from public, anon;
grant execute on function public.record_report_export(text, date, date, jsonb)
  to authenticated, service_role;

comment on function public.record_report_export(text, date, date, jsonb) is
  'Records metadata-only audit events for authorized Excel report exports; workbook contents are never stored.';

commit;
