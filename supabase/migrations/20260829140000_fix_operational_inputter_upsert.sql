-- ============================================================
-- HOTFIX
-- Operational Inputter UPSERT ambiguity
--
-- Fixes ambiguous PL/pgSQL output-variable references in:
--   set_operational_inputter()
--
-- Applies to:
--   sales
--   expenses
--   suppliers
--
-- No data reset.
-- No historical snapshot rewrite.
-- ============================================================

begin;


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

  -- ----------------------------------------------------------
  -- Section validation
  -- ----------------------------------------------------------

  if p_section is null
     or p_section not in (
       'sales',
       'expenses',
       'suppliers'
     )
  then
    raise exception
      'Bagian penginput tidak valid.'
      using errcode = '22023';
  end if;


  -- ----------------------------------------------------------
  -- Authorization
  --
  -- Supplier management currently belongs to Admin/Super Admin.
  -- Sales/Expenses retain Staff/Admin/Super Admin behavior.
  -- ----------------------------------------------------------

  if p_section = 'suppliers' then

    v_actor :=
      public.require_visitor_role(
        array[
          'admin',
          'super_admin'
        ]
      );

  else

    v_actor :=
      public.require_visitor_role(
        array[
          'staff',
          'admin',
          'super_admin'
        ]
      );

  end if;


  -- ----------------------------------------------------------
  -- Normalize + validate name
  -- ----------------------------------------------------------

  v_name :=
    btrim(
      p_inputter_name
    );


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


  -- ----------------------------------------------------------
  -- Resolve canonical active Outlet
  -- ----------------------------------------------------------

  v_outlet :=
    public.lm_resolve_sales_outlet(
      p_outlet_id
    );


  -- ----------------------------------------------------------
  -- UPSERT
  --
  -- IMPORTANT:
  -- Use ON CONFLICT ON CONSTRAINT instead of:
  --
  --   ON CONFLICT (outlet_id, section)
  --
  -- because outlet_id / section are also RETURNS TABLE
  -- output variables inside this PL/pgSQL function.
  -- ----------------------------------------------------------

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

  on conflict on constraint
    operational_inputter_settings_outlet_section_key

  do update
  set
    inputter_name = excluded.inputter_name,
    updated_at = clock_timestamp(),
    updated_by = v_actor;


  -- ----------------------------------------------------------
  -- Return canonical stored setting
  -- ----------------------------------------------------------

  return query
  select
    v_outlet,
    p_section,
    v_name;

end;
$$;


-- ============================================================
-- FUNCTION SECURITY
-- ============================================================

revoke all
on function public.set_operational_inputter(
  text,
  text,
  uuid
)
from public, anon, authenticated;


grant execute
on function public.set_operational_inputter(
  text,
  text,
  uuid
)
to authenticated;


commit;