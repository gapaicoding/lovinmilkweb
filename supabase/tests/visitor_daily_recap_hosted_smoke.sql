do $$ begin
 if to_regclass('public.visitor_daily_recaps') is null then raise exception 'visitor_daily_recaps missing'; end if;
 if to_regprocedure('public.create_or_append_visitor_daily_recap(date,uuid,text,jsonb)') is null then raise exception 'bulk RPC missing'; end if;
 if to_regprocedure('public.get_visitor_daily_recap_period(uuid,date,date)') is null then raise exception 'period RPC missing'; end if;
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='uq_visitor_daily_recaps_active_day') then raise exception 'daily unique index missing'; end if;
 if has_table_privilege('authenticated','public.visitor_daily_recaps','INSERT') then raise exception 'direct writes enabled'; end if;
 if has_function_privilege('anon','public.create_or_append_visitor_daily_recap(date,uuid,text,jsonb)','EXECUTE') then raise exception 'anon execute enabled'; end if;
end $$;
