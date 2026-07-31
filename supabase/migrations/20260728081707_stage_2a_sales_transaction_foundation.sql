begin;

-- ============================================================
-- STAGE 2A
-- Multi-item Sales Transaction Foundation
--
-- Tujuan:
--   1. Membuat header transaksi penjualan baru.
--   2. Membuat item transaksi multi-produk.
--   3. Menyimpan snapshot ownership per item.
--   4. Menjaga integritas Product -> Category -> Subunit -> Outlet.
--   5. Mengizinkan Staff+ membaca data.
--   6. Melarang direct write dari client.
--
-- BELUM:
--   - RPC create/update/delete
--   - inventory / stock movement
--   - dashboard / finance integration
--   - migrasi data public.sales
--   - clean database
-- ============================================================


-- ============================================================
-- 1. PREFLIGHT
-- ============================================================

do $$
begin
  -- ----------------------------------------------------------
  -- Required Stage 1 tables
  -- ----------------------------------------------------------

  if to_regclass('public.profiles') is null then
    raise exception
      'STAGE 2A ABORT: public.profiles tidak ditemukan.';
  end if;

  if to_regclass('public.outlets') is null then
    raise exception
      'STAGE 2A ABORT: public.outlets tidak ditemukan.';
  end if;

  if to_regclass('public.business_subunits') is null then
    raise exception
      'STAGE 2A ABORT: public.business_subunits tidak ditemukan.';
  end if;

  if to_regclass('public.sales_categories') is null then
    raise exception
      'STAGE 2A ABORT: public.sales_categories tidak ditemukan.';
  end if;

  if to_regclass('public.products') is null then
    raise exception
      'STAGE 2A ABORT: public.products tidak ditemukan.';
  end if;

  -- Legacy sales harus tetap ada pada fase ini.
  if to_regclass('public.sales') is null then
    raise exception
      'STAGE 2A ABORT: public.sales legacy tidak ditemukan.';
  end if;


  -- ----------------------------------------------------------
  -- Required columns
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_subunits'
      and column_name = 'outlet_id'
  ) then
    raise exception
      'STAGE 2A ABORT: business_subunits.outlet_id tidak ditemukan.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_categories'
      and column_name = 'subunit_id'
  ) then
    raise exception
      'STAGE 2A ABORT: sales_categories.subunit_id tidak ditemukan.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'sales_category_id'
  ) then
    raise exception
      'STAGE 2A ABORT: products.sales_category_id tidak ditemukan.';
  end if;


  -- ----------------------------------------------------------
  -- Required helper functions from existing application
  -- ----------------------------------------------------------

  if to_regprocedure(
    'public.lm_is_active_staff_or_above()'
  ) is null then
    raise exception
      'STAGE 2A ABORT: lm_is_active_staff_or_above() tidak ditemukan.';
  end if;

  if to_regprocedure(
    'public.lm_is_active_super_admin()'
  ) is null then
    raise exception
      'STAGE 2A ABORT: lm_is_active_super_admin() tidak ditemukan.';
  end if;

  if to_regprocedure(
    'public.lm_set_updated_at()'
  ) is null then
    raise exception
      'STAGE 2A ABORT: lm_set_updated_at() tidak ditemukan.';
  end if;


  -- ----------------------------------------------------------
  -- Jangan diam-diam menimpa deployment parsial
  -- ----------------------------------------------------------

  if to_regclass(
    'public.sales_transactions'
  ) is not null then
    raise exception
      'STAGE 2A ABORT: public.sales_transactions sudah ada.';
  end if;

  if to_regclass(
    'public.sales_items'
  ) is not null then
    raise exception
      'STAGE 2A ABORT: public.sales_items sudah ada.';
  end if;
end;
$$;


-- ============================================================
-- 2. SALES TRANSACTIONS
-- ============================================================

