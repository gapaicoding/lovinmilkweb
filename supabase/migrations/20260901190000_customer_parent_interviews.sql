begin;

alter table public.operational_inputter_sessions drop constraint operational_inputter_sessions_section_check;
alter table public.operational_inputter_sessions add constraint operational_inputter_sessions_section_check check (section in ('sales','expenses','suppliers','visitors','interviews'));

create table public.customer_interview_form_versions (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id) on delete restrict,
  version_number integer not null check(version_number>0), is_active boolean not null default false,
  created_at timestamptz not null default clock_timestamp(), created_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz not null default clock_timestamp(), published_by uuid references auth.users(id) on delete restrict,
  unique(outlet_id,version_number)
);
create unique index customer_interview_one_active_version on public.customer_interview_form_versions(outlet_id) where is_active;

create table public.customer_interview_questions (
  id uuid primary key default gen_random_uuid(), form_version_id uuid not null references public.customer_interview_form_versions(id) on delete restrict,
  question_text text not null check(btrim(question_text)<>'' and char_length(btrim(question_text))<=2000),
  sort_order integer not null check(sort_order>0), created_at timestamptz not null default clock_timestamp(),
  unique(form_version_id,sort_order)
);

create table public.customer_interviews (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id) on delete restrict,
  interview_date date not null, visit_time time not null, form_version_id uuid not null references public.customer_interview_form_versions(id) on delete restrict,
  inputter_name text not null check(btrim(inputter_name)<>'' and char_length(btrim(inputter_name))<=100),
  inputter_session_id uuid not null references public.operational_inputter_sessions(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(), created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(), updated_by uuid not null references auth.users(id) on delete restrict
);
create index customer_interviews_period_idx on public.customer_interviews(outlet_id,interview_date desc,visit_time desc);

create table public.customer_interview_answers (
  id uuid primary key default gen_random_uuid(), interview_id uuid not null references public.customer_interviews(id) on delete restrict,
  question_id uuid not null references public.customer_interview_questions(id) on delete restrict, answer_text text,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), unique(interview_id,question_id)
);

create function public.lm_customer_interview_questions_immutable() returns trigger language plpgsql as $$ begin raise exception 'Pertanyaan versi terbit tidak dapat diubah.' using errcode='55000'; end $$;
create trigger customer_interview_questions_immutable before update or delete on public.customer_interview_questions for each row execute function public.lm_customer_interview_questions_immutable();

create function public.lm_customer_interview_answer_version_guard() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_interview_version uuid;v_question_version uuid;begin
 select form_version_id into v_interview_version from public.customer_interviews where id=new.interview_id;
 select form_version_id into v_question_version from public.customer_interview_questions where id=new.question_id;
 if v_interview_version is null or v_question_version is null or v_interview_version<>v_question_version then raise exception 'Pertanyaan tidak sesuai versi formulir wawancara.' using errcode='23514';end if;return new;
end $$;
create trigger customer_interview_answer_version_guard before insert or update on public.customer_interview_answers for each row execute function public.lm_customer_interview_answer_version_guard();

create function public.publish_customer_interview_form_version(p_questions jsonb,p_outlet_id uuid default null)
returns table(form_version_id uuid,version_number integer) language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid;v_outlet uuid;v_version integer;v_id uuid;v_question jsonb;v_text text;v_count integer;
begin
 v_actor:=public.require_visitor_role(array['staff','admin','super_admin']); v_outlet:=public.lm_resolve_sales_outlet(null);
 if p_outlet_id is not null and p_outlet_id<>v_outlet then raise exception 'Formulir wawancara tidak tersedia pada Outlet ini.' using errcode='42501';end if;
 if jsonb_typeof(p_questions)<>'array' then raise exception 'Daftar pertanyaan tidak valid.' using errcode='22023';end if;
 v_count:=jsonb_array_length(p_questions);if v_count<1 then raise exception 'Minimal satu pertanyaan wajib tersedia.' using errcode='22023';end if;
 if v_count>100 then raise exception 'Maksimal 100 pertanyaan.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('customer-interview-form:'||v_outlet::text,0));
 select coalesce(max(f.version_number),0)+1 into v_version from public.customer_interview_form_versions f where f.outlet_id=v_outlet;
 for v_question in select value from jsonb_array_elements(p_questions) loop v_text:=btrim(v_question->>'question_text');if coalesce(v_text,'')='' or char_length(v_text)>2000 then raise exception 'Pertanyaan kosong atau terlalu panjang.' using errcode='22023';end if;end loop;
 update public.customer_interview_form_versions set is_active=false where outlet_id=v_outlet and is_active;
 insert into public.customer_interview_form_versions(outlet_id,version_number,is_active,created_by,published_by) values(v_outlet,v_version,true,v_actor,v_actor) returning id into v_id;
 insert into public.customer_interview_questions(form_version_id,question_text,sort_order)
 select v_id,btrim(value->>'question_text'),ordinality::integer from jsonb_array_elements(p_questions) with ordinality;
 return query select v_id,v_version;
