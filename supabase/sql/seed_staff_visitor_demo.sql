-- DEVELOPMENT ONLY, opsional, tidak idempotent terhadap transaksi.
-- Tidak membuat auth user dan tidak menggunakan service-role key.
-- Gunakan UI /kunjungan dengan sesi user valid agar seluruh aturan RPC/RLS diuji.
SELECT id,name,selling_price,unit
FROM public.products
WHERE deleted_at IS NULL AND is_active
ORDER BY name LIMIT 10;
