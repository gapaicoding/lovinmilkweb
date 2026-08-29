-- ============================================================
-- ACTIVE OPERATIONAL INPUTTER
-- Sales + Expenses
--
-- Active setting scope:
--   outlet_id + section
--
-- Sections:
--   sales
--   expenses
--
-- Historical records:
--   inputter_name remains NULL for records created before
--   this migration.
--
-- New records:
--   inputter_name is resolved server-side at INSERT time.
--
-- Snapshot semantics:
--   inputter_name is immutable after record creation.
-- ============================================================

begin;


-- ============================================================
-- 1. ACTIVE INPUTTER SETTINGS
-- ============================================================

create table public.operational_inputter_settings (
  id uuid primary key
    default gen_random_uuid(),

  outlet_id uuid not null
    references public.outlets(id)
    on delete restrict,

  section text not null,

  inputter_name text not null,

  created_at timestamptz not null
    default clock_timestamp(),

  created_by uuid
    references public.profiles(id)
    on delete set null,

  updated_at timestamptz not null
    default clock_timestamp(),

  updated_by uuid
    references public.profiles(id)
    on delete set null,

  constraint operational_inputter_settings_section_check
    check (
      section in (
        'sales',
        'expenses'
      )
    ),

  constraint operational_inputter_settings_name_check
    check (
      btrim(inputter_name) <> ''
      and char_length(btrim(inputter_name)) <= 100
    ),

  constraint operational_inputter_settings_outlet_section_key
    unique (
      outlet_id,
      section
    )
);


comment on table public.operational_inputter_settings is
  'Active operational inputter name per Outlet and operational section.';

comment on column public.operational_inputter_settings.section is
  'Operational section: sales or expenses.';

comment on column public.operational_inputter_settings.inputter_name is
  'Current human operational inputter name. This is separate from authentication audit fields.';


-- ============================================================
-- 2. SETTINGS TABLE SECURITY
-- ============================================================

alter table public.operational_inputter_settings
  enable row level security;

revoke all
on table public.operational_inputter_settings
from public, anon, authenticated;


-- ============================================================
-- 3. HISTORICAL SNAPSHOT COLUMNS
--
-- Intentionally nullable:
-- existing historical rows are NOT backfilled.
-- ============================================================

alter table public.sales_transactions
  add column inputter_name text null;


alter table public.sales_transactions
  add constraint sales_transactions_inputter_name_check
  check (
    inputter_name is null
    or (
      btrim(inputter_name) <> ''
      and char_length(btrim(inputter_name)) <= 100
    )
  );


comment on column public.sales_transactions.inputter_name is
  'Immutable operational inputter name snapshot captured when the Sales transaction was created.';


alter table public.operational_expenses
  add column inputter_name text null;


alter table public.operational_expenses
  add constraint operational_expenses_inputter_name_check
  check (
    inputter_name is null
    or (
      btrim(inputter_name) <> ''
      and char_length(btrim(inputter_name)) <= 100
    )
  );


comment on column public.operational_expenses.inputter_name is
  'Immutable operational inputter name snapshot captured when the Expense record was created.';


-- ============================================================
-- 4. INTERNAL:
-- GET REQUIRED ACTIVE INPUTTER
--
-- Used only by authoritative database INSERT lifecycle.
--
-- Missing inputter:
--   Sales    -> reject creation
--   Expenses -> reject creation
-- ============================================================

