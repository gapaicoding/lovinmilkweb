# Instalasi Staff dan Modul Pengunjung

1. Backup database dan catat jumlah, total `amount`, serta total `quantity` sales.
2. Jalankan `audit_before_staff_visitor_module.sql` dalam mode read-only.
3. Review khususnya schema aktual `profiles`, `user_roles`, helper role, policy, dan RPC soft delete.
4. Terapkan migration berurutan:
   - `20260724143000_add_staff_role.sql`
   - `20260724143100_create_visitor_module.sql`
   - `20260724143200_create_visitor_rpc_and_rls.sql`
5. Regenerate types:
   `npx supabase gen types typescript --project-id rhvlozmcpacximgzlkxb --schema public > src/integrations/supabase/types.ts`
6. Jalankan `verify_staff_visitor_module.sql`, lalu bandingkan baseline sales.
7. Jalankan `npm.cmd run build` dan `npm.cmd run lint`.
8. QA Staff, Admin, dan Super Admin menggunakan checklist Sprint 5.

Jangan menjalankan migration production dari Codex. Jika helper/schema hasil audit berbeda,
hentikan instalasi dan sesuaikan migration di staging terlebih dahulu.

Troubleshooting:

- `unsafe use of new enum value`: jalankan migration role sebagai transaksi terpisah.
- RPC ditolak: periksa profile aktif, `user_roles`, grants, dan `auth.uid()`.
- Active visit ganda: periksa index `uq_visitor_visits_one_active`.
- Sale visitor gagal: pastikan product aktif, harga positif, dan schema sales memiliki kolom Sprint 4.
