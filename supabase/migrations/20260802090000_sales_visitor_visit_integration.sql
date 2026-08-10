-- Sales Transaction <-> Visitor Visit integration.
--
-- The authoritative sales engine remains the Stage 2/5 RPC stack. This
-- migration only adds visit context, guarded wrappers, and derived summaries.
-- Existing public.sales rows and existing visits are preserved as legacy data;
-- no historical relationship is inferred or backfilled.

begin;

-- ---------------------------------------------------------------------------
-- 1. Additive visit metadata and authoritative Sales header relationship
-- ---------------------------------------------------------------------------

alter table public.visitor_visits
  add column if not exists outlet_id uuid references public.outlets(id) on delete restrict,
  add column if not exists visit_date date,
  add column if not exists adult_count integer,
  add column if not exists child_count integer,
  add column if not exists record_source text;

-- Every row that predates this integration came through the legacy visitor
-- purchase workflow. This classification does not change its financial data.
update public.visitor_visits
set record_source = 'legacy_manual'
where record_source is null;

alter table public.visitor_visits
  alter column record_source set default 'operational',
  alter column record_source set not null,
  alter column visitor_id drop not null;

alter table public.visitor_visits
  drop constraint if exists visitor_visits_record_source_check,
  add constraint visitor_visits_record_source_check
    check (record_source in ('legacy_manual', 'operational')),
  drop constraint if exists visitor_visits_operational_fields_check,
  add constraint visitor_visits_operational_fields_check check (
    (record_source = 'legacy_manual')
    or (
      outlet_id is not null
      and visit_date is not null
      and adult_count is not null
      and child_count is not null
      and adult_count >= 0
      and child_count >= 0
      and adult_count + child_count > 0
    )
  );

