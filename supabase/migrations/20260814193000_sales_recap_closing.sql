begin;

-- Daily operational values supplement canonical transaction reporting. They do
-- not duplicate or override transaction totals.
create table public.sales_daily_closings (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  business_date date not null,
  membership_transaction_count integer,
  promo_transaction_count integer,
  cashier_name text,
  adult_visitors integer,
  child_visitors integer,
  qris_dretail numeric(30,2),
  qris_dynamic_bca numeric(30,2),
  qris_static_bca numeric(30,2),
  debit_edc_bca numeric(30,2),
  qris_static_bri numeric(30,2),
  cash_payment numeric(30,2),
  dine_in_sales numeric(30,2),
  takeaway_sales numeric(30,2),
  reservation_sales numeric(30,2),
  cash_opening numeric(30,2),
  cash_deposited numeric(30,2),
  deposit_method text,
  cash_closing_actual numeric(30,2),
  notes text,
  sales_validated_at timestamptz,
  sales_validated_by uuid references public.profiles(id) on delete set null,
  sales_validated_revision bigint,
  sales_validation_snapshot jsonb,
  cash_validated_at timestamptz,
  cash_validated_by uuid references public.profiles(id) on delete set null,
  cash_validated_revision bigint,
  cash_validation_snapshot jsonb,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint sales_daily_closings_outlet_date_unique unique (outlet_id, business_date),
  constraint sales_daily_closings_counts_nonnegative check (
    membership_transaction_count >= 0 and promo_transaction_count >= 0
    and adult_visitors >= 0 and child_visitors >= 0
  ),
  constraint sales_daily_closings_money_nonnegative check (
    qris_dretail >= 0 and qris_dynamic_bca >= 0 and qris_static_bca >= 0
    and debit_edc_bca >= 0 and qris_static_bri >= 0 and cash_payment >= 0
    and dine_in_sales >= 0 and takeaway_sales >= 0 and reservation_sales >= 0
    and cash_opening >= 0 and cash_deposited >= 0 and cash_closing_actual >= 0
  ),
  constraint sales_daily_closings_deposit_method_check check (
    deposit_method is null or deposit_method in (
      'Tidak Disetor', 'Setor Tunai ke bu Reni', 'Setor ATM/Bank'
    )
  ),
  constraint sales_daily_closings_no_deposit_check check (
    deposit_method is distinct from 'Tidak Disetor' or cash_deposited = 0
  ),
  constraint sales_daily_closings_cashier_length check (
    cashier_name is null or char_length(cashier_name) <= 150
  ),
  constraint sales_daily_closings_notes_length check (
    notes is null or char_length(notes) <= 1000
  )
);

create table public.sales_daily_revisions (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (outlet_id, business_date)
);

create index sales_daily_closings_date_idx
  on public.sales_daily_closings (business_date desc, outlet_id);

comment on table public.sales_daily_closings is
  'Manual daily closing fields. Sales totals, subunit revenue, dates, and receipt count remain canonical transaction/reporting data.';
comment on table public.sales_daily_revisions is
  'Mutation counter for daily sales. A validated closing is stale when its stored revision differs from this value.';
comment on column public.sales_daily_closings.sales_validated_revision is
  'Revision validated by the backend. One active sales transaction equals one receipt regardless of subunit mix.';

alter table public.sales_daily_closings enable row level security;
alter table public.sales_daily_revisions enable row level security;

create policy sales_daily_closings_select_staff
on public.sales_daily_closings for select to authenticated
using (public.lm_is_active_staff_or_above());

create policy sales_daily_revisions_select_staff
on public.sales_daily_revisions for select to authenticated
using (public.lm_is_active_staff_or_above());

revoke all on table public.sales_daily_closings, public.sales_daily_revisions from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.sales_daily_closings, public.sales_daily_revisions from authenticated;
grant select on table public.sales_daily_closings, public.sales_daily_revisions to authenticated;

create or replace function public.lm_bump_sales_daily_revision(
  p_outlet_id uuid,
  p_business_date date
) returns void
language sql volatile security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
  insert into public.sales_daily_revisions(outlet_id, business_date, revision)
  select p_outlet_id, p_business_date, 1
  where p_outlet_id is not null and p_business_date is not null
  on conflict (outlet_id, business_date) do update
    set revision = public.sales_daily_revisions.revision + 1,
        updated_at = clock_timestamp();
$$;

