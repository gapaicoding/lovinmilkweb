# Catatan Rollback Aman

Backup wajib dilakukan. Jangan menjalankan rollback destruktif otomatis.

Urutan aman:

1. Deploy frontend versi sebelum Sprint 5 agar tidak ada request RPC baru.
2. Revoke RPC visitor dari `authenticated`, lalu hentikan traffic operasional.
3. Pertahankan `sales` yang sudah tercatat. Ubah `entry_source` visitor menjadi `manual`
   dan set `visitor_visit_id` NULL hanya jika keterkaitan kunjungan memang akan dilepas.
4. Setelah backup/verifikasi, drop FK dan index sales visitor; kolom hanya boleh dihapus
   bila downstream sudah tidak menggunakannya.
5. Drop policy/RPC/trigger visitor, lalu tabel `visitor_visits`, `visitors`, dan sequence.
   Langkah ini menghilangkan identitas serta riwayat kunjungan.
6. Pulihkan policy sales/expenses versi sebelum Sprint 5.

Nilai enum PostgreSQL `staff` tidak aman untuk dihapus langsung. Biarkan nilainya ada,
atau lakukan migrasi enum khusus setelah memastikan tidak ada row Staff. Jangan
merekonstruksi enum di production tanpa maintenance window dan backup.
