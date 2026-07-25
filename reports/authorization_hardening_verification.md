# Verifikasi Hardening Authorization Profil

Migration `20260724144000_harden_profile_authorization.sql` applied pada project
`baukcqccetzzwzgpbnoj`. Verifier fail-closed
`supabase/sql/verify_profile_authorization_hardening.sql` selesai dengan exit
code `0`.

Assertion yang lolos:

- default akun baru adalah role `staff` dan `is_active = false`;
- metadata signup tidak dapat menetapkan role/status authorization;
- `anon` tidak mempunyai privilege pada `profiles`;
- `authenticated` hanya dapat membaca sesuai RLS dan mengubah kolom tampilan
  `full_name`/`avatar_url`;
- `authenticated` tidak dapat mengubah `role` atau `is_active` langsung;
- hanya dua policy profil canonical yang tersisa;
- RLS `profiles` aktif;
- helper/RPC menggunakan `SECURITY DEFINER`, fixed `search_path`, dan
  `row_security=off`;
- RPC authorization hanya executable oleh role terautentikasi/service backend,
  lalu memverifikasi Super Admin aktif di dalam fungsi;
- trigger signup masih menunjuk `handle_new_user`;
- minimal satu Super Admin aktif tetap tersedia (aktual: `1`);
- RPC menolak self-change dan menjaga Super Admin aktif terakhir melalui
  advisory transaction lock.

Halaman Manajemen Pengguna harus memanggil
`admin_update_profile_authorization`, bukan direct table update.

