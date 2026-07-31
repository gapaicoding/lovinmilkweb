begin;

-- ============================================================
-- STAGE 2B
-- Atomic Multi-item Sales Transaction RPC Engine
--
-- Public RPC:
--   create_sales_transaction
--   update_sales_transaction
--   soft_delete_sales_transaction
--   restore_sales_transaction
--   hard_delete_sales_transaction
--
-- Internal:
--   lm_generate_sales_transaction_number
--   lm_resolve_sales_outlet
--   lm_insert_sales_transaction_items
--
-- Prinsip:
--   - authenticated TIDAK memperoleh direct table write;
--   - write hanya lewat SECURITY DEFINER RPC;
--   - Product -> Category -> Subunit di-resolve database;
--   - subtotal sales_items dihitung generated column;
--   - total header dihitung database;
--   - create/update atomic.
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
      'STAGE 2B ABORT: public.sales_transactions tidak ditemukan.';
  end if;

  if to_regclass(
    'public.sales_items'
  ) is null then
    raise exception
      'STAGE 2B ABORT: public.sales_items tidak ditemukan.';
  end if;

  if to_regclass(
    'public.products'
  ) is null then
    raise exception
      'STAGE 2B ABORT: public.products tidak ditemukan.';
  end if;

  if to_regclass(
    'public.sales_categories'
  ) is null then
    raise exception
      'STAGE 2B ABORT: public.sales_categories tidak ditemukan.';
  end if;

  if to_regclass(
    'public.business_subunits'
  ) is null then
    raise exception
      'STAGE 2B ABORT: public.business_subunits tidak ditemukan.';
  end if;

  if to_regclass(
    'public.outlets'
  ) is null then
    raise exception
      'STAGE 2B ABORT: public.outlets tidak ditemukan.';
  end if;

  if to_regprocedure(
    'public.lm_is_active_admin()'
  ) is null then
    raise exception
      'STAGE 2B ABORT: lm_is_active_admin() tidak ditemukan.';
  end if;

  if to_regprocedure(
    'public.lm_is_active_super_admin()'
  ) is null then
    raise exception
      'STAGE 2B ABORT: lm_is_active_super_admin() tidak ditemukan.';
  end if;

  if to_regprocedure(
    'public.lm_validate_sales_item_ownership()'
  ) is null then
    raise exception
      'STAGE 2B ABORT: ownership trigger function Stage 2A tidak ditemukan.';
  end if;

  -- Stage 2A harus masih read-only untuk client.
  if has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'INSERT'
  ) then
    raise exception
      'STAGE 2B ABORT: authenticated masih memiliki INSERT langsung ke sales_transactions.';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.sales_items',
    'INSERT'
  ) then
    raise exception
      'STAGE 2B ABORT: authenticated masih memiliki INSERT langsung ke sales_items.';
  end if;
end;
$$;


-- ============================================================
-- 2. TRANSACTION NUMBER SEQUENCE
--
-- Nomor dibuat immutable dan tidak bergantung pada tanggal.
--
-- Contoh:
--   TRX-0000000001
--   TRX-0000000002
--
-- Sequence concurrency-safe.
-- Gap akibat rollback diperbolehkan.
-- ============================================================

create sequence public.sales_transaction_number_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;


revoke all
on sequence public.sales_transaction_number_seq
from public;

revoke all
on sequence public.sales_transaction_number_seq
from anon;

revoke all
on sequence public.sales_transaction_number_seq
from authenticated;


-- ============================================================
-- 3. INTERNAL: GENERATE TRANSACTION NUMBER
-- ============================================================

create or replace function public.lm_generate_sales_transaction_number()
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_number bigint;
begin
  v_number :=
    nextval(
      'public.sales_transaction_number_seq'::regclass
    );

  return
    'TRX-' ||
    lpad(
      v_number::text,
      10,
      '0'
    );
end;
$$;


comment on function
  public.lm_generate_sales_transaction_number()
is
  'Internal helper untuk menghasilkan nomor transaksi penjualan unik dan concurrency-safe.';


