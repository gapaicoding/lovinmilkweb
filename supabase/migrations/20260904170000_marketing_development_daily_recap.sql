begin;

alter table public.operational_inputter_sessions
  drop constraint operational_inputter_sessions_section_check;
alter table public.operational_inputter_sessions
  add constraint operational_inputter_sessions_section_check
  check (section in ('sales','expenses','suppliers','visitors','interviews','marketing'));

create table public.marketing_daily_recaps (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  business_date date not null,
  registered_membership_total integer check (registered_membership_total is null or registered_membership_total >= 0),
  promo_claim_count integer not null default 0 check (promo_claim_count >= 0),
  google_star_1_count integer not null default 0 check (google_star_1_count >= 0),
  google_star_2_count integer not null default 0 check (google_star_2_count >= 0),
  google_star_3_count integer not null default 0 check (google_star_3_count >= 0),
  google_star_4_count integer not null default 0 check (google_star_4_count >= 0),
  google_star_5_count integer not null default 0 check (google_star_5_count >= 0),
  customer_engagement_count integer not null default 0 check (customer_engagement_count >= 0),
  inputter_name text not null check (btrim(inputter_name) <> '' and char_length(btrim(inputter_name)) <= 100),
  inputter_session_id uuid not null references public.operational_inputter_sessions(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  unique (outlet_id, business_date)
);
create index marketing_daily_recaps_period_idx on public.marketing_daily_recaps(outlet_id,business_date);

create table public.marketing_daily_membership_entries (
  id uuid primary key default gen_random_uuid(),
  recap_id uuid not null references public.marketing_daily_recaps(id) on delete cascade,
  member_name text not null check (btrim(member_name) <> '' and char_length(btrim(member_name)) <= 150),
  phone_number text not null check (btrim(phone_number) <> '' and char_length(btrim(phone_number)) <= 40 and btrim(phone_number) ~ '^[0-9+() ./-]+$'),
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default clock_timestamp(),
  unique (recap_id, sort_order)
);

create table public.marketing_daily_events (
  id uuid primary key default gen_random_uuid(),
  recap_id uuid not null references public.marketing_daily_recaps(id) on delete cascade,
  event_name text not null check (btrim(event_name) <> '' and char_length(btrim(event_name)) <= 200),
  registration_type text not null check (registration_type in ('PAID','UNPAID')),
  third_party text check (third_party is null or char_length(btrim(third_party)) <= 200),
  external_participant_count integer not null default 0 check (external_participant_count >= 0),
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default clock_timestamp(),
  unique (recap_id, sort_order)
);

create or replace function public.lm_require_operational_inputter_session(p_session_id uuid,p_section text,p_outlet_id uuid)
returns table(session_id uuid,inputter_name text,outlet_id uuid)
language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid;v_outlet uuid;v_row public.operational_inputter_sessions%rowtype;
begin
 v_actor:=public.require_visitor_role(array['staff','admin','super_admin']);
 if p_section not in ('sales','expenses','suppliers','visitors','interviews','marketing') then raise exception 'Bagian penginput tidak valid.' using errcode='22023';end if;
 v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);
 select * into v_row from public.operational_inputter_sessions s where s.id=p_session_id for update;
 if not found or v_row.actor_id<>v_actor or v_row.outlet_id<>v_outlet or v_row.section<>p_section or v_row.superseded_at is not null then raise exception 'Sesi penginput tidak valid atau sudah diganti.' using errcode='P0001';end if;
 if btrim(v_row.inputter_name)='' or char_length(btrim(v_row.inputter_name))>100 then raise exception 'Nama penginput sesi tidak valid.' using errcode='22023';end if;
 update public.operational_inputter_sessions set last_used_at=clock_timestamp() where id=v_row.id;
 return query select v_row.id,btrim(v_row.inputter_name),v_outlet;
end $$;

create or replace function public.start_operational_inputter_session(p_section text,p_inputter_name text,p_outlet_id uuid default null)
returns table(session_id uuid,outlet_id uuid,section text,inputter_name text,started_at timestamptz)
language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid;v_outlet uuid;v_name text;v_row public.operational_inputter_sessions%rowtype;
begin
 v_actor:=public.require_visitor_role(array['staff','admin','super_admin']);
 if p_section not in ('sales','expenses','suppliers','visitors','interviews','marketing') then raise exception 'Bagian penginput tidak valid.' using errcode='22023';end if;
 v_name:=btrim(p_inputter_name);if coalesce(v_name,'')='' then raise exception 'Nama penginput wajib diisi.' using errcode='22023';end if;
 if char_length(v_name)>100 then raise exception 'Nama penginput maksimal 100 karakter.' using errcode='22023';end if;
 v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);
 update public.operational_inputter_sessions s set superseded_at=clock_timestamp() where s.actor_id=v_actor and s.outlet_id=v_outlet and s.section=p_section and s.superseded_at is null;
 insert into public.operational_inputter_sessions(outlet_id,section,inputter_name,actor_id) values(v_outlet,p_section,v_name,v_actor) returning * into v_row;
 return query select v_row.id,v_row.outlet_id,v_row.section,v_row.inputter_name,v_row.started_at;
