# Review dan Perubahan Migration Foundation Juni 2026

## Status

**Corrected migration siap untuk dry run, tetapi belum dijalankan ke database.**

- Sumber paket:
  `E:\lovin_milk_fase_1_8_juni_2026\supabase\migrations\20260725000000_june_2026_finance_assets_foundation.sql`
- Salinan corrected di repository:
  `supabase/migrations/20260725000000_june_2026_finance_assets_foundation.sql`
- Batch:
  `LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2`
- Transaction: satu pasangan `begin` / `commit`
- Scope: 16 tabel baru, 2 view baru, 5 helper function
- Database execution: **tidak dilakukan**, sesuai batasan review ini

SHA-256 saat review:

- Migration sumber paket:
  `4583D0EDAF2FBE3E84DC036CA509A09443E0E69E2269927AB1C1F3774A8F23AE`
- Corrected migration repository after production parser correction:
  `84F08FACFDAD5098116F3629E097104E02576DB1D23CB504808FBFABA4FE9922`

Perbandingan `git diff --no-index` terhadap sumber paket mencatat 1.052
baris ditambah dan 81 baris dihapus. Sebagian besar penambahan adalah
preflight, verifikasi definisi object, dan postcondition fail-closed; jumlah
object bisnis tetap 16 tabel dan 2 view.

## Object yang Dipertahankan

Enam belas tabel:

1. `data_import_batches`
2. `data_coverage_periods`
3. `daily_sales_summaries`
4. `customer_traffic_daily`
5. `historical_products`
6. `historical_product_aliases`
7. `historical_product_daily_quantities`
8. `suppliers`
9. `supplier_items`
10. `purchase_invoices`
11. `purchase_items`
12. `asset_categories`
13. `assets`
14. `asset_depreciation_entries`
15. `tax_entries`
16. `owner_distributions`

Dua view:

1. `v_asset_book_values`
2. `v_financial_statement_monthly`

Migration hanya membaca atau mereferensikan `profiles` dan `products` untuk
preflight/foreign key. Tidak ada `ALTER`, `INSERT`, `UPDATE`, `DELETE`,
`TRUNCATE`, atau `DROP` terhadap `sales`, `expenses`, `visitors`,
`visitor_visits`, maupun tabel lama lain.

## Temuan Review dan Koreksi

### 1. `IF NOT EXISTS` dapat menerima object lama yang tidak kompatibel

Risiko sumber:

- `CREATE TABLE IF NOT EXISTS` melewati definisi tabel bila nama sudah ada;
- index dengan nama sama juga dapat dilewati;
- migration dapat berlanjut dengan kolom, tipe, key, atau RLS yang salah.

Koreksi:

- preflight memverifikasi kontrak lama yang benar-benar dipakai:
  `profiles(id, role, is_active, created_at)`, `products(id)`, `auth.uid()`,
  `pgcrypto`, dan role Supabase;
- `profiles.role` diterima sebagai enum atau string, dan bila enum harus
  memiliki `staff`, `admin`, dan `super_admin`;
- setelah DDL, seluruh nama kolom yang diwajibkan pada 16 tabel diperiksa;
- setiap `id` wajib berupa primary key UUID;
- tipe/nullability kritis, generated
  `assets.monthly_depreciation`, batch foreign key, dan tiga composite
  same-batch foreign key diperiksa;
- postcondition memastikan 16 tabel ber-RLS dan kedua view benar-benar
  `security_invoker`.

Object parsial yang tidak kompatibel sekarang menghentikan transaction secara
aman, bukan diterima diam-diam.

### 2. Search path dan ACL helper function

Risiko sumber:

- security-definer helper memakai `public` dalam `search_path`;
- ACL yang tersisa dari eksekusi parsial tidak seluruhnya dinormalisasi.

Koreksi:

- ketiga helper role menggunakan
  `SET search_path = pg_catalog, pg_temp`;
- referensi tabel/function sensitif tetap schema-qualified sebagai
  `public.profiles` dan `auth.uid()`;
- trigger helper memakai security-invoker dengan search path yang sama;
- `PUBLIC`, `anon`, dan grant lama `authenticated` direvoke sebelum hanya
  `authenticated` dan `service_role` diberi EXECUTE pada helper role;
