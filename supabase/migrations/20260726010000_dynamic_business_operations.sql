begin;

-- Separate provenance from data-quality origin. Existing imported facts keep
-- their batch linkage; website-created business records never borrow an
-- historical batch merely to satisfy a NOT NULL constraint.
alter table public.purchase_invoices
  add column if not exists record_source text;
alter table public.purchase_items
  add column if not exists record_source text;
alter table public.assets
  add column if not exists record_source text;
alter table public.tax_entries
  add column if not exists record_source text;
alter table public.owner_distributions
  add column if not exists record_source text;
alter table public.sales
  add column if not exists record_source text;
alter table public.expenses
  add column if not exists record_source text;

update public.purchase_invoices
set record_source = case when import_batch_id is null then 'operational' else 'historical_import' end
where record_source is null;
update public.purchase_items
set record_source = case when import_batch_id is null then 'operational' else 'historical_import' end
where record_source is null;
update public.assets
set record_source = case when import_batch_id is null then 'operational' else 'historical_import' end
where record_source is null;
update public.tax_entries
set record_source = case when import_batch_id is null then 'operational' else 'historical_import' end
where record_source is null;
update public.owner_distributions
set record_source = case when import_batch_id is null then 'operational' else 'historical_import' end
where record_source is null;

-- Pre-existing legacy CRUD rows have no reliable provenance marker. They are
-- retained but are not silently promoted into canonical financial statements.
update public.sales set record_source = 'legacy_unclassified' where record_source is null;
update public.expenses set record_source = 'legacy_unclassified' where record_source is null;

alter table public.purchase_invoices alter column record_source set default 'operational';
alter table public.purchase_items alter column record_source set default 'operational';
alter table public.assets alter column record_source set default 'operational';
alter table public.tax_entries alter column record_source set default 'operational';
alter table public.owner_distributions alter column record_source set default 'operational';
alter table public.sales alter column record_source set default 'operational';
alter table public.expenses alter column record_source set default 'operational';

alter table public.purchase_invoices alter column record_source set not null;
alter table public.purchase_items alter column record_source set not null;
alter table public.assets alter column record_source set not null;
alter table public.tax_entries alter column record_source set not null;
alter table public.owner_distributions alter column record_source set not null;
alter table public.sales alter column record_source set not null;
alter table public.expenses alter column record_source set not null;

do $constraints$
declare
  v_table text;
begin
  foreach v_table in array array[
    'purchase_invoices', 'purchase_items', 'assets', 'tax_entries',
    'owner_distributions', 'sales', 'expenses'
  ] loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      v_table,
      v_table || '_record_source_check'
    );
    execute format(
      'alter table public.%I add constraint %I check
       (record_source in (''historical_import'', ''operational'', ''adjustment'', ''legacy_unclassified''))',
      v_table,
      v_table || '_record_source_check'
    );
  end loop;
end;
$constraints$;

alter table public.purchase_invoices alter column import_batch_id drop not null;
alter table public.purchase_items alter column import_batch_id drop not null;

alter table public.purchase_invoices
  add column if not exists reference_source_id uuid
    references public.purchase_invoices(id) on delete restrict,
  add column if not exists correction_reason text;
alter table public.purchase_items
  add column if not exists reference_source_id uuid
    references public.purchase_items(id) on delete restrict,
  add column if not exists correction_reason text;
alter table public.assets
  add column if not exists reference_source_id uuid
    references public.assets(id) on delete restrict,
  add column if not exists correction_reason text;

alter table public.purchase_invoices
  add constraint purchase_invoices_source_consistency check (
    (record_source = 'historical_import' and import_batch_id is not null)
    or (record_source in ('operational', 'legacy_unclassified') and import_batch_id is null)
    or (record_source = 'adjustment' and reference_source_id is not null and correction_reason is not null)
  ) not valid;
alter table public.purchase_items
  add constraint purchase_items_source_consistency check (
    (record_source = 'historical_import' and import_batch_id is not null)
    or (record_source in ('operational', 'legacy_unclassified') and import_batch_id is null)
    or (record_source = 'adjustment' and reference_source_id is not null and correction_reason is not null)
  ) not valid;

