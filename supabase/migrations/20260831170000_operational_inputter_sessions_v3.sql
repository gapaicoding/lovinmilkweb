-- Browser-session operational inputter identity and append-only audit history.
begin;

create table public.operational_inputter_sessions (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  section text not null check (section in ('sales','expenses','suppliers','visitors')),
  inputter_name text not null check (btrim(inputter_name)<>'' and char_length(btrim(inputter_name))<=100),
  actor_id uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz not null default clock_timestamp(),
  last_used_at timestamptz,
  superseded_at timestamptz
);
comment on table public.operational_inputter_sessions is 'Append-only audit history for browser-scoped operational inputter sessions.';
comment on table public.operational_inputter_settings is 'Legacy rollback compatibility only; no longer the active browser-session source of truth.';
create index operational_inputter_sessions_history_idx on public.operational_inputter_sessions(outlet_id,section,started_at desc);
create unique index operational_inputter_sessions_active_actor_idx on public.operational_inputter_sessions(actor_id,outlet_id,section) where superseded_at is null;
alter table public.operational_inputter_sessions enable row level security;
revoke all on table public.operational_inputter_sessions from public,anon,authenticated;

alter table public.sales_transactions add column inputter_session_id uuid references public.operational_inputter_sessions(id) on delete restrict;
alter table public.operational_expenses add column inputter_session_id uuid references public.operational_inputter_sessions(id) on delete restrict;
alter table public.suppliers add column inputter_session_id uuid references public.operational_inputter_sessions(id) on delete restrict;
alter table public.supplier_items add column inputter_session_id uuid references public.operational_inputter_sessions(id) on delete restrict;
alter table public.visitor_visits add column inputter_name text check(inputter_name is null or (btrim(inputter_name)<>'' and char_length(btrim(inputter_name))<=100));
alter table public.visitor_visits add column inputter_session_id uuid references public.operational_inputter_sessions(id) on delete restrict;

create or replace function public.lm_require_operational_inputter_session(p_session_id uuid,p_section text,p_outlet_id uuid)
returns table(session_id uuid,inputter_name text,outlet_id uuid)
language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid; v_outlet uuid; v_row public.operational_inputter_sessions%rowtype;
begin
 v_actor:=public.require_visitor_role(array['staff','admin','super_admin']);
 if p_section not in ('sales','expenses','suppliers','visitors') then raise exception 'Bagian penginput tidak valid.' using errcode='22023'; end if;
 v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);
 select * into v_row from public.operational_inputter_sessions s where s.id=p_session_id for update;
 if not found or v_row.actor_id<>v_actor or v_row.outlet_id<>v_outlet or v_row.section<>p_section or v_row.superseded_at is not null then
   raise exception 'Sesi penginput tidak valid atau sudah diganti.' using errcode='P0001';
 end if;
 if btrim(v_row.inputter_name)='' or char_length(btrim(v_row.inputter_name))>100 then raise exception 'Nama penginput sesi tidak valid.' using errcode='22023'; end if;
 update public.operational_inputter_sessions set last_used_at=clock_timestamp() where id=v_row.id;
 return query select v_row.id,btrim(v_row.inputter_name),v_outlet;
end $$;

create or replace function public.start_operational_inputter_session(p_section text,p_inputter_name text,p_outlet_id uuid default null)
returns table(session_id uuid,outlet_id uuid,section text,inputter_name text,started_at timestamptz)
language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_actor uuid; v_outlet uuid; v_name text; v_row public.operational_inputter_sessions%rowtype;
begin
 v_actor:=public.require_visitor_role(array['staff','admin','super_admin']);
 if p_section not in ('sales','expenses','suppliers','visitors') then raise exception 'Bagian penginput tidak valid.' using errcode='22023'; end if;
 v_name:=btrim(p_inputter_name); if coalesce(v_name,'')='' then raise exception 'Nama penginput wajib diisi.' using errcode='22023'; end if;
 if char_length(v_name)>100 then raise exception 'Nama penginput maksimal 100 karakter.' using errcode='22023'; end if;
 v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);
 update public.operational_inputter_sessions s set superseded_at=clock_timestamp() where s.actor_id=v_actor and s.outlet_id=v_outlet and s.section=p_section and s.superseded_at is null;
 insert into public.operational_inputter_sessions(outlet_id,section,inputter_name,actor_id) values(v_outlet,p_section,v_name,v_actor) returning * into v_row;
 return query select v_row.id,v_row.outlet_id,v_row.section,v_row.inputter_name,v_row.started_at;