- trigger function tidak diberikan EXECUTE langsung ke client role.

Helper hanya membaca profile milik `auth.uid()` yang aktif. Migration tidak
mensyaratkan atau membaca `user_roles`.

### 3. Provenance batch dapat hilang atau tertimpa

Risiko sumber:

- `suppliers`, `supplier_items`, `assets`, `tax_entries`, dan
  `owner_distributions` menggunakan `ON DELETE SET NULL` untuk batch;
- batch paket menggunakan `ON CONFLICT DO UPDATE`, sehingga replay dapat
  menulis ulang manifest/expected metrics batch yang sudah imported atau
  reconciled.

Koreksi:

- semua foreign key provenance import memakai `ON DELETE RESTRICT`, kecuali
  `data_coverage_periods` yang memang merupakan child governance dan tetap
  `ON DELETE CASCADE`;
- trigger `lm_guard_import_batch_provenance` membuat `batch_key`,
  description, periode fact, flag full-assets, manifest, expected metrics,
  serta audit creation immutable setelah insert;
- batch paket memakai `ON CONFLICT (batch_key) DO NOTHING`;
- assertion setelah insert memastikan provenance sama persis dengan paket;
- row baru selalu masuk sebagai `prepared`;
- replay menerima lifecycle maju `prepared`, `staged`, `importing`,
  `imported`, atau `reconciled` tanpa mengubah status;
- batch dengan provenance berbeda, `failed`, atau `rolled_back` menyebabkan
  migration gagal dan rollback, bukan ditimpa.

Field workflow seperti `status`, `started_at`, `completed_at`, `updated_at`,
dan `updated_by` tetap dapat diperbarui oleh proses import yang berwenang.

### 4. Child dapat menunjuk parent dari batch lain

Risiko sumber:

- alias dan quantity hanya mereferensikan `historical_products.id`;
- item pembelian hanya mereferensikan `purchase_invoices.id`;
- nilai `import_batch_id` child dapat berbeda dari parent.

Koreksi:

- `historical_products` memiliki candidate key
  `(import_batch_id, id)`;
- alias dan quantity memakai composite foreign key
  `(import_batch_id, historical_product_id)`;
- `purchase_invoices` memiliki candidate key `(import_batch_id, id)`;
- `purchase_items` memakai composite foreign key
  `(import_batch_id, purchase_invoice_id)`;
- join laporan pembelian juga memakai kedua komponen batch dan ID.

### 5. View pembelian menghitung invoice/item yang tidak valid

Risiko sumber:

- nilai HPP/OpEx masih dapat berasal dari invoice `voided`;
- filter soft-delete berada di aggregate `FILTER`, sehingga group/month dapat
  tetap terbentuk dari row yang tidak layak;
- month set pembelian memasukkan invoice yang tidak mempunyai item aktif.

Koreksi:

- invoice harus `status = 'recorded'` dan `deleted_at IS NULL`;
- item harus `deleted_at IS NULL`;
- month pembelian hanya dibentuk bila ada item aktif;
- aggregate HPP/OpEx dijalankan setelah filter row;
- tax/distribution month set juga hanya memakai status keuangan yang tercatat
  (`recorded`/`paid`), bukan row voided.

### 6. View penyusutan belum konsisten

Risiko sumber:

- month penyusutan dapat dibentuk oleh entry draft/reversed;
- financial depreciation tidak mengecualikan asset soft-deleted;
- asset book-value join masih membawa semua entry lalu memfilter aggregate.

Koreksi:

- kedua view hanya memasukkan depreciation entry `posted`;
- kedua view hanya memakai asset dengan `deleted_at IS NULL`;
- `v_asset_book_values` juga mengecualikan category soft-deleted;
- filter status dipindahkan ke join/row source sebelum aggregate.

### 7. RLS dan grant dari eksekusi parsial dapat membuka akses

Risiko sumber:

- table/view hanya merevoke `anon`, bukan pseudo-role `PUBLIC`;
- policy asing/permissive dari percobaan manual dapat bertahan;
- tidak ada assertion final atas RLS, policy, dan effective grant.

Koreksi:

- table dan view merevoke `PUBLIC`, `anon`, `authenticated`, dan
  `service_role` terlebih dahulu, lalu memberi grant yang eksplisit;