end $$;

create function public.create_customer_interview(p_interview_date date,p_visit_time time,p_answers jsonb,p_inputter_session_id uuid,p_outlet_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid;v_outlet uuid;v_session record;v_version uuid;v_interview uuid;v_answer jsonb;v_question uuid;
begin
 v_actor:=public.require_visitor_role(array['staff','admin','super_admin']);if p_interview_date is null or p_visit_time is null then raise exception 'Tanggal dan jam berkunjung wajib diisi.' using errcode='22023';end if;
 v_outlet:=public.lm_resolve_sales_outlet(null);
 if p_outlet_id is not null and p_outlet_id<>v_outlet then raise exception 'Wawancara tidak tersedia pada Outlet ini.' using errcode='42501';end if;
 select * into v_session from public.lm_require_operational_inputter_session(p_inputter_session_id,'interviews',v_outlet);
 select id into v_version from public.customer_interview_form_versions where outlet_id=v_session.outlet_id and is_active for share;
 if v_version is null then raise exception 'Formulir wawancara aktif tidak tersedia.' using errcode='P0001';end if;
 insert into public.customer_interviews(outlet_id,interview_date,visit_time,form_version_id,inputter_name,inputter_session_id,created_by,updated_by) values(v_session.outlet_id,p_interview_date,p_visit_time,v_version,v_session.inputter_name,v_session.session_id,v_actor,v_actor) returning id into v_interview;
 for v_answer in select value from jsonb_array_elements(coalesce(p_answers,'[]')) loop
  v_question:=(v_answer->>'question_id')::uuid;
  insert into public.customer_interview_answers(interview_id,question_id,answer_text) values(v_interview,v_question,nullif(v_answer->>'answer_text',''));
 end loop;return v_interview;
end $$;

create function public.update_customer_interview(p_interview_id uuid,p_interview_date date,p_visit_time time,p_answers jsonb)
returns uuid language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid;v_outlet uuid;v_interview_outlet uuid;v_version uuid;v_answer jsonb;v_question uuid;
begin
 v_actor:=public.require_visitor_role(array['staff','admin','super_admin']);if p_interview_date is null or p_visit_time is null then raise exception 'Tanggal dan jam berkunjung wajib diisi.' using errcode='22023';end if;
 v_outlet:=public.lm_resolve_sales_outlet(null);
 select outlet_id,form_version_id into v_interview_outlet,v_version from public.customer_interviews where id=p_interview_id for update;
 if v_version is null then raise exception 'Wawancara tidak ditemukan.' using errcode='P0002';end if;
 if v_interview_outlet<>v_outlet then raise exception 'Wawancara tidak tersedia pada Outlet ini.' using errcode='42501';end if;
 update public.customer_interviews set interview_date=p_interview_date,visit_time=p_visit_time,updated_at=clock_timestamp(),updated_by=v_actor where id=p_interview_id;
 for v_answer in select value from jsonb_array_elements(coalesce(p_answers,'[]')) loop v_question:=(v_answer->>'question_id')::uuid;
  insert into public.customer_interview_answers(interview_id,question_id,answer_text) values(p_interview_id,v_question,nullif(v_answer->>'answer_text','')) on conflict(interview_id,question_id) do update set answer_text=excluded.answer_text,updated_at=clock_timestamp();
 end loop;return p_interview_id;
end $$;

-- Extend V3 session validation without changing other section behavior.
create or replace function public.lm_require_operational_inputter_session(p_session_id uuid,p_section text,p_outlet_id uuid)
returns table(session_id uuid,inputter_name text,outlet_id uuid) language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid;v_outlet uuid;v_row public.operational_inputter_sessions%rowtype;begin
 v_actor:=public.require_visitor_role(array['staff','admin','super_admin']);if p_section not in ('sales','expenses','suppliers','visitors','interviews') then raise exception 'Bagian penginput tidak valid.' using errcode='22023';end if;
 v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);select * into v_row from public.operational_inputter_sessions s where s.id=p_session_id for update;
 if not found or v_row.actor_id<>v_actor or v_row.outlet_id<>v_outlet or v_row.section<>p_section or v_row.superseded_at is not null then raise exception 'Sesi penginput tidak valid atau sudah diganti.' using errcode='P0001';end if;
 if btrim(v_row.inputter_name)='' or char_length(btrim(v_row.inputter_name))>100 then raise exception 'Nama penginput sesi tidak valid.' using errcode='22023';end if;
 update public.operational_inputter_sessions set last_used_at=clock_timestamp() where id=v_row.id;return query select v_row.id,btrim(v_row.inputter_name),v_outlet;end $$;

