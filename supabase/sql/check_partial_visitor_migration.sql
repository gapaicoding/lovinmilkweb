-- READ ONLY. Jalankan setelah migration struktur gagal untuk mengetahui partial state.
BEGIN TRANSACTION READ ONLY;

SELECT
  to_regclass('public.visitor_code_seq') AS visitor_code_seq,
  to_regclass('public.visitors') AS visitors,
  to_regclass('public.visitor_visits') AS visitor_visits;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'sales' AND column_name IN ('visitor_visit_id', 'entry_source'))
    OR table_name IN ('visitors', 'visitor_visits')
  )
ORDER BY table_name, ordinal_position;

SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname,
  con.contype,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('sales', 'visitors', 'visitor_visits')
  AND (
    con.conname ILIKE '%visitor%'
    OR con.conname ILIKE '%entry_source%'
  )
ORDER BY c.relname, con.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    tablename IN ('visitors', 'visitor_visits')
    OR indexname IN (
      'idx_sales_visitor_visit',
      'idx_sales_entry_source',
      'idx_sales_visit_deleted'
    )
  )
ORDER BY tablename, indexname;

SELECT event_object_table, trigger_name, action_timing, event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('visitors', 'visitor_visits')
ORDER BY event_object_table, trigger_name;

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  p.proconfig,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('generate_visitor_code', 'update_updated_at_column')
ORDER BY p.proname;

SELECT
  CASE
    WHEN to_regclass('public.visitor_code_seq') IS NULL
      AND to_regclass('public.visitors') IS NULL
      AND to_regclass('public.visitor_visits') IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='sales'
          AND column_name IN ('visitor_visit_id','entry_source')
      )
    THEN 'ROLLBACK PENUH: tidak ada object struktur Sprint 5. Jalankan ulang migration struktur yang sudah diperbaiki.'
    ELSE 'PARTIAL: satu atau lebih object Sprint 5 tersedia. Jangan cleanup otomatis; backup, review hasil query di atas, lalu rerun migration struktur yang idempotent.'
  END AS rekomendasi;

SELECT
  'Jika memilih rollback penuh pada partial state, buat migration rollback terpisah setelah backup dan review dependency. Jangan DROP object langsung dari checker ini.'
  AS catatan_rollback;

ROLLBACK;
