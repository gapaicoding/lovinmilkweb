begin;

drop index if exists
  public.sales_unique_active_date_product_idx;

create unique index if not exists
  sales_unique_active_manual_date_product_idx
on public.sales (
  transaction_date,
  product_id
)
where deleted_at is null
  and entry_source = 'manual'
  and visitor_visit_id is null;

create unique index if not exists
  sales_unique_active_visit_product_idx
on public.sales (
  visitor_visit_id,
  product_id
)
where deleted_at is null
  and entry_source = 'visitor'
  and visitor_visit_id is not null;

commit;