- semua policy pada 16 object target dibersihkan sebelum empat policy
  canonical dibuat ulang;
- operational aggregate: staff aktif boleh SELECT, admin aktif boleh
  INSERT/UPDATE, super admin aktif boleh DELETE;
- financial/governance: admin aktif boleh SELECT/INSERT/UPDATE, super admin
  aktif boleh DELETE;
- `anon` tidak mendapat table/view access;
- `authenticated` mendapat privilege object yang diperlukan agar RLS dapat
  dievaluasi;
- `service_role` mendapat administrative table access;
- postcondition memverifikasi RLS, empat policy authenticated-only per tabel,
  effective grant, no-anon access, dan opsi `security_invoker` view.

## Batch Metadata yang Dipertahankan

Nilai dari package source tidak diubah:

- fact period: `2026-06-01` sampai `2026-06-30`;
- full assets: `true`;
- source files frozen: `6`;
- dummy data allowed: `false`;
- marketing imported: `false`;
- membership identity imported: `false`;
- daily sales rows: `30`;
- revenue: `30,011,000`;
- product quantity rows: `656`;
- product quantity: `1,358`;
- purchase items: `344`;
- purchase invoices: `343`;
- purchase total: `11,535,298`;
- HPP: `10,488,538`;
- operating expense: `1,046,760`;
- traffic total: `827`;
- assets: `21`;
- asset register total: `870,145`.

Foundation tetap hanya mendaftarkan metadata batch. Tidak ada fact, asset,
tax, dividend, harga historis, atau dummy row yang diimpor oleh migration ini.

## Self-review Statis

Pemeriksaan yang dilakukan tanpa koneksi database:

- object count: 16 `CREATE TABLE`, 2 `CREATE OR REPLACE VIEW`;
- helper count: 5 `CREATE OR REPLACE FUNCTION`;
- transaction count: 1 `begin`, 1 `commit`;
- seluruh dollar-quote berpasangan;
- parenthesis count seimbang: 605 buka dan 605 tutup;
- tidak ada executable statement destructive terhadap tabel lama;
- tidak ada `ON CONFLICT DO UPDATE`;
- `git diff --no-index --check` tidak menemukan whitespace error;
- perbandingan sumber/corrected serta SHA-256 dicatat di atas.

Git menampilkan warning informasional bahwa checkout Windows dapat
mengonversi LF ke CRLF saat Git menyentuh file. Tidak ada whitespace error
yang dilaporkan.

## Batas Review dan Gate Berikutnya

Review ini sengaja tidak menjalankan PostgreSQL, Supabase CLI, migration dry
run, atau remote database. Oleh karena itu, hasil ini belum merupakan bukti
bahwa migration sudah applied.

Sebelum apply:

1. pastikan migration/security baseline yang menyediakan canonical
   `profiles.role`, `profiles.is_active`, dan tiga enum role sudah ada;
2. verifikasi target project ref;
3. selesaikan backup dan checksum tabel lama;
4. jalankan `supabase db push --dry-run`;
5. periksa bahwa hanya migration yang dikenal yang pending;
6. setelah apply, jalankan post-migration verification dan bandingkan checksum
   tabel lama.

Migration akan fail closed bila contract prerequisite, PostgreSQL
`security_invoker`, object parsial, policy, grant, atau batch provenance tidak
sesuai.

## Koreksi dari Percobaan Apply Pertama

Apply pertama memasang migration hardening authorization, lalu berhenti aman
di dalam transaction foundation sebelum staging. PostgreSQL 17 melaporkan
`operator does not exist: name[] = text[]` pada assertion foreign key:
`pg_attribute.attname` bertipe internal `name`, sehingga `array_agg(attname)`
menghasilkan `name[]`, sedangkan expected literal sudah `text[]`.

Delapan ekspresi catalog dikoreksi menjadi
`array_agg(a.attname::text order by k.ordinality)`. Transaction foundation
yang gagal telah rollback; migration history remote membuktikan hanya
`20260724144000` yang applied dan dua migration berikutnya masih pending.
Dry-run ulang kemudian hanya menampilkan foundation dan staging. Koreksi ini
tidak mengubah object bisnis, data, atau tabel lama.