end $$;

create or replace function public.validate_operational_inputter_session(p_session_id uuid,p_section text,p_outlet_id uuid default null)
returns table(session_id uuid,outlet_id uuid,section text,inputter_name text,started_at timestamptz)
language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v record; v_started timestamptz;
begin
 perform public.require_visitor_role(array['staff','admin','super_admin']);
 select s.id as session_id,s.outlet_id,s.inputter_name,s.started_at into v from public.operational_inputter_sessions s
 where s.id=p_session_id and s.actor_id=auth.uid() and s.section=p_section and s.outlet_id=public.lm_resolve_sales_outlet(p_outlet_id) and s.superseded_at is null;
 if not found then raise exception 'Sesi penginput tidak valid atau sudah diganti.' using errcode='P0001'; end if;
 v_started:=v.started_at;
 return query select v.session_id,v.outlet_id,p_section,v.inputter_name,v_started;
end $$;

create or replace function public.get_operational_inputter_history(p_section text,p_outlet_id uuid default null,p_limit integer default 20)
returns table(inputter_name text,section text,started_at timestamptz,last_used_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_outlet uuid;
begin
 perform public.require_visitor_role(array['staff','admin','super_admin']);
 if p_section not in ('sales','expenses','suppliers','visitors') then raise exception 'Bagian penginput tidak valid.' using errcode='22023'; end if;
 v_outlet:=public.lm_resolve_sales_outlet(p_outlet_id);
 return query select s.inputter_name,s.section,s.started_at,s.last_used_at from public.operational_inputter_sessions s where s.outlet_id=v_outlet and s.section=p_section order by s.started_at desc limit greatest(1,least(coalesce(p_limit,20),100));
end $$;

create or replace function public.lm_get_active_operational_inputter(p_outlet_id uuid,p_section text) returns text
language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_session uuid; v record;
begin
 begin v_session:=nullif(current_setting('app.operational_inputter_session_id',true),'')::uuid; exception when invalid_text_representation then v_session:=null; end;
 if v_session is null then raise exception 'Sesi penginput wajib diatur sebelum mencatat data.' using errcode='P0001'; end if;
 select * into v from public.lm_require_operational_inputter_session(v_session,p_section,p_outlet_id);
 return v.inputter_name;
end $$;

create or replace function public.lm_snapshot_operational_inputter() returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_section text; v_session uuid; v record;
begin
 v_section:=case tg_table_name when 'sales_transactions' then 'sales' when 'operational_expenses' then 'expenses' else null end;
 if v_section is null then raise exception 'Tabel snapshot penginput tidak didukung.' using errcode='22023'; end if;
 begin v_session:=coalesce(new.inputter_session_id,nullif(current_setting('app.operational_inputter_session_id',true),'')::uuid); exception when invalid_text_representation then v_session:=new.inputter_session_id; end;
 select * into v from public.lm_require_operational_inputter_session(v_session,v_section,new.outlet_id);
 new.inputter_session_id:=v.session_id; new.inputter_name:=v.inputter_name; new.outlet_id:=v.outlet_id; return new;
end $$;

create or replace function public.lm_preserve_operational_inputter_snapshot() returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$ begin new.inputter_name:=old.inputter_name;new.inputter_session_id:=old.inputter_session_id;return new;end $$;
drop trigger if exists sales_transactions_preserve_inputter on public.sales_transactions;
create trigger sales_transactions_preserve_inputter before update of inputter_name,inputter_session_id on public.sales_transactions for each row execute function public.lm_preserve_operational_inputter_snapshot();
drop trigger if exists operational_expenses_preserve_inputter on public.operational_expenses;
create trigger operational_expenses_preserve_inputter before update of inputter_name,inputter_session_id on public.operational_expenses for each row execute function public.lm_preserve_operational_inputter_snapshot();

create or replace function public.lm_preserve_supplier_inputter_snapshot() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$ begin new.inputter_name:=old.inputter_name;new.inputter_session_id:=old.inputter_session_id;return new;end $$;
drop trigger if exists suppliers_preserve_inputter on public.suppliers;
create trigger suppliers_preserve_inputter before update of inputter_name,inputter_session_id on public.suppliers for each row execute function public.lm_preserve_supplier_inputter_snapshot();
drop trigger if exists supplier_items_preserve_inputter on public.supplier_items;
create trigger supplier_items_preserve_inputter before update of inputter_name,inputter_session_id on public.supplier_items for each row execute function public.lm_preserve_supplier_inputter_snapshot();

create or replace function public.lm_snapshot_supplier_inputter_on_insert() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_session uuid;v record;begin begin v_session:=coalesce(new.inputter_session_id,nullif(current_setting('app.operational_inputter_session_id',true),'')::uuid);exception when invalid_text_representation then v_session:=new.inputter_session_id;end;select * into v from public.lm_require_operational_inputter_session(v_session,'suppliers',new.outlet_id);new.outlet_id:=v.outlet_id;new.inputter_name:=v.inputter_name;new.inputter_session_id:=v.session_id;return new;end $$;
create or replace function public.lm_snapshot_supplier_item_inputter_on_insert() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_outlet uuid;v_session uuid;v record;begin select outlet_id into v_outlet from public.suppliers where id=new.supplier_id;if v_outlet is null then raise exception 'Supplier tidak ditemukan.';end if;begin v_session:=coalesce(new.inputter_session_id,nullif(current_setting('app.operational_inputter_session_id',true),'')::uuid);exception when invalid_text_representation then v_session:=new.inputter_session_id;end;select * into v from public.lm_require_operational_inputter_session(v_session,'suppliers',v_outlet);new.outlet_id:=v.outlet_id;new.inputter_name:=v.inputter_name;new.inputter_session_id:=v.session_id;return new;end $$;

create or replace function public.lm_snapshot_visitor_inputter() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_session uuid;v_section text;v record;begin begin v_session:=coalesce(new.inputter_session_id,nullif(current_setting('app.operational_inputter_session_id',true),'')::uuid);exception when invalid_text_representation then v_session:=new.inputter_session_id;end;v_section:=nullif(current_setting('app.operational_inputter_section',true),'');if v_section not in ('sales','visitors') then v_section:='visitors';end if;select * into v from public.lm_require_operational_inputter_session(v_session,v_section,new.outlet_id);new.inputter_name:=v.inputter_name;new.inputter_session_id:=v.session_id;new.outlet_id:=v.outlet_id;return new;end $$;
create trigger visitor_visits_snapshot_inputter before insert on public.visitor_visits for each row execute function public.lm_snapshot_visitor_inputter();
create trigger visitor_visits_preserve_inputter before update of inputter_name,inputter_session_id on public.visitor_visits for each row execute function public.lm_preserve_operational_inputter_snapshot();

alter function public.create_operational_expense(date,text,numeric,text,numeric,numeric,uuid,text,text,text) rename to create_operational_expense_v2_legacy;
alter function public.save_supplier_with_items(jsonb,jsonb,uuid,uuid) rename to save_supplier_with_items_v2_legacy;
alter function public.create_sales_transaction_with_visit(date,jsonb,text,text,uuid,uuid,jsonb) rename to create_sales_transaction_with_visit_v2_legacy;
alter function public.create_or_append_visitor_daily_recap(date,uuid,text,jsonb) rename to create_or_append_visitor_daily_recap_v2_legacy;

create or replace function public.create_operational_expense(p_expense_date date,p_item_name text,p_quantity numeric,p_unit text,p_unit_price numeric,p_amount numeric,p_cost_category_id uuid,p_inputter_session_id uuid,p_receipt_reference text default null,p_vendor_name text default null,p_notes text default null)
returns public.operational_expenses language plpgsql volatile security definer set search_path=public,pg_catalog as $$ begin perform set_config('app.operational_inputter_session_id',p_inputter_session_id::text,true);perform public.lm_require_operational_inputter_session(p_inputter_session_id,'expenses',(select outlet_id from public.cost_categories where id=p_cost_category_id));return public.create_operational_expense_v2_legacy(p_expense_date,p_item_name,p_quantity,p_unit,p_unit_price,p_amount,p_cost_category_id,p_receipt_reference,p_vendor_name,p_notes);end $$;
create or replace function public.save_supplier_with_items(p_supplier jsonb,p_items jsonb,p_inputter_session_id uuid,p_supplier_id uuid default null,p_outlet_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare v_requires_session boolean;
begin
 v_requires_session:=p_supplier_id is null or exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) i where nullif(i->>'id','') is null or not exists(select 1 from public.supplier_items si where si.id=(i->>'id')::uuid and si.supplier_id=p_supplier_id and si.deleted_at is null));
 if v_requires_session then perform public.lm_require_operational_inputter_session(p_inputter_session_id,'suppliers',p_outlet_id);perform set_config('app.operational_inputter_session_id',p_inputter_session_id::text,true);end if;
 return public.save_supplier_with_items_v2_legacy(p_supplier,p_items,p_supplier_id,p_outlet_id);
