-- DEVELOPMENT ONLY. Jangan jalankan pada production.
-- RPC membutuhkan auth.uid(), sehingga panggil lewat aplikasi/Supabase client
-- dengan sesi Staff/Admin/Super Admin yang valid. Jangan hardcode UUID user.

-- 1. Sebagai Staff, direct INSERT/UPDATE sales dan expenses harus ditolak RLS.
-- 2. Ambil product aktif dan gunakan ID-nya di form /kunjungan.
-- 3. Catat visitor baru; pastikan visitor, visit, dan satu sale muncul bersama.
-- 4. Ulangi dua request visitor existing bersamaan; hanya satu active visit boleh ada.
-- 5. Panggil add_visitor_purchase; sale kedua memakai visitor_visit_id yang sama.
-- 6. Panggil check_out_visitor dua kali; panggilan kedua harus gagal jelas.
-- 7. Pastikan checkout tidak mengubah count/sum sales.
-- 8. Sebagai Admin, update identitas dan soft delete visitor tanpa active visit.
-- 9. Sebagai Staff, operasi update/delete/restore/hard delete harus ditolak.
-- 10. Sebagai Super Admin, lihat data terhapus dan uji restore.
-- 11. hard_delete_visitor harus gagal bila visitor memiliki visitor_visits.

SELECT visitor_code,count(*) duplicate_count
FROM public.visitors GROUP BY visitor_code HAVING count(*)>1;
SELECT visitor_id,count(*) active_count
FROM public.visitor_visits WHERE check_out_at IS NULL AND deleted_at IS NULL
GROUP BY visitor_id HAVING count(*)>1;
SELECT s.id,s.entry_source,s.visitor_visit_id,s.quantity,s.unit_price,s.amount
FROM public.sales s WHERE s.entry_source='visitor'
ORDER BY s.created_at DESC LIMIT 20;
