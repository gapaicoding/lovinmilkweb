begin;

create table public.visitor_daily_recaps (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id),
  business_date date not null, recorder_name text not null check (char_length(btrim(recorder_name)) between 1 and 100),
  created_at timestamptz not null default clock_timestamp(), created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default clock_timestamp(), updated_by uuid not null references auth.users(id),
  deleted_at timestamptz, deleted_by uuid references auth.users(id),
  constraint visitor_daily_recaps_delete_audit check ((deleted_at is null) = (deleted_by is null))
);
create unique index uq_visitor_daily_recaps_active_day on public.visitor_daily_recaps(outlet_id,business_date) where deleted_at is null;
create index idx_visitor_daily_recaps_period on public.visitor_daily_recaps(outlet_id,business_date);

alter table public.visitor_visits add column capture_mode text;
update public.visitor_visits set capture_mode='live_session' where capture_mode is null;
alter table public.visitor_visits alter column capture_mode set default 'live_session', alter column capture_mode set not null,
  add constraint visitor_visits_capture_mode_check check (capture_mode in ('live_session','bulk_recap')),
  add column daily_recap_id uuid references public.visitor_daily_recaps(id);
alter table public.visitor_visits add constraint visitor_visits_capture_contract check (
  (capture_mode='live_session' and daily_recap_id is null) or
  (capture_mode='bulk_recap' and daily_recap_id is not null and visitor_id is null and check_out_at is null)
);
drop index if exists public.uq_visitor_visits_one_active;
create unique index uq_visitor_visits_one_active on public.visitor_visits(visitor_id)
  where capture_mode='live_session' and check_out_at is null and deleted_at is null and visitor_id is not null;
create index idx_visitor_visits_daily_recap on public.visitor_visits(daily_recap_id) where daily_recap_id is not null;

alter table public.visitor_daily_recaps enable row level security;
create policy "Visitor roles read daily recaps" on public.visitor_daily_recaps for select to authenticated
  using (public.lm_is_active_staff_or_above());
revoke all on table public.visitor_daily_recaps from public, anon, authenticated;
grant select on table public.visitor_daily_recaps to authenticated;
grant all on table public.visitor_daily_recaps to service_role;

create or replace function public.get_visitor_daily_recap(p_outlet_id uuid,p_business_date date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;
begin
  perform public.require_visitor_role(array['staff','admin','super_admin']);
  select jsonb_build_object('id',r.id,'outlet_id',r.outlet_id,'business_date',r.business_date,'recorder_name',r.recorder_name,
    'entries',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'arrival_time',to_char(v.check_in_at at time zone 'Asia/Jakarta','HH24:MI'),'adult_count',v.adult_count,'child_count',v.child_count,'notes',v.notes,'check_in_at',v.check_in_at,'created_at',v.created_at,'updated_at',v.updated_at) order by v.check_in_at,v.created_at) from public.visitor_visits v where v.daily_recap_id=r.id and v.deleted_at is null),'[]'::jsonb))
  into v_result from public.visitor_daily_recaps r where r.outlet_id=p_outlet_id and r.business_date=p_business_date and r.deleted_at is null;
  return v_result;
end $$;