alter table public.sales_transactions
  add column if not exists visitor_visit_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sales_transactions'::regclass
      and conname = 'sales_transactions_visitor_visit_id_fkey'
  ) then
    alter table public.sales_transactions
      add constraint sales_transactions_visitor_visit_id_fkey
      foreign key (visitor_visit_id)
      references public.visitor_visits(id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists idx_sales_transactions_visitor_visit
  on public.sales_transactions(visitor_visit_id);

create index if not exists idx_sales_transactions_active_visit
  on public.sales_transactions(visitor_visit_id)
  where deleted_at is null and visitor_visit_id is not null;

create index if not exists idx_visitor_visits_operational_lookup
  on public.visitor_visits(outlet_id, visit_date)
  where deleted_at is null and record_source = 'operational';

comment on column public.sales_transactions.visitor_visit_id is
  'Optional authoritative link from one Sales Transaction to one Visitor Visit.';
comment on column public.visitor_visits.record_source is
  'legacy_manual preserves the old visitor purchase workflow; operational uses linked sales_transactions.';

-- ---------------------------------------------------------------------------
-- 2. Database-level relationship and visit mutation guards
-- ---------------------------------------------------------------------------

create or replace function public.lm_validate_sales_visitor_visit_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_visit public.visitor_visits%rowtype;
begin
  if new.visitor_visit_id is null then
    return new;
  end if;

  select * into v_visit
  from public.visitor_visits
  where id = new.visitor_visit_id
  for key share;

  if not found then
    raise exception 'Kunjungan tidak ditemukan.' using errcode = '23503';
  end if;
  if v_visit.deleted_at is not null then
    raise exception 'Kunjungan sudah diarsipkan.' using errcode = '23514';
  end if;
  if v_visit.record_source <> 'operational' then
    raise exception 'Kunjungan historis tidak dapat dihubungkan ke transaksi operasional.' using errcode = '23514';
  end if;
  if v_visit.outlet_id is distinct from new.outlet_id then
    raise exception 'Kunjungan berasal dari Outlet yang berbeda.' using errcode = '23514';
  end if;
  if v_visit.visit_date is distinct from new.transaction_date then
    raise exception 'Tanggal kunjungan harus sama dengan tanggal transaksi.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.lm_validate_sales_visitor_visit_link()
  from public, anon, authenticated;

drop trigger if exists validate_sales_visitor_visit_link on public.sales_transactions;
create trigger validate_sales_visitor_visit_link
before insert or update of visitor_visit_id, outlet_id, transaction_date, deleted_at
on public.sales_transactions
for each row execute function public.lm_validate_sales_visitor_visit_link();

create or replace function public.lm_guard_linked_visit_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if (new.visit_date is distinct from old.visit_date
      or new.outlet_id is distinct from old.outlet_id)
     and exists (
       select 1 from public.sales_transactions st
       where st.visitor_visit_id = old.id
     ) then
    raise exception 'Tanggal atau Outlet kunjungan tidak dapat diubah karena masih terhubung dengan transaksi penjualan.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.lm_guard_linked_visit_changes()
  from public, anon, authenticated;

drop trigger if exists guard_linked_visit_changes on public.visitor_visits;
create trigger guard_linked_visit_changes
before update of visit_date, outlet_id
on public.visitor_visits
for each row execute function public.lm_guard_linked_visit_changes();

-- ---------------------------------------------------------------------------
-- 3. Internal validated operational Visit creator
-- ---------------------------------------------------------------------------

create or replace function public.lm_create_operational_visitor_visit(
  p_visit_date date,
  p_outlet_id uuid,
  p_visitor_id uuid,
  p_adult_count integer,
  p_child_count integer,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_visit_id uuid;
  v_check_in_at timestamptz;
begin
  if v_actor_id is null or not public.current_user_is_active() then
    raise exception 'Sesi login tidak valid atau akun tidak aktif.' using errcode = '42501';
  end if;
  if p_visit_date is null or p_outlet_id is null then
    raise exception 'Tanggal dan Outlet kunjungan wajib tersedia.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.outlets o
    where o.id = p_outlet_id and o.is_active and o.deleted_at is null
  ) then
    raise exception 'Outlet kunjungan tidak valid atau tidak aktif.' using errcode = '23514';
  end if;
  if p_adult_count is null or p_child_count is null
     or p_adult_count < 0 or p_child_count < 0
     or p_adult_count + p_child_count < 1 then
    raise exception 'Jumlah pengunjung minimal satu orang.' using errcode = '23514';
  end if;
  if p_visitor_id is not null and not exists (
    select 1 from public.visitors v
    where v.id = p_visitor_id and v.deleted_at is null
  ) then
    raise exception 'Pengunjung tidak ditemukan atau telah diarsipkan.' using errcode = '23503';
  end if;
  if p_notes is not null and char_length(btrim(p_notes)) > 500 then
    raise exception 'Catatan kunjungan maksimal 500 karakter.' using errcode = '23514';
  end if;

  -- Preserve the selected Jakarta business date while retaining a useful
  -- arrival time for today. Backdated/future visits use local noon.
  v_check_in_at := case
    when p_visit_date = (clock_timestamp() at time zone 'Asia/Jakarta')::date
      then clock_timestamp()
    else (p_visit_date::timestamp + time '12:00') at time zone 'Asia/Jakarta'
  end;

  insert into public.visitor_visits (
    visitor_id, outlet_id, visit_date, adult_count, child_count,
    record_source, check_in_at, notes, created_by, updated_by
  ) values (
    p_visitor_id, p_outlet_id, p_visit_date, p_adult_count, p_child_count,
    'operational', v_check_in_at, nullif(btrim(p_notes), ''), v_actor_id, v_actor_id
  ) returning id into v_visit_id;

  return v_visit_id;
end;
$$;

revoke all on function public.lm_create_operational_visitor_visit(date,uuid,uuid,integer,integer,text)
  from public, anon, authenticated;

create or replace function public.create_operational_visitor_visit(
  p_visit_date date,
  p_adult_count integer,
  p_child_count integer,
  p_visitor_id uuid default null,
  p_notes text default null,
  p_outlet_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_outlet_id uuid;
begin
  perform public.require_visitor_role(array['staff','admin','super_admin']);
  v_outlet_id := public.lm_resolve_sales_outlet(p_outlet_id);
  return public.lm_create_operational_visitor_visit(
    p_visit_date, v_outlet_id, p_visitor_id,
    p_adult_count, p_child_count, p_notes
  );
end;
$$;

revoke all on function public.create_operational_visitor_visit(date,integer,integer,uuid,text,uuid)
  from public, anon;
grant execute on function public.create_operational_visitor_visit(date,integer,integer,uuid,text,uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Visit-aware atomic wrappers around the authoritative Stage 5 Sales RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_sales_transaction_with_visit(
  p_transaction_date date,
  p_items jsonb,
  p_notes text default null,
  p_entry_source text default 'manual',
  p_outlet_id uuid default null,
  p_existing_visit_id uuid default null,
  p_new_visit jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_outlet_id uuid;
  v_visit_id uuid;
  v_transaction_id uuid;
  v_new_visit_created boolean := false;
begin
  if p_existing_visit_id is not null and p_new_visit is not null then
    raise exception 'Pilih kunjungan lama atau buat kunjungan baru, bukan keduanya.' using errcode = '22023';
  end if;

  v_outlet_id := public.lm_resolve_sales_outlet(p_outlet_id);

  if p_new_visit is not null then
    if jsonb_typeof(p_new_visit) <> 'object' then
      raise exception 'Data kunjungan baru tidak valid.' using errcode = '22023';
    end if;
    v_visit_id := public.lm_create_operational_visitor_visit(
      p_transaction_date,
      v_outlet_id,
      nullif(p_new_visit->>'visitor_id', '')::uuid,
      (p_new_visit->>'adult_count')::integer,
      (p_new_visit->>'child_count')::integer,
      p_new_visit->>'notes'
    );
    v_new_visit_created := true;
  else
    v_visit_id := p_existing_visit_id;
  end if;

  -- Stage 5 remains authoritative for numbering, items, totals, HPP, inventory,
  -- mixed-Subunit validation, and permissions. Any later link failure rolls the
  -- complete PostgreSQL function transaction back.
  v_transaction_id := public.create_sales_transaction(
    p_transaction_date,
    p_items,
    p_notes,
    case when v_visit_id is null then p_entry_source else 'visitor' end,
    v_outlet_id
  );

  update public.sales_transactions
  set visitor_visit_id = v_visit_id,
      updated_at = clock_timestamp(),
      updated_by = auth.uid()
  where id = v_transaction_id;

  return jsonb_build_object(
    'sales_transaction_id', v_transaction_id,
    'transaction_number', (
      select transaction_number from public.sales_transactions where id = v_transaction_id
    ),
    'visitor_visit_id', v_visit_id,
    'visit_created', v_new_visit_created
  );
end;
$$;

create or replace function public.update_sales_transaction_with_visit(
  p_transaction_id uuid,
  p_transaction_date date,
  p_items jsonb,
  p_notes text default null,
  p_existing_visit_id uuid default null,
  p_new_visit jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_outlet_id uuid;
  v_visit_id uuid;
  v_new_visit_created boolean := false;
  v_updated boolean;
begin
  if p_existing_visit_id is not null and p_new_visit is not null then
    raise exception 'Pilih kunjungan lama atau buat kunjungan baru, bukan keduanya.' using errcode = '22023';
  end if;

  select outlet_id into v_outlet_id
  from public.sales_transactions
  where id = p_transaction_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Transaksi penjualan tidak ditemukan atau sudah diarsipkan.' using errcode = 'P0001';
  end if;

  if p_new_visit is not null then
    if jsonb_typeof(p_new_visit) <> 'object' then
      raise exception 'Data kunjungan baru tidak valid.' using errcode = '22023';
    end if;
    v_visit_id := public.lm_create_operational_visitor_visit(
      p_transaction_date,
      v_outlet_id,
      nullif(p_new_visit->>'visitor_id', '')::uuid,
      (p_new_visit->>'adult_count')::integer,
      (p_new_visit->>'child_count')::integer,
      p_new_visit->>'notes'
    );
    v_new_visit_created := true;
  else
    v_visit_id := p_existing_visit_id;
  end if;

  -- Detach first so an intentional date-change + detach/replace is valid.
  -- The entire wrapper is atomic, so a later failure restores the old link.
  update public.sales_transactions
  set visitor_visit_id = null,
      updated_at = clock_timestamp(),
      updated_by = auth.uid()
  where id = p_transaction_id;

  v_updated := public.update_sales_transaction(
    p_transaction_id, p_transaction_date, p_items, p_notes
  );
  if not v_updated then
    raise exception 'Transaksi penjualan tidak dapat diperbarui.' using errcode = 'P0001';
  end if;

  update public.sales_transactions
  set visitor_visit_id = v_visit_id,
      updated_at = clock_timestamp(),
      updated_by = auth.uid()
  where id = p_transaction_id;

  return jsonb_build_object(
    'sales_transaction_id', p_transaction_id,
    'transaction_number', (
      select transaction_number from public.sales_transactions where id = p_transaction_id
    ),
    'visitor_visit_id', v_visit_id,
    'visit_created', v_new_visit_created
  );
end;
$$;

revoke all on function public.create_sales_transaction_with_visit(date,jsonb,text,text,uuid,uuid,jsonb)
  from public, anon;
revoke all on function public.update_sales_transaction_with_visit(uuid,date,jsonb,text,uuid,jsonb)
  from public, anon;
grant execute on function public.create_sales_transaction_with_visit(date,jsonb,text,text,uuid,uuid,jsonb)
  to authenticated;
grant execute on function public.update_sales_transaction_with_visit(uuid,date,jsonb,text,uuid,jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Authoritative server-side Visit/Sales read contracts
-- ---------------------------------------------------------------------------

create or replace function public.list_visitor_visit_options(
  p_visit_date date,
  p_outlet_id uuid
)
returns table (
  visit_id uuid,
  visitor_id uuid,
  visitor_name text,
  visitor_phone text,
  adult_count integer,
  child_count integer,
  total_visitors integer,
  active_transaction_count bigint,
  active_purchase_total numeric,
  check_out_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    vv.id,
    vv.visitor_id,
    coalesce(v.full_name, 'Tamu Umum'),
    v.phone,
    vv.adult_count,
    vv.child_count,
    vv.adult_count + vv.child_count,
    count(st.id) filter (where st.deleted_at is null),
    coalesce(sum(st.total_amount) filter (where st.deleted_at is null), 0),
    vv.check_out_at
  from public.visitor_visits vv
  left join public.visitors v on v.id = vv.visitor_id
  left join public.sales_transactions st on st.visitor_visit_id = vv.id
  where public.lm_is_active_staff_or_above()
    and vv.record_source = 'operational'
    and vv.deleted_at is null
    and vv.visit_date = p_visit_date
    and vv.outlet_id = p_outlet_id
  group by vv.id, v.full_name, v.phone
  order by vv.check_in_at desc, vv.id;
$$;

create or replace function public.get_sales_linked_visit_summaries(
  p_transaction_ids uuid[]
)
returns table (
  sales_transaction_id uuid,
  visit_id uuid,
  visitor_id uuid,
  visitor_name text,
  adult_count integer,
  child_count integer,
  total_visitors integer,
  visit_date date,
  visit_deleted_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    st.id,
    vv.id,
    vv.visitor_id,
    coalesce(v.full_name, 'Tamu Umum'),
    vv.adult_count,
    vv.child_count,
    coalesce(vv.adult_count, 0) + coalesce(vv.child_count, 0),
    coalesce(vv.visit_date, (vv.check_in_at at time zone 'Asia/Jakarta')::date),
    vv.deleted_at
  from public.sales_transactions st
  join public.visitor_visits vv on vv.id = st.visitor_visit_id
  left join public.visitors v on v.id = vv.visitor_id
  where public.lm_is_active_staff_or_above()
    and st.id = any(coalesce(p_transaction_ids, array[]::uuid[]))
    and (st.deleted_at is null or public.lm_is_active_super_admin());
$$;

create or replace function public.list_visitor_visits(
  p_status text default 'active',
  p_query text default null,
  p_from date default null,
  p_to date default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  perform public.require_visitor_role(array['staff','admin','super_admin']);
  if p_status not in ('active', 'history', 'all') then
    raise exception 'Status kunjungan tidak valid.' using errcode = '22023';
  end if;

  with visit_rows as (
    select
      vv.id,
      vv.visitor_id,
      coalesce(v.visitor_code, 'TAMU-UMUM') as visitor_code,
      coalesce(v.full_name, 'Tamu Umum') as full_name,
      v.phone,
      vv.outlet_id,
      coalesce(vv.visit_date, (vv.check_in_at at time zone 'Asia/Jakarta')::date) as visit_date,
      vv.check_in_at,
      vv.check_out_at,
      vv.notes,
      vv.adult_count,
      vv.child_count,
      case when vv.adult_count is null or vv.child_count is null
        then null else vv.adult_count + vv.child_count end as total_visitors,
      vv.record_source,
      coalesce(native_sales.active_transaction_count, 0) as active_transaction_count,
      coalesce(native_sales.active_purchase_total, 0) as active_purchase_total,
      coalesce(native_sales.archived_transaction_count, 0) as archived_transaction_count,
      coalesce(native_sales.transactions, '[]'::jsonb) as linked_transactions,
      legacy_sales.legacy_manual_purchase_amount,
      legacy_sales.legacy_manual_quantity
    from public.visitor_visits vv
    left join public.visitors v on v.id = vv.visitor_id
    left join lateral (
      select
        count(*) filter (where st.deleted_at is null) as active_transaction_count,
        coalesce(sum(st.total_amount) filter (where st.deleted_at is null), 0) as active_purchase_total,
        count(*) filter (where st.deleted_at is not null) as archived_transaction_count,
        jsonb_agg(
          jsonb_build_object(
            'transaction_id', st.id,
            'transaction_number', st.transaction_number,
            'transaction_date', st.transaction_date,
            'total_amount', st.total_amount,
            'deleted_at', st.deleted_at
          ) order by st.transaction_date desc, st.created_at desc
        ) filter (
          where st.id is not null
            and (st.deleted_at is null or public.lm_is_active_super_admin())
        ) as transactions
      from public.sales_transactions st
      where st.visitor_visit_id = vv.id
    ) native_sales on true
    left join lateral (
      select
        sum(s.amount) filter (where s.deleted_at is null) as legacy_manual_purchase_amount,
        sum(s.quantity) filter (where s.deleted_at is null) as legacy_manual_quantity
      from public.sales s
      where s.visitor_visit_id = vv.id
    ) legacy_sales on true
    where vv.deleted_at is null
      and (v.id is null or v.deleted_at is null)
      and (p_status = 'all'
        or (p_status = 'active' and vv.check_out_at is null)
        or (p_status = 'history' and vv.check_out_at is not null))
      and (nullif(btrim(p_query), '') is null
        or vv.id::text = btrim(p_query)
        or coalesce(v.visitor_code, 'TAMU-UMUM') ilike '%' || btrim(p_query) || '%'
        or coalesce(v.full_name, 'Tamu Umum') ilike '%' || btrim(p_query) || '%'
        or coalesce(v.phone, '') ilike '%' || btrim(p_query) || '%')
      and (p_from is null or coalesce(vv.visit_date, (vv.check_in_at at time zone 'Asia/Jakarta')::date) >= p_from)
      and (p_to is null or coalesce(vv.visit_date, (vv.check_in_at at time zone 'Asia/Jakarta')::date) <= p_to)
  ), counted as (
    select count(*) as total from visit_rows
  ), paged as (
    select * from visit_rows
    order by check_in_at desc, id
    limit least(greatest(coalesce(p_page_size, 20), 1), 100)
    offset (greatest(coalesce(p_page, 1), 1) - 1)
      * least(greatest(coalesce(p_page_size, 20), 1), 100)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(paged)) from paged), '[]'::jsonb),
    'total', (select total from counted),
    'page', greatest(coalesce(p_page, 1), 1),
    'page_size', least(greatest(coalesce(p_page_size, 20), 1), 100)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.list_visitor_visit_options(date,uuid)
  from public, anon;
revoke all on function public.get_sales_linked_visit_summaries(uuid[])
  from public, anon;
revoke all on function public.list_visitor_visits(text,text,date,date,integer,integer)
  from public, anon;
grant execute on function public.list_visitor_visit_options(date,uuid)
  to authenticated;
grant execute on function public.get_sales_linked_visit_summaries(uuid[])
  to authenticated;
grant execute on function public.list_visitor_visits(text,text,date,date,integer,integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Visit lifecycle guards and anonymous-safe checkout
-- ---------------------------------------------------------------------------

create or replace function public.soft_delete_visitor_visit(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.require_visitor_role(array['admin','super_admin']);
  if exists (
    select 1 from public.sales_transactions st
    where st.visitor_visit_id = p_visit_id and st.deleted_at is null
  ) then
    raise exception 'Kunjungan masih terhubung dengan transaksi penjualan.' using errcode = '23503';
  end if;
  update public.visitor_visits
  set deleted_at = clock_timestamp(), deleted_by = v_user_id, updated_by = v_user_id
  where id = p_visit_id and deleted_at is null;
  if not found then
    raise exception 'Kunjungan tidak ditemukan atau sudah diarsipkan.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.hard_delete_visitor_visit(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.require_visitor_role(array['super_admin']);
  if exists (select 1 from public.sales where visitor_visit_id = p_visit_id)
     or exists (select 1 from public.sales_transactions where visitor_visit_id = p_visit_id) then
    raise exception 'Kunjungan memiliki transaksi terkait dan tidak dapat dihapus permanen.' using errcode = '23503';
  end if;
  delete from public.visitor_visits where id = p_visit_id and deleted_at is not null;
  if not found then
    raise exception 'Data kunjungan terarsip tidak ditemukan.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.check_out_visitor(p_visit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
  v_visit public.visitor_visits%rowtype;
  v_name text;
  v_code text;
begin
  v_user_id := public.require_visitor_role(array['staff','admin','super_admin']);
  select * into v_visit from public.visitor_visits
  where id = p_visit_id and deleted_at is null for update;
  if not found then raise exception 'Kunjungan tidak ditemukan.'; end if;
  if v_visit.check_out_at is not null then raise exception 'Pengunjung sudah ditandai pulang.'; end if;
  update public.visitor_visits
  set check_out_at = clock_timestamp(), updated_at = clock_timestamp(), updated_by = v_user_id
  where id = p_visit_id returning * into v_visit;
  select full_name, visitor_code into v_name, v_code
  from public.visitors where id = v_visit.visitor_id;
  return jsonb_build_object(
    'visitor_visit_id', v_visit.id,
    'visitor_id', v_visit.visitor_id,
    'visitor_code', coalesce(v_code, 'TAMU-UMUM'),
    'full_name', coalesce(v_name, 'Tamu Umum'),
    'check_out_at', v_visit.check_out_at
  );
end;
$$;

revoke all on function public.soft_delete_visitor_visit(uuid),
  public.hard_delete_visitor_visit(uuid), public.check_out_visitor(uuid)
  from public, anon;
grant execute on function public.soft_delete_visitor_visit(uuid),
  public.hard_delete_visitor_visit(uuid), public.check_out_visitor(uuid)
  to authenticated;

-- The legacy purchase RPCs remain installed for historical compatibility and
-- controlled service/import access, but the authenticated application can no
-- longer create new revenue-like rows through the Visitor module.
revoke execute on function public.record_visitor_purchase(jsonb,uuid,text,text,text)
  from authenticated;
revoke execute on function public.add_visitor_purchase(uuid,jsonb)
  from authenticated;

-- Reassert direct-write restrictions for both authoritative domains.
revoke insert, update, delete, truncate, references, trigger
  on table public.sales_transactions, public.sales_items,
    public.visitor_visits, public.visitors, public.sales
  from authenticated;
grant select on table public.sales_transactions, public.sales_items,
  public.visitor_visits to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Fail-closed installation assertions
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.create_sales_transaction_with_visit(date,jsonb,text,text,uuid,uuid,jsonb)') is null
     or to_regprocedure('public.update_sales_transaction_with_visit(uuid,date,jsonb,text,uuid,jsonb)') is null
     or to_regprocedure('public.create_operational_visitor_visit(date,integer,integer,uuid,text,uuid)') is null then
    raise exception 'SALES/VISITOR VERIFY FAILED: required integration RPC is missing.';
  end if;
  if has_table_privilege('authenticated', 'public.sales_transactions', 'INSERT')
     or has_table_privilege('authenticated', 'public.sales_transactions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.visitor_visits', 'INSERT')
     or has_table_privilege('authenticated', 'public.visitor_visits', 'UPDATE') then
    raise exception 'SALES/VISITOR VERIFY FAILED: authenticated direct writes remain enabled.';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.record_visitor_purchase(jsonb,uuid,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.add_visitor_purchase(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'SALES/VISITOR VERIFY FAILED: legacy purchase write RPC remains executable.';
  end if;
end;
$$;

commit;
