begin;

comment on table public.operational_inputter_settings is
  'Deprecated Phase-1 compatibility table retained for historical compatibility; new operational writes require V3 sessions.';

create or replace function public.lm_get_active_operational_inputter(p_outlet_id uuid,p_section text)
returns text
language plpgsql volatile security definer set search_path=public,pg_catalog as $$
declare
  v_session uuid;
  v record;
begin
  if p_section not in ('sales','expenses','suppliers','visitors') then
    raise exception 'Bagian penginput tidak valid.' using errcode='22023';
  end if;
  begin
    v_session:=nullif(current_setting('app.operational_inputter_session_id',true),'')::uuid;
  exception when invalid_text_representation then
    v_session:=null;
  end;
  if v_session is null then
    raise exception 'Sesi penginput wajib diisi.' using errcode='P0001';
  end if;
  select * into v from public.lm_require_operational_inputter_session(v_session,p_section,p_outlet_id);
  return v.inputter_name;
end $$;

create or replace function public.lm_snapshot_operational_inputter()
returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_section text;
  v_session uuid;
  v record;
begin
  v_section:=case tg_table_name
    when 'sales_transactions' then 'sales'
    when 'operational_expenses' then 'expenses'
    else null
  end;
  if v_section is null then
    raise exception 'Tabel snapshot penginput tidak didukung.' using errcode='22023';
  end if;
  begin
    v_session:=coalesce(new.inputter_session_id,nullif(current_setting('app.operational_inputter_session_id',true),'')::uuid);
  exception when invalid_text_representation then
    v_session:=new.inputter_session_id;
  end;
  if v_session is null then
    raise exception 'Sesi penginput wajib diisi.' using errcode='P0001';
  end if;
  select * into v from public.lm_require_operational_inputter_session(v_session,v_section,new.outlet_id);
  new.inputter_session_id:=v.session_id;
  new.inputter_name:=v.inputter_name;
  new.outlet_id:=v.outlet_id;
  return new;
end $$;

create or replace function public.lm_snapshot_supplier_inputter_on_insert()
returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_session uuid;
  v_outlet uuid;
  v record;
begin
  v_outlet:=public.lm_resolve_sales_outlet(new.outlet_id);
  begin
    v_session:=coalesce(new.inputter_session_id,nullif(current_setting('app.operational_inputter_session_id',true),'')::uuid);
  exception when invalid_text_representation then
    v_session:=new.inputter_session_id;
  end;
  if v_session is null then
    raise exception 'Sesi penginput Supplier wajib diisi.' using errcode='P0001';
  end if;
  select * into v from public.lm_require_operational_inputter_session(v_session,'suppliers',v_outlet);
  new.outlet_id:=v.outlet_id;
  new.inputter_name:=v.inputter_name;
  new.inputter_session_id:=v.session_id;
  return new;
end $$;

create or replace function public.lm_snapshot_supplier_item_inputter_on_insert()
returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_supplier_outlet uuid;
  v_requested_outlet uuid;
  v_session uuid;
  v record;
begin
  select public.lm_resolve_sales_outlet(s.outlet_id) into v_supplier_outlet
  from public.suppliers s
  where s.id=new.supplier_id and s.deleted_at is null;
  if v_supplier_outlet is null then
    raise exception 'Supplier tidak valid untuk Item Supplier.' using errcode='23503';
  end if;
  if new.outlet_id is not null then
    v_requested_outlet:=public.lm_resolve_sales_outlet(new.outlet_id);
    if v_requested_outlet<>v_supplier_outlet then
      raise exception 'Outlet Item Supplier tidak sesuai dengan Supplier.' using errcode='23503';
    end if;
  end if;
  begin
    v_session:=coalesce(new.inputter_session_id,nullif(current_setting('app.operational_inputter_session_id',true),'')::uuid);
  exception when invalid_text_representation then
    v_session:=new.inputter_session_id;
  end;
  if v_session is null then
    raise exception 'Sesi penginput Supplier wajib diisi.' using errcode='P0001';
  end if;
  select * into v from public.lm_require_operational_inputter_session(v_session,'suppliers',v_supplier_outlet);
  new.outlet_id:=v.outlet_id;
  new.inputter_name:=v.inputter_name;
  new.inputter_session_id:=v.session_id;
  return new;
end $$;

create or replace function public.lm_snapshot_visitor_inputter()
returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_session uuid;
  v_section text;
  v record;