end $$;

create or replace function public.get_operational_inputter_history(p_section text,p_outlet_id uuid default null,p_limit integer default 20)
returns table(inputter_name text,section text,started_at timestamptz,last_used_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_outlet uuid;
begin
 perform public.require_visitor_role(array['staff','admin','super_admin']);
 if p_section not in ('sales','expenses','suppliers','visitors','interviews','marketing') then raise exception 'Bagian penginput tidak valid.' using errcode='22023';end if;
 v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);
 return query select s.inputter_name,s.section,s.started_at,s.last_used_at from public.operational_inputter_sessions s where s.outlet_id=v_outlet and s.section=p_section order by s.started_at desc limit greatest(1,least(coalesce(p_limit,20),100));
end $$;

create function public.save_marketing_daily_recap_v1(
 p_business_date date,p_registered_membership_total integer,p_promo_claim_count integer,
 p_google_star_1_count integer,p_google_star_2_count integer,p_google_star_3_count integer,
 p_google_star_4_count integer,p_google_star_5_count integer,p_customer_engagement_count integer,
 p_membership_entries jsonb,p_events jsonb,p_inputter_session_id uuid,p_outlet_id uuid default null
) returns uuid language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid;v_session record;v_recap uuid;v_item jsonb;v_name text;v_phone text;v_type text;v_third text;v_count integer;v_order integer;
begin
 v_actor:=public.require_visitor_role(array['staff','admin','super_admin']);
 if p_business_date is null then raise exception 'Tanggal wajib diisi.' using errcode='22023';end if;
 if p_registered_membership_total < 0 or p_promo_claim_count is null or p_promo_claim_count < 0 or
    p_google_star_1_count is null or p_google_star_1_count < 0 or p_google_star_2_count is null or p_google_star_2_count < 0 or
    p_google_star_3_count is null or p_google_star_3_count < 0 or p_google_star_4_count is null or p_google_star_4_count < 0 or
    p_google_star_5_count is null or p_google_star_5_count < 0 or p_customer_engagement_count is null or p_customer_engagement_count < 0
 then raise exception 'Semua jumlah harus berupa bilangan bulat non-negatif.' using errcode='22023';end if;
 if jsonb_typeof(coalesce(p_membership_entries,'[]')) <> 'array' or jsonb_typeof(coalesce(p_events,'[]')) <> 'array' then raise exception 'Detail Marketing harus berupa daftar.' using errcode='22023';end if;
 select * into v_session from public.lm_require_operational_inputter_session(p_inputter_session_id,'marketing',p_outlet_id);
 perform pg_advisory_xact_lock(hashtextextended('marketing-recap:'||v_session.outlet_id::text||':'||p_business_date::text,0));
 select id into v_recap from public.marketing_daily_recaps where outlet_id=v_session.outlet_id and business_date=p_business_date for update;
 if v_recap is null then
  insert into public.marketing_daily_recaps(outlet_id,business_date,registered_membership_total,promo_claim_count,google_star_1_count,google_star_2_count,google_star_3_count,google_star_4_count,google_star_5_count,customer_engagement_count,inputter_name,inputter_session_id,created_by,updated_by)
  values(v_session.outlet_id,p_business_date,p_registered_membership_total,p_promo_claim_count,p_google_star_1_count,p_google_star_2_count,p_google_star_3_count,p_google_star_4_count,p_google_star_5_count,p_customer_engagement_count,v_session.inputter_name,v_session.session_id,v_actor,v_actor) returning id into v_recap;
 else
  update public.marketing_daily_recaps set registered_membership_total=p_registered_membership_total,promo_claim_count=p_promo_claim_count,google_star_1_count=p_google_star_1_count,google_star_2_count=p_google_star_2_count,google_star_3_count=p_google_star_3_count,google_star_4_count=p_google_star_4_count,google_star_5_count=p_google_star_5_count,customer_engagement_count=p_customer_engagement_count,updated_at=clock_timestamp(),updated_by=v_actor where id=v_recap;
 end if;
 delete from public.marketing_daily_membership_entries where recap_id=v_recap;
 v_order:=0;
 for v_item in select value from jsonb_array_elements(coalesce(p_membership_entries,'[]')) loop
  v_order:=v_order+1;v_name:=btrim(v_item->>'member_name');v_phone:=btrim(v_item->>'phone_number');
  if coalesce(v_name,'')='' or char_length(v_name)>150 then raise exception 'Nama Member wajib diisi dan maksimal 150 karakter.' using errcode='22023';end if;
  if coalesce(v_phone,'')='' or char_length(v_phone)>40 or v_phone !~ '^[0-9+() ./-]+$' then raise exception 'Nomor HP tidak valid.' using errcode='22023';end if;
  insert into public.marketing_daily_membership_entries(recap_id,member_name,phone_number,sort_order) values(v_recap,v_name,v_phone,v_order);
 end loop;
 delete from public.marketing_daily_events where recap_id=v_recap;
 v_order:=0;
 for v_item in select value from jsonb_array_elements(coalesce(p_events,'[]')) loop
  v_order:=v_order+1;v_name:=btrim(v_item->>'event_name');v_type:=upper(btrim(v_item->>'registration_type'));v_third:=nullif(btrim(v_item->>'third_party'),'');
  begin v_count:=(v_item->>'external_participant_count')::integer;exception when others then raise exception 'Jumlah peserta harus berupa bilangan bulat.' using errcode='22023';end;
  if coalesce(v_name,'')='' or char_length(v_name)>200 then raise exception 'Nama Event wajib diisi dan maksimal 200 karakter.' using errcode='22023';end if;
  if v_type not in ('PAID','UNPAID') then raise exception 'Tipe Registrasi harus PAID atau UNPAID.' using errcode='22023';end if;
  if char_length(coalesce(v_third,''))>200 then raise exception 'Pihak Ketiga maksimal 200 karakter.' using errcode='22023';end if;
  if v_count is null or v_count<0 then raise exception 'Jumlah peserta harus non-negatif.' using errcode='22023';end if;
  insert into public.marketing_daily_events(recap_id,event_name,registration_type,third_party,external_participant_count,sort_order) values(v_recap,v_name,v_type,v_third,v_count,v_order);
 end loop;
 return v_recap;