create table public.sales_transactions (
  id uuid primary key
    default gen_random_uuid(),

  outlet_id uuid not null
    references public.outlets(id)
    on delete restrict,

  /*
   * Dibuat oleh RPC pada Stage 2B.
   *
   * Jangan generate nomor transaksi dari frontend.
   */
  transaction_number text not null,

  transaction_date date not null,

  /*
   * Canonical transaction total.
   *
   * Stage 2B RPC akan menghitung nilai ini berdasarkan
   * SUM(sales_items.amount).
   */
  total_amount numeric(30, 2)
    not null
    default 0,

  notes text,

  /*
   * Dipertahankan kompatibel dengan konsep source
   * pada Penjualan existing.
   *
   * Integrasi visitor belum dikerjakan pada Stage 2A.
   */
  entry_source text
    not null
    default 'manual',

  created_at timestamptz
    not null
    default clock_timestamp(),

  updated_at timestamptz
    not null
    default clock_timestamp(),

  created_by uuid
    references public.profiles(id)
    on delete set null,

  updated_by uuid
    references public.profiles(id)
    on delete set null,

  deleted_at timestamptz,

  deleted_by uuid
    references public.profiles(id)
    on delete set null,


  constraint sales_transactions_number_not_blank
    check (
      btrim(transaction_number) <> ''
    ),

  constraint sales_transactions_number_length
    check (
      char_length(transaction_number)
      <= 80
    ),

  constraint sales_transactions_total_nonnegative
    check (
      total_amount >= 0
    ),

  constraint sales_transactions_notes_length
    check (
      notes is null
      or char_length(notes) <= 500
    ),

  constraint sales_transactions_entry_source_check
    check (
      entry_source in (
        'manual',
        'visitor'
      )
    )
);


comment on table public.sales_transactions is
  'Header transaksi penjualan multi-item. Satu transaksi dapat berisi item dari beberapa Subunit Bisnis.';

comment on column public.sales_transactions.total_amount is
  'Total canonical transaksi. Dipelihara server-side oleh lifecycle transaksi, bukan dipercaya dari frontend.';

comment on column public.sales_transactions.transaction_number is
  'Nomor transaksi unik yang dibuat server-side oleh RPC Stage 2B.';

comment on column public.sales_transactions.entry_source is
  'Sumber pencatatan transaksi. Integrasi visitor akan ditangani terpisah.';


-- ============================================================
-- 3. SALES ITEMS
-- ============================================================

create table public.sales_items (
  id uuid primary key
    default gen_random_uuid(),

  sales_transaction_id uuid not null
    references public.sales_transactions(id)
    on delete cascade,

  /*
   * Menyimpan urutan item di dalam transaksi.
   *
   * Tidak dibuat UNIQUE(product_id), karena produk yang sama
   * dapat muncul lebih dari satu baris apabila kelak mempunyai
   * harga/catatan berbeda.
   */
  line_no integer not null,

  product_id uuid not null
    references public.products(id)
    on delete restrict,

  /*
   * Historical ownership snapshot.
   *
   * Nilainya di-resolve server-side dari Product -> Category.
   */
  sales_category_id uuid not null
    references public.sales_categories(id)
    on delete restrict,

  /*
   * Historical ownership snapshot.
   *
   * Nilainya di-resolve server-side dari Category -> Subunit.
   */
  subunit_id uuid not null
    references public.business_subunits(id)
    on delete restrict,

  quantity numeric(14, 2)
    not null,

  unit_price numeric(16, 2)
    not null,

  /*
   * Server/database canonical subtotal.
   *
   * Frontend tidak mengirim amount.
   */
  amount numeric(30, 2)
    generated always as (
      round(quantity * unit_price, 2)
    ) stored,

  /*
   * Snapshot textual values menjaga histori transaksi
   * tetap terbaca walaupun master di-rename di masa depan.
   */
  product_name_snapshot text not null,

  product_sku_snapshot text,

  category_name_snapshot text not null,

  subunit_name_snapshot text not null,

  unit_snapshot text not null,

  notes text,

  created_at timestamptz
    not null
    default clock_timestamp(),


  constraint sales_items_line_no_positive
    check (
      line_no > 0
    ),

  constraint sales_items_quantity_positive
    check (
      quantity > 0
    ),

  constraint sales_items_quantity_max
    check (
      quantity <= 999999999.99
    ),

  constraint sales_items_unit_price_nonnegative
    check (
      unit_price >= 0
    ),

  constraint sales_items_unit_price_max
    check (
      unit_price <= 999999999999.99
    ),

  constraint sales_items_product_name_not_blank
    check (
      btrim(product_name_snapshot) <> ''
    ),

  constraint sales_items_product_name_length
    check (
      char_length(product_name_snapshot)
      <= 200
    ),

  constraint sales_items_product_sku_length
    check (
      product_sku_snapshot is null
      or char_length(product_sku_snapshot)
      <= 100
    ),

  constraint sales_items_category_name_not_blank
    check (
      btrim(category_name_snapshot) <> ''
    ),

  constraint sales_items_category_name_length
    check (
      char_length(category_name_snapshot)
      <= 150
    ),

  constraint sales_items_subunit_name_not_blank
    check (
      btrim(subunit_name_snapshot) <> ''
    ),

  constraint sales_items_subunit_name_length
    check (
      char_length(subunit_name_snapshot)
      <= 150
    ),

  constraint sales_items_unit_not_blank
    check (
      btrim(unit_snapshot) <> ''
    ),

  constraint sales_items_unit_length
    check (
      char_length(unit_snapshot)
      <= 50
    ),

  constraint sales_items_notes_length
    check (
      notes is null
      or char_length(notes) <= 500
    ),

  constraint sales_items_transaction_line_unique
    unique (
      sales_transaction_id,
      line_no
    )
);


