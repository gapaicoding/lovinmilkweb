-- Staff operational access to Supplier Master V2.
--
-- Scope:
-- - Staff may view active Suppliers and active Supplier Items.
-- - Staff may set/change the active Supplier inputter.
-- - Staff may create/edit active Suppliers and their catalog through the
--   authoritative save_supplier_with_items RPC.
-- - Staff may export the Supplier workbook.
--
-- Explicitly NOT granted:
-- - archived/inactive Supplier browsing
-- - Supplier archive/restore
-- - Supplier hard delete
-- - Purchase/invoice financial visibility
-- - general financial-data access
--
-- This migration intentionally does not modify historical migrations.

begin;

-- ============================================================
-- 1. STAFF READ ACCESS — ACTIVE SUPPLIER CATALOG ONLY
-- ============================================================

drop policy if exists suppliers_select_staff_active
  on public.suppliers;

create policy suppliers_select_staff_active
on public.suppliers
for select
to authenticated
using (
  public.lm_is_active_staff_or_above()
  and deleted_at is null
  and is_active = true
);


drop policy if exists supplier_items_select_staff_active
  on public.supplier_items;

create policy supplier_items_select_staff_active
on public.supplier_items
for select
to authenticated
using (
  public.lm_is_active_staff_or_above()
  and deleted_at is null
  and is_active = true
  and exists (
    select 1
    from public.suppliers s
    where s.id = supplier_items.supplier_id
      and s.deleted_at is null
      and s.is_active = true
  )
);


-- ============================================================
-- 2. ACTIVE INPUTTER — ALLOW STAFF FOR SUPPLIERS
--
-- Keep the runtime ambiguity hotfix by targeting the named
-- outlet/section uniqueness constraint explicitly.
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

  v_actor :=
    public.require_visitor_role(
      array[
        'staff',
        'admin',
        'super_admin'
      ]
    );

  v_name := btrim(p_inputter_name);

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
  on conflict on constraint
    operational_inputter_settings_outlet_section_key
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


-- ============================================================
-- 3. AUTHORITATIVE SUPPLIER SAVE RPC
--
-- Staff:
-- - create active Supplier
-- - edit active Supplier
-- - add/edit/remove catalog items
-- - cannot change Supplier lifecycle status
--
-- Admin/Super Admin keep the previous lifecycle behavior.
-- ============================================================