create unique index if not exists purchase_invoices_operational_source_uidx
  on public.purchase_invoices(invoice_source_key)
  where import_batch_id is null;
create unique index if not exists purchase_items_operational_source_uidx
  on public.purchase_items(line_source_key)
  where import_batch_id is null;

create table if not exists public.business_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  actor_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists business_audit_log_entity_idx
  on public.business_audit_log(entity_type, entity_id, occurred_at desc);

-- The previous view used an inner join to import batches and a composite
-- batch/item join, which both hid operational invoices with NULL batch IDs.
create or replace view public.v_purchase_invoice_index
with (security_invoker = true)
as
select
  inv.id, inv.import_batch_id, inv.invoice_source_key, inv.purchase_date,
  inv.supplier_id, inv.supplier_name_raw, inv.receipt_reference,
  inv.data_origin, inv.status, inv.notes, inv.created_at, inv.deleted_at,
  case when inv.deleted_at is not null then 'deleted' else inv.status end as record_state,
  case when supplier.id is null then null else jsonb_build_object(
    'id', supplier.id, 'supplier_name', supplier.supplier_name
  ) end as supplier,
  case when batch.id is null then null else jsonb_build_object(
    'batch_key', batch.batch_key, 'description', batch.description
  ) end as import_batch,
  count(item.id)::integer as item_count,
  coalesce(sum(item.amount), 0)::numeric(18,2) as invoice_total,
  coalesce(bool_or(item.financial_class = 'hpp'), false) as has_hpp,
  coalesce(bool_or(item.financial_class = 'operating_expense'), false) as has_operating_expense,
  coalesce(bool_or(item.financial_class = 'asset'), false) as has_asset,
  coalesce(bool_or(item.financial_class = 'other'), false) as has_other,
  lower(concat_ws(' ', inv.invoice_source_key, inv.receipt_reference,
    inv.supplier_name_raw, supplier.supplier_name,
    string_agg(item.item_name_raw, ' ' order by item.id))) as search_text,
  coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id, 'line_source_key', item.line_source_key,
    'item_name_raw', item.item_name_raw,
    'item_name_normalized', item.item_name_normalized,
    'quantity', item.quantity, 'unit', item.unit, 'unit_price', item.unit_price,
    'amount', item.amount, 'calculated_total', item.calculated_total,
    'amount_difference', item.amount_difference,
    'source_category', item.source_category,
    'financial_class', item.financial_class,
    'classification_policy', item.classification_policy,
    'asset_tracking', item.asset_tracking, 'data_origin', item.data_origin,
    'deleted_at', item.deleted_at
  ) order by item.source_row nulls last, item.created_at, item.id)
    filter (where item.id is not null), '[]'::jsonb) as purchase_items,
  inv.record_source
from public.purchase_invoices inv
left join public.data_import_batches batch on batch.id = inv.import_batch_id
left join public.suppliers supplier on supplier.id = inv.supplier_id
left join public.purchase_items item
  on item.purchase_invoice_id = inv.id and item.deleted_at is null
group by inv.id, batch.id, supplier.id;

