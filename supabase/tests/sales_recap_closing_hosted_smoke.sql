-- Run after 20260814193000_sales_recap_closing.sql is applied.
begin;

do $smoke$
begin
  if to_regclass('public.sales_daily_closings') is null
     or to_regclass('public.sales_daily_revisions') is null then
    raise exception 'Sales recap closing tables are missing.';
  end if;

  if to_regprocedure('public.get_sales_recap_daily(uuid,date,date)') is null
     or to_regprocedure('public.upsert_sales_daily_closing(uuid,date,jsonb)') is null
     or to_regprocedure('public.upsert_sales_daily_cash_closing(uuid,date,jsonb)') is null
     or to_regprocedure('public.validate_sales_daily_closing(uuid,date,bigint)') is null
     or to_regprocedure('public.validate_cash_daily_closing(uuid,date,bigint)') is null then
    raise exception 'Sales recap RPC surface is incomplete.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.sales_transactions'::regclass
      and tgname='track_sales_transaction_daily_revision' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid='public.sales_items'::regclass
      and tgname='track_sales_item_daily_revision' and not tgisinternal
  ) then
    raise exception 'Sales recap revision triggers are missing.';
  end if;

  if has_table_privilege('authenticated','public.sales_daily_closings','INSERT')
     or has_table_privilege('authenticated','public.sales_daily_closings','UPDATE')
     or has_table_privilege('authenticated','public.sales_daily_revisions','UPDATE') then
    raise exception 'Authenticated has unsafe direct write privileges.';
  end if;

  if not has_function_privilege('authenticated','public.get_sales_recap_daily(uuid,date,date)','EXECUTE')
     or not has_function_privilege('authenticated','public.upsert_sales_daily_closing(uuid,date,jsonb)','EXECUTE') then
    raise exception 'Authenticated is missing required recap RPC privileges.';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.upsert_sales_daily_cash_closing(uuid,date,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated is missing Cash-only save RPC privilege.';
  end if;
end;
$smoke$;

rollback;
