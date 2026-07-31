begin;

-- ============================================================
-- STAGE 2B HOTFIX
--
-- sales_categories tidak menggunakan deleted_at.
-- Category aktif ditentukan melalui is_active.
--
-- Migration Stage 2B sebelumnya sudah Remote, jadi kita tidak
-- mengubah history lama. Function diganti melalui migration baru.
-- ============================================================


-- ============================================================
-- 1. PREFLIGHT
-- ============================================================

do $$
begin
  if to_regclass(
    'public.sales_categories'
  ) is null then
    raise exception
      '2B HOTFIX ABORT: sales_categories tidak ditemukan.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_categories'
      and column_name = 'is_active'
  ) then
    raise exception
      '2B HOTFIX ABORT: sales_categories.is_active tidak ditemukan.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_categories'
      and column_name = 'subunit_id'
  ) then
    raise exception
      '2B HOTFIX ABORT: sales_categories.subunit_id tidak ditemukan.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_categories'
      and column_name = 'deleted_at'
  ) then
    raise notice
      'sales_categories.deleted_at ternyata tersedia; hotfix tetap aman.';
  end if;
end;
$$;


-- ============================================================
-- 2. REPLACE INTERNAL CART WRITER
-- ============================================================

create or replace function public.lm_insert_sales_transaction_items(
  p_transaction_id uuid,
  p_outlet_id uuid,
  p_items jsonb
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_item jsonb;
  v_line_no integer;

  v_product_text text;
  v_product_id uuid;

  v_quantity numeric;
  v_unit_price numeric;
  v_notes text;

  v_product_name text;
  v_product_sku text;
  v_unit text;

  v_category_id uuid;
  v_category_name text;

  v_subunit_id uuid;
  v_subunit_name text;

  v_total numeric(30, 2);
begin
  -- ----------------------------------------------------------
  -- Header checks
  -- ----------------------------------------------------------

  if p_transaction_id is null then
    raise exception
      using
        errcode = 'P0001',
        message =
          'ID transaksi penjualan wajib tersedia.';
  end if;


  if p_outlet_id is null then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Outlet transaksi wajib tersedia.';
  end if;


  if not exists (
    select 1
    from public.sales_transactions st
    where st.id = p_transaction_id
      and st.outlet_id = p_outlet_id
  ) then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Header transaksi penjualan tidak ditemukan.';
  end if;


  -- ----------------------------------------------------------
  -- Cart validation
  -- ----------------------------------------------------------

  if p_items is null then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Transaksi wajib memiliki minimal satu item.';
  end if;


  if jsonb_typeof(p_items) <> 'array' then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Format item transaksi harus berupa array JSON.';
  end if;


  if jsonb_array_length(p_items) = 0 then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Transaksi wajib memiliki minimal satu item.';
  end if;


  if jsonb_array_length(p_items) > 200 then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Satu transaksi maksimal memiliki 200 baris item.';
  end if;


  -- ----------------------------------------------------------
  -- Iterate cart
  -- ----------------------------------------------------------

  for v_item, v_line_no in
    select
      source.value,
      source.ordinality::integer
    from jsonb_array_elements(
      p_items
    ) with ordinality
      as source(
        value,
        ordinality
      )
  loop

    -- --------------------------------------------------------
    -- JSON object
    -- --------------------------------------------------------

    if jsonb_typeof(v_item) <> 'object' then
      raise exception
        using
          errcode = 'P0001',
          message =
            format(
              'Item baris %s harus berupa object JSON.',
              v_line_no
            );
    end if;


    -- --------------------------------------------------------
    -- Product
    -- --------------------------------------------------------

    if not (
      v_item ? 'product_id'
    ) then
      raise exception
        using
          errcode = 'P0001',
          message =
            format(
              'Produk pada baris %s wajib dipilih.',
              v_line_no
            );
    end if;


    if jsonb_typeof(
      v_item -> 'product_id'
    ) <> 'string' then
      raise exception
        using
          errcode = 'P0001',
          message =
            format(
              'Product ID pada baris %s tidak valid.',
              v_line_no
            );
    end if;


    v_product_text :=
      nullif(
        btrim(
          v_item ->> 'product_id'
        ),
        ''
      );


    if v_product_text is null
      or v_product_text !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      raise exception
        using
          errcode = 'P0001',
          message =
            format(
              'Product ID pada baris %s tidak valid.',
              v_line_no
            );
    end if;


    v_product_id :=
      v_product_text::uuid;


    -- --------------------------------------------------------
    -- Quantity
    -- --------------------------------------------------------

    if not (
      v_item ? 'quantity'
    )
      or jsonb_typeof(
        v_item -> 'quantity'
      ) <> 'number'
    then
      raise exception
        using
          errcode = 'P0001',
          message =
            format(
              'Jumlah pada baris %s wajib berupa angka.',
              v_line_no
            );
    end if;


    v_quantity :=
      (
        v_item ->> 'quantity'
      )::numeric;


    if v_quantity <= 0 then
      raise exception
        using
          errcode = '23514',
          message =
            format(
              'Jumlah pada baris %s harus lebih dari 0.',
              v_line_no
            );
    end if;


    if v_quantity > 999999999.99 then
      raise exception
        using
          errcode = '23514',
          message =
            format(
              'Jumlah pada baris %s terlalu besar.',
              v_line_no
            );
    end if;


    -- --------------------------------------------------------
    -- Unit price
    -- --------------------------------------------------------

    if not (
      v_item ? 'unit_price'
    )
      or jsonb_typeof(
        v_item -> 'unit_price'
      ) <> 'number'
    then
      raise exception
        using
          errcode = 'P0001',
          message =
            format(
              'Harga satuan pada baris %s wajib berupa angka.',
              v_line_no
            );
    end if;


    v_unit_price :=
      (
        v_item ->> 'unit_price'
      )::numeric;


    if v_unit_price < 0 then
      raise exception
        using
          errcode = '23514',
          message =
            format(
              'Harga satuan pada baris %s tidak boleh negatif.',
              v_line_no
            );
    end if;


    if v_unit_price > 999999999999.99 then
      raise exception
        using
          errcode = '23514',
          message =
            format(
              'Harga satuan pada baris %s terlalu besar.',
              v_line_no
            );
    end if;


    -- --------------------------------------------------------
    -- Notes
    -- --------------------------------------------------------

    if v_item ? 'notes'
      and jsonb_typeof(
        v_item -> 'notes'
      ) not in (
        'string',
        'null'
      )
    then
      raise exception
        using
          errcode = 'P0001',
          message =
            format(
              'Catatan item pada baris %s tidak valid.',
              v_line_no
            );
    end if;


    v_notes :=
      nullif(
        btrim(
          v_item ->> 'notes'
        ),
        ''
      );


    if v_notes is not null
      and char_length(v_notes) > 500
    then
      raise exception
        using
          errcode = '23514',
          message =
            format(
              'Catatan item pada baris %s maksimal 500 karakter.',
              v_line_no
            );
    end if;


    -- --------------------------------------------------------
    -- Resolve active master
    --
    -- IMPORTANT:
    --
    -- products:
    --   is_active + deleted_at
    --
    -- sales_categories:
    --   is_active
    --   TIDAK menggunakan deleted_at
    --
    -- business_subunits:
    --   is_active + deleted_at
    -- --------------------------------------------------------

    v_product_name := null;
    v_product_sku := null;
    v_unit := null;

    v_category_id := null;
    v_category_name := null;

    v_subunit_id := null;
    v_subunit_name := null;


    select
      p.name,
      p.sku,
      p.unit,

      c.id,
      c.name,

      s.id,
      s.name

    into
      v_product_name,
      v_product_sku,
      v_unit,

      v_category_id,
      v_category_name,

      v_subunit_id,
      v_subunit_name

    from public.products p

    join public.sales_categories c
      on c.id =
        p.sales_category_id

    join public.business_subunits s
      on s.id =
        c.subunit_id

    where p.id =
        v_product_id

      and p.is_active = true
      and p.deleted_at is null

      and c.is_active = true

      and s.is_active = true
      and s.deleted_at is null

      and s.outlet_id =
        p_outlet_id

    for share of
      p,
      c,
      s;


    if v_product_name is null then
      raise exception
        using
          errcode = 'P0001',
          message =
            format(
              'Produk pada baris %s tidak ditemukan, tidak aktif, diarsipkan, atau bukan milik Outlet transaksi.',
              v_line_no
            );
    end if;


    -- --------------------------------------------------------
    -- Canonical insert
    -- --------------------------------------------------------

    insert into public.sales_items (
      sales_transaction_id,
      line_no,

      product_id,
      sales_category_id,
      subunit_id,

      quantity,
      unit_price,

      product_name_snapshot,
      product_sku_snapshot,
      category_name_snapshot,
      subunit_name_snapshot,
      unit_snapshot,

      notes
    )
    values (
      p_transaction_id,
      v_line_no,

      v_product_id,
      v_category_id,
      v_subunit_id,

      v_quantity,
      v_unit_price,

      v_product_name,
      v_product_sku,
      v_category_name,
      v_subunit_name,
      v_unit,

      v_notes
    );

  end loop;


  -- ----------------------------------------------------------
  -- Canonical total
  -- ----------------------------------------------------------

  select
    coalesce(
      sum(si.amount),
      0
    )

  into v_total

  from public.sales_items si

  where si.sales_transaction_id =
    p_transaction_id;


  return
    round(
      v_total,
      2
    );
end;
$$;


-- ============================================================
-- 3. SECURITY
-- ============================================================

revoke all
on function public.lm_insert_sales_transaction_items(
  uuid,
  uuid,
  jsonb
)
from public;


revoke all
on function public.lm_insert_sales_transaction_items(
  uuid,
  uuid,
  jsonb
)
from anon;


revoke all
on function public.lm_insert_sales_transaction_items(
  uuid,
  uuid,
  jsonb
)
from authenticated;


-- ============================================================
-- 4. ASSERT
-- ============================================================

do $$
begin
  if to_regprocedure(
    'public.lm_insert_sales_transaction_items(uuid,uuid,jsonb)'
  ) is null then
    raise exception
      '2B HOTFIX VERIFY FAILED: cart writer missing.';
  end if;


  if has_function_privilege(
    'authenticated',
    'public.lm_insert_sales_transaction_items(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      '2B HOTFIX VERIFY FAILED: internal helper executable by authenticated.';
  end if;


  raise notice
    'STAGE 2B HOTFIX VERIFIED SUCCESSFULLY.';
end;
$$;


commit;