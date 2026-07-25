# Eksekusi Migration Juni 2026

## Target

- Project ref: `baukcqccetzzwzgpbnoj`
- Supabase CLI: `2.109.1`
- Tanggal: `2026-07-25` (Asia/Jakarta)

## Hasil

Tiga migration dikenal telah applied dan migration history lokal/remote cocok:

1. `20260724144000_harden_profile_authorization.sql`
2. `20260725000000_june_2026_finance_assets_foundation.sql`
3. `20260725001000_june_2026_import_staging.sql`

## Percobaan Pertama dan Rollback Aman

Dry-run pertama hanya menampilkan tiga migration di atas. Saat apply:

- hardening authorization berhasil dan committed;
- foundation berhenti pada assertion catalog dengan
  `operator does not exist: name[] = text[]`;
- transaction foundation rollback;
- staging belum dijalankan.

Migration history setelah kegagalan membuktikan hanya hardening authorization
yang applied. Tidak ada fact baru, staging row, atau perubahan tabel lama dari
transaction foundation yang gagal.

Penyebabnya adalah `pg_attribute.attname` bertipe `name`; delapan
`array_agg(attname)` dikoreksi menjadi `array_agg(attname::text)`. SHA-256
foundation terkoreksi:

`84F08FACFDAD5098116F3629E097104E02576DB1D23CB504808FBFABA4FE9922`

## Retry

Dry-run kedua hanya menampilkan foundation dan staging. Apply retry selesai
dengan exit code `0`; notice `does not exist, skipping` berasal dari pola aman
`DROP ... IF EXISTS` saat membuat trigger/policy canonical pertama kali.

Verifikasi setelah apply:

- 16 tabel foundation tersedia dan RLS aktif;
- dua view ada serta memakai `security_invoker`;
- `anon` tidak memiliki akses pada object foundation;
- batch target tersedia dengan status `prepared`;
- fact/master target masih kosong sebelum staging import;
- checksum sembilan tabel lama sama dengan snapshot eksplisit
  `LM-PRE-JUNE-FOUNDATION-20260725-130419425`;
- migration list menampilkan delapan versi lokal/remote yang sama.