create or replace function public.create_or_append_visitor_daily_recap(p_business_date date,p_outlet_id uuid,p_recorder_name text default null,p_entries jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid; v_recap public.visitor_daily_recaps%rowtype; v_entry jsonb; v_slot text; v_adults int; v_children int; v_notes text; v_count int;
begin
  v_actor:=public.require_visitor_role(array['staff','admin','super_admin']);
  if not exists(select 1 from public.outlets where id=p_outlet_id and is_active and deleted_at is null) then raise exception 'Outlet aktif tidak ditemukan.' using errcode='P0002'; end if;
  if p_business_date is null then raise exception 'Tanggal rekap wajib diisi.' using errcode='22023'; end if;
  if jsonb_typeof(p_entries)<>'array' then raise exception 'Data kedatangan tidak valid.' using errcode='22023'; end if;
  v_count:=jsonb_array_length(p_entries); if v_count<1 then raise exception 'Tambahkan minimal satu baris kedatangan.' using errcode='22023'; end if;
  if v_count>100 then raise exception 'Maksimal 100 baris dapat disimpan sekaligus.' using errcode='22023'; end if;
  select * into v_recap from public.visitor_daily_recaps where outlet_id=p_outlet_id and business_date=p_business_date and deleted_at is null for update;
  if not found then
    if nullif(btrim(p_recorder_name),'') is null then raise exception 'Nama perekap wajib diisi saat membuat rekap harian.' using errcode='22023'; end if;
    insert into public.visitor_daily_recaps(outlet_id,business_date,recorder_name,created_by,updated_by) values(p_outlet_id,p_business_date,btrim(p_recorder_name),v_actor,v_actor) returning * into v_recap;
  elsif nullif(btrim(p_recorder_name),'') is not null and btrim(p_recorder_name)<>v_recap.recorder_name then
    raise exception 'Rekap harian untuk tanggal ini sudah memiliki perekap %.',v_recap.recorder_name using errcode='22023';
  end if;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_slot:=v_entry->>'arrival_time'; v_adults:=(v_entry->>'adult_count')::int; v_children:=(v_entry->>'child_count')::int; v_notes:=nullif(btrim(v_entry->>'notes'),'');
    if v_slot !~ '^(0[7-9]|1[0-9]|2[01]):(00|30)$' then raise exception 'Jam kedatangan tidak valid.' using errcode='22023'; end if;
    if v_adults<0 or v_children<0 or v_adults+v_children<1 then raise exception 'Jumlah pengunjung minimal satu orang.' using errcode='22023'; end if;
    if char_length(coalesce(v_notes,''))>500 then raise exception 'Catatan maksimal 500 karakter.' using errcode='22023'; end if;
    insert into public.visitor_visits(visitor_id,outlet_id,visit_date,adult_count,child_count,record_source,capture_mode,daily_recap_id,check_in_at,notes,created_by,updated_by)
    values(null,p_outlet_id,p_business_date,v_adults,v_children,'operational','bulk_recap',v_recap.id,(p_business_date::text||' '||v_slot||':00 Asia/Jakarta')::timestamptz,v_notes,v_actor,v_actor);
  end loop;
  return public.get_visitor_daily_recap(p_outlet_id,p_business_date);
exception when unique_violation then raise exception 'Rekap harian berubah. Muat ulang halaman.' using errcode='40001';
end $$;

create or replace function public.update_visitor_daily_recap_recorder(p_recap_id uuid,p_recorder_name text) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=public.require_visitor_role(array['staff','admin','super_admin']); begin
 if nullif(btrim(p_recorder_name),'') is null then raise exception 'Nama perekap wajib diisi.'; end if;
 update public.visitor_daily_recaps set recorder_name=btrim(p_recorder_name),updated_at=clock_timestamp(),updated_by=v_actor where id=p_recap_id and deleted_at is null;
 if not found then raise exception 'Rekap harian tidak ditemukan.'; end if;
end $$;

create or replace function public.update_visitor_recap_entry(p_visit_id uuid,p_arrival_time text,p_adult_count int,p_child_count int,p_notes text default null) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=public.require_visitor_role(array['staff','admin','super_admin']); v_date date; begin
 if p_arrival_time !~ '^(0[7-9]|1[0-9]|2[01]):(00|30)$' then raise exception 'Jam kedatangan tidak valid.'; end if;
 if p_adult_count<0 or p_child_count<0 or p_adult_count+p_child_count<1 then raise exception 'Jumlah pengunjung minimal satu orang.'; end if;
 select visit_date into v_date from public.visitor_visits where id=p_visit_id and capture_mode='bulk_recap' and deleted_at is null for update;
 if not found then raise exception 'Entry rekap tidak ditemukan.'; end if;
 update public.visitor_visits set adult_count=p_adult_count,child_count=p_child_count,notes=nullif(btrim(p_notes),''),check_in_at=(v_date::text||' '||p_arrival_time||':00 Asia/Jakarta')::timestamptz,updated_at=clock_timestamp(),updated_by=v_actor where id=p_visit_id;
end $$;

create or replace function public.archive_visitor_recap_entry(p_visit_id uuid) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=public.require_visitor_role(array['admin','super_admin']); begin
 if exists(select 1 from public.sales_transactions where visitor_visit_id=p_visit_id and deleted_at is null) then raise exception 'Kunjungan masih terhubung dengan transaksi penjualan.' using errcode='23503'; end if;
 update public.visitor_visits set deleted_at=clock_timestamp(),deleted_by=v_actor,updated_at=clock_timestamp(),updated_by=v_actor where id=p_visit_id and capture_mode='bulk_recap' and deleted_at is null;
 if not found then raise exception 'Entry rekap tidak ditemukan.'; end if;
end $$;

create or replace function public.get_visitor_daily_recap_period(p_outlet_id uuid,p_start_date date,p_end_date date) returns table(business_date date,recorder_name text,arrival_time text,adult_count int,child_count int)
language plpgsql stable security definer set search_path=public,pg_catalog as $$ begin
 perform public.require_visitor_role(array['staff','admin','super_admin']);
 if p_start_date is null or p_end_date<p_start_date then raise exception 'Rentang laporan tidak valid.'; end if;
 if p_end_date-p_start_date>365 then raise exception 'Rentang laporan maksimal 366 hari.'; end if;
 return query select d::date,r.recorder_name,to_char(v.check_in_at at time zone 'Asia/Jakarta','HH24:MI'),coalesce(v.adult_count,0),coalesce(v.child_count,0)
 from generate_series(p_start_date,p_end_date,'1 day') d left join public.visitor_daily_recaps r on r.outlet_id=p_outlet_id and r.business_date=d::date and r.deleted_at is null left join public.visitor_visits v on v.daily_recap_id=r.id and v.capture_mode='bulk_recap' and v.deleted_at is null order by d,v.check_in_at;
end $$;

create or replace function public.check_out_visitor(p_visit_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user_id uuid; v_visit public.visitor_visits%rowtype; begin v_user_id:=public.require_visitor_role(array['staff','admin','super_admin']); select * into v_visit from public.visitor_visits where id=p_visit_id and deleted_at is null for update;
 if not found then raise exception 'Kunjungan tidak ditemukan.'; end if; if v_visit.capture_mode<>'live_session' then raise exception 'Entry rekap tidak memerlukan checkout.'; end if; if v_visit.check_out_at is not null then raise exception 'Pengunjung sudah ditandai pulang.'; end if;
 update public.visitor_visits set check_out_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=v_user_id where id=p_visit_id returning * into v_visit; return jsonb_build_object('visitor_visit_id',v_visit.id,'check_out_at',v_visit.check_out_at); end $$;

-- Preserve the legacy list contract while keeping bulk arrival rows out of the
-- active/history session tabs. They are read through the daily recap RPC.
create or replace function public.list_visitor_visits(p_status text default 'active',p_query text default null,p_from date default null,p_to date default null,p_page integer default 1,p_page_size integer default 20) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;
begin
 perform public.require_visitor_role(array['staff','admin','super_admin']);
 if p_status not in ('active','history','all') then raise exception 'Status kunjungan tidak valid.' using errcode='22023'; end if;
 with visit_rows as (
  select vv.id,vv.visitor_id,coalesce(v.visitor_code,'TAMU-UMUM') visitor_code,coalesce(v.full_name,'Tamu Umum') full_name,v.phone,vv.outlet_id,
   coalesce(vv.visit_date,(vv.check_in_at at time zone 'Asia/Jakarta')::date) visit_date,vv.check_in_at,vv.check_out_at,vv.notes,vv.adult_count,vv.child_count,
   case when vv.adult_count is null or vv.child_count is null then null else vv.adult_count+vv.child_count end total_visitors,vv.record_source,
   coalesce(ns.active_transaction_count,0) active_transaction_count,coalesce(ns.active_purchase_total,0) active_purchase_total,coalesce(ns.archived_transaction_count,0) archived_transaction_count,coalesce(ns.transactions,'[]'::jsonb) linked_transactions,
   ls.legacy_manual_purchase_amount,ls.legacy_manual_quantity
  from public.visitor_visits vv left join public.visitors v on v.id=vv.visitor_id
  left join lateral (select count(*) filter(where st.deleted_at is null) active_transaction_count,coalesce(sum(st.total_amount) filter(where st.deleted_at is null),0) active_purchase_total,count(*) filter(where st.deleted_at is not null) archived_transaction_count,
   jsonb_agg(jsonb_build_object('transaction_id',st.id,'transaction_number',st.transaction_number,'transaction_date',st.transaction_date,'total_amount',st.total_amount,'deleted_at',st.deleted_at)) filter(where st.id is not null and (st.deleted_at is null or public.lm_is_active_super_admin())) transactions from public.sales_transactions st where st.visitor_visit_id=vv.id) ns on true
  left join lateral (select sum(s.amount) filter(where s.deleted_at is null) legacy_manual_purchase_amount,sum(s.quantity) filter(where s.deleted_at is null) legacy_manual_quantity from public.sales s where s.visitor_visit_id=vv.id) ls on true
  where vv.deleted_at is null and vv.capture_mode='live_session' and (v.id is null or v.deleted_at is null)
   and (p_status='all' or (p_status='active' and vv.check_out_at is null) or (p_status='history' and vv.check_out_at is not null))
   and (nullif(btrim(p_query),'') is null or vv.id::text=btrim(p_query) or coalesce(v.visitor_code,'TAMU-UMUM') ilike '%'||btrim(p_query)||'%' or coalesce(v.full_name,'Tamu Umum') ilike '%'||btrim(p_query)||'%' or coalesce(v.phone,'') ilike '%'||btrim(p_query)||'%')
   and (p_from is null or coalesce(vv.visit_date,(vv.check_in_at at time zone 'Asia/Jakarta')::date)>=p_from) and (p_to is null or coalesce(vv.visit_date,(vv.check_in_at at time zone 'Asia/Jakarta')::date)<=p_to)
 ), counted as(select count(*) total from visit_rows), paged as(select * from visit_rows order by check_in_at desc,id limit least(greatest(coalesce(p_page_size,20),1),100) offset (greatest(coalesce(p_page,1),1)-1)*least(greatest(coalesce(p_page_size,20),1),100))
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select total from counted),'page',greatest(coalesce(p_page,1),1),'page_size',least(greatest(coalesce(p_page_size,20),1),100)) into v_result;
 return v_result;
end $$;

revoke all on function public.get_visitor_daily_recap(uuid,date),public.create_or_append_visitor_daily_recap(date,uuid,text,jsonb),public.update_visitor_daily_recap_recorder(uuid,text),public.update_visitor_recap_entry(uuid,text,int,int,text),public.archive_visitor_recap_entry(uuid),public.get_visitor_daily_recap_period(uuid,date,date) from public,anon;
grant execute on function public.get_visitor_daily_recap(uuid,date),public.create_or_append_visitor_daily_recap(date,uuid,text,jsonb),public.update_visitor_daily_recap_recorder(uuid,text),public.update_visitor_recap_entry(uuid,text,int,int,text),public.archive_visitor_recap_entry(uuid),public.get_visitor_daily_recap_period(uuid,date,date) to authenticated;
comment on table public.visitor_daily_recaps is 'One recorder header per outlet and business date for arrival-traffic recap.';
commit;