create table if not exists public.asset_accounting_policies (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null,
  capitalization_threshold numeric(18,2) not null check (capitalization_threshold >= 0),
  default_depreciation_method text not null default 'straight_line'
    check (default_depreciation_method = 'straight_line'),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists asset_accounting_policies_effective_uidx
  on public.asset_accounting_policies(effective_from)
  where deleted_at is null;

insert into public.asset_accounting_policies (
  effective_from, capitalization_threshold, default_depreciation_method,
  notes, is_active
)
select date '2026-01-01', 1000000, 'straight_line',
       'Initial effective-dated policy migrated from the June foundation.', true
where not exists (
  select 1 from public.asset_accounting_policies where deleted_at is null
);

alter table public.assets
  add column if not exists accounting_policy_id uuid
    references public.asset_accounting_policies(id) on delete restrict;

update public.assets a
set accounting_policy_id = (
  select policy.id
  from public.asset_accounting_policies policy
  where policy.effective_from <= a.acquisition_date
    and policy.deleted_at is null
  order by policy.effective_from desc
  limit 1
)
where a.accounting_policy_id is null;

-- Canonical dynamic statement. Historical aggregate days are authoritative;
-- website sales on the same dates are excluded. Purchase, tax, distribution,
-- and depreciation rows include both imported and operational sources.
create or replace function public.get_financial_statement_range(
  p_start_date date,
  p_end_date date
)
returns table (
  period_start date,
  period_end date,
  revenue numeric,
  hpp numeric,
  gross_profit numeric,
  operating_expense numeric,
  ebitda numeric,
  depreciation numeric,
  ebit_operating_profit numeric,
  tax_amount numeric,
  tax_recorded boolean,
  net_income_provisional_before_tax numeric,
  net_income_final numeric,
  dividend_amount numeric,
  dividend_recorded boolean,
  retained_earnings_final numeric,
  statement_status text,
  source_record_count bigint,
  historical_batch_ids uuid[]
)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin or Super Admin access is required.' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'A valid report range is required.' using errcode = '22023';
  end if;

  return query
  with historical_days as (
    select distinct s.sale_date
    from public.daily_sales_summaries s
    where s.sale_date between p_start_date and p_end_date
  ),
  revenue_values as (
    select coalesce(sum(s.total_sales), 0)::numeric as amount
    from public.daily_sales_summaries s
    where s.sale_date between p_start_date and p_end_date
    union all
    select coalesce(sum(s.amount), 0)::numeric
    from public.sales s
    where s.transaction_date between p_start_date and p_end_date
      and s.deleted_at is null
      and s.record_source = 'operational'
      and not exists (select 1 from historical_days d where d.sale_date = s.transaction_date)
  ),
  purchase_values as (
    select
      coalesce(sum(i.amount) filter (where i.financial_class = 'hpp'), 0)::numeric as hpp,
      coalesce(sum(i.amount) filter (where i.financial_class = 'operating_expense'), 0)::numeric as opex
    from public.purchase_items i
    join public.purchase_invoices inv on inv.id = i.purchase_invoice_id
    where inv.purchase_date between p_start_date and p_end_date
      and inv.status = 'recorded' and inv.deleted_at is null and i.deleted_at is null
      and i.record_source <> 'legacy_unclassified'
  ),
  other_expenses as (
    select coalesce(sum(e.amount), 0)::numeric as amount
    from public.expenses e
    where e.transaction_date between p_start_date and p_end_date
      and e.deleted_at is null and e.record_source = 'operational'
  ),
  depreciation_values as (
    select coalesce(sum(d.depreciation_amount), 0)::numeric as amount
    from public.asset_depreciation_entries d
    join public.assets a on a.id = d.asset_id
    where d.period_month between date_trunc('month', p_start_date)::date
      and date_trunc('month', p_end_date)::date
      and d.status = 'posted' and a.deleted_at is null
  ),
  tax_values as (
    select coalesce(sum(t.amount), 0)::numeric as amount, count(*) > 0 as recorded
    from public.tax_entries t
    where t.period_start <= p_end_date and t.period_end >= p_start_date
      and t.deleted_at is null and t.status in ('recorded', 'paid')
  ),
  dividend_values as (
    select coalesce(sum(d.amount), 0)::numeric as amount, count(*) > 0 as recorded
    from public.owner_distributions d
    where d.distribution_date between p_start_date and p_end_date
      and d.deleted_at is null and d.status in ('recorded', 'paid')
  ),
  totals as (
    select
      (select sum(amount) from revenue_values)::numeric as revenue,
      p.hpp, (p.opex + e.amount)::numeric as opex, dep.amount as depreciation,
      t.amount as tax, t.recorded as tax_recorded,
      div.amount as dividend, div.recorded as dividend_recorded
    from purchase_values p cross join other_expenses e cross join depreciation_values dep
    cross join tax_values t cross join dividend_values div
  )
  select p_start_date, p_end_date, x.revenue, x.hpp,
    (x.revenue - x.hpp)::numeric,
    x.opex, (x.revenue - x.hpp - x.opex)::numeric,
    x.depreciation, (x.revenue - x.hpp - x.opex - x.depreciation)::numeric,
    case when x.tax_recorded then x.tax else null end,
    x.tax_recorded,
    (x.revenue - x.hpp - x.opex - x.depreciation)::numeric,
    case when x.tax_recorded then x.revenue - x.hpp - x.opex - x.depreciation - x.tax else null end,
    case when x.dividend_recorded then x.dividend else null end,
    x.dividend_recorded,
    case when x.tax_recorded and x.dividend_recorded
      then x.revenue - x.hpp - x.opex - x.depreciation - x.tax - x.dividend else null end,
    case when not x.tax_recorded then 'provisional_before_tax'
      when not x.dividend_recorded then 'net_income_final_dividend_not_supplied'
      else 'final' end,
    (
      (select count(*) from public.daily_sales_summaries s where s.sale_date between p_start_date and p_end_date)
      + (select count(*) from public.sales s where s.transaction_date between p_start_date and p_end_date
          and s.deleted_at is null and s.record_source = 'operational')
      + (select count(*) from public.purchase_invoices inv where inv.purchase_date between p_start_date and p_end_date
          and inv.deleted_at is null and inv.status = 'recorded')
      + (select count(*) from public.expenses e where e.transaction_date between p_start_date and p_end_date
          and e.deleted_at is null and e.record_source = 'operational')
      + (select count(*) from public.tax_entries t where t.period_start <= p_end_date and t.period_end >= p_start_date
          and t.deleted_at is null and t.status in ('recorded','paid'))
      + (select count(*) from public.owner_distributions d where d.distribution_date between p_start_date and p_end_date
          and d.deleted_at is null and d.status in ('recorded','paid'))
    )::bigint,
    coalesce((select array_agg(distinct import_batch_id)
      from public.daily_sales_summaries where sale_date between p_start_date and p_end_date), array[]::uuid[])
  from totals x;
end;
$function$;

create or replace function public.get_purchase_breakdown_range(
  p_start_date date,
  p_end_date date,
  p_financial_classes text[] default array['hpp','operating_expense']
)
returns table (item_name text, financial_class text, amount numeric, line_count bigint)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin or Super Admin access is required.' using errcode = '42501';
  end if;
  return query
  select coalesce(nullif(i.item_name_normalized, ''), 'Item tanpa nama'),
         i.financial_class, sum(i.amount)::numeric, count(*)::bigint
  from public.purchase_items i
  join public.purchase_invoices inv on inv.id = i.purchase_invoice_id
  where inv.purchase_date between p_start_date and p_end_date
    and inv.status = 'recorded' and inv.deleted_at is null and i.deleted_at is null
    and i.financial_class = any(p_financial_classes)
    and i.record_source <> 'legacy_unclassified'
  group by 1, 2 order by 3 desc, 1;
end;
$function$;

create or replace function public.save_operational_purchase_invoice(
  p_purchase_date date,
  p_items jsonb,
  p_invoice_id uuid default null,
  p_supplier_id uuid default null,
  p_supplier_name_raw text default null,
  p_receipt_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_invoice_id uuid := coalesce(p_invoice_id, gen_random_uuid());
  v_before jsonb;
  v_item jsonb;
  v_index integer := 0;
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin or Super Admin access is required.' using errcode = '42501';
  end if;
  if p_purchase_date is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Purchase date and at least one item are required.' using errcode = '22023';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id and s.deleted_at is null and s.is_active
  ) then
    raise exception 'The selected supplier is unavailable.' using errcode = '23503';
  end if;

  if p_invoice_id is null then
    insert into public.purchase_invoices (
      id, import_batch_id, invoice_source_key, purchase_date, supplier_id,
      supplier_name_raw, receipt_reference, source_file, source_sheet,
      data_origin, record_source, status, notes, created_by, updated_by
    ) values (
      v_invoice_id, null, 'INV-WEB-' || v_invoice_id::text, p_purchase_date,
      p_supplier_id, nullif(btrim(p_supplier_name_raw), ''),
      nullif(btrim(p_receipt_reference), ''), 'website', 'data_pembelian',
      'actual', 'operational', 'recorded', nullif(btrim(p_notes), ''), v_actor, v_actor
    );
  else
    select to_jsonb(inv) into v_before
    from public.purchase_invoices inv where inv.id = p_invoice_id for update;
    if v_before is null then
      raise exception 'Purchase invoice not found.' using errcode = 'P0002';
    end if;
    if (v_before ->> 'record_source') <> 'operational' then
      raise exception 'Historical purchases must use the correction workflow.' using errcode = '23514';
    end if;
    update public.purchase_invoices set
      purchase_date = p_purchase_date, supplier_id = p_supplier_id,
      supplier_name_raw = nullif(btrim(p_supplier_name_raw), ''),
      receipt_reference = nullif(btrim(p_receipt_reference), ''),
      notes = nullif(btrim(p_notes), ''), updated_by = v_actor
    where id = p_invoice_id;
    delete from public.purchase_items
    where purchase_invoice_id = p_invoice_id and record_source = 'operational';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_index := v_index + 1;
    if coalesce((v_item ->> 'quantity')::numeric, 0) <= 0
      or coalesce((v_item ->> 'unit_price')::numeric, -1) < 0
      or v_item ->> 'financial_class' not in ('hpp','operating_expense','asset','other') then
      raise exception 'Invalid purchase item at row %.', v_index using errcode = '22023';
    end if;
    insert into public.purchase_items (
      import_batch_id, purchase_invoice_id, line_source_key, item_name_raw,
      item_name_normalized, quantity, unit, unit_price, amount,
      calculated_total, amount_difference, source_category, financial_class,
      classification_policy, asset_tracking, source_file, source_sheet,
      source_row, data_origin, record_source, created_by, updated_by
    ) values (
      null, v_invoice_id, 'LINE-WEB-' || gen_random_uuid()::text,
      btrim(v_item ->> 'item_name'), lower(btrim(v_item ->> 'item_name')),
      (v_item ->> 'quantity')::numeric, nullif(btrim(v_item ->> 'unit'), ''),
      (v_item ->> 'unit_price')::numeric,
      round((v_item ->> 'quantity')::numeric * (v_item ->> 'unit_price')::numeric, 2),
      round((v_item ->> 'quantity')::numeric * (v_item ->> 'unit_price')::numeric, 2),
      0, nullif(btrim(v_item ->> 'source_category'), ''),
      v_item ->> 'financial_class', 'manual_web_entry',
      (v_item ->> 'financial_class') = 'asset', 'website', 'data_pembelian',
      v_index, 'actual', 'operational', v_actor, v_actor
    );
  end loop;

  insert into public.business_audit_log (
    entity_type, entity_id, operation, before_data, after_data, actor_id
  )
  select 'purchase_invoice', v_invoice_id,
    case when p_invoice_id is null then 'create' else 'update' end,
    v_before, to_jsonb(inv), v_actor
  from public.purchase_invoices inv where inv.id = v_invoice_id;

  return v_invoice_id;
end;
$function$;

revoke all on function public.get_financial_statement_range(date,date) from public, anon;
grant execute on function public.get_financial_statement_range(date,date) to authenticated, service_role;
revoke all on function public.get_purchase_breakdown_range(date,date,text[]) from public, anon;
grant execute on function public.get_purchase_breakdown_range(date,date,text[]) to authenticated, service_role;
revoke all on function public.save_operational_purchase_invoice(date,jsonb,uuid,uuid,text,text,text)
  from public, anon;
grant execute on function public.save_operational_purchase_invoice(date,jsonb,uuid,uuid,text,text,text)
  to authenticated, service_role;

alter table public.business_audit_log enable row level security;
alter table public.asset_accounting_policies enable row level security;

create policy business_audit_log_admin_read on public.business_audit_log
for select to authenticated using (public.lm_is_active_admin());
create policy asset_accounting_policies_admin_read on public.asset_accounting_policies
for select to authenticated using (public.lm_is_active_admin());
create policy asset_accounting_policies_super_admin_write on public.asset_accounting_policies
for all to authenticated using (public.lm_is_active_super_admin())
with check (public.lm_is_active_super_admin());

grant select on public.business_audit_log, public.asset_accounting_policies to authenticated;
grant insert on public.business_audit_log to authenticated;
grant insert, update, delete on public.asset_accounting_policies to authenticated;

comment on function public.get_financial_statement_range(date,date) is
  'Canonical dynamic financial statement combining historical import, operational records, and valid adjustments.';

commit;