begin
  begin
    v_session:=coalesce(new.inputter_session_id,nullif(current_setting('app.operational_inputter_session_id',true),'')::uuid);
  exception when invalid_text_representation then
    v_session:=new.inputter_session_id;
  end;
  if v_session is null then
    raise exception 'Sesi penginput Pengunjung wajib diisi.' using errcode='P0001';
  end if;
  v_section:=nullif(current_setting('app.operational_inputter_section',true),'');
  if v_section not in ('sales','visitors') then
    raise exception 'Bagian sesi Pengunjung tidak valid.' using errcode='P0001';
  end if;
  select * into v from public.lm_require_operational_inputter_session(v_session,v_section,new.outlet_id);
  new.inputter_name:=v.inputter_name;
  new.inputter_session_id:=v.session_id;
  new.outlet_id:=v.outlet_id;
  return new;
end $$;

-- The legacy setting RPCs remain installed but are retired and cannot be used
-- to read or write new operational attribution.
create or replace function public.get_operational_inputter(p_section text,p_outlet_id uuid default null)
returns table(outlet_id uuid,section text,inputter_name text)
language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
  raise exception 'RPC penginput lama sudah dihentikan.' using errcode='P0001';
end $$;

create or replace function public.set_operational_inputter(p_section text,p_inputter_name text,p_outlet_id uuid default null)
returns table(outlet_id uuid,section text,inputter_name text)
language plpgsql volatile security definer set search_path=public,pg_catalog as $$
begin
  raise exception 'RPC penginput lama sudah dihentikan.' using errcode='P0001';
end $$;

revoke all on function public.get_operational_inputter(text,uuid),public.set_operational_inputter(text,text,uuid)
  from public,anon,authenticated;

revoke all on function public.create_operational_expense(date,numeric,uuid,text),
  public.create_operational_expense(date,text,numeric,text,numeric,numeric,uuid,text,text,text),
  public.save_supplier_with_items(jsonb,jsonb,uuid,uuid),
  public.create_sales_transaction_with_visit(date,jsonb,text,text,uuid,uuid,jsonb),
  public.update_sales_transaction_with_visit(uuid,date,jsonb,text,uuid,jsonb),
  public.create_or_append_visitor_daily_recap(date,uuid,text,jsonb),
  public.create_operational_visitor_visit(date,integer,integer,uuid,text,uuid)
  from public,anon,authenticated;

revoke all on function public.create_or_append_visitor_daily_recap_v3(date,uuid,uuid,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.create_or_append_visitor_daily_recap_v3(date,uuid,uuid,text,jsonb,uuid)
  from public,anon,authenticated;
grant execute on function public.create_or_append_visitor_daily_recap_v3(date,uuid,uuid,text,jsonb,uuid)
  to authenticated;

revoke all on function public.start_operational_inputter_session(text,text,uuid),
  public.validate_operational_inputter_session(uuid,text,uuid),
  public.get_operational_inputter_history(text,uuid,integer),
  public.create_operational_expense_v3(date,text,numeric,text,numeric,numeric,uuid,uuid,text,text,text),
  public.save_supplier_with_items_v3(jsonb,jsonb,uuid,uuid,uuid),
  public.create_sales_transaction_with_visit_v3(date,jsonb,uuid,text,text,uuid,uuid,jsonb),
  public.update_sales_transaction_with_visit_v3(uuid,date,jsonb,text,uuid,jsonb,uuid),
  public.create_or_append_visitor_daily_recap_v3(date,uuid,uuid,text,jsonb,uuid)
  from public,anon,authenticated;
grant execute on function public.start_operational_inputter_session(text,text,uuid),
  public.validate_operational_inputter_session(uuid,text,uuid),
  public.get_operational_inputter_history(text,uuid,integer),
  public.create_operational_expense_v3(date,text,numeric,text,numeric,numeric,uuid,uuid,text,text,text),
  public.save_supplier_with_items_v3(jsonb,jsonb,uuid,uuid,uuid),
  public.create_sales_transaction_with_visit_v3(date,jsonb,uuid,text,text,uuid,uuid,jsonb),
  public.update_sales_transaction_with_visit_v3(uuid,date,jsonb,text,uuid,jsonb,uuid),
  public.create_or_append_visitor_daily_recap_v3(date,uuid,uuid,text,jsonb,uuid)
  to authenticated;

revoke all on function public.lm_require_operational_inputter_session(uuid,text,uuid),
  public.lm_get_active_operational_inputter(uuid,text),
  public.lm_snapshot_operational_inputter(),
  public.lm_snapshot_supplier_inputter_on_insert(),
  public.lm_snapshot_supplier_item_inputter_on_insert(),
  public.lm_snapshot_visitor_inputter()
  from public,anon,authenticated;

commit;
