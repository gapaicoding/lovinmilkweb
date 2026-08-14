begin;

create or replace function public.upsert_sales_daily_cash_closing(
  p_outlet_id uuid,
  p_business_date date,
  p_cash jsonb
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_cash_opening numeric;
  v_cash_deposited numeric;
  v_deposit_method text;
  v_cash_closing_actual numeric;
  v_row public.sales_daily_closings%rowtype;
begin
  if not public.lm_is_active_staff_or_above() then
    raise exception 'Anda tidak berwenang menyimpan closing Cash.' using errcode = '42501';
  end if;

  if p_business_date is null
     or p_business_date > (clock_timestamp() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal closing tidak boleh berada di masa depan.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.outlets
    where id = p_outlet_id and is_active and deleted_at is null
  ) then
    raise exception 'Outlet aktif tidak ditemukan.' using errcode = 'P0002';
  end if;

  select * into v_row
  from public.sales_daily_closings
  where outlet_id = p_outlet_id and business_date = p_business_date
  for update;

  if not found then
    raise exception 'Simpan draft closing terlebih dahulu.' using errcode = 'P0002';
  end if;

  v_cash_opening := (p_cash->>'cash_opening')::numeric;
  v_cash_deposited := (p_cash->>'cash_deposited')::numeric;
  v_deposit_method := nullif(p_cash->>'deposit_method', '');
  v_cash_closing_actual := (p_cash->>'cash_closing_actual')::numeric;

  if v_cash_opening < 0 or v_cash_deposited < 0 or v_cash_closing_actual < 0 then
    raise exception 'Nilai closing Cash tidak boleh negatif.' using errcode = '23514';
  end if;

  if v_deposit_method is not null and v_deposit_method not in (
    'Tidak Disetor', 'Setor Tunai ke bu Reni', 'Setor ATM/Bank'
  ) then
    raise exception 'Metode setor tidak valid.' using errcode = '23514';
  end if;

  if v_deposit_method = 'Tidak Disetor' and v_cash_deposited <> 0 then
    raise exception 'Uang Cash Disetor harus Rp 0 jika metode Tidak Disetor.' using errcode = '23514';
  end if;

  update public.sales_daily_closings set
    cash_opening = v_cash_opening,
    cash_deposited = v_cash_deposited,
    deposit_method = v_deposit_method,
    cash_closing_actual = v_cash_closing_actual,
    cash_validated_at = null,
    cash_validated_by = null,
    cash_validated_revision = null,
    cash_validation_snapshot = null,
    updated_at = clock_timestamp(),
    updated_by = v_user_id
  where outlet_id = p_outlet_id and business_date = p_business_date
  returning * into v_row;

  return to_jsonb(v_row);
exception
  when invalid_text_representation then
    raise exception 'Nilai closing Cash tidak valid.' using errcode = '22023';
end;
$$;

revoke all on function public.upsert_sales_daily_cash_closing(uuid,date,jsonb)
  from public, anon;
grant execute on function public.upsert_sales_daily_cash_closing(uuid,date,jsonb)
  to authenticated;

comment on function public.upsert_sales_daily_cash_closing(uuid,date,jsonb) is
  'Cash-only save preserves current Sales Validation because Cash balance fields do not alter Sales payment/service reconciliation; Cash validation itself is invalidated.';

commit;
