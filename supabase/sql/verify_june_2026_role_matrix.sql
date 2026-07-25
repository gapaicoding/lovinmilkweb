\set ON_ERROR_STOP on

begin;

set local role postgres;

do $preflight$
begin
  if (
    select count(*)
    from public.profiles
    where is_active = true
      and role::text = 'staff'
  ) < 1 then
    raise exception 'Role-matrix verification requires one active Staff account.';
  end if;

  if (
    select count(*)
    from public.profiles
    where is_active = true
      and role::text = 'admin'
  ) < 1 then
    raise exception 'Role-matrix verification requires one active Admin account.';
  end if;

  if (
    select count(*)
    from public.profiles
    where is_active = true
      and role::text = 'super_admin'
  ) < 1 then
    raise exception 'Role-matrix verification requires one active Super Admin account.';
  end if;

  if has_table_privilege('anon', 'public.daily_sales_summaries', 'SELECT')
    or has_table_privilege('anon', 'public.purchase_items', 'SELECT')
    or has_table_privilege('anon', 'public.assets', 'SELECT')
  then
    raise exception 'Anonymous table access must remain revoked.';
  end if;
end;
$preflight$;

select id::text as staff_id
from public.profiles
where is_active = true
  and role::text = 'staff'
order by created_at, id
limit 1
\gset

select id::text as admin_id
from public.profiles
where is_active = true
  and role::text = 'admin'
order by created_at, id
limit 1
\gset

select id::text as super_admin_id
from public.profiles
where is_active = true
  and role::text = 'super_admin'
order by created_at, id
limit 1
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub', :'staff_id', true) as configured
\gset

do $staff_matrix$
declare
  v_dashboard record;
begin
  if not public.lm_is_active_staff_or_above()
    or public.lm_is_active_admin()
    or public.lm_is_active_super_admin()
  then
    raise exception 'Staff role helper matrix failed.';
  end if;

  if (
    select count(*)
    from public.daily_sales_summaries
    where sale_date between date '2026-06-01' and date '2026-06-30'
  ) <> 30 then
    raise exception 'Staff cannot read the approved operational daily-sales aggregate.';
  end if;

  if (select count(*) from public.data_import_batches) <> 0
    or (select count(*) from public.purchase_items) <> 0
    or (select count(*) from public.assets) <> 0
    or (select count(*) from public.v_financial_statement_monthly) <> 0
    or (select count(*) from public.v_asset_book_values) <> 0
  then
    raise exception 'Staff can see financial, asset, or import-governance detail.';
  end if;

  select *
  into v_dashboard
  from public.get_operational_dashboard_month(
    date '2026-06-01',
    'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2'
  );

  if v_dashboard.revenue <> 30011000
    or v_dashboard.bill_count <> 342
    or v_dashboard.visitors <> 827
    or v_dashboard.product_quantity <> 1358
    or v_dashboard.source_days <> 30
  then
    raise exception 'Staff operational dashboard aggregate is incorrect.';
  end if;
end;
$staff_matrix$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true) as configured
\gset

do $admin_matrix$
begin
  if not public.lm_is_active_staff_or_above()
    or not public.lm_is_active_admin()
    or public.lm_is_active_super_admin()
  then
    raise exception 'Admin role helper matrix failed.';
  end if;

  if (select count(*) from public.purchase_invoices where deleted_at is null) <> 343
    or (select count(*) from public.purchase_items where deleted_at is null) <> 344
    or (select count(*) from public.assets where deleted_at is null) <> 21
    or (
      select count(*)
      from public.v_financial_statement_monthly
      where batch_key = 'LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2'
        and month_start = date '2026-06-01'
    ) <> 1
  then
    raise exception 'Admin financial visibility matrix failed.';
  end if;
end;
$admin_matrix$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'super_admin_id', true) as configured
\gset

do $super_admin_matrix$
begin
  if not public.lm_is_active_staff_or_above()
    or not public.lm_is_active_admin()
    or not public.lm_is_active_super_admin()
  then
    raise exception 'Super Admin role helper matrix failed.';
  end if;

  if (select count(*) from public.suppliers where deleted_at is null) <> 9
    or (select count(*) from public.purchase_items where deleted_at is null) <> 344
    or (select count(*) from public.v_asset_book_values) <> 21
  then
    raise exception 'Super Admin financial visibility matrix failed.';
  end if;
end;
$super_admin_matrix$;

reset role;
rollback;

\echo 'June 2026 Staff/Admin/Super Admin RLS matrix passed without exposing account identifiers.'
