-- Stage 6 hosted accounting and role smoke suite.
-- Paste this complete file into the hosted Supabase SQL Editor and run it in
-- one session. It needs an active Staff, Admin, and Super Admin profile.
-- All STAGE6-SMOKE rows are created inside a subtransaction that is forced to
-- roll back before the pgTAP cleanup assertions run.
-- Precondition: pgTAP must already be enabled in schema "extensions".
-- This suite performs no persistent DDL or other non-rollback setup.

do $precondition$
begin
  if to_regnamespace('extensions') is null
     or not exists (
       select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'extensions' and p.proname = 'plan'
     )
     or not exists (
       select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'extensions' and p.proname = 'ok'
     )
     or not exists (
       select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'extensions' and p.proname = 'is'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'Stage 6 smoke precondition failed: enable pgTAP in schema extensions first.';
  end if;
end;
$precondition$;

set search_path = public, extensions, pg_temp;

create or replace function pg_temp.run_stage6_smoke()
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_marker constant text := 'STAGE6-SMOKE-20260731-FINAL';
  v_admin uuid;
  v_staff uuid;
  v_super uuid;
  v_outlet_a uuid := gen_random_uuid();
  v_outlet_b uuid := gen_random_uuid();
  v_subunit_a1 uuid := gen_random_uuid();
  v_subunit_a2 uuid := gen_random_uuid();
  v_subunit_b1 uuid := gen_random_uuid();
  v_inactive_subunit uuid := gen_random_uuid();
  v_category uuid := gen_random_uuid();
  v_inactive_category uuid := gen_random_uuid();
  v_basic uuid;
  v_residual uuid;
  v_rounding uuid;
  v_edge uuid;
  v_admin_asset uuid;
  v_legacy_count bigint;
  v_count bigint;
  v_amount numeric;
  v_book numeric;
  v_subunit_a1_amount numeric;
  v_subunit_a2_amount numeric;
  v_outlet_amount numeric;
  v_failed boolean;
  v_state text;
  v_message text;
  v_result jsonb := '{}'::jsonb;
begin
  select count(*)
  into v_legacy_count
  from public.assets
  where record_source = 'historical_import';

  select id into strict v_admin
  from public.profiles
  where role = 'admin' and is_active
  order by created_at
  limit 1;

  select id into strict v_staff
  from public.profiles
  where role = 'staff' and is_active
  order by created_at
  limit 1;

  select id into strict v_super
  from public.profiles
  where role = 'super_admin' and is_active
  order by created_at
  limit 1;

  begin
    -- Fixture setup deliberately runs as the SQL Editor session owner. These
    -- rows are not part of the Admin authorization test and remain inside the
    -- rollback-safe subtransaction.
    insert into public.outlets (
      id, code, name, timezone, is_default, is_active, created_by, updated_by
    ) values
      (
        v_outlet_a, v_marker || '-OUTLET-A', v_marker || ' Outlet A',
        'Asia/Jakarta', false, true, v_admin, v_admin
      ),
      (
        v_outlet_b, v_marker || '-OUTLET-B', v_marker || ' Outlet B',
        'Asia/Jakarta', false, true, v_admin, v_admin
      );

    insert into public.business_subunits (
      id, outlet_id, code, name, description, inventory_enabled, is_active,
      created_by, updated_by
    ) values
      (
        v_subunit_a1, v_outlet_a, v_marker || '-SUB-A1',
        v_marker || ' Subunit A1', v_marker, false, true, v_admin, v_admin
      ),
      (
        v_subunit_a2, v_outlet_a, v_marker || '-SUB-A2',
        v_marker || ' Subunit A2', v_marker, false, true, v_admin, v_admin
      ),
      (
        v_subunit_b1, v_outlet_b, v_marker || '-SUB-B1',
        v_marker || ' Subunit B1', v_marker, false, true, v_admin, v_admin
      ),
      (
        v_inactive_subunit, v_outlet_a, v_marker || '-SUB-INACTIVE',
        v_marker || ' Inactive Subunit', v_marker, false, false, v_admin, v_admin
      );

    insert into public.asset_categories (
      id, name, default_useful_life_months, description, is_active,
      created_by, updated_by
    ) values
      (
        v_category, v_marker || ' Active Category', 12,
        v_marker, true, v_admin, v_admin
      ),
      (
        v_inactive_category, v_marker || ' Inactive Category', 12,
        v_marker, false, v_admin, v_admin
      );

    -- Role testing begins only after privileged fixture setup is complete.
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('role', 'authenticated', true);

    -- Admin create with a fully valid payload.
    select id into v_basic
    from public.create_operational_asset(jsonb_build_object(
      'outlet_id', v_outlet_a,
      'subunit_id', v_subunit_a1,
      'asset_category_id', v_category,
      'asset_source_key', v_marker || '-BASIC',
      'asset_code', v_marker || '-BASIC',
      'asset_name', v_marker || ' Basic',
      'acquisition_date', '2026-07-15',
      'acquisition_cost', 12000000,
      'residual_value', 0,
      'useful_life_months', 12,
      'asset_status', 'active'
    ));

    if not exists (
      select 1 from public.assets
      where id = v_basic
        and outlet_id = v_outlet_a
        and subunit_id = v_subunit_a1
        and record_source = 'operational'
    ) then
      raise exception 'Admin create did not persist expected operational ownership';
    end if;
    v_result := v_result || jsonb_build_object('admin_create', 'PASS');

    -- Basic straight-line and acquisition-month convention.
    perform public.generate_asset_depreciation(v_basic, date '2026-12-01');
    select count(*), sum(depreciation_amount), min(ending_book_value)
    into v_count, v_amount, v_book
    from public.asset_depreciation_entries
    where asset_id = v_basic;

    if (v_count, v_amount, v_book) is distinct from
       (6::bigint, 6000000::numeric, 6000000::numeric) then
      raise exception 'Basic depreciation mismatch: %, %, %',
        v_count, v_amount, v_book;
    end if;
    if not exists (
      select 1 from public.asset_depreciation_entries
      where asset_id = v_basic
        and period_month = date '2026-07-01'
        and depreciation_amount = 1000000
        and accumulated_depreciation = 1000000
        and ending_book_value = 11000000
    ) then
      raise exception 'Acquisition month was not the first full depreciation period';
    end if;
    v_result := v_result || jsonb_build_object(
      'basic_depreciation', 'PASS',
      'acquisition_month', 'PASS'
    );

    -- Full schedule plus repeat generation proves idempotency.
    perform public.generate_asset_depreciation(v_basic, date '2027-06-01');
    perform public.generate_asset_depreciation(v_basic, date '2027-06-01');
    select count(*), sum(depreciation_amount), min(ending_book_value)
    into v_count, v_amount, v_book
    from public.asset_depreciation_entries
    where asset_id = v_basic;
    if (v_count, v_amount, v_book) is distinct from
       (12::bigint, 12000000::numeric, 0::numeric) then
      raise exception 'Full schedule/idempotency mismatch: %, %, %',
        v_count, v_amount, v_book;
    end if;
    v_result := v_result || jsonb_build_object('idempotency', 'PASS');

    -- Period cutoff must exclude September and later entries.
    select accumulated_depreciation, book_value
    into v_amount, v_book
    from public.get_asset_book_values(date '2026-08-31')
    where asset_id = v_basic;
    if (v_amount, v_book) is distinct from
       (2000000::numeric, 10000000::numeric) then
      raise exception 'Period cutoff mismatch: %, %', v_amount, v_book;
    end if;
    v_result := v_result || jsonb_build_object('period_book_value', 'PASS');

    -- 31 July still gets a complete July period.
    select id into v_edge
    from public.create_operational_asset(jsonb_build_object(
      'outlet_id', v_outlet_a,
      'subunit_id', v_subunit_a1,
      'asset_category_id', v_category,
      'asset_source_key', v_marker || '-EDGE',
      'asset_code', v_marker || '-EDGE',
      'asset_name', v_marker || ' July 31',
      'acquisition_date', '2026-07-31',
      'acquisition_cost', 1200,
      'residual_value', 0,
      'useful_life_months', 12,
      'asset_status', 'active'
    ));
    perform public.generate_asset_depreciation(v_edge, date '2026-07-01');
    if not exists (
      select 1 from public.asset_depreciation_entries
      where asset_id = v_edge
        and period_month = date '2026-07-01'
        and depreciation_amount = 100
    ) then
      raise exception '31 July acquisition did not receive full July depreciation';
    end if;

    -- Residual-value floor, intentionally in the second Subunit of Outlet A.
    select id into v_residual
    from public.create_operational_asset(jsonb_build_object(
      'outlet_id', v_outlet_a,
      'subunit_id', v_subunit_a2,
      'asset_category_id', v_category,
      'asset_source_key', v_marker || '-RESIDUAL',
      'asset_code', v_marker || '-RESIDUAL',
      'asset_name', v_marker || ' Residual',
      'acquisition_date', '2026-07-01',
      'acquisition_cost', 12000000,
      'residual_value', 2400000,
      'useful_life_months', 12,
      'asset_status', 'active'
    ));
    perform public.generate_asset_depreciation(v_residual, date '2027-06-01');
    select sum(depreciation_amount), min(ending_book_value)
    into v_amount, v_book
    from public.asset_depreciation_entries
    where asset_id = v_residual;
    if (v_amount, v_book) is distinct from
       (9600000::numeric, 2400000::numeric) then
      raise exception 'Residual-value mismatch: %, %', v_amount, v_book;
    end if;
    v_result := v_result || jsonb_build_object('residual_value', 'PASS');

    -- Uneven 36-month schedule must close exactly without drift.
    select id into v_rounding
    from public.create_operational_asset(jsonb_build_object(
      'outlet_id', v_outlet_a,
      'subunit_id', v_subunit_a1,
      'asset_category_id', v_category,
      'asset_source_key', v_marker || '-ROUNDING',
      'asset_code', v_marker || '-ROUNDING',
      'asset_name', v_marker || ' Rounding',
      'acquisition_date', '2026-07-01',
      'acquisition_cost', 10000000,
      'residual_value', 0,
      'useful_life_months', 36,
      'asset_status', 'active'
    ));
    perform public.generate_asset_depreciation(v_rounding, date '2029-06-01');
    select count(*), sum(depreciation_amount), min(ending_book_value)
    into v_count, v_amount, v_book
    from public.asset_depreciation_entries
    where asset_id = v_rounding;
    if (v_count, v_amount, v_book) is distinct from
       (36::bigint, 10000000::numeric, 0::numeric) then
      raise exception 'Rounding mismatch: %, %, %', v_count, v_amount, v_book;
    end if;
    v_result := v_result || jsonb_build_object('rounding', 'PASS');

    -- Every accounting-sensitive field is rejected separately with P0001.
    v_failed := false;
    begin
      perform public.update_operational_asset(
        v_basic, jsonb_build_object('acquisition_date', '2026-07-16')
      );
    exception when sqlstate 'P0001' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Acquisition date lock failed'; end if;

    v_failed := false;
    begin
      perform public.update_operational_asset(
        v_basic, jsonb_build_object('acquisition_cost', 13000000)
      );
    exception when sqlstate 'P0001' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Acquisition cost lock failed'; end if;

    v_failed := false;
    begin
      perform public.update_operational_asset(
        v_basic, jsonb_build_object('residual_value', 100000)
      );
    exception when sqlstate 'P0001' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Residual value lock failed'; end if;

    v_failed := false;
    begin
      perform public.update_operational_asset(
        v_basic, jsonb_build_object('useful_life_months', 24)
      );
    exception when sqlstate 'P0001' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Useful-life lock failed'; end if;

    -- The operational schema only permits straight_line. The trigger must
    -- reject a method change as accounting-locked before the CHECK constraint.
    v_failed := false;
    begin
      perform public.update_operational_asset(
        v_basic, jsonb_build_object('depreciation_method', 'declining_balance')
      );
    exception when sqlstate 'P0001' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Depreciation-method lock failed'; end if;

    v_failed := false;
    begin
      perform public.update_operational_asset(
        v_basic,
        jsonb_build_object('outlet_id', v_outlet_b, 'subunit_id', v_subunit_b1)
      );
    exception when sqlstate 'P0001' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Ownership lock failed'; end if;

    perform public.update_operational_asset(
      v_basic,
      jsonb_build_object(
        'asset_name', v_marker || ' Basic Renamed',
        'notes', v_marker || ' descriptive edit'
      )
    );
    if not exists (
      select 1 from public.assets
      where id = v_basic
        and asset_name = v_marker || ' Basic Renamed'
        and notes = v_marker || ' descriptive edit'
    ) then
      raise exception 'Safe descriptive edit failed';
    end if;
    v_result := v_result || jsonb_build_object(
      'accounting_lock', 'PASS',
      'ownership_lock', 'PASS',
      'descriptive_edit', 'PASS'
    );

    -- Real Outlet A + valid Subunit belonging to Outlet B must be rejected.
    v_failed := false;
    begin
      perform public.create_operational_asset(jsonb_build_object(
        'outlet_id', v_outlet_a,
        'subunit_id', v_subunit_b1,
        'asset_category_id', v_category,
        'asset_source_key', v_marker || '-MISMATCH',
        'asset_code', v_marker || '-MISMATCH',
        'asset_name', v_marker || ' Mismatch',
        'acquisition_date', '2026-07-01',
        'acquisition_cost', 1000,
        'residual_value', 0,
        'useful_life_months', 12,
        'asset_status', 'active'
      ));
    exception when sqlstate '23514' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Same-outlet validation failed'; end if;

    v_failed := false;
    begin
      perform public.create_operational_asset(jsonb_build_object(
        'outlet_id', v_outlet_a,
        'subunit_id', v_inactive_subunit,
        'asset_category_id', v_category,
        'asset_source_key', v_marker || '-INACTIVE-SUBUNIT',
        'asset_code', v_marker || '-INACTIVE-SUBUNIT',
        'asset_name', v_marker || ' Inactive Subunit',
        'acquisition_date', '2026-07-01',
        'acquisition_cost', 1000,
        'residual_value', 0,
        'useful_life_months', 12,
        'asset_status', 'active'
      ));
    exception when sqlstate '23514' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Inactive Subunit was accepted'; end if;

    v_failed := false;
    begin
      perform public.create_operational_asset(jsonb_build_object(
        'outlet_id', v_outlet_a,
        'subunit_id', v_subunit_a1,
        'asset_category_id', v_inactive_category,
        'asset_source_key', v_marker || '-INACTIVE-CATEGORY',
        'asset_code', v_marker || '-INACTIVE-CATEGORY',
        'asset_name', v_marker || ' Inactive Category',
        'acquisition_date', '2026-07-01',
        'acquisition_cost', 1000,
        'residual_value', 0,
        'useful_life_months', 12,
        'asset_status', 'active'
      ));
    exception when sqlstate '23514' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Inactive Asset Category was accepted'; end if;
    v_result := v_result || jsonb_build_object(
      'same_outlet_ownership', 'PASS',
      'inactive_subunit', 'PASS',
      'inactive_category', 'PASS'
    );

    -- Admin lifecycle with a valid, unused Asset.
    select id into v_admin_asset
    from public.create_operational_asset(jsonb_build_object(
      'outlet_id', v_outlet_a,
      'subunit_id', v_subunit_a1,
      'asset_category_id', v_category,
      'asset_source_key', v_marker || '-ADMIN',
      'asset_code', v_marker || '-ADMIN',
      'asset_name', v_marker || ' Admin Lifecycle',
      'acquisition_date', '2026-07-01',
      'acquisition_cost', 12000,
      'residual_value', 0,
      'useful_life_months', 12,
      'asset_status', 'active'
    ));
    perform public.update_operational_asset(
      v_admin_asset,
      jsonb_build_object(
        'asset_name', v_marker || ' Admin Edited',
        'notes', v_marker || ' admin safe edit'
      )
    );
    perform public.archive_operational_asset(v_admin_asset);

    if exists (select 1 from public.assets where id = v_admin_asset) then
      raise exception 'Admin can see archived Asset but policy requires it hidden';
    end if;

    v_failed := false;
    begin
      perform public.restore_operational_asset(v_admin_asset);
    exception when sqlstate '42501' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Admin restore unexpectedly succeeded'; end if;

    v_failed := false;
    begin
      perform public.hard_delete_operational_asset(v_admin_asset);
    exception when sqlstate '42501' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Admin hard delete unexpectedly succeeded'; end if;

    v_failed := false;
    begin
      update public.assets
      set notes = v_marker || ' forbidden raw admin update'
      where id = v_basic;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise exception using errcode = '42501',
          message = 'Raw authoritative update affected no row';
      end if;
    exception when sqlstate '42501' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Admin raw authoritative update succeeded'; end if;
    v_result := v_result || jsonb_build_object(
      'admin_edit', 'PASS',
      'admin_archive', 'PASS',
      'admin_archived_hidden', 'PASS',
      'admin_restore_rejected', 'PASS',
      'admin_hard_delete_rejected', 'PASS',
      'admin_raw_write_rejected', 'PASS'
    );

    -- Staff reads a known Asset and its known depreciation rows.
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    if (select count(*) from public.assets where id = v_basic) <> 1 then
      raise exception 'Staff cannot read known active operational Asset';
    end if;
    if (select count(*) from public.asset_depreciation_entries where asset_id = v_basic) <> 12 then
      raise exception 'Staff cannot read known operational depreciation history';
    end if;

    -- Fully valid payload: only permission may cause rejection.
    v_failed := false;
    v_state := null;
    v_message := null;
    begin
      perform public.create_operational_asset(jsonb_build_object(
        'outlet_id', v_outlet_a,
        'subunit_id', v_subunit_a1,
        'asset_category_id', v_category,
        'asset_source_key', v_marker || '-STAFF-FORBIDDEN',
        'asset_code', v_marker || '-STAFF-FORBIDDEN',
        'asset_name', v_marker || ' Staff Forbidden',
        'acquisition_date', '2026-07-01',
        'acquisition_cost', 12000,
        'residual_value', 0,
        'useful_life_months', 12,
        'asset_status', 'active'
      ));
    exception when others then
      get stacked diagnostics
        v_state = returned_sqlstate,
        v_message = message_text;
      v_failed := v_state = '42501'
        and v_message = 'Hanya Admin yang dapat membuat aset.';
    end;
    if not v_failed then
      raise exception 'Staff create rejection contract mismatch: %, %',
        v_state, v_message;
    end if;

    v_failed := false;
    begin
      update public.assets
      set notes = v_marker || ' forbidden raw staff update'
      where id = v_basic;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise exception using errcode = '42501',
          message = 'Raw authoritative update affected no row';
      end if;
    exception when sqlstate '42501' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Staff raw authoritative write succeeded'; end if;
    v_result := v_result || jsonb_build_object(
      'staff_read', 'PASS',
      'staff_depreciation_read', 'PASS',
      'staff_mutation_rejected', 'PASS',
      'staff_raw_write_rejected', 'PASS'
    );

    -- Super Admin can see, restore, and safely hard-delete the unused Asset.
    perform set_config('request.jwt.claim.sub', v_super::text, true);
    if (select count(*) from public.assets where id = v_admin_asset and deleted_at is not null) <> 1 then
      raise exception 'Super Admin cannot see archived operational Asset';
    end if;
    perform public.restore_operational_asset(v_admin_asset);
    if not exists (
      select 1 from public.assets
      where id = v_admin_asset and deleted_at is null
    ) then
      raise exception 'Super Admin restore failed';
    end if;

    -- Super Admin remains subject to the accounting lock.
    v_failed := false;
    begin
      perform public.update_operational_asset(
        v_basic, jsonb_build_object('acquisition_cost', 14000000)
      );
    exception when sqlstate 'P0001' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Super Admin bypassed accounting lock'; end if;

    perform public.archive_operational_asset(v_admin_asset);
    perform public.hard_delete_operational_asset(v_admin_asset);
    if exists (select 1 from public.assets where id = v_admin_asset) then
      raise exception 'Unused archived Asset was not hard-deleted';
    end if;

    -- A historical Asset cannot be hard-deleted.
    perform public.archive_operational_asset(v_edge);
    v_failed := false;
    begin
      perform public.hard_delete_operational_asset(v_edge);
    exception when sqlstate '23503' then
      v_failed := true;
    end;
    if not v_failed then raise exception 'Historical Asset hard delete succeeded'; end if;
    perform public.restore_operational_asset(v_edge);

    -- Archive is application lifecycle only and does not stop depreciation.
    perform public.archive_operational_asset(v_edge);
    perform public.generate_asset_depreciation(v_edge, date '2026-08-01');
    if (select count(*) from public.asset_depreciation_entries where asset_id = v_edge) <> 2 then
      raise exception 'Archive stopped scheduled depreciation';
    end if;
    perform public.restore_operational_asset(v_edge);
    perform public.generate_asset_depreciation(v_edge, date '2026-08-01');
    if (select count(*) from public.asset_depreciation_entries where asset_id = v_edge) <> 2 then
      raise exception 'Restore duplicated depreciation history';
    end if;
    v_result := v_result || jsonb_build_object(
      'super_archived_visible', 'PASS',
      'super_restore', 'PASS',
      'super_accounting_lock', 'PASS',
      'super_safe_hard_delete', 'PASS',
      'unused_hard_delete', 'PASS',
      'historical_hard_delete', 'PASS',
      'archive_continuation', 'PASS',
      'restore_no_duplicate', 'PASS'
    );

    -- Per-Subunit attribution and per-Outlet aggregation.
    select period_depreciation
    into strict v_subunit_a1_amount
    from public.get_asset_depreciation_summary(date '2026-07-01')
    where outlet_id = v_outlet_a and subunit_id = v_subunit_a1;

    select period_depreciation
    into strict v_subunit_a2_amount
    from public.get_asset_depreciation_summary(date '2026-07-01')
    where outlet_id = v_outlet_a and subunit_id = v_subunit_a2;

    select coalesce(sum(period_depreciation), 0)
    into v_outlet_amount
    from public.get_asset_depreciation_summary(date '2026-07-01')
    where outlet_id = v_outlet_a;

    if v_subunit_a1_amount is distinct from 1277877.78::numeric then
      raise exception 'Subunit A1 July attribution mismatch: %', v_subunit_a1_amount;
    end if;
    if v_subunit_a2_amount is distinct from 800000::numeric then
      raise exception 'Subunit A2 July attribution mismatch: %', v_subunit_a2_amount;
    end if;
    if v_outlet_amount is distinct from
       (v_subunit_a1_amount + v_subunit_a2_amount) then
      raise exception 'Outlet aggregation mismatch: %, %, %',
        v_subunit_a1_amount, v_subunit_a2_amount, v_outlet_amount;
    end if;
    if exists (
      select 1
      from public.get_asset_depreciation_summary(date '2026-07-01')
      where outlet_id = v_outlet_b
    ) then
      raise exception 'Outlet B contaminated the depreciation fixture';
    end if;
    v_result := v_result || jsonb_build_object(
      'subunit_aggregation', 'PASS',
      'outlet_aggregation', 'PASS'
    );

    raise exception 'stage6_smoke_rollback' using errcode = 'P6006';
  exception when sqlstate 'P6006' then
    null;
  end;

  perform set_config('role', 'none', true);

  if (select count(*) from public.assets where record_source = 'historical_import')
     <> v_legacy_count then
    raise exception 'Legacy Asset count changed';
  end if;
  if exists (
    select 1 from public.assets where asset_code like v_marker || '%'
  ) then
    raise exception 'Temporary Asset rows remain';
  end if;
  if exists (
    select 1 from public.business_subunits where code like v_marker || '%'
  ) then
    raise exception 'Temporary Subunit rows remain';
  end if;
  if exists (
    select 1 from public.asset_categories where name like v_marker || '%'
  ) then
    raise exception 'Temporary Asset Category rows remain';
  end if;
  if exists (
    select 1 from public.outlets where code like v_marker || '%'
  ) then
    raise exception 'Temporary Outlet rows remain';
  end if;
  if exists (
    select 1 from public.asset_depreciation_entries
    where asset_id in (
      v_basic, v_residual, v_rounding, v_edge, v_admin_asset
    )
  ) then
    raise exception 'Temporary depreciation rows remain';
  end if;
  if exists (
    select 1 from public.outlets
    where id in (v_outlet_a, v_outlet_b)
  ) or exists (
    select 1 from public.business_subunits
    where id in (
      v_subunit_a1, v_subunit_a2, v_subunit_b1, v_inactive_subunit
    )
  ) or exists (
    select 1 from public.asset_categories
    where id in (v_category, v_inactive_category)
  ) then
    raise exception 'One or more exact temporary master fixtures remain';
  end if;

  return v_result || jsonb_build_object(
    'legacy_assets_unchanged', 'PASS',
    'cleanup', 'PASS',
    'legacy_asset_count', v_legacy_count
  );
end;
$$;

with smoke_run as materialized (
  select pg_temp.run_stage6_smoke() as internal_results
),
verification as materialized (
  select
    smoke_run.internal_results,
    (
      select count(*)::integer
      from public.assets
      where asset_code like 'STAGE6-SMOKE-%'
    ) as remaining_smoke_asset_count,
    (
      (select count(*) from public.business_subunits
       where code like 'STAGE6-SMOKE-%')
      + (select count(*) from public.asset_categories
         where name like 'STAGE6-SMOKE-%')
      + (select count(*) from public.outlets
         where code like 'STAGE6-SMOKE-%')
    )::integer as remaining_smoke_master_count
  from smoke_run
)
select
  case
    when internal_results->>'cleanup' = 'PASS' then 'PASS'
    else 'FAIL'
  end as main_stage6_invariant_status,
  remaining_smoke_asset_count,
  case
    when remaining_smoke_asset_count = 0 then 'PASS'
    else 'FAIL'
  end as remaining_smoke_asset_status,
  remaining_smoke_master_count,
  case
    when remaining_smoke_master_count = 0 then 'PASS'
    else 'FAIL'
  end as remaining_smoke_master_status,
  internal_results
from verification;