end $$;
create or replace function public.create_sales_transaction_with_visit(p_transaction_date date,p_items jsonb,p_inputter_session_id uuid,p_notes text default null,p_entry_source text default 'manual',p_outlet_id uuid default null,p_existing_visit_id uuid default null,p_new_visit jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_catalog as $$ begin perform public.lm_require_operational_inputter_session(p_inputter_session_id,'sales',p_outlet_id);perform set_config('app.operational_inputter_session_id',p_inputter_session_id::text,true);perform set_config('app.operational_inputter_section','sales',true);return public.create_sales_transaction_with_visit_v2_legacy(p_transaction_date,p_items,p_notes,p_entry_source,p_outlet_id,p_existing_visit_id,p_new_visit);end $$;
create or replace function public.create_or_append_visitor_daily_recap(p_business_date date,p_outlet_id uuid,p_inputter_session_id uuid,p_recorder_name text default null,p_entries jsonb default '[]')
returns jsonb language plpgsql volatile security definer set search_path=public,pg_catalog as $$ declare v record;v_header_name text;begin select * into v from public.lm_require_operational_inputter_session(p_inputter_session_id,'visitors',p_outlet_id);perform set_config('app.operational_inputter_session_id',p_inputter_session_id::text,true);perform set_config('app.operational_inputter_section','visitors',true);v_header_name:=case when exists(select 1 from public.visitor_daily_recaps r where r.outlet_id=v.outlet_id and r.business_date=p_business_date and r.deleted_at is null) then null else v.inputter_name end;return public.create_or_append_visitor_daily_recap_v2_legacy(p_business_date,v.outlet_id,v_header_name,p_entries);end $$;

create or replace function public.get_visitor_daily_recap(p_outlet_id uuid,p_business_date date) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;begin perform public.require_visitor_role(array['staff','admin','super_admin']);select jsonb_build_object('id',r.id,'outlet_id',r.outlet_id,'business_date',r.business_date,'recorder_name',r.recorder_name,'entries',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'arrival_time',to_char(v.check_in_at at time zone 'Asia/Jakarta','HH24:MI'),'adult_count',v.adult_count,'child_count',v.child_count,'notes',v.notes,'inputter_name',v.inputter_name,'inputter_session_id',v.inputter_session_id,'check_in_at',v.check_in_at,'created_at',v.created_at,'updated_at',v.updated_at) order by v.check_in_at,v.created_at) from public.visitor_visits v where v.daily_recap_id=r.id and v.deleted_at is null),'[]'::jsonb)) into v_result from public.visitor_daily_recaps r where r.outlet_id=p_outlet_id and r.business_date=p_business_date and r.deleted_at is null;return v_result;end $$;

