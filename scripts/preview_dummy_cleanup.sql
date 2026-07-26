\set ON_ERROR_STOP on

-- SELECT-only preview. No row is classified as dummy unless a deterministic
-- marker exists in the schema. The legacy operational tables currently have
-- no data_origin/import_batch/seed-id marker, so they are reported as
-- unclassified and must not be deleted.
select 'sales' as table_name, 0::bigint as proven_dummy_rows,
       count(*)::bigint as unclassified_rows,
       coalesce(sum(amount), 0)::numeric as unclassified_amount
from public.sales
union all
select 'expenses', 0, count(*), coalesce(sum(amount), 0)
from public.expenses
union all
select 'visitors', 0, count(*), 0
from public.visitors
union all
select 'visitor_visits', 0, count(*), 0
from public.visitor_visits;

select b.batch_key, b.status,
       (select count(*) from public.daily_sales_summaries s where s.import_batch_id = b.id) as daily_sales_rows,
       (select coalesce(sum(s.total_sales), 0) from public.daily_sales_summaries s where s.import_batch_id = b.id) as revenue
from public.data_import_batches b
where b.batch_key = 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2';