create or replace function public.save_supplier_with_items(
  p_supplier jsonb,
  p_items jsonb,
  p_supplier_id uuid default null,
  p_outlet_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid;
  v_outlet uuid;
  v_inputter text;
  v_id uuid;
  v_name text;
  v_item jsonb;
  v_item_id uuid;
  v_seen uuid[] := array[]::uuid[];
  v_is_admin boolean;
begin
  v_actor :=
    public.require_visitor_role(
      array[
        'staff',
        'admin',
        'super_admin'
      ]
    );

  v_is_admin :=
    coalesce(
      public.lm_is_active_admin(),
      false
    );

  v_outlet :=
    public.lm_resolve_sales_outlet(
      p_outlet_id
    );

  v_name :=
    btrim(
      p_supplier->>'supplier_name'
    );

  if coalesce(v_name, '') = '' then
    raise exception
      'Nama Toko / Supplier wajib diisi.'
      using errcode = '22023';
  end if;

  if char_length(v_name) > 300 then
    raise exception
      'Nama Toko / Supplier maksimal 300 karakter.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(
       coalesce(
         p_items,
         '[]'::jsonb
       )
     ) <> 'array'
     or jsonb_array_length(
       coalesce(
         p_items,
         '[]'::jsonb
       )
     ) = 0
  then
    raise exception
      'Minimal satu Barang Supplier wajib diisi.'
      using errcode = '22023';
  end if;

  if p_supplier_id is null then
    v_inputter :=
      public.lm_get_active_operational_inputter(
        v_outlet,
        'suppliers'
      );

    v_id := gen_random_uuid();

    insert into public.suppliers (
      id,
      outlet_id,
      supplier_key,
      supplier_name,
      normalized_name,
      phone,
      address,
      link,
      contact_person,
      source_type,
      source_references,
      is_active,
      inputter_name,
      created_by,
      updated_by
    )
    values (
      v_id,
      v_outlet,
      'SUP-MANUAL-' || replace(v_id::text, '-', ''),
      v_name,
      lower(
        regexp_replace(
          v_name,
          '\s+',
          ' ',
          'g'
        )
      ),
      nullif(
        btrim(
          p_supplier->>'phone'
        ),
        ''
      ),
      nullif(
        btrim(
          p_supplier->>'address'
        ),
        ''
      ),
      nullif(
        btrim(
          p_supplier->>'link'
        ),
        ''
      ),
      nullif(
        btrim(
          p_supplier->>'contact_person'
        ),
        ''
      ),
      nullif(
        btrim(
          p_supplier->>'source_type'
        ),
        ''
      ),
      nullif(
        btrim(
          p_supplier->>'source_references'
        ),
        ''
      ),
      case
        when v_is_admin
          then coalesce(
            (p_supplier->>'is_active')::boolean,
            true
          )
        else true
      end,
      v_inputter,
      v_actor,
      v_actor
    );

  else
    v_id := p_supplier_id;

    update public.suppliers s
    set
      supplier_name = v_name,
      normalized_name =
        lower(
          regexp_replace(
            v_name,
            '\s+',
            ' ',
            'g'
          )
        ),
      phone =
        nullif(
          btrim(
            p_supplier->>'phone'
          ),
          ''
        ),
      address =
        nullif(
          btrim(
            p_supplier->>'address'
          ),
          ''
        ),
      link =
        nullif(
          btrim(
            p_supplier->>'link'
          ),
          ''
        ),
      contact_person =
        nullif(
          btrim(
            p_supplier->>'contact_person'
          ),
          ''
        ),
      source_type =
        nullif(
          btrim(
            p_supplier->>'source_type'
          ),
          ''
        ),
      source_references =
        nullif(
          btrim(
            p_supplier->>'source_references'
          ),
          ''
        ),
      is_active =
        case
          when v_is_admin
            then coalesce(
              (p_supplier->>'is_active')::boolean,
              s.is_active
            )
          else s.is_active
        end,
      updated_at = clock_timestamp(),
      updated_by = v_actor
    where s.id = v_id
      and s.outlet_id = v_outlet
      and s.deleted_at is null
      and (
        v_is_admin
        or s.is_active = true
      );

    if not found then
      raise exception
        'Supplier tidak ditemukan.'
        using errcode = 'P0002';
    end if;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(
        p_items,
        '[]'::jsonb
      )
    )
  loop
    if coalesce(
         btrim(
           v_item->>'product_name'
         ),
         ''
       ) = ''
    then
      raise exception
        'Nama Produk wajib diisi.'
        using errcode = '22023';
    end if;

    if char_length(
         btrim(
           v_item->>'product_name'
         )
       ) > 300
    then
      raise exception
        'Nama Produk maksimal 300 karakter.'
        using errcode = '22023';
    end if;

    if char_length(
         coalesce(
           btrim(
             v_item->>'unit_price_text'
           ),
           ''
         )
       ) > 500
    then
      raise exception
        'Harga Satuan maksimal 500 karakter.'
        using errcode = '22023';
    end if;

    v_item_id :=
      case
        when coalesce(
               v_item->>'id',
               ''
             ) ~
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (v_item->>'id')::uuid
        else gen_random_uuid()
      end;

    if exists (
      select 1
      from public.supplier_items si
      where si.id = v_item_id
        and si.supplier_id = v_id
        and si.deleted_at is not null
    ) then
      v_item_id := gen_random_uuid();
    end if;

    v_seen :=
      array_append(
        v_seen,
        v_item_id
      );

    if exists (
      select 1
      from public.supplier_items si
      where si.id = v_item_id
        and si.supplier_id = v_id
        and si.deleted_at is null
    ) then
      update public.supplier_items si
      set
        item_name_raw =
          btrim(
            v_item->>'product_name'
          ),
        item_name_normalized =
          lower(
            regexp_replace(
              btrim(
                v_item->>'product_name'
              ),
              '\s+',
              ' ',
              'g'
            )
          ),
        brand_raw =
          nullif(
            btrim(
              v_item->>'brand_name'
            ),
            ''
          ),
        size_raw =
          nullif(
            btrim(
              v_item->>'product_size'
            ),
            ''
          ),
        price_raw =
          nullif(
            btrim(
              v_item->>'unit_price_text'
            ),
            ''
          ),
        updated_at = clock_timestamp(),
        updated_by = v_actor
      where si.id = v_item_id
        and si.supplier_id = v_id
        and si.deleted_at is null;

    else
      v_inputter :=
        public.lm_get_active_operational_inputter(
          v_outlet,
          'suppliers'
        );

      insert into public.supplier_items (
        id,
        supplier_id,
        outlet_id,
        supplier_item_key,
        item_name_raw,
        item_name_normalized,
        brand_raw,
        size_raw,
        price_raw,
        inputter_name,
        created_by,
        updated_by
      )
      values (
        v_item_id,
        v_id,
        v_outlet,
        'SUP-ITEM-' || replace(v_item_id::text, '-', ''),
        btrim(
          v_item->>'product_name'
        ),
        lower(
          regexp_replace(
            btrim(
              v_item->>'product_name'
            ),
            '\s+',
            ' ',
            'g'
          )
        ),
        nullif(
          btrim(
            v_item->>'brand_name'
          ),
          ''
        ),
        nullif(
          btrim(
            v_item->>'product_size'
          ),
          ''
        ),
        nullif(
          btrim(
            v_item->>'unit_price_text'
          ),
          ''
        ),
        v_inputter,
        v_actor,
        v_actor
      );
    end if;
  end loop;

  update public.supplier_items si
  set
    deleted_at = clock_timestamp(),
    deleted_by = v_actor,
    is_active = false,
    updated_at = clock_timestamp(),
    updated_by = v_actor
  where si.supplier_id = v_id
    and si.deleted_at is null
    and not (
      si.id = any(v_seen)
    );

  return v_id;
