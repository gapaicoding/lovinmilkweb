# Laporan Eksekusi Backup Database

## Status

**BERHASIL** — backup yang menjadi bukti pemulihan adalah run
`20260725_130331`. Run lain di bawah `backup_output` adalah percobaan gagal
yang dipertahankan sebagai audit trail dan tidak digunakan sebagai bukti
backup.

- Project ref: `baukcqccetzzwzgpbnoj`
- Batch yang akan diimpor: `LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2`
- Lokasi utama: `E:\lovin_milk_fase_1_8_juni_2026\backup_output\20260725_130331`
- Salinan privat kedua:
  `C:\Users\WINDOWS\Documents\LovinMilkPrivateBackup\20260725_130331`
- Snapshot key:
  `LM-PRE-JUNE-FOUNDATION-20260725-130419425`
- Snapshot run ID: `a7fc60b0-49b9-41a3-9dfa-489c6bf928fc`
- Snapshot status: `completed`
- Snapshot selesai: `2026-07-25 06:04:19.631213+00`

## Metode

Backup dibuat memakai klien resmi PostgreSQL 17.10 dan kredensial login
sementara dari sesi Supabase CLI yang sudah terautentikasi. Kredensial hanya
berada di environment proses, tidak ditulis ke repository, laporan, atau file
backup.

Sembilan tabel lama dikunci dengan mode `SHARE` selama pengambilan roles,
schema, data, migration history, dan snapshot agar artefak menggambarkan satu
keadaan yang konsisten. Project remote diverifikasi sebagai
`baukcqccetzzwzgpbnoj` sebelum eksekusi.

Environment tidak menyediakan `SUPABASE_DB_URL` persisten. Karena Supabase CLI
yang sudah login dapat memberikan login database sementara, metode itu dipakai
sebagai adaptasi aman tanpa meminta atau menyimpan password pengguna.

Managed database backup terdeteksi memakai WAL-G, tetapi daftar backup yang
dapat diverifikasi kosong dan PITR tidak aktif. Karena itu logical dump dan
in-database snapshot di atas adalah bukti backup utama release ini.

## Artefak dan SHA-256

| File | Ukuran (byte) | SHA-256 |
|---|---:|---|
| `00_preflight_result.txt` | 1,210 | `FB5F2638CBC9661E9B18CACAD1574F884887556689AD27FAC6770492EDCB4A33` |
| `01_snapshot_result.txt` | 3,253 | `067AE5B845D5B48BD4BBC099342E35587F66B880D6428D965C8AC36F7EB95E5D` |
| `data.sql` | 1,304,156 | `CF37D29CAD84E9DAD8CAC345206B020D6435CB1A23E97C1E1900F8B9430E0E50` |
| `migration_history_data.sql` | 153 | `E6881088BD93A0796CDDE3620B95B52D16A5C7B0B5B38118800764464B30A557` |
| `migration_history_schema.sql` | 140 | `47FA54B77D210B3B7144BF90FA5204D0CF684ED32F300496C2B25515AF380FAB` |
| `roles.sql` | 6,432 | `DA833571830561A2A030C4465C10A394585A952B9B7F0573B24EFFC96D2CDF10` |
| `schema.sql` | 331,378 | `2145E9185394B74ECA9A60A84F894FA89C2A94A5428AADE3ECF20E9A58424BDA` |

`README.txt` (320 byte) dan `SHA256.txt` (602 byte) turut tersimpan. Seluruh
tujuh hash payload di atas diverifikasi ulang pada lokasi utama dan salinan
privat; hasilnya identik.

Schema migration history belum ada pada database sebelum rekonsiliasi history.
Karena itu dua file migration-history berisi pernyataan eksplisit bahwa schema
dan row sumber tidak ada, bukan history hasil rekayasa. Keadaan ini kemudian
direkonsiliasi secara terkontrol dan dibahas di
`reports/migration_history_reconciliation.md`.

## Snapshot Tabel Lama

| Tabel | Row | Row aktif | Jumlah aktif | MD5 canonical row set |
|---|---:|---:|---:|---|
| `expense_categories` | 9 | 9 | — | `d144663fc71d6d64cdeff3f225eca372` |
| `expense_items` | 4 | 4 | — | `c324086b3ee108d34efbda5fe6678ca0` |
| `expenses` | 238 | 238 | 4,992,000.00 | `a23c1aba9edb50f8232cb99aad7887bd` |
| `products` | 57 | 57 | — | `9bba08baf59e3d007850689118576d3c` |
| `profiles` | 3 | 3 | — | `8af77b8550cf703d6ad135b0fe0d214a` |
| `sales` | 304 | 304 | 7,854,000.00 | `361be1c69e7efc7cabc07aa41f44006a` |
| `sales_categories` | 10 | 10 | — | `67aab0245bcb1e07cfad94b38a89363e` |
| `visitor_visits` | 203 | 203 | — | `22db3e6063849a8e40ca2c82a9e89e47` |
| `visitors` | 75 | 75 | — | `6780f38c712076fff7881941cc9f616b` |

Preflight juga memastikan minimal satu Super Admin aktif tersedia dan
`pgcrypto` aktif.

## Verifikasi Kelengkapan

- `roles.sql` ada, tidak kosong, dan tidak memuat password hash.
- `schema.sql` memuat seluruh sembilan tabel lama.
- `data.sql` memuat blok `COPY` untuk seluruh sembilan tabel lama.
- migration history tersimpan sesuai keadaan sumber saat backup.
- snapshot database berstatus `completed`.
- checksum payload tersedia dan cocok pada dua lokasi.
- backup dan CSV berada di luar repository serta diabaikan oleh Git.

Folder percobaan `115112`, `124508`, `124544`, `125734`, `125851`,
`130049`, dan `130144` tidak lengkap dan tidak boleh digunakan untuk restore.

