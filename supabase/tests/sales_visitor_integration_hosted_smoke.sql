-- SALES + VISITOR INTEGRATION HOSTED SMOKE
-- Target: baukcqccetzzwzgpbnoj
-- Run manually in the hosted SQL editor after reviewing the selected profile
-- and product below. The entire test is rolled back; no test rows remain.
-- Sequence values may advance, as PostgreSQL sequences are non-transactional.

begin;

create temporary table sv_smoke_context (
  actor_id uuid,
  outlet_id uuid,
  product_id uuid,
  visit_id uuid,
  second_visit_id uuid,
  archived_visit_id uuid,
  first_sale_id uuid,
  second_sale_id uuid,
  inline_sale_id uuid
) on commit drop;

insert into sv_smoke_context(actor_id, outlet_id, product_id)
select
  p.id,
  o.id,
  (
    select pr.id
    from public.products pr
    join public.sales_categories sc on sc.id = pr.sales_category_id
    join public.business_subunits bs on bs.id = sc.subunit_id
    where pr.is_active and pr.deleted_at is null
      and sc.is_active and bs.is_active and bs.outlet_id = o.id
    order by pr.created_at
    limit 1
  )
from public.profiles p
cross join lateral (
  select id from public.outlets
  where is_active and deleted_at is null
  order by is_default desc, created_at
  limit 1
) o
where p.role = 'super_admin' and p.is_active
limit 1;

do $$
begin
  if not exists (
    select 1 from sv_smoke_context
    where actor_id is not null and outlet_id is not null and product_id is not null
  ) then
    raise exception 'SMOKE SETUP FAILED: active Super Admin, Outlet, or Product is unavailable.';
  end if;
end;
$$;

grant select, update on sv_smoke_context to authenticated;
select set_config('request.jwt.claim.sub', (select actor_id::text from sv_smoke_context), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- 1. Visit without Sale.
update sv_smoke_context
set visit_id = public.create_operational_visitor_visit(
  (clock_timestamp() at time zone 'Asia/Jakarta')::date,
  2,
  1,
  null,
  'CODEX-SV-SMOKE existing visit',
  outlet_id
);

-- 2. First Sale links to an existing Visit.
with created as (
  select public.create_sales_transaction_with_visit(
    (clock_timestamp() at time zone 'Asia/Jakarta')::date,
    jsonb_build_array(jsonb_build_object(
      'product_id', product_id,
      'quantity', 1,
      'unit_price', 1,
      'notes', 'CODEX-SV-SMOKE'
    )),
    'CODEX-SV-SMOKE first linked sale',
    'manual',
    outlet_id,
    visit_id,
    null
  ) result
  from sv_smoke_context
)
update sv_smoke_context c
set first_sale_id = (created.result->>'sales_transaction_id')::uuid
from created;

-- 3. A second Sale links to the same Visit (one-to-many).
with created as (
  select public.create_sales_transaction_with_visit(
    (clock_timestamp() at time zone 'Asia/Jakarta')::date,
    jsonb_build_array(jsonb_build_object(
      'product_id', product_id, 'quantity', 1, 'unit_price', 1, 'notes', null
    )),
    'CODEX-SV-SMOKE second linked sale', 'manual', outlet_id, visit_id, null
  ) result
  from sv_smoke_context
)
update sv_smoke_context c
set second_sale_id = (created.result->>'sales_transaction_id')::uuid
from created;

-- 4. Inline Visit + Sale creation is atomic.
with created as (
  select public.create_sales_transaction_with_visit(
    (clock_timestamp() at time zone 'Asia/Jakarta')::date,
    jsonb_build_array(jsonb_build_object(
      'product_id', product_id, 'quantity', 1, 'unit_price', 1, 'notes', null
    )),
    'CODEX-SV-SMOKE inline visit', 'manual', outlet_id, null,
    jsonb_build_object('visitor_id', null, 'adult_count', 1, 'child_count', 0,
      'notes', 'CODEX-SV-SMOKE inline visit')
  ) result
  from sv_smoke_context
)
update sv_smoke_context c
set inline_sale_id = (created.result->>'sales_transaction_id')::uuid,
    second_visit_id = (created.result->>'visitor_visit_id')::uuid
from created;

-- 5. Update keeps the authoritative Stage 5 path and the Visit link.
select public.update_sales_transaction_with_visit(
  first_sale_id,
  (clock_timestamp() at time zone 'Asia/Jakarta')::date,
  jsonb_build_array(jsonb_build_object(
    'product_id', product_id, 'quantity', 1, 'unit_price', 1, 'notes', 'updated'
  )),
  'CODEX-SV-SMOKE updated',
  visit_id,
  null
)
from sv_smoke_context;

reset role;

do $$
declare
  c sv_smoke_context%rowtype;
  v_total numeric;
begin
  select * into c from sv_smoke_context;
  if (select count(*) from public.sales_transactions where visitor_visit_id = c.visit_id) <> 2 then
    raise exception 'MULTIPLE SALES FAILED';
  end if;
  select sum(total_amount) into v_total from public.sales_transactions
  where visitor_visit_id = c.visit_id and deleted_at is null;
  if v_total is distinct from (
    select sum(total_amount) from public.sales_transactions
    where id in (c.first_sale_id, c.second_sale_id) and deleted_at is null
  ) then raise exception 'DERIVED TOTAL FAILED'; end if;
  if not exists (
    select 1 from public.sales_transactions
    where id = c.inline_sale_id and visitor_visit_id = c.second_visit_id
  ) then raise exception 'INLINE VISIT FAILED'; end if;
end;
$$;

set local role authenticated;

-- 6. Archive/restore excludes and re-includes the header total exactly once.
select public.soft_delete_sales_transaction(first_sale_id) from sv_smoke_context;
select public.restore_sales_transaction(first_sale_id) from sv_smoke_context;

-- 7. Detach leaves both domain records intact.
select public.update_sales_transaction_with_visit(
  second_sale_id,
  (clock_timestamp() at time zone 'Asia/Jakarta')::date,
  jsonb_build_array(jsonb_build_object(
    'product_id', product_id, 'quantity', 1, 'unit_price', 1, 'notes', null
  )),
  'CODEX-SV-SMOKE detached', null, null
)
from sv_smoke_context;

-- 8. Invalid counts must be rejected.
do $$
begin
  begin
    perform public.create_operational_visitor_visit(
      (clock_timestamp() at time zone 'Asia/Jakarta')::date, 0, 0, null,
      'CODEX-SV-SMOKE invalid', (select outlet_id from sv_smoke_context)
    );
    raise exception 'INVALID COUNTS WERE ACCEPTED';
  exception when check_violation then null;
  end;
end;
$$;

-- 9. Existing and new Visit inputs are mutually exclusive.
do $$
begin
  begin
    perform public.create_sales_transaction_with_visit(
      (clock_timestamp() at time zone 'Asia/Jakarta')::date,
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from sv_smoke_context),
        'quantity', 1, 'unit_price', 1
      )), 'CODEX-SV-SMOKE invalid exclusive', 'manual',
      (select outlet_id from sv_smoke_context),
      (select visit_id from sv_smoke_context),
      jsonb_build_object('adult_count', 1, 'child_count', 0)
    );
    raise exception 'MUTUALLY EXCLUSIVE INPUT WAS ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- 10. Date mismatch is rejected by the database trigger.
