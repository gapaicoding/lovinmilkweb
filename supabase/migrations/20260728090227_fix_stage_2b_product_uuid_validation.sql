begin;

-- ============================================================
-- STAGE 2B HOTFIX #2
-- Fix Product UUID Validation
--
-- Masalah:
--   Internal cart writer sebelumnya memvalidasi UUID memakai
--   regex yang terlalu ketat terhadap UUID version/variant.
--
--   Beberapa product_id existing PostgreSQL valid, tetapi dapat
--   ditolak sebelum sempat dicocokkan ke public.products.
--
-- Contoh bentuk yang harus tetap diterima:
--
--   ac37da46-d438-06b6-1eaa-bff264f0bdd6
--
-- Solusi:
--   Validasi hanya canonical UUID shape:
--
--   8-4-4-4-12 hexadecimal
--
--   Keabsahan Product sebenarnya tetap ditentukan melalui
--   lookup terhadap public.products.
--
-- Migration ini TIDAK:
--   - mengubah schema tabel
--   - mengubah data
--   - mengubah RLS
--   - membuka direct table write
--   - menyentuh legacy public.sales
--
-- Hanya mengganti:
--
--   public.lm_insert_sales_transaction_items(uuid, uuid, jsonb)
-- ============================================================


-- ============================================================
-- 1. PREFLIGHT
-- ============================================================

do $$
begin
  if to_regclass(
    'public.sales_transactions'
  ) is null then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: public.sales_transactions tidak ditemukan.';
  end if;


  if to_regclass(
    'public.sales_items'
  ) is null then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: public.sales_items tidak ditemukan.';
  end if;


  if to_regclass(
    'public.products'
  ) is null then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: public.products tidak ditemukan.';
  end if;


  if to_regclass(
    'public.sales_categories'
  ) is null then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: public.sales_categories tidak ditemukan.';
  end if;


  if to_regclass(
    'public.business_subunits'
  ) is null then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: public.business_subunits tidak ditemukan.';
  end if;


  if to_regprocedure(
    'public.lm_insert_sales_transaction_items(uuid,uuid,jsonb)'
  ) is null then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: lm_insert_sales_transaction_items tidak ditemukan.';
  end if;


  if to_regprocedure(
    'public.lm_validate_sales_item_ownership()'
  ) is null then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: ownership validation function tidak ditemukan.';
  end if;


  -- sales_categories memang menggunakan is_active,
  -- bukan deleted_at.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_categories'
      and column_name = 'is_active'
  ) then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: sales_categories.is_active tidak ditemukan.';
  end if;


  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_categories'
      and column_name = 'subunit_id'
  ) then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: sales_categories.subunit_id tidak ditemukan.';
  end if;


  -- Pastikan security boundary Stage 2A/2B masih utuh.
  if has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'INSERT'
  ) then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: authenticated memiliki direct INSERT sales_transactions.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_items',
    'INSERT'
  ) then
    raise exception
      'STAGE 2B HOTFIX #2 ABORT: authenticated memiliki direct INSERT sales_items.';
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
  -- ==========================================================
  -- HEADER VALIDATION
  -- ==========================================================

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


  -- ==========================================================
  -- CART VALIDATION
  -- ==========================================================

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


  -- ==========================================================
  -- ITERATE CART
  -- ==========================================================

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

    -- ========================================================
    -- ITEM MUST BE JSON OBJECT
    -- ========================================================

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


    -- ========================================================
    -- PRODUCT ID
    -- ========================================================

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


    -- --------------------------------------------------------
    -- IMPORTANT HOTFIX #2
    --
    -- Jangan membatasi UUID version/variant.
    --
    -- Yang divalidasi di sini hanya bentuk canonical:
    --
    --   xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    --
    -- dengan karakter hexadecimal.
    --
    -- Product legitimacy tetap dibuktikan oleh SELECT terhadap
    -- public.products di bawah.
    -- --------------------------------------------------------

    if v_product_text is null
      or v_product_text !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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


    -- ========================================================
    -- QUANTITY
    -- ========================================================

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


    -- ========================================================
    -- UNIT PRICE
    -- ========================================================

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


    -- ========================================================
    -- ITEM NOTES
    -- ========================================================

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


    -- ========================================================
    -- RESET RESOLVED MASTER VALUES
    -- ========================================================

    v_product_name := null;
    v_product_sku := null;
    v_unit := null;

    v_category_id := null;
    v_category_name := null;

    v_subunit_id := null;
    v_subunit_name := null;


    -- ========================================================
    -- RESOLVE CURRENT ACTIVE MASTER
    --
    -- Product
    --   ↓
    -- Sales Category
    --   ↓
    -- Business Subunit
    --   ↓
    -- Outlet transaksi
    --
    -- Current schema:
    --
    -- products
    --   is_active
    --   deleted_at
    --
    -- sales_categories
    --   is_active
    --   NO deleted_at
    --
    -- business_subunits
    --   is_active
    --   deleted_at
    -- ========================================================

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


    -- ========================================================
    -- INSERT CANONICAL TRANSACTION ITEM
    --
    -- Category/Subunit tidak berasal dari JSON.
    -- Nilainya berasal dari master database.
    --
    -- Trigger validate_sales_item_ownership Stage 2A tetap
    -- berjalan sebagai lapisan validasi kedua.
    -- ========================================================

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


  -- ==========================================================
  -- CALCULATE CANONICAL TOTAL
  -- ==========================================================

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


