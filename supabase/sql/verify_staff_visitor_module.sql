-- READ ONLY. Jalankan setelah ketiga migration.
BEGIN TRANSACTION READ ONLY;

SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
WHERE t.typname='app_role' ORDER BY enumsortorder;

SELECT to_regclass('public.visitors') visitors,
  to_regclass('public.visitor_visits') visitor_visits,
  to_regclass('public.visitor_code_seq') visitor_code_seq;

SELECT table_name,column_name,column_default,is_nullable
FROM information_schema.columns WHERE table_schema='public'
AND ((table_name='sales' AND column_name IN ('visitor_visit_id','entry_source'))
  OR table_name IN ('visitors','visitor_visits'))
ORDER BY table_name,ordinal_position;

SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid IN ('public.visitors'::regclass,'public.visitor_visits'::regclass,'public.sales'::regclass)
AND (conname ILIKE '%visitor%' OR conname ILIKE '%entry_source%');

SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('visitors','visitor_visits','sales') ORDER BY tablename,indexname;

SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('visitors','visitor_visits','sales','expenses');

SELECT p.proname, p.prosecdef security_definer, p.proconfig,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('public',p.oid,'EXECUTE') public_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'search_operational_visitors','record_visitor_purchase','add_visitor_purchase',
  'check_out_visitor','list_visitor_visits','list_visitors_admin',
  'update_visitor_identity','soft_delete_visitor','soft_delete_visitor_visit',
  'restore_visitor','restore_visitor_visit','hard_delete_visitor','hard_delete_visitor_visit',
  'soft_delete_sale','soft_delete_expense'
) ORDER BY p.proname;

SELECT schemaname,tablename,policyname,cmd,roles,qual,with_check
FROM pg_policies WHERE schemaname='public'
AND tablename IN ('visitors','visitor_visits','sales','expenses')
ORDER BY tablename,policyname;

SELECT visitor_code,count(*) FROM public.visitors GROUP BY visitor_code HAVING count(*)>1;
SELECT visitor_id,count(*) FROM public.visitor_visits
WHERE check_out_at IS NULL AND deleted_at IS NULL GROUP BY visitor_id HAVING count(*)>1;
SELECT vv.id FROM public.visitor_visits vv LEFT JOIN public.visitors v ON v.id=vv.visitor_id WHERE v.id IS NULL;
SELECT s.id FROM public.sales s LEFT JOIN public.visitor_visits vv ON vv.id=s.visitor_visit_id
WHERE s.visitor_visit_id IS NOT NULL AND vv.id IS NULL;
SELECT id FROM public.sales WHERE entry_source='visitor' AND visitor_visit_id IS NULL;
SELECT count(*) sales_count,coalesce(sum(amount),0) total_amount,coalesce(sum(quantity),0) total_quantity,
  count(*) FILTER (WHERE entry_source='manual') manual_count
FROM public.sales;

ROLLBACK;