revoke all on function public.start_operational_inputter_session(text,text,uuid),public.validate_operational_inputter_session(uuid,text,uuid),public.get_operational_inputter_history(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.start_operational_inputter_session(text,text,uuid),public.validate_operational_inputter_session(uuid,text,uuid),public.get_operational_inputter_history(text,uuid,integer) to authenticated;
revoke all on function public.lm_require_operational_inputter_session(uuid,text,uuid),public.lm_get_active_operational_inputter(uuid,text),public.lm_snapshot_visitor_inputter() from public,anon,authenticated;
revoke all on function public.create_operational_expense_v2_legacy(date,text,numeric,text,numeric,numeric,uuid,text,text,text),public.save_supplier_with_items_v2_legacy(jsonb,jsonb,uuid,uuid),public.create_sales_transaction_with_visit_v2_legacy(date,jsonb,text,text,uuid,uuid,jsonb),public.create_or_append_visitor_daily_recap_v2_legacy(date,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_operational_expense(date,text,numeric,text,numeric,numeric,uuid,uuid,text,text,text),public.save_supplier_with_items(jsonb,jsonb,uuid,uuid,uuid),public.create_sales_transaction_with_visit(date,jsonb,uuid,text,text,uuid,uuid,jsonb),public.create_or_append_visitor_daily_recap(date,uuid,uuid,text,jsonb) to authenticated;

commit;