-- Existing V3 RPC bodies are section-agnostic apart from their whitelist.
create or replace function public.start_operational_inputter_session(p_section text,p_inputter_name text,p_outlet_id uuid default null) returns table(session_id uuid,outlet_id uuid,section text,inputter_name text,started_at timestamptz) language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid;v_outlet uuid;v_name text;v_row public.operational_inputter_sessions%rowtype;begin v_actor:=public.require_visitor_role(array['staff','admin','super_admin']);if p_section not in ('sales','expenses','suppliers','visitors','interviews') then raise exception 'Bagian penginput tidak valid.' using errcode='22023';end if;v_name:=btrim(p_inputter_name);if coalesce(v_name,'')='' then raise exception 'Nama penginput wajib diisi.' using errcode='22023';end if;if char_length(v_name)>100 then raise exception 'Nama penginput maksimal 100 karakter.' using errcode='22023';end if;v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);update public.operational_inputter_sessions s set superseded_at=clock_timestamp() where s.actor_id=v_actor and s.outlet_id=v_outlet and s.section=p_section and s.superseded_at is null;insert into public.operational_inputter_sessions(outlet_id,section,inputter_name,actor_id) values(v_outlet,p_section,v_name,v_actor) returning * into v_row;return query select v_row.id,v_row.outlet_id,v_row.section,v_row.inputter_name,v_row.started_at;end $$;
create or replace function public.get_operational_inputter_history(p_section text,p_outlet_id uuid default null,p_limit integer default 20)
returns table(inputter_name text,section text,started_at timestamptz,last_used_at timestamptz) language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_outlet uuid;begin perform public.require_visitor_role(array['staff','admin','super_admin']);if p_section not in ('sales','expenses','suppliers','visitors','interviews') then raise exception 'Bagian penginput tidak valid.' using errcode='22023';end if;v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);return query select s.inputter_name,s.section,s.started_at,s.last_used_at from public.operational_inputter_sessions s where s.outlet_id=v_outlet and s.section=p_section order by s.started_at desc limit greatest(1,least(coalesce(p_limit,20),100));end $$;

alter table public.customer_interview_form_versions enable row level security;alter table public.customer_interview_questions enable row level security;alter table public.customer_interviews enable row level security;alter table public.customer_interview_answers enable row level security;
create policy interview_versions_read_staff on public.customer_interview_form_versions for select to authenticated using(public.lm_is_active_staff_or_above() and outlet_id=public.lm_resolve_sales_outlet(null));
create policy interview_questions_read_staff on public.customer_interview_questions for select to authenticated using(public.lm_is_active_staff_or_above() and exists(select 1 from public.customer_interview_form_versions f where f.id=form_version_id and f.outlet_id=public.lm_resolve_sales_outlet(null)));
create policy interviews_read_staff on public.customer_interviews for select to authenticated using(public.lm_is_active_staff_or_above() and outlet_id=public.lm_resolve_sales_outlet(null));
create policy interview_answers_read_staff on public.customer_interview_answers for select to authenticated using(public.lm_is_active_staff_or_above() and exists(select 1 from public.customer_interviews i where i.id=interview_id and i.outlet_id=public.lm_resolve_sales_outlet(null)));
revoke all on public.customer_interview_form_versions,public.customer_interview_questions,public.customer_interviews,public.customer_interview_answers from public,anon,authenticated;
grant select on public.customer_interview_form_versions,public.customer_interview_questions,public.customer_interviews,public.customer_interview_answers to authenticated;
revoke all on function public.publish_customer_interview_form_version(jsonb,uuid),public.create_customer_interview(date,time,jsonb,uuid,uuid),public.update_customer_interview(uuid,date,time,jsonb) from public,anon,authenticated;
grant execute on function public.publish_customer_interview_form_version(jsonb,uuid),public.create_customer_interview(date,time,jsonb,uuid,uuid),public.update_customer_interview(uuid,date,time,jsonb),public.start_operational_inputter_session(text,text,uuid) to authenticated;

do $$ declare v_outlet uuid;v_version uuid;begin
 select id into v_outlet from public.outlets where is_default and is_active and deleted_at is null order by created_at limit 1;
 if v_outlet is not null and not exists(select 1 from public.customer_interview_form_versions where outlet_id=v_outlet) then
  insert into public.customer_interview_form_versions(outlet_id,version_number,is_active) values(v_outlet,1,true) returning id into v_version;
  insert into public.customer_interview_questions(form_version_id,sort_order,question_text) values
  (v_version,1,'Nama panggilan dan aslinya dari mana? Harus tanya sampai kelurahan / kecamatan.'),(v_version,2,'Sudah pernah ke sini sebelumnya atau baru pertama kali?'),(v_version,3,'Datang ke sini bersama siapa saja?'),(v_version,4,'Mengetahui informasi Lovin Milk dari mana dan mengapa tertarik berkunjung?'),(v_version,5,'Masukan untuk Lovin Milk: minta masukan, koreksi, dan request ingin ada apa yang belum ada saat ini.'),(v_version,6,'Kalau menurut customer, apakah sudah berkenan merekomendasikan Lovin Milk ke kerabat lain atau belum? Kenapa?'),(v_version,7,'Naik apa ke sini?'),(v_version,8,'Menu yang dipesan (diisi petugas dan dicek dari struk pesanan)');
 end if;end $$;
commit;
