begin;

create table public.visitor_daily_recap_submissions (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  outlet_id uuid not null references public.outlets(id),
  business_date date not null,
  operation text not null check (operation = 'create_or_append_visitor_daily_recap_v3'),
  request_fingerprint text not null,
  recap_id uuid references public.visitor_daily_recaps(id),
  response jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
create index idx_visitor_daily_recap_submissions_scope on public.visitor_daily_recap_submissions(actor_id, outlet_id, business_date, operation);

create or replace function public.create_or_append_visitor_daily_recap_v3(
  p_business_date date,
  p_outlet_id uuid,
  p_inputter_session_id uuid,
  p_recorder_name text default null,
  p_entries jsonb default '[]',
  p_request_id uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare
  v record;
  v_header_name text;
  v_existing jsonb;
  v_request_fingerprint text;
  v_submission public.visitor_daily_recap_submissions%rowtype;
begin
  if p_request_id is null then
    raise exception 'Request idempotency key wajib diisi.' using errcode='22023';
  end if;

  select s.* into v
  from public.lm_require_operational_inputter_session(p_inputter_session_id, 'visitors', p_outlet_id) s;

  v_request_fingerprint := md5(jsonb_build_object(
    'actor_id', auth.uid(),
    'business_date', p_business_date,
    'outlet_id', v.outlet_id,
    'inputter_session_id', p_inputter_session_id,
    'recorder_name', p_recorder_name,
    'entries', coalesce(p_entries, '[]'::jsonb)
  )::text);

  select * into v_submission
  from public.visitor_daily_recap_submissions
  where request_id = p_request_id
  for update;

  if found then
    if v_submission.actor_id <> auth.uid()
      or v_submission.outlet_id <> v.outlet_id
      or v_submission.business_date <> p_business_date
      or v_submission.operation <> 'create_or_append_visitor_daily_recap_v3'
      or v_submission.request_fingerprint <> v_request_fingerprint then
      raise exception 'Kunci idempotensi sudah digunakan untuk permintaan lain.' using errcode='22023';
    end if;
    if v_submission.response is null then
      raise exception 'Permintaan simpan masih diproses.' using errcode='55000';
    end if;
    return v_submission.response;
  end if;

  insert into public.visitor_daily_recap_submissions (
    request_id,
    actor_id,
    outlet_id,
    business_date,
    operation,
    request_fingerprint
  ) values (
    p_request_id,
    auth.uid(),
    v.outlet_id,
    p_business_date,
    'create_or_append_visitor_daily_recap_v3',
    v_request_fingerprint
  );

  perform set_config('app.operational_inputter_session_id', p_inputter_session_id::text, true);
  perform set_config('app.operational_inputter_section', 'visitors', true);
  v_header_name := case
    when exists(
      select 1
      from public.visitor_daily_recaps r
      where r.outlet_id = v.outlet_id
        and r.business_date = p_business_date
        and r.deleted_at is null
    ) then null
    else v.inputter_name
  end;

  v_existing := public.create_or_append_visitor_daily_recap(p_business_date, v.outlet_id, v_header_name, p_entries);

  update public.visitor_daily_recap_submissions
  set recap_id = (v_existing->>'id')::uuid,
      response = v_existing,
      completed_at = clock_timestamp()
  where request_id = p_request_id;

  return v_existing;
exception when unique_violation then
  select * into v_submission
  from public.visitor_daily_recap_submissions
  where request_id = p_request_id;
  if not found then
    raise exception 'Permintaan simpan sedang diproses ulang.' using errcode='40001';
  end if;
  if v_submission.actor_id <> auth.uid()
    or v_submission.outlet_id <> v.outlet_id
    or v_submission.business_date <> p_business_date
    or v_submission.operation <> 'create_or_append_visitor_daily_recap_v3'
    or v_submission.request_fingerprint <> v_request_fingerprint then
    raise exception 'Kunci idempotensi sudah digunakan untuk permintaan lain.' using errcode='22023';
  end if;
  if v_submission.response is null then
    raise exception 'Permintaan simpan masih diproses.' using errcode='55000';
  end if;
  return v_submission.response;
end $$;

revoke all on table public.visitor_daily_recap_submissions from public, anon, authenticated;
alter table public.visitor_daily_recap_submissions enable row level security;

revoke all on function public.create_or_append_visitor_daily_recap_v3(date,uuid,uuid,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.create_or_append_visitor_daily_recap_v3(date,uuid,uuid,text,jsonb,uuid) to authenticated;

commit;