create or replace function public.lm_get_active_operational_inputter(
  p_outlet_id uuid,
  p_section text
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_outlet uuid;
  v_name text;
begin
  if p_section is null
     or p_section not in ('sales', 'expenses')
  then
    raise exception
      'Bagian penginput tidak valid.'
      using errcode = '22023';
  end if;


  -- Always use the canonical resolved active Outlet.
  v_outlet :=
    public.lm_resolve_sales_outlet(
      p_outlet_id
    );


  select
    btrim(s.inputter_name)
  into
    v_name
  from public.operational_inputter_settings s
  where s.outlet_id = v_outlet
    and s.section = p_section;


  if v_name is null then
    raise exception
      '%',
      case p_section
        when 'sales'
          then 'Nama penginput Penjualan belum diatur.'
        when 'expenses'
          then 'Nama penginput Pengeluaran belum diatur.'
        else
          'Nama penginput belum diatur.'
      end
      using errcode = 'P0001';
  end if;


  return v_name;
end;
$$;


comment on function public.lm_get_active_operational_inputter(uuid, text) is
  'Internal helper that resolves the current required operational inputter for one Outlet and section.';


-- ============================================================
-- 5. PUBLIC READ RPC
--
-- Returns exactly one row.
--
-- If no setting exists:
--   inputter_name = NULL
--
-- This allows the frontend to distinguish:
--   successful but unset
-- versus:
--   server/query error
-- ============================================================

create or replace function public.get_operational_inputter(
  p_section text,
  p_outlet_id uuid default null
)
returns table (
  outlet_id uuid,
  section text,
  inputter_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_outlet uuid;
begin
  perform public.require_visitor_role(
    array[
      'staff',
      'admin',
      'super_admin'
    ]
  );


  if p_section is null
     or p_section not in ('sales', 'expenses')
  then
    raise exception
      'Bagian penginput tidak valid.'
      using errcode = '22023';
  end if;


  v_outlet :=
    public.lm_resolve_sales_outlet(
      p_outlet_id
    );


  return query
  select
    v_outlet,
    p_section,
    (
      select btrim(s.inputter_name)
      from public.operational_inputter_settings s
      where s.outlet_id = v_outlet
        and s.section = p_section
    );
end;
$$;


comment on function public.get_operational_inputter(text, uuid) is
  'Returns the active operational inputter setting for Sales or Expenses.';


-- ============================================================
-- 6. PUBLIC SET / CHANGE RPC
--
-- Staff/Admin/Super Admin may set the active operational
-- inputter because those roles already participate in
-- operational data entry.
--
-- Updating the active setting NEVER rewrites historical
-- transaction snapshots.
-- ============================================================

create or replace function public.set_operational_inputter(
  p_section text,
  p_inputter_name text,
  p_outlet_id uuid default null
)
returns table (
  outlet_id uuid,
  section text,
  inputter_name text
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_outlet uuid;
  v_actor uuid;
  v_name text;
begin
  v_actor :=
    public.require_visitor_role(
      array[
        'staff',
        'admin',
        'super_admin'
      ]
    );


  if p_section is null
     or p_section not in ('sales', 'expenses')
  then
    raise exception
      'Bagian penginput tidak valid.'
      using errcode = '22023';
  end if;


  v_name :=
    btrim(p_inputter_name);


  if v_name is null
     or v_name = ''
  then
    raise exception
      'Nama penginput wajib diisi.'
      using errcode = '22023';
  end if;


  if char_length(v_name) > 100 then
    raise exception
      'Nama penginput maksimal 100 karakter.'
      using errcode = '22023';
  end if;


  v_outlet :=
    public.lm_resolve_sales_outlet(
      p_outlet_id
    );


  insert into public.operational_inputter_settings (
    outlet_id,
    section,
    inputter_name,
    created_by,
    updated_by
  )
  values (
    v_outlet,
    p_section,
    v_name,
    v_actor,
    v_actor
  )
  on conflict (
    outlet_id,
    section
  )
  do update
  set
    inputter_name = excluded.inputter_name,
    updated_at = clock_timestamp(),
    updated_by = v_actor;


  return query
  select
    v_outlet,
    p_section,
    v_name;
end;
$$;


comment on function public.set_operational_inputter(text, text, uuid) is
  'Sets or changes the active operational inputter for one Outlet and section without rewriting historical records.';


-- ============================================================
-- 7. CREATE-TIME SNAPSHOT TRIGGER
--
-- Frontend does NOT decide inputter_name.
--
-- Database resolves:
--
-- sales_transactions
--   -> Outlet + sales
--
-- operational_expenses
--   -> Outlet + expenses
--
-- Any client/server-provided inputter_name is overwritten with
-- the authoritative current setting.
-- ============================================================

create or replace function public.lm_snapshot_operational_inputter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_section text;
begin
  if tg_table_name = 'sales_transactions' then
    v_section := 'sales';

  elsif tg_table_name = 'operational_expenses' then
    v_section := 'expenses';

  else
    raise exception
      'Tabel snapshot penginput tidak didukung: %',
      tg_table_name
      using errcode = '22023';
  end if;


  new.inputter_name :=
    public.lm_get_active_operational_inputter(
      new.outlet_id,
      v_section
    );


  return new;
end;
$$;


-- ============================================================
-- 8. SALES CREATE SNAPSHOT
-- ============================================================

create trigger sales_transactions_snapshot_inputter
before insert
on public.sales_transactions
for each row
execute function public.lm_snapshot_operational_inputter();


-- ============================================================
-- 9. EXPENSE CREATE SNAPSHOT
-- ============================================================

create trigger operational_expenses_snapshot_inputter
before insert
on public.operational_expenses
for each row
execute function public.lm_snapshot_operational_inputter();


-- ============================================================
-- 10. IMMUTABLE SNAPSHOT PROTECTION
--
-- The original operational inputter belongs to the historical
-- record and must not change when the transaction is edited.
--
-- created_by / updated_by remain the technical audit trail.
-- ============================================================

create or replace function public.lm_preserve_operational_inputter_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.inputter_name := old.inputter_name;

  return new;
end;
$$;


create trigger sales_transactions_preserve_inputter
before update of inputter_name
on public.sales_transactions
for each row
execute function public.lm_preserve_operational_inputter_snapshot();


create trigger operational_expenses_preserve_inputter
before update of inputter_name
on public.operational_expenses
for each row
execute function public.lm_preserve_operational_inputter_snapshot();


-- ============================================================
-- 11. FUNCTION SECURITY
-- ============================================================

revoke all
on function public.lm_get_active_operational_inputter(uuid, text)
from public, anon, authenticated;


revoke all
on function public.lm_snapshot_operational_inputter()
from public, anon, authenticated;


revoke all
on function public.lm_preserve_operational_inputter_snapshot()
from public, anon, authenticated;


revoke all
on function public.get_operational_inputter(text, uuid)
from public, anon, authenticated;


revoke all
on function public.set_operational_inputter(text, text, uuid)
from public, anon, authenticated;


grant execute
on function public.get_operational_inputter(text, uuid)
to authenticated;


grant execute
on function public.set_operational_inputter(text, text, uuid)
to authenticated;


commit;