revoke all
on function
  public.lm_generate_sales_transaction_number()
from public;

revoke all
on function
  public.lm_generate_sales_transaction_number()
from anon;

revoke all
on function
  public.lm_generate_sales_transaction_number()
from authenticated;


-- ============================================================
-- 4. INTERNAL: RESOLVE ACTIVE OUTLET
--
-- Jika p_outlet_id NULL:
--   gunakan Outlet aktif yang is_default = true.
--
-- Jika diberikan:
--   pastikan Outlet aktif dan belum diarsipkan.
-- ============================================================

create or replace function public.lm_resolve_sales_outlet(
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
  if p_outlet_id is null then
    select o.id
    into v_outlet_id
    from public.outlets o
    where o.is_default = true
      and o.is_active = true
      and o.deleted_at is null
    order by
      o.created_at asc,
      o.id asc
    limit 1;

    if v_outlet_id is null then
      raise exception
        using
          errcode = 'P0001',
          message =
            'Outlet default aktif tidak ditemukan.';
    end if;

    return v_outlet_id;
  end if;


  select o.id
  into v_outlet_id
  from public.outlets o
  where o.id = p_outlet_id
    and o.is_active = true
    and o.deleted_at is null;


  if v_outlet_id is null then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Outlet tidak ditemukan atau sudah tidak aktif.';
  end if;


  return v_outlet_id;
end;
$$;


comment on function
  public.lm_resolve_sales_outlet(uuid)
is
  'Internal helper untuk memilih Outlet aktif transaksi penjualan.';


revoke all
on function
  public.lm_resolve_sales_outlet(uuid)
from public;

revoke all
on function
  public.lm_resolve_sales_outlet(uuid)
from anon;

revoke all
on function
  public.lm_resolve_sales_outlet(uuid)
from authenticated;


-- ============================================================
-- 5. INTERNAL: VALIDATE + INSERT CART ITEMS
--
-- Expected JSON:
--
-- [
--   {
--     "product_id": "<uuid>",
--     "quantity": 2,
--     "unit_price": 17000,
--     "notes": null
--   },
--   {
--     "product_id": "<uuid>",
--     "quantity": 1,
--     "unit_price": 15000,
--     "notes": "Opsional"
--   }
-- ]
--
-- Server resolve:
--
-- Product
--   ↓
-- Category
--   ↓
-- Subunit
--   ↓
-- Outlet
--
-- Frontend TIDAK mengirim:
--   sales_category_id
--   subunit_id
--   amount
--   snapshot names
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
  -- Header basic checks
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
    -- Object
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
    -- Product UUID
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


    if v_quantity >
      999999999.99
    then
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


    if v_unit_price >
      999999999999.99
    then
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
    -- Item notes
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
      and char_length(v_notes) >
        500
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
    -- Resolve current active master
    --
    -- Product
    --   ↓
    -- Category
    --   ↓
    -- Subunit
    --
    -- Juga memastikan Subunit berada di Outlet transaksi.
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
      and c.deleted_at is null

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
    -- Insert canonical transaction item.
    --
    -- Ownership trigger Stage 2A tetap berjalan sebagai
    -- second layer protection.
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


comment on function
  public.lm_insert_sales_transaction_items(
    uuid,
    uuid,
    jsonb
  )
is
  'Internal atomic cart writer. Resolve Product -> Category -> Subunit dan membuat snapshot item transaksi.';


revoke all
on function
  public.lm_insert_sales_transaction_items(
    uuid,
    uuid,
    jsonb
  )
from public;

revoke all
on function
  public.lm_insert_sales_transaction_items(
    uuid,
    uuid,
    jsonb
  )
from anon;

revoke all
on function
  public.lm_insert_sales_transaction_items(
    uuid,
    uuid,
    jsonb
  )
from authenticated;


-- ============================================================
-- 6. PUBLIC RPC: CREATE SALES TRANSACTION
-- ============================================================

create or replace function public.create_sales_transaction(
  p_transaction_date date,
  p_items jsonb,
  p_notes text default null,
  p_entry_source text default 'manual',
  p_outlet_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_id uuid;
  v_outlet_id uuid;

  v_transaction_id uuid;
  v_transaction_number text;

  v_notes text;
  v_entry_source text;

  v_total numeric(30, 2);
begin
  -- ----------------------------------------------------------
  -- Authorization
  -- ----------------------------------------------------------

  v_actor_id :=
    auth.uid();


  if v_actor_id is null then
    raise exception
      using
        errcode = '42501',
        message =
          'Sesi pengguna tidak ditemukan.';
  end if;


  if not public.lm_is_active_admin() then
    raise exception
      using
        errcode = '42501',
        message =
          'Anda tidak memiliki izin membuat transaksi penjualan.';
  end if;


  -- ----------------------------------------------------------
  -- Header validation
  -- ----------------------------------------------------------

  if p_transaction_date is null then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Tanggal transaksi wajib diisi.';
  end if;


  v_notes :=
    nullif(
      btrim(p_notes),
      ''
    );


  if v_notes is not null
    and char_length(v_notes) >
      500
  then
    raise exception
      using
        errcode = '23514',
        message =
          'Catatan transaksi maksimal 500 karakter.';
  end if;


  v_entry_source :=
    lower(
      btrim(
        coalesce(
          p_entry_source,
          'manual'
        )
      )
    );


  if v_entry_source not in (
    'manual',
    'visitor'
  ) then
    raise exception
      using
        errcode = '23514',
        message =
          'Entry source transaksi tidak valid.';
  end if;


  v_outlet_id :=
    public.lm_resolve_sales_outlet(
      p_outlet_id
    );


  -- ----------------------------------------------------------
  -- Generate immutable transaction identity
  -- ----------------------------------------------------------

  v_transaction_id :=
    gen_random_uuid();


  v_transaction_number :=
    public.lm_generate_sales_transaction_number();


  -- ----------------------------------------------------------
  -- Insert header first.
  --
  -- Jika cart selanjutnya gagal, seluruh function rollback.
  -- ----------------------------------------------------------

  insert into public.sales_transactions (
    id,
    outlet_id,

    transaction_number,
    transaction_date,

    total_amount,
    notes,
    entry_source,

    created_by,
    updated_by
  )
  values (
    v_transaction_id,
    v_outlet_id,

    v_transaction_number,
    p_transaction_date,

    0,
    v_notes,
    v_entry_source,

    v_actor_id,
    v_actor_id
  );


  -- ----------------------------------------------------------
  -- Resolve + insert cart
  -- ----------------------------------------------------------

  v_total :=
    public.lm_insert_sales_transaction_items(
      v_transaction_id,
      v_outlet_id,
      p_items
    );


  -- ----------------------------------------------------------
  -- Canonical header total
  -- ----------------------------------------------------------

  update public.sales_transactions
  set
    total_amount = v_total,
    updated_by = v_actor_id
  where id =
    v_transaction_id;


  return
    v_transaction_id;
end;
$$;


comment on function
  public.create_sales_transaction(
    date,
    jsonb,
    text,
    text,
    uuid
  )
is
  'Membuat transaksi penjualan multi-item secara atomic. Admin atau Super Admin.';


revoke all
on function
  public.create_sales_transaction(
    date,
    jsonb,
    text,
    text,
    uuid
  )
from public;

revoke all
on function
  public.create_sales_transaction(
    date,
    jsonb,
    text,
    text,
    uuid
  )
from anon;

revoke all
on function
  public.create_sales_transaction(
    date,
    jsonb,
    text,
    text,
    uuid
  )
from authenticated;


grant execute
on function
  public.create_sales_transaction(
    date,
    jsonb,
    text,
    text,
    uuid
  )
to authenticated;


-- ============================================================
-- 7. PUBLIC RPC: UPDATE SALES TRANSACTION
--
-- Stage 2 strategy:
--
--   lock header
--   ↓
--   update header
--   ↓
--   delete current cart
--   ↓
--   rebuild cart atomically
--   ↓
--   recalculate total
--
-- Seluruh operasi berada dalam transaction function.
-- Error apa pun = rollback semuanya.
--
-- Transaction number tidak berubah.
-- Outlet tidak berubah.
-- ============================================================

create or replace function public.update_sales_transaction(
  p_transaction_id uuid,
  p_transaction_date date,
  p_items jsonb,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_id uuid;
  v_outlet_id uuid;

  v_notes text;

  v_total numeric(30, 2);
begin
  -- ----------------------------------------------------------
  -- Authorization
  -- ----------------------------------------------------------

  v_actor_id :=
    auth.uid();


  if v_actor_id is null then
    raise exception
      using
        errcode = '42501',
        message =
          'Sesi pengguna tidak ditemukan.';
  end if;


  if not public.lm_is_active_admin() then
    raise exception
      using
        errcode = '42501',
        message =
          'Anda tidak memiliki izin mengubah transaksi penjualan.';
  end if;


  -- ----------------------------------------------------------
  -- Input
  -- ----------------------------------------------------------

  if p_transaction_id is null then
    raise exception
      using
        errcode = 'P0001',
        message =
          'ID transaksi wajib tersedia.';
  end if;


  if p_transaction_date is null then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Tanggal transaksi wajib diisi.';
  end if;


  v_notes :=
    nullif(
      btrim(p_notes),
      ''
    );


  if v_notes is not null
    and char_length(v_notes) >
      500
  then
    raise exception
      using
        errcode = '23514',
        message =
          'Catatan transaksi maksimal 500 karakter.';
  end if;


  -- ----------------------------------------------------------
  -- Lock active transaction header.
  -- ----------------------------------------------------------

  select st.outlet_id
  into v_outlet_id
  from public.sales_transactions st
  where st.id =
      p_transaction_id
    and st.deleted_at is null
  for update;


  if v_outlet_id is null then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Transaksi penjualan tidak ditemukan atau sudah dihapus.';
  end if;


  -- Outlet transaksi existing harus tetap valid.
  if not exists (
    select 1
    from public.outlets o
    where o.id = v_outlet_id
      and o.is_active = true
      and o.deleted_at is null
  ) then
    raise exception
      using
        errcode = 'P0001',
        message =
          'Outlet transaksi sudah tidak aktif.';
  end if;


  -- ----------------------------------------------------------
  -- Update header metadata.
  -- ----------------------------------------------------------

  update public.sales_transactions
  set
    transaction_date =
      p_transaction_date,

    notes =
      v_notes,

    total_amount =
      0,

    updated_by =
      v_actor_id

  where id =
    p_transaction_id;


  -- ----------------------------------------------------------
  -- Replace cart.
  --
  -- Jika rebuild gagal, DELETE ini ikut rollback.
  -- ----------------------------------------------------------

  delete from public.sales_items
  where sales_transaction_id =
    p_transaction_id;


  v_total :=
    public.lm_insert_sales_transaction_items(
      p_transaction_id,
      v_outlet_id,
      p_items
    );


  update public.sales_transactions
  set
    total_amount =
      v_total,

    updated_by =
      v_actor_id

  where id =
    p_transaction_id;


  return true;
end;
$$;


comment on function
  public.update_sales_transaction(
    uuid,
    date,
    jsonb,
    text
  )
is
  'Mengganti header dan cart transaksi penjualan secara atomic. Transaction number dan Outlet tetap.';


revoke all
on function
  public.update_sales_transaction(
    uuid,
    date,
    jsonb,
    text
  )
from public;

revoke all
on function
  public.update_sales_transaction(
    uuid,
    date,
    jsonb,
    text
  )
from anon;

revoke all
on function
  public.update_sales_transaction(
    uuid,
    date,
    jsonb,
    text
  )
from authenticated;


grant execute
on function
  public.update_sales_transaction(
    uuid,
    date,
    jsonb,
    text
  )
to authenticated;


-- ============================================================
-- 8. PUBLIC RPC: SOFT DELETE
--
-- Admin+
--
-- Hanya header diberi deleted_at.
-- sales_items tetap ada sebagai child transaction.
-- RLS Stage 2A membuat items ikut tidak terlihat
-- untuk user non-Super-Admin.
-- ============================================================

create or replace function public.soft_delete_sales_transaction(
  p_transaction_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id :=
    auth.uid();


  if v_actor_id is null then
    raise exception
      using
        errcode = '42501',
        message =
          'Sesi pengguna tidak ditemukan.';
  end if;


  if not public.lm_is_active_admin() then
    raise exception
      using
        errcode = '42501',
        message =
          'Anda tidak memiliki izin menghapus transaksi penjualan.';
  end if;


  update public.sales_transactions
  set
    deleted_at =
      clock_timestamp(),

    deleted_by =
      v_actor_id,

    updated_by =
      v_actor_id

  where id =
      p_transaction_id
    and deleted_at is null;


  if not found then
    return false;
  end if;


  return true;
end;
$$;


comment on function
  public.soft_delete_sales_transaction(uuid)
is
  'Soft delete transaksi penjualan. Admin atau Super Admin.';


revoke all
on function
  public.soft_delete_sales_transaction(uuid)
from public;

revoke all
on function
  public.soft_delete_sales_transaction(uuid)
from anon;

revoke all
on function
  public.soft_delete_sales_transaction(uuid)
from authenticated;


grant execute
on function
  public.soft_delete_sales_transaction(uuid)
to authenticated;


-- ============================================================
-- 9. PUBLIC RPC: RESTORE
--
-- Super Admin only.
-- ============================================================

create or replace function public.restore_sales_transaction(
  p_transaction_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id :=
    auth.uid();


  if v_actor_id is null then
    raise exception
      using
        errcode = '42501',
        message =
          'Sesi pengguna tidak ditemukan.';
  end if;


  if not public.lm_is_active_super_admin() then
    raise exception
      using
        errcode = '42501',
        message =
          'Hanya Super Admin yang dapat memulihkan transaksi penjualan.';
  end if;


  update public.sales_transactions
  set
    deleted_at = null,
    deleted_by = null,

    updated_by =
      v_actor_id

  where id =
      p_transaction_id
    and deleted_at is not null;


  if not found then
    return false;
  end if;


  return true;
end;
$$;


comment on function
  public.restore_sales_transaction(uuid)
is
  'Memulihkan transaksi penjualan yang dihapus. Super Admin only.';


revoke all
on function
  public.restore_sales_transaction(uuid)
from public;

revoke all
on function
  public.restore_sales_transaction(uuid)
from anon;

revoke all
on function
  public.restore_sales_transaction(uuid)
from authenticated;


grant execute
on function
  public.restore_sales_transaction(uuid)
to authenticated;


-- ============================================================
-- 10. PUBLIC RPC: HARD DELETE
--
-- Super Admin only.
--
-- Hanya transaksi yang SUDAH soft deleted
-- yang boleh dihapus permanen.
--
-- ON DELETE CASCADE akan menghapus sales_items.
-- ============================================================

create or replace function public.hard_delete_sales_transaction(
  p_transaction_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id :=
    auth.uid();


  if v_actor_id is null then
    raise exception
      using
        errcode = '42501',
        message =
          'Sesi pengguna tidak ditemukan.';
  end if;


  if not public.lm_is_active_super_admin() then
    raise exception
      using
        errcode = '42501',
        message =
          'Hanya Super Admin yang dapat menghapus permanen transaksi penjualan.';
  end if;


  delete from public.sales_transactions
  where id =
      p_transaction_id
    and deleted_at is not null;


  if not found then
    return false;
  end if;


  return true;
end;
$$;


comment on function
  public.hard_delete_sales_transaction(uuid)
is
  'Menghapus permanen transaksi yang sudah soft deleted. Super Admin only.';


revoke all
on function
  public.hard_delete_sales_transaction(uuid)
from public;

revoke all
on function
  public.hard_delete_sales_transaction(uuid)
from anon;

revoke all
on function
  public.hard_delete_sales_transaction(uuid)
from authenticated;


grant execute
on function
  public.hard_delete_sales_transaction(uuid)
to authenticated;


-- ============================================================
-- 11. REASSERT TABLE PRIVILEGES
--
-- RPC tidak boleh secara tidak sengaja membuka direct write.
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
-- 12. FINAL ASSERTIONS
-- ============================================================

do $$
begin
  -- ----------------------------------------------------------
  -- Required RPC functions
  -- ----------------------------------------------------------

  if to_regprocedure(
    'public.create_sales_transaction(date,jsonb,text,text,uuid)'
  ) is null then
    raise exception
      'STAGE 2B VERIFY FAILED: create_sales_transaction missing.';
  end if;


  if to_regprocedure(
    'public.update_sales_transaction(uuid,date,jsonb,text)'
  ) is null then
    raise exception
      'STAGE 2B VERIFY FAILED: update_sales_transaction missing.';
  end if;


  if to_regprocedure(
    'public.soft_delete_sales_transaction(uuid)'
  ) is null then
    raise exception
      'STAGE 2B VERIFY FAILED: soft_delete_sales_transaction missing.';
  end if;


  if to_regprocedure(
    'public.restore_sales_transaction(uuid)'
  ) is null then
    raise exception
      'STAGE 2B VERIFY FAILED: restore_sales_transaction missing.';
  end if;


  if to_regprocedure(
    'public.hard_delete_sales_transaction(uuid)'
  ) is null then
    raise exception
      'STAGE 2B VERIFY FAILED: hard_delete_sales_transaction missing.';
  end if;


  -- ----------------------------------------------------------
  -- Direct table write still forbidden
  -- ----------------------------------------------------------

  if has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'INSERT'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated memiliki direct INSERT sales_transactions.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'UPDATE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated memiliki direct UPDATE sales_transactions.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_transactions',
    'DELETE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated memiliki direct DELETE sales_transactions.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_items',
    'INSERT'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated memiliki direct INSERT sales_items.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_items',
    'UPDATE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated memiliki direct UPDATE sales_items.';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.sales_items',
    'DELETE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated memiliki direct DELETE sales_items.';
  end if;


  -- ----------------------------------------------------------
  -- Public RPC execute
  -- ----------------------------------------------------------

  if not has_function_privilege(
    'authenticated',
    'public.create_sales_transaction(date,jsonb,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated tidak dapat EXECUTE create_sales_transaction.';
  end if;


  if not has_function_privilege(
    'authenticated',
    'public.update_sales_transaction(uuid,date,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated tidak dapat EXECUTE update_sales_transaction.';
  end if;


  if not has_function_privilege(
    'authenticated',
    'public.soft_delete_sales_transaction(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated tidak dapat EXECUTE soft_delete_sales_transaction.';
  end if;


  if not has_function_privilege(
    'authenticated',
    'public.restore_sales_transaction(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated tidak dapat EXECUTE restore_sales_transaction.';
  end if;


  if not has_function_privilege(
    'authenticated',
    'public.hard_delete_sales_transaction(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated tidak dapat EXECUTE hard_delete_sales_transaction.';
  end if;


  -- ----------------------------------------------------------
  -- Internal helper must NOT be client-executable
  -- ----------------------------------------------------------

  if has_function_privilege(
    'authenticated',
    'public.lm_generate_sales_transaction_number()',
    'EXECUTE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated dapat mengeksekusi internal transaction number helper.';
  end if;


  if has_function_privilege(
    'authenticated',
    'public.lm_resolve_sales_outlet(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated dapat mengeksekusi internal outlet helper.';
  end if;


  if has_function_privilege(
    'authenticated',
    'public.lm_insert_sales_transaction_items(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'STAGE 2B VERIFY FAILED: authenticated dapat mengeksekusi internal cart writer.';
  end if;


  raise notice
    'STAGE 2B FOUNDATION VERIFIED SUCCESSFULLY.';
end;
$$;


commit;