do $$
begin
  begin
    perform public.create_sales_transaction_with_visit(
      ((clock_timestamp() at time zone 'Asia/Jakarta')::date - 1),
      jsonb_build_array(jsonb_build_object(
        'product_id', (select product_id from sv_smoke_context),
        'quantity', 1, 'unit_price', 1
      )), 'CODEX-SV-SMOKE invalid date', 'manual',
      (select outlet_id from sv_smoke_context), (select visit_id from sv_smoke_context), null
    );
    raise exception 'DATE MISMATCH WAS ACCEPTED';
  exception when check_violation then null;
  end;
end;
$$;

-- 11. Visit archive is rejected while an active Sale is linked.
do $$
begin
  begin
    perform public.soft_delete_visitor_visit((select visit_id from sv_smoke_context));
    raise exception 'LINKED VISIT ARCHIVE WAS ACCEPTED';
  exception when foreign_key_violation then null;
  end;
end;
$$;

reset role;

-- 12. Raw writes and legacy purchase RPC execution remain closed.
do $$
begin
  if has_table_privilege('authenticated', 'public.sales_transactions', 'INSERT')
     or has_table_privilege('authenticated', 'public.sales_transactions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.visitor_visits', 'INSERT')
     or has_table_privilege('authenticated', 'public.sales', 'INSERT') then
    raise exception 'RAW WRITE REJECTION FAILED';
  end if;
  if has_function_privilege('authenticated',
       'public.record_visitor_purchase(jsonb,uuid,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.add_visitor_purchase(uuid,jsonb)', 'EXECUTE') then
    raise exception 'LEGACY WRITE RESTRICTION FAILED';
  end if;
end;
$$;

-- 13. Legacy rows and reporting cutover remain untouched.
select
  (select count(*) from public.sales) as legacy_sales_rows_preserved,
  (select count(*) from public.visitor_visits where record_source = 'legacy_manual')
    as legacy_visits_preserved,
  (select operational_reporting_start_date from public.outlet_reporting_configs
   where outlet_id = (select outlet_id from sv_smoke_context)) as reporting_cutover,
  (select count(*) from public.sales_transactions
   where visitor_visit_id = (select visit_id from sv_smoke_context)) as linked_sales_count,
  'PASS - transaction will now roll back' as smoke_status;

rollback;