end;
$$;


revoke all
on function public.save_supplier_with_items(
  jsonb,
  jsonb,
  uuid,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.save_supplier_with_items(
  jsonb,
  jsonb,
  uuid,
  uuid
)
to authenticated;


-- ============================================================
-- 4. SUPPLIER EXPORT AUDIT — ALLOW STAFF
--
-- Supplier export remains limited by Supplier/Supplier Item RLS.
-- Financial/Purchase/Asset/Depreciation exports remain Admin-only.
-- ============================================================

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
as $$
declare
  v_allowed_reports constant text[] :=
    array[
      'financial',
      'sales',
      'visitors',
      'expenses',
      'purchases',
      'products',
      'suppliers',
      'assets',
      'depreciation'
    ];
begin
  if not public.lm_is_active_staff_or_above() then
    raise exception
      'Active Staff, Admin, or Super Admin access is required.'
      using errcode = '42501';
  end if;

  if p_report_type is null
     or not (
       p_report_type = any(v_allowed_reports)
     )
  then
    raise exception
      'Unknown report type.'
      using errcode = '22023';
  end if;

  if p_start_date is null
     or p_end_date is null
     or p_start_date > p_end_date
  then
    raise exception
      'Invalid export date range.'
      using errcode = '22023';
  end if;

  if p_report_type in (
       'financial',
       'purchases',
       'assets',
       'depreciation'
     )
     and not public.lm_is_active_admin()
  then
    raise exception
      'Admin or Super Admin access is required for this export.'
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
      'report_type',
      p_report_type,
      'start_date',
      p_start_date,
      'end_date',
      p_end_date,
      'filters',
      coalesce(
        p_filters,
        '{}'::jsonb
      ),
      'timezone',
      'Asia/Jakarta'
    ),
    'User initiated Excel export',
    auth.uid(),
    clock_timestamp()
  );
end;
$$;


revoke all
on function public.record_report_export(
  text,
  date,
  date,
  jsonb
)
from public, anon;

grant execute
on function public.record_report_export(
  text,
  date,
  date,
  jsonb
)
to authenticated, service_role;


comment on function public.record_report_export(
  text,
  date,
  date,
  jsonb
) is
  'Records metadata-only audit events for authorized Excel report exports; Supplier export is available to active Staff and above while financial exports remain Admin-only.';


commit;