comment on table public.sales_items is
  'Item transaksi penjualan. Ownership Category dan Subunit disimpan sebagai snapshot transaksi.';

comment on column public.sales_items.subunit_id is
  'Subunit pemilik revenue item pada saat transaksi dibuat.';

comment on column public.sales_items.sales_category_id is
  'Kategori produk pada saat transaksi dibuat.';

comment on column public.sales_items.amount is
  'Subtotal canonical = quantity * unit_price, dihitung PostgreSQL.';


-- ============================================================
-- 4. INDEXES
-- ============================================================

create unique index sales_transactions_number_uidx
  on public.sales_transactions (
    transaction_number
  );


create index sales_transactions_date_idx
  on public.sales_transactions (
    transaction_date desc
  );


create index sales_transactions_outlet_date_idx
  on public.sales_transactions (
    outlet_id,
    transaction_date desc
  );


create index sales_transactions_active_date_idx
  on public.sales_transactions (
    transaction_date desc,
    created_at desc
  )
  where deleted_at is null;


create index sales_transactions_deleted_date_idx
  on public.sales_transactions (
    transaction_date desc,
    created_at desc
  )
  where deleted_at is not null;


create index sales_items_transaction_idx
  on public.sales_items (
    sales_transaction_id
  );


create index sales_items_product_idx
  on public.sales_items (
    product_id
  );


create index sales_items_category_idx
  on public.sales_items (
    sales_category_id
  );


create index sales_items_subunit_idx
  on public.sales_items (
    subunit_id
  );


create index sales_items_subunit_category_idx
  on public.sales_items (
    subunit_id,
    sales_category_id
  );


-- ============================================================
-- 5. UPDATED_AT TRIGGER
-- ============================================================

create trigger set_sales_transactions_updated_at
before update
on public.sales_transactions
for each row
execute function public.lm_set_updated_at();


-- ============================================================
-- 6. RELATIONAL OWNERSHIP PROTECTION
--
-- Melindungi:
--
-- Product
--   ↓
-- Sales Category
--   ↓
-- Business Subunit
--   ↓
-- Outlet transaksi
--
-- Frontend/RPC tidak boleh dapat membuat kombinasi seperti:
--
-- product Lovin
-- category Lovin
-- subunit Arayya
--
-- atau:
--
-- transaction Outlet A
-- item Subunit Outlet B
-- ============================================================

create or replace function public.lm_validate_sales_item_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_product_category_id uuid;
  v_category_subunit_id uuid;
  v_subunit_outlet_id uuid;
  v_transaction_outlet_id uuid;