end $$;

alter table public.marketing_daily_recaps enable row level security;
alter table public.marketing_daily_membership_entries enable row level security;
alter table public.marketing_daily_events enable row level security;

-- Keep the shared resolver private. RLS receives only a boolean equality predicate,
-- preventing authenticated callers from obtaining the canonical Outlet ID.
create or replace function public.lm_is_current_marketing_outlet(p_outlet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select p_outlet_id is not null
    and p_outlet_id = public.lm_resolve_sales_outlet(null);
$$;

revoke execute on function public.lm_resolve_sales_outlet(uuid)
from public, anon, authenticated;
revoke all on function public.lm_is_current_marketing_outlet(uuid)
from public, anon, authenticated;
grant execute on function public.lm_is_current_marketing_outlet(uuid)
to authenticated, service_role;

create policy marketing_recaps_read_staff on public.marketing_daily_recaps
for select to authenticated using (
  public.lm_is_active_staff_or_above()
  and public.lm_is_current_marketing_outlet(outlet_id)
);
create policy marketing_members_read_staff on public.marketing_daily_membership_entries
for select to authenticated using (
  public.lm_is_active_staff_or_above()
  and exists (
    select 1 from public.marketing_daily_recaps r
    where r.id = recap_id
      and public.lm_is_current_marketing_outlet(r.outlet_id)
  )
);
create policy marketing_events_read_staff on public.marketing_daily_events
for select to authenticated using (
  public.lm_is_active_staff_or_above()
  and exists (
    select 1 from public.marketing_daily_recaps r
    where r.id = recap_id
      and public.lm_is_current_marketing_outlet(r.outlet_id)
  )
);

revoke all on public.marketing_daily_recaps,public.marketing_daily_membership_entries,public.marketing_daily_events from public,anon,authenticated;
grant select on public.marketing_daily_recaps,public.marketing_daily_membership_entries,public.marketing_daily_events to authenticated;
revoke all on function public.save_marketing_daily_recap_v1(date,integer,integer,integer,integer,integer,integer,integer,integer,jsonb,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_marketing_daily_recap_v1(date,integer,integer,integer,integer,integer,integer,integer,integer,jsonb,jsonb,uuid,uuid) to authenticated;

commit;