revoke all on function public.lm_bump_sales_daily_revision(uuid,date)
  from public, anon, authenticated;

create or replace function public.lm_track_sales_transaction_revision()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  if tg_op = 'INSERT' then
    perform public.lm_bump_sales_daily_revision(new.outlet_id, new.transaction_date);
  elsif tg_op = 'DELETE' then
    perform public.lm_bump_sales_daily_revision(old.outlet_id, old.transaction_date);
  else
    if row(new.outlet_id, new.transaction_date, new.total_amount, new.deleted_at)
       is distinct from row(old.outlet_id, old.transaction_date, old.total_amount, old.deleted_at) then
      perform public.lm_bump_sales_daily_revision(old.outlet_id, old.transaction_date);
      if row(new.outlet_id, new.transaction_date)
         is distinct from row(old.outlet_id, old.transaction_date) then
        perform public.lm_bump_sales_daily_revision(new.outlet_id, new.transaction_date);
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger track_sales_transaction_daily_revision
after insert or delete or update of outlet_id, transaction_date, total_amount, deleted_at
on public.sales_transactions for each row
execute function public.lm_track_sales_transaction_revision();

create or replace function public.lm_track_sales_item_revision()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  v_old_outlet uuid;
  v_old_date date;
  v_new_outlet uuid;
  v_new_date date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select outlet_id, transaction_date into v_old_outlet, v_old_date
    from public.sales_transactions where id = old.sales_transaction_id;
    perform public.lm_bump_sales_daily_revision(v_old_outlet, v_old_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select outlet_id, transaction_date into v_new_outlet, v_new_date
    from public.sales_transactions where id = new.sales_transaction_id;
    if tg_op = 'INSERT' or row(v_new_outlet, v_new_date)
       is distinct from row(v_old_outlet, v_old_date) then
      perform public.lm_bump_sales_daily_revision(v_new_outlet, v_new_date);
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger track_sales_item_daily_revision
after insert or update or delete on public.sales_items for each row
execute function public.lm_track_sales_item_revision();

-- Uses the existing dashboard RPC as the single source of daily aggregation.
create or replace function public.get_sales_recap_daily(
  p_outlet_id uuid,
  p_start_date date,
  p_end_date date
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  v_dashboard jsonb;
  v_rows jsonb;
begin
  if not public.lm_is_active_staff_or_above() then
    raise exception 'Akses operasional diperlukan.' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Rentang Rekap Sales tidak valid.' using errcode = '22023';
  end if;
  if p_end_date - p_start_date > 366 then
    raise exception 'Rentang Rekap Sales maksimal 367 hari.' using errcode = '22023';
  end if;

  v_dashboard := public.get_dashboard_daily_series(p_outlet_id, p_start_date, p_end_date);

  with system_rows as (
    select * from jsonb_to_recordset(coalesce(v_dashboard->'rows', '[]'::jsonb)) as x(
      report_date date,
      outlet_revenue numeric,
      lovin_revenue numeric,
      arayya_revenue numeric,
      bill_count bigint,
      quantity numeric,
      visitor_count bigint,
      visitor_adult bigint,
      visitor_child bigint
    )
  ), recap as (
    select
      s.report_date as business_date,
      s.bill_count,
      s.outlet_revenue as system_total_sales,
      s.lovin_revenue as lovin_sales,
      s.arayya_revenue as arayya_sales,
      s.quantity,
      s.visitor_count as visitor_system_total,
      s.visitor_adult as visitor_system_adult,
      s.visitor_child as visitor_system_child,
      c.id as closing_id,
      c.membership_transaction_count, c.promo_transaction_count, c.cashier_name,
      c.adult_visitors, c.child_visitors,
      c.qris_dretail, c.qris_dynamic_bca, c.qris_static_bca,
      c.debit_edc_bca, c.qris_static_bri, c.cash_payment,
      c.dine_in_sales, c.takeaway_sales, c.reservation_sales,
      c.cash_opening, c.cash_deposited, c.deposit_method, c.cash_closing_actual,
      c.notes, c.sales_validated_at, c.sales_validated_by,
      c.sales_validated_revision, c.sales_validation_snapshot,
      c.cash_validated_at, c.cash_validated_by,
      c.cash_validated_revision, c.cash_validation_snapshot,
      c.created_at, c.updated_at,
      coalesce(r.revision, 0) as current_revision,
      coalesce(c.qris_dretail,0) + coalesce(c.qris_dynamic_bca,0)
        + coalesce(c.qris_static_bca,0) + coalesce(c.debit_edc_bca,0)
        + coalesce(c.qris_static_bri,0) + coalesce(c.cash_payment,0) as payment_total,
      coalesce(c.dine_in_sales,0) + coalesce(c.takeaway_sales,0)
        + coalesce(c.reservation_sales,0) as service_type_total,
      coalesce(c.cash_opening,0) + coalesce(c.cash_payment,0)
        - coalesce(c.cash_deposited,0) as expected_cash_closing,
      (s.lovin_revenue + s.arayya_revenue) - s.outlet_revenue as subunit_variance
    from system_rows s
    left join public.sales_daily_closings c
      on c.outlet_id = p_outlet_id and c.business_date = s.report_date
    left join public.sales_daily_revisions r
      on r.outlet_id = p_outlet_id and r.business_date = s.report_date
  ), calculated as (
    select *,
      payment_total - system_total_sales as payment_variance,
      service_type_total - system_total_sales as service_type_variance,
      cash_closing_actual - expected_cash_closing as cash_variance,
      sales_validated_at is not null
        and sales_validated_revision = current_revision
        and payment_total = system_total_sales
        and service_type_total = system_total_sales
        and subunit_variance = 0 as sales_validation_is_current,
      cash_validated_at is not null
        and cash_validated_revision = current_revision
        and cash_closing_actual = expected_cash_closing as cash_validation_is_current,
      closing_id is not null
        and membership_transaction_count is not null
        and promo_transaction_count is not null
        and nullif(btrim(cashier_name), '') is not null
        and adult_visitors is not null and child_visitors is not null
        and qris_dretail is not null and qris_dynamic_bca is not null
        and qris_static_bca is not null and debit_edc_bca is not null
        and qris_static_bri is not null and cash_payment is not null
        and dine_in_sales is not null and takeaway_sales is not null
        and reservation_sales is not null as sales_fields_complete,
      closing_id is not null and cash_opening is not null
        and cash_deposited is not null and deposit_method is not null
        and cash_closing_actual is not null as cash_fields_complete
    from recap
  ), statuses as (
    select *, case
      when sales_validation_is_current and cash_validation_is_current then 'VALIDATED'
      when closing_id is null or not sales_fields_complete then 'DRAFT'
      when (sales_validated_at is not null and not sales_validation_is_current)
        or (cash_validated_at is not null and not cash_validation_is_current)
        or payment_variance <> 0 or service_type_variance <> 0
        or subunit_variance <> 0
        or (cash_fields_complete and cash_variance <> 0) then 'NEEDS_REVIEW'
      else 'READY_TO_VALIDATE'
    end as overall_status
    from calculated
  )
  select coalesce(jsonb_agg(to_jsonb(statuses) order by business_date), '[]'::jsonb)
  into v_rows from statuses;

  return jsonb_build_object(
    'requested_start_date', p_start_date,
    'requested_end_date', p_end_date,
    'operational_cutover_date', v_dashboard->>'operational_cutover_date',
    'source_status', v_dashboard->>'source_status',
    'rows', v_rows
  );
end;
$$;

create or replace function public.upsert_sales_daily_closing(
  p_outlet_id uuid,
  p_business_date date,
  p_closing jsonb
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.sales_daily_closings%rowtype;
begin
  if not public.lm_is_active_staff_or_above() then
    raise exception 'Anda tidak berwenang menyimpan closing.' using errcode = '42501';
  end if;
  if p_business_date is null or p_business_date > (clock_timestamp() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal closing tidak boleh berada di masa depan.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.outlets where id=p_outlet_id and is_active and deleted_at is null) then
    raise exception 'Outlet aktif tidak ditemukan.' using errcode = 'P0002';
  end if;

  insert into public.sales_daily_closings (
    outlet_id, business_date, membership_transaction_count, promo_transaction_count,
    cashier_name, adult_visitors, child_visitors, qris_dretail, qris_dynamic_bca,
    qris_static_bca, debit_edc_bca, qris_static_bri, cash_payment, dine_in_sales,
    takeaway_sales, reservation_sales, cash_opening, cash_deposited, deposit_method,
    cash_closing_actual, notes, created_by, updated_by
  ) values (
    p_outlet_id, p_business_date,
    (p_closing->>'membership_transaction_count')::integer,
    (p_closing->>'promo_transaction_count')::integer,
    nullif(btrim(p_closing->>'cashier_name'), ''),
    (p_closing->>'adult_visitors')::integer, (p_closing->>'child_visitors')::integer,
    (p_closing->>'qris_dretail')::numeric, (p_closing->>'qris_dynamic_bca')::numeric,
    (p_closing->>'qris_static_bca')::numeric, (p_closing->>'debit_edc_bca')::numeric,
    (p_closing->>'qris_static_bri')::numeric, (p_closing->>'cash_payment')::numeric,
    (p_closing->>'dine_in_sales')::numeric, (p_closing->>'takeaway_sales')::numeric,
    (p_closing->>'reservation_sales')::numeric, (p_closing->>'cash_opening')::numeric,
    (p_closing->>'cash_deposited')::numeric, nullif(p_closing->>'deposit_method',''),
    (p_closing->>'cash_closing_actual')::numeric, nullif(btrim(p_closing->>'notes'),''),
    v_user_id, v_user_id
  )
  on conflict (outlet_id, business_date) do update set
    membership_transaction_count=excluded.membership_transaction_count,
    promo_transaction_count=excluded.promo_transaction_count,
    cashier_name=excluded.cashier_name, adult_visitors=excluded.adult_visitors,
    child_visitors=excluded.child_visitors, qris_dretail=excluded.qris_dretail,
    qris_dynamic_bca=excluded.qris_dynamic_bca, qris_static_bca=excluded.qris_static_bca,
    debit_edc_bca=excluded.debit_edc_bca, qris_static_bri=excluded.qris_static_bri,
    cash_payment=excluded.cash_payment, dine_in_sales=excluded.dine_in_sales,
    takeaway_sales=excluded.takeaway_sales, reservation_sales=excluded.reservation_sales,
    cash_opening=excluded.cash_opening, cash_deposited=excluded.cash_deposited,
    deposit_method=excluded.deposit_method, cash_closing_actual=excluded.cash_closing_actual,
    notes=excluded.notes, updated_at=clock_timestamp(), updated_by=v_user_id,
    sales_validated_at=null, sales_validated_by=null, sales_validated_revision=null,
    cash_validated_at=null, cash_validated_by=null, cash_validated_revision=null
  returning * into v_row;
  return to_jsonb(v_row);
exception when check_violation then
  raise exception '%', sqlerrm using errcode='23514';
end;
$$;

create or replace function public.validate_sales_daily_closing(
  p_outlet_id uuid,
  p_business_date date,
  p_expected_revision bigint default null
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_recap jsonb;
  v_row jsonb;
  v_revision bigint;
  v_snapshot jsonb;
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin atau Super Admin diperlukan untuk Validasi Sales.' using errcode='42501';
  end if;
  perform 1 from public.sales_daily_closings
    where outlet_id=p_outlet_id and business_date=p_business_date for update;
  if not found then raise exception 'Simpan draft closing terlebih dahulu.' using errcode='P0002'; end if;
  v_recap := public.get_sales_recap_daily(p_outlet_id,p_business_date,p_business_date);
  v_row := v_recap->'rows'->0;
  v_revision := coalesce((v_row->>'current_revision')::bigint,0);
  if p_expected_revision is not null and p_expected_revision <> v_revision then
    raise exception 'Data transaksi berubah. Muat ulang Rekap Sales sebelum memvalidasi.' using errcode='40001';
  end if;
  if not coalesce((v_row->>'sales_fields_complete')::boolean,false) then
    raise exception 'Lengkapi data closing dan rekap pembayaran terlebih dahulu.' using errcode='22023';
  end if;
  if (v_row->>'payment_variance')::numeric <> 0 then
    raise exception 'Total pembayaran masih selisih Rp %.', abs((v_row->>'payment_variance')::numeric) using errcode='22023';
  end if;
  if (v_row->>'service_type_variance')::numeric <> 0 then
    raise exception 'Total Dine In + Take Away + Reservasi masih selisih Rp %.', abs((v_row->>'service_type_variance')::numeric) using errcode='22023';
  end if;
  if (v_row->>'subunit_variance')::numeric <> 0 then
    raise exception 'Total Lovin + Arayya tidak sama dengan Total Sales sistem.' using errcode='22023';
  end if;
  v_snapshot := jsonb_build_object(
    'revision',v_revision,'bill_count',v_row->'bill_count',
    'system_total_sales',v_row->'system_total_sales','lovin_sales',v_row->'lovin_sales',
    'arayya_sales',v_row->'arayya_sales','payment_total',v_row->'payment_total',
    'payment_variance',v_row->'payment_variance','service_type_total',v_row->'service_type_total',
    'service_type_variance',v_row->'service_type_variance','validated_at',clock_timestamp()
  );
  update public.sales_daily_closings set
    sales_validated_at=clock_timestamp(), sales_validated_by=v_user_id,
    sales_validated_revision=v_revision, sales_validation_snapshot=v_snapshot,
    cash_validated_at=null, cash_validated_by=null, cash_validated_revision=null,
    updated_at=clock_timestamp(), updated_by=v_user_id
  where outlet_id=p_outlet_id and business_date=p_business_date;
  return v_snapshot;
end;
$$;

create or replace function public.validate_cash_daily_closing(
  p_outlet_id uuid,
  p_business_date date,
  p_expected_revision bigint default null
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_recap jsonb;
  v_row jsonb;
  v_revision bigint;
  v_snapshot jsonb;
begin
  if not public.lm_is_active_admin() then
    raise exception 'Admin atau Super Admin diperlukan untuk Validasi Cash.' using errcode='42501';
  end if;
  perform 1 from public.sales_daily_closings
    where outlet_id=p_outlet_id and business_date=p_business_date for update;
  if not found then raise exception 'Simpan draft closing terlebih dahulu.' using errcode='P0002'; end if;
  v_recap := public.get_sales_recap_daily(p_outlet_id,p_business_date,p_business_date);
  v_row := v_recap->'rows'->0;
  v_revision := coalesce((v_row->>'current_revision')::bigint,0);
  if p_expected_revision is not null and p_expected_revision <> v_revision then
    raise exception 'Data transaksi berubah. Muat ulang Rekap Sales sebelum memvalidasi.' using errcode='40001';
  end if;
  if not coalesce((v_row->>'sales_validation_is_current')::boolean,false) then
    raise exception 'Validasi Sales harus masih berlaku sebelum Validasi Cash.' using errcode='22023';
  end if;
  if not coalesce((v_row->>'cash_fields_complete')::boolean,false) then
    raise exception 'Lengkapi Uang Cash Awal, setoran, metode setor, dan Cash Akhir.' using errcode='22023';
  end if;
  if v_row->>'deposit_method' = 'Tidak Disetor' and (v_row->>'cash_deposited')::numeric <> 0 then
    raise exception 'Uang Cash Disetor harus Rp 0 jika metode Tidak Disetor.' using errcode='22023';
  end if;
  if (v_row->>'cash_variance')::numeric <> 0 then
    raise exception 'Cash akhir masih selisih Rp %.', abs((v_row->>'cash_variance')::numeric) using errcode='22023';
  end if;
  v_snapshot := jsonb_build_object(
    'revision',v_revision,'cash_opening',v_row->'cash_opening',
    'cash_payment',v_row->'cash_payment','cash_deposited',v_row->'cash_deposited',
    'expected_cash_closing',v_row->'expected_cash_closing',
    'cash_closing_actual',v_row->'cash_closing_actual','cash_variance',v_row->'cash_variance',
    'validated_at',clock_timestamp()
  );
  update public.sales_daily_closings set
    cash_validated_at=clock_timestamp(), cash_validated_by=v_user_id,
    cash_validated_revision=v_revision, cash_validation_snapshot=v_snapshot,
    updated_at=clock_timestamp(), updated_by=v_user_id
  where outlet_id=p_outlet_id and business_date=p_business_date;
  return v_snapshot;
end;
$$;

revoke all on function public.get_sales_recap_daily(uuid,date,date) from public, anon;
revoke all on function public.upsert_sales_daily_closing(uuid,date,jsonb) from public, anon;
revoke all on function public.validate_sales_daily_closing(uuid,date,bigint) from public, anon;
revoke all on function public.validate_cash_daily_closing(uuid,date,bigint) from public, anon;
grant execute on function public.get_sales_recap_daily(uuid,date,date) to authenticated;
grant execute on function public.upsert_sales_daily_closing(uuid,date,jsonb) to authenticated;
grant execute on function public.validate_sales_daily_closing(uuid,date,bigint) to authenticated;
grant execute on function public.validate_cash_daily_closing(uuid,date,bigint) to authenticated;

comment on function public.get_sales_recap_daily(uuid,date,date) is
  'Daily sales recap joined to the canonical dashboard daily series; one active transaction header is one receipt.';

commit;