begin
  -- ----------------------------------------------------------
  -- Resolve Product -> Category
  -- ----------------------------------------------------------

  select p.sales_category_id
  into v_product_category_id
  from public.products p
  where p.id = new.product_id;

  if v_product_category_id is null then
    raise exception
      using
        errcode = '23503',
        message = 'Product transaksi tidak ditemukan.';
  end if;


  -- ----------------------------------------------------------
  -- Resolve Category -> Subunit
  -- ----------------------------------------------------------

  select c.subunit_id
  into v_category_subunit_id
  from public.sales_categories c
  where c.id = v_product_category_id;

  if v_category_subunit_id is null then
    raise exception
      using
        errcode = '23503',
        message = 'Kategori produk transaksi tidak ditemukan.';
  end if;


  -- ----------------------------------------------------------
  -- Resolve Subunit -> Outlet
  -- ----------------------------------------------------------

  select s.outlet_id
  into v_subunit_outlet_id
  from public.business_subunits s
  where s.id = v_category_subunit_id;

  if v_subunit_outlet_id is null then
    raise exception
      using
        errcode = '23503',
        message = 'Subunit produk transaksi tidak ditemukan.';
  end if;


  -- ----------------------------------------------------------
  -- Resolve transaction Outlet
  -- ----------------------------------------------------------

  select t.outlet_id
  into v_transaction_outlet_id
  from public.sales_transactions t
  where t.id = new.sales_transaction_id;

  if v_transaction_outlet_id is null then
    raise exception
      using
        errcode = '23503',
        message = 'Header transaksi penjualan tidak ditemukan.';
  end if;


  -- ----------------------------------------------------------
  -- Validate explicit snapshots
  -- ----------------------------------------------------------

  if new.sales_category_id
    is distinct from
    v_product_category_id
  then
    raise exception
      using
        errcode = '23514',
        message =
          'Kategori item tidak sesuai dengan kategori Product.';
  end if;


  if new.subunit_id
    is distinct from
    v_category_subunit_id
  then
    raise exception
      using
        errcode = '23514',
        message =
          'Subunit item tidak sesuai dengan Subunit pemilik kategori.';
  end if;


  if v_transaction_outlet_id
    is distinct from
    v_subunit_outlet_id
  then
    raise exception
      using
        errcode = '23514',
        message =
          'Subunit item tidak berada pada Outlet transaksi.';
  end if;


  return new;
end;
$$;


create trigger validate_sales_item_ownership
before insert or update of
  sales_transaction_id,
  product_id,
  sales_category_id,
  subunit_id
on public.sales_items
for each row
execute function public.lm_validate_sales_item_ownership();


comment on function public.lm_validate_sales_item_ownership() is
  'Menjaga Product -> Category -> Subunit -> Outlet tetap konsisten pada sales_items.';


-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

alter table public.sales_transactions
enable row level security;


alter table public.sales_items
enable row level security;


-- ------------------------------------------------------------
-- Transaction header
--
-- Staff/Admin:
--   hanya transaksi aktif
--
-- Super Admin:
--   aktif + soft deleted
-- ------------------------------------------------------------

create policy sales_transactions_select_staff
on public.sales_transactions
for select
to authenticated
using (
  public.lm_is_active_staff_or_above()
  and (
    deleted_at is null
    or public.lm_is_active_super_admin()
  )
);


-- ------------------------------------------------------------
-- Transaction items mengikuti visibility header.
-- ------------------------------------------------------------

create policy sales_items_select_staff
on public.sales_items
for select
to authenticated
using (
  public.lm_is_active_staff_or_above()
  and exists (
    select 1
    from public.sales_transactions st
    where st.id = sales_items.sales_transaction_id
      and (
        st.deleted_at is null
        or public.lm_is_active_super_admin()
      )
  )
);


-- ============================================================
-- 8. PRIVILEGES
--
-- Stage 2A sengaja READ ONLY dari client.
--
-- INSERT/UPDATE/DELETE nantinya hanya melalui
-- SECURITY DEFINER RPC Stage 2B.
-- ============================================================

revoke all
on table public.sales_transactions
from anon;


revoke all
on table public.sales_items
from anon;


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


-- Trigger function bukan public RPC.
revoke all
on function public.lm_validate_sales_item_ownership()
from public;


-- ============================================================
-- 9. FINAL MIGRATION ASSERTIONS
-- ============================================================

do $$
declare
  v_transaction_count bigint;
  v_item_count bigint;
begin
  if to_regclass(
    'public.sales_transactions'
  ) is null then
    raise exception
      'STAGE 2A VERIFY FAILED: sales_transactions tidak terbentuk.';
  end if;


  if to_regclass(
    'public.sales_items'
  ) is null then
    raise exception
      'STAGE 2A VERIFY FAILED: sales_items tidak terbentuk.';
  end if;


  select count(*)
  into v_transaction_count
  from public.sales_transactions;


  select count(*)
  into v_item_count
  from public.sales_items;


  if v_transaction_count <> 0 then
    raise exception
      'STAGE 2A VERIFY FAILED: sales_transactions harus kosong, ditemukan % row.',
      v_transaction_count;
  end if;


  if v_item_count <> 0 then
    raise exception
      'STAGE 2A VERIFY FAILED: sales_items harus kosong, ditemukan % row.',
      v_item_count;
  end if;


  if to_regclass(
    'public.sales'
  ) is null then
    raise exception
      'STAGE 2A VERIFY FAILED: legacy public.sales tidak boleh hilang.';
  end if;
end;
$$;


commit;