comment on function public.lm_insert_sales_transaction_items(
  uuid,
  uuid,
  jsonb
)
is
  'Internal atomic cart writer. Resolve Product -> Category -> Subunit dan membuat snapshot transaction item. UUID product divalidasi berdasarkan canonical hexadecimal shape tanpa membatasi UUID version/variant.';


-- ============================================================
-- 3. REASSERT INTERNAL FUNCTION SECURITY
--
-- Function ini bukan public RPC.
-- Hanya public lifecycle RPC SECURITY DEFINER yang memakainya.
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
-- 4. REASSERT DIRECT TABLE WRITE BOUNDARY
-- ============================================================

revoke insert,
       update,
       delete,
       truncate,
       references,
       trigger
on table public.sales_transactions
from authenticated;


revoke insert,
       update,
       delete,
       truncate,
       references,
       trigger
on table public.sales_items
from authenticated;


grant select
on table public.sales_transactions
to authenticated;


grant select
on table public.sales_items
to authenticated;


-- ============================================================
-- 5. FINAL ASSERTIONS
-- ============================================================

do $$
begin
  -- Internal cart writer tetap tersedia.
  if to_regprocedure(
    'public.lm_insert_sales_transaction_items(uuid,uuid,jsonb)'
  ) is null then
    raise exception
      'STAGE 2B HOTFIX #2 VERIFY FAILED: lm_insert_sales_transaction_items missing.';
  end if;


  -- Harus tetap SECURITY DEFINER.
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname =
        'lm_insert_sales_transaction_items'
      and pg_get_function_identity_arguments(p.oid) =
        'p_transaction_id uuid, p_outlet_id uuid, p_items jsonb'
      and p.prosecdef = true
  ) then
    raise exception
      'STAGE 2B HOTFIX #2 VERIFY FAILED: cart writer bukan SECURITY DEFINER.';
  end if;


  -- Client tidak boleh memanggil helper internal.
  if has_function_privilege(
    'authenticated',
    'public.lm_insert_sales_transaction_items(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'STAGE 2B HOTFIX #2 VERIFY FAILED: authenticated dapat EXECUTE internal cart writer.';
  end if;


  if has_function_privilege(
    'anon',
    'public.lm_insert_sales_transaction_items(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'STAGE 2B HOTFIX #2 VERIFY FAILED: anon dapat EXECUTE internal cart writer.';
  end if;


  -- Direct table writes tetap terlarang.
  if has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'INSERT'
  )
    or has_table_privilege(
      'authenticated',
      'public.sales_transactions',
      'UPDATE'
    )
    or has_table_privilege(
      'authenticated',
      'public.sales_transactions',
      'DELETE'
    )
  then
    raise exception
      'STAGE 2B HOTFIX #2 VERIFY FAILED: authenticated memiliki direct write sales_transactions.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_items',
    'INSERT'
  )
    or has_table_privilege(
      'authenticated',
      'public.sales_items',
      'UPDATE'
    )
    or has_table_privilege(
      'authenticated',
      'public.sales_items',
      'DELETE'
    )
  then
    raise exception
      'STAGE 2B HOTFIX #2 VERIFY FAILED: authenticated memiliki direct write sales_items.';
  end if;


  -- Legacy sales tidak boleh tersentuh.
  if to_regclass(
    'public.sales'
  ) is null then
    raise exception
      'STAGE 2B HOTFIX #2 VERIFY FAILED: legacy public.sales hilang.';
  end if;


  raise notice
    'STAGE 2B HOTFIX #2 VERIFIED SUCCESSFULLY.';
end;
$$;


commit;