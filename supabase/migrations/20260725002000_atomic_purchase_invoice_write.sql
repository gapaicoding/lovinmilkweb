begin;

-- Header and item writes must succeed or fail as one PostgreSQL transaction.
-- The caller never supplies audit identities or provenance keys: those values
-- are derived from auth.uid() and generated inside this function.
create or replace function public.admin_write_purchase_invoice_atomic(
  p_import_batch_id uuid,
  p_purchase_date date,
  p_items jsonb,
  p_invoice_id uuid default null,
  p_supplier_id uuid default null,
  p_supplier_name_raw text default null,
  p_receipt_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_invoice_id uuid;
  v_is_create boolean := p_invoice_id is null;
  v_batch record;
  v_supplier record;
  v_existing_invoice public.purchase_invoices%rowtype;
  v_existing_item public.purchase_items%rowtype;
  v_item jsonb;
  v_item_index integer := 0;
  v_item_id uuid;
  v_item_id_text text;
  v_seen_item_ids uuid[] := array[]::uuid[];
  v_item_name text;
  v_quantity numeric;
  v_unit text;
  v_unit_price numeric;
  v_amount numeric;
  v_calculated_total numeric;
  v_source_category text;
  v_financial_class text;
  v_classification_policy text;
  v_asset_tracking boolean;
  v_supplier_name text;
  v_receipt_reference text;
  v_notes text;
  v_max_money constant numeric := 9999999999999999.99;
begin
  -- Lock the authorization row so a concurrent role/deactivation change cannot
  -- race an in-flight financial write.
  perform 1
  from public.profiles p
  where p.id = v_actor_id
    and p.is_active = true
    and p.role::text in ('admin', 'super_admin')
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only an active Admin or Super Admin may write purchase invoices.';
  end if;

  if p_import_batch_id is null then
    raise exception using
      errcode = '22023',
      message = 'A data import batch is required.';
  end if;

  select
    b.id,
    b.status,
    b.facts_period_start,
    b.facts_period_end
  into v_batch
  from public.data_import_batches b
  where b.id = p_import_batch_id
  for share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The selected data import batch does not exist.';
  end if;

  if v_batch.status not in ('staged', 'imported', 'reconciled') then
    raise exception using
      errcode = '23514',
      message = format(
        'Purchase writes are not allowed while the batch status is %s.',
        v_batch.status
      );
  end if;

  if p_purchase_date is null then
    raise exception using
      errcode = '22023',
      message = 'A valid purchase date is required.';
  end if;

  if (
    v_batch.facts_period_start is not null
    and p_purchase_date < v_batch.facts_period_start
  ) or (
    v_batch.facts_period_end is not null
    and p_purchase_date > v_batch.facts_period_end
  ) then
    raise exception using
      errcode = '23514',
      message = 'The purchase date is outside the selected batch coverage period.';
  end if;

  if p_supplier_id is not null then
    select
      s.id,
      s.import_batch_id,
      s.supplier_name
    into v_supplier
    from public.suppliers s
    where s.id = p_supplier_id
      and s.is_active = true
      and s.deleted_at is null
    for share;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'The selected supplier is unavailable.';
    end if;

    if (
      v_supplier.import_batch_id is not null
      and v_supplier.import_batch_id <> p_import_batch_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'A supplier from another data batch cannot be linked to this invoice.';
    end if;

    v_supplier_name := v_supplier.supplier_name;
  else
    v_supplier_name := nullif(
      btrim(regexp_replace(coalesce(p_supplier_name_raw, ''), '\s+', ' ', 'g')),
      ''
    );
  end if;

  v_receipt_reference := nullif(btrim(p_receipt_reference), '');
  v_notes := nullif(btrim(p_notes), '');

  if char_length(coalesce(v_supplier_name, '')) > 300 then
    raise exception using
      errcode = '22023',
      message = 'The supplier source name is too long (maximum 300 characters).';
  end if;

  if char_length(coalesce(v_receipt_reference, '')) > 300 then
    raise exception using
      errcode = '22023',
      message = 'The receipt reference is too long (maximum 300 characters).';
  end if;

  if char_length(coalesce(v_notes, '')) > 4000 then
    raise exception using
      errcode = '22023',
      message = 'Invoice notes are too long (maximum 4000 characters).';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'Purchase items must be supplied as a JSON array.';
  end if;

  if jsonb_array_length(p_items) < 1 then
    raise exception using
      errcode = '23514',
      message = 'An invoice must contain at least one item.';
  end if;

  if jsonb_array_length(p_items) > 500 then
    raise exception using
      errcode = '54000',
      message = 'A single invoice cannot contain more than 500 items.';
  end if;

  if v_is_create then
    v_invoice_id := gen_random_uuid();

    insert into public.purchase_invoices (
      id,
      import_batch_id,
      invoice_source_key,
      purchase_date,
      supplier_id,
      supplier_name_raw,
      receipt_reference,
      source_file,
      source_sheet,
      data_origin,
      status,
      notes,
      created_by,
      updated_by
    )
    values (
      v_invoice_id,
      p_import_batch_id,
      'INV-MANUAL-' || gen_random_uuid()::text,
      p_purchase_date,
      p_supplier_id,
      v_supplier_name,
      v_receipt_reference,
      'manual_web_entry',
      'data_pembelian',
      'actual',
      'recorded',
      v_notes,
      v_actor_id,
      v_actor_id
    );
  else
    select inv.*
    into v_existing_invoice
    from public.purchase_invoices inv
    where inv.id = p_invoice_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'The purchase invoice no longer exists.';
    end if;

    if v_existing_invoice.import_batch_id <> p_import_batch_id then
      raise exception using
        errcode = '23514',
        message = 'An existing invoice cannot be moved to another data batch.';
    end if;

    if v_existing_invoice.deleted_at is not null then
      raise exception using
        errcode = '23514',
        message = 'Restore a deleted invoice before editing it.';
    end if;

    v_invoice_id := v_existing_invoice.id;

    update public.purchase_invoices
    set
      purchase_date = p_purchase_date,
      supplier_id = p_supplier_id,
      supplier_name_raw = v_supplier_name,
      receipt_reference = v_receipt_reference,
      status = 'recorded',
      notes = v_notes,
      updated_by = v_actor_id
    where id = v_invoice_id;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_item_index := v_item_index + 1;

    if jsonb_typeof(v_item) <> 'object' then
      raise exception using
        errcode = '22023',
        message = format('Purchase item %s must be a JSON object.', v_item_index);
    end if;

    v_item_id := null;
    v_item_id_text := nullif(btrim(v_item ->> 'id'), '');

    begin
      if v_item_id_text is not null then
        v_item_id := v_item_id_text::uuid;
      end if;

      v_quantity := nullif(btrim(v_item ->> 'quantity'), '')::numeric;
      v_unit_price := nullif(btrim(v_item ->> 'unit_price'), '')::numeric;
      v_amount := nullif(btrim(v_item ->> 'amount'), '')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using
          errcode = '22023',
          message = format(
            'Purchase item %s contains an invalid UUID or numeric value.',
            v_item_index
          );
    end;

    if v_item_id is not null and v_item_id = any(v_seen_item_ids) then
      raise exception using
        errcode = '23514',
        message = format('Purchase item %s repeats an item ID.', v_item_index);
    end if;

    v_item_name := btrim(
      regexp_replace(coalesce(v_item ->> 'item_name', ''), '\s+', ' ', 'g')
    );
    v_unit := nullif(btrim(v_item ->> 'unit'), '');
    v_source_category := nullif(btrim(v_item ->> 'source_category'), '');
    v_financial_class := btrim(coalesce(v_item ->> 'financial_class', ''));
    v_classification_policy := nullif(
      btrim(v_item ->> 'classification_policy'),
      ''
    );

    if v_item ? 'asset_tracking'
       and jsonb_typeof(v_item -> 'asset_tracking') <> 'boolean' then
      raise exception using
        errcode = '22023',
        message = format(
          'Purchase item %s has an invalid asset-tracking value.',
          v_item_index
        );
    end if;
    v_asset_tracking := coalesce(
      (v_item ->> 'asset_tracking')::boolean,
      false
    );

    if char_length(v_item_name) < 2 or char_length(v_item_name) > 500 then
      raise exception using
        errcode = '22023',
        message = format(
          'Purchase item %s name must contain 2 to 500 characters.',
          v_item_index
        );
    end if;

    if v_quantity is null
       or v_quantity <= 0
       or v_quantity > 99999999999.999
       or v_quantity <> round(v_quantity, 3) then
      raise exception using
        errcode = '23514',
        message = format(
          'Purchase item %s quantity must be positive with at most 3 decimal places.',
          v_item_index
        );
    end if;

    if v_unit_price is null
       or v_unit_price < 0
       or v_unit_price > v_max_money
       or v_unit_price <> round(v_unit_price, 2) then
      raise exception using
        errcode = '23514',
        message = format(
          'Purchase item %s unit price is outside the allowed currency range.',
          v_item_index
        );
    end if;

    if v_amount is null
       or v_amount < 0
       or v_amount > v_max_money
       or v_amount <> round(v_amount, 2) then
      raise exception using
        errcode = '23514',
        message = format(
          'Purchase item %s source amount is outside the allowed currency range.',
          v_item_index
        );
    end if;

    v_calculated_total := round(v_quantity * v_unit_price, 2);
    if v_calculated_total > v_max_money then
      raise exception using
        errcode = '22003',
        message = format(
          'Purchase item %s calculated total exceeds the currency limit.',
          v_item_index
        );
    end if;

    if v_financial_class not in (
      'hpp',
      'operating_expense',
      'asset',
      'other'
    ) then
      raise exception using
        errcode = '23514',
        message = format(
          'Purchase item %s has an invalid financial class.',
          v_item_index
        );
    end if;

    if v_asset_tracking and v_financial_class <> 'asset' then
      raise exception using
        errcode = '23514',
        message = format(
          'Purchase item %s can only be asset-tracked when classified as an asset.',
          v_item_index
        );
    end if;

    if char_length(coalesce(v_unit, '')) > 50
       or char_length(coalesce(v_source_category, '')) > 200
       or char_length(coalesce(v_classification_policy, '')) > 500 then
      raise exception using
        errcode = '22023',
        message = format(
          'Purchase item %s contains text longer than the allowed limit.',
          v_item_index
        );
    end if;

    if v_item_id is not null then
      select item.*
      into v_existing_item
      from public.purchase_items item
      where item.id = v_item_id
      for update;

      if not found
         or v_existing_item.import_batch_id <> p_import_batch_id
         or v_existing_item.purchase_invoice_id <> v_invoice_id then
        raise exception using
          errcode = '23514',
          message = format(
            'Purchase item %s does not belong to this invoice and data batch.',
            v_item_index
          );
      end if;

      if v_existing_item.deleted_at is not null then
        raise exception using
          errcode = '23514',
          message = format(
            'Purchase item %s has already been deleted.',
            v_item_index
          );
      end if;

      update public.purchase_items
      set
        item_name_raw = v_item_name,
        item_name_normalized = lower(v_item_name),
        quantity = v_quantity,
        unit = v_unit,
        unit_price = v_unit_price,
        amount = v_amount,
        calculated_total = v_calculated_total,
        amount_difference = v_amount - v_calculated_total,
        source_category = v_source_category,
        financial_class = v_financial_class,
        classification_policy = v_classification_policy,
        asset_tracking = v_asset_tracking,
        data_origin = 'actual',
        updated_by = v_actor_id
      where id = v_item_id;
    else
      v_item_id := gen_random_uuid();

      insert into public.purchase_items (
        id,
        import_batch_id,
        purchase_invoice_id,
        line_source_key,
        item_name_raw,
        item_name_normalized,
        quantity,
        unit,
        unit_price,
        amount,
        calculated_total,
        amount_difference,
        source_category,
        financial_class,
        classification_policy,
        asset_tracking,
        source_file,
        source_sheet,
        source_row,
        data_origin,
        created_by,
        updated_by
      )
      values (
        v_item_id,
        p_import_batch_id,
        v_invoice_id,
        'LINE-MANUAL-' || gen_random_uuid()::text,
        v_item_name,
        lower(v_item_name),
        v_quantity,
        v_unit,
        v_unit_price,
        v_amount,
        v_calculated_total,
        v_amount - v_calculated_total,
        v_source_category,
        v_financial_class,
        v_classification_policy,
        v_asset_tracking,
        'manual_web_entry',
        'data_pembelian',
        v_item_index,
        'actual',
        v_actor_id,
        v_actor_id
      );
    end if;

    v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);
  end loop;

  -- Items omitted by an edit are retained as audit records, but no longer
  -- participate in financial reporting.
  update public.purchase_items item
  set
    deleted_at = clock_timestamp(),
    deleted_by = v_actor_id,
    updated_by = v_actor_id
  where item.import_batch_id = p_import_batch_id
    and item.purchase_invoice_id = v_invoice_id
    and item.deleted_at is null
    and not (item.id = any(v_seen_item_ids));

  return v_invoice_id;
end;
$function$;

revoke all on function public.admin_write_purchase_invoice_atomic(
  uuid,
  date,
  jsonb,
  uuid,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.admin_write_purchase_invoice_atomic(
  uuid,
  date,
  jsonb,
  uuid,
  uuid,
  text,
  text,
  text
) to authenticated, service_role;

comment on function public.admin_write_purchase_invoice_atomic(
  uuid,
  date,
  jsonb,
  uuid,
  uuid,
  text,
  text,
  text
) is
  'Atomically creates or edits one purchase invoice and its active item set; active Admin/Super Admin only.';

-- Any purchase mutation makes a previously reconciled batch stale. Preserve
-- the frozen manifest and expected metrics, but move lifecycle state back to
-- imported so the UI/release process cannot mistake changed facts for a
-- reconciled package. This trigger also covers direct soft-delete/restore and
-- Super Admin hard-delete operations.
create or replace function public.lm_invalidate_purchase_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $trigger$
declare
  v_batch_ids uuid[];
  v_changed_batch_ids uuid[];
  v_changed_batch_id uuid;
begin
  if tg_op = 'INSERT' then
    v_batch_ids := array[new.import_batch_id];
  elsif tg_op = 'DELETE' then
    v_batch_ids := array[old.import_batch_id];
  else
    v_batch_ids := array[new.import_batch_id, old.import_batch_id];
  end if;

  with changed as (
    update public.data_import_batches batch
    set
      status = 'imported',
      completed_at = null,
      updated_at = clock_timestamp(),
      updated_by = coalesce((select auth.uid()), batch.updated_by)
    where batch.id = any(v_batch_ids)
      and batch.status = 'reconciled'
    returning batch.id
  )
  select coalesce(array_agg(changed.id), array[]::uuid[])
  into v_changed_batch_ids
  from changed;

  foreach v_changed_batch_id in array v_changed_batch_ids
  loop
    insert into public.data_import_reconciliation_results as existing (
      import_batch_id,
      phase,
      metric_key,
      expected_value,
      actual_value,
      passed,
      checked_at,
      details
    )
    values (
      v_changed_batch_id,
      'manual_mutation',
      'purchase_data_changed',
      'no_changes_after_reconciliation',
      'purchase_data_changed',
      false,
      clock_timestamp(),
      jsonb_build_object(
        'reason',
        'A purchase invoice or item changed after reconciliation.',
        'source_relation',
        tg_table_schema || '.' || tg_table_name,
        'operation',
        tg_op,
        'actor_id',
        (select auth.uid()),
        'reconciliation_invalidated',
        true,
        'invalidation_count',
        1
      )
    )
    on conflict (import_batch_id, phase, metric_key)
    do update
    set
      expected_value = excluded.expected_value,
      actual_value = excluded.actual_value,
      passed = false,
      checked_at = excluded.checked_at,
      details = existing.details || excluded.details || jsonb_build_object(
        'invalidation_count',
        coalesce(
          (existing.details ->> 'invalidation_count')::integer,
          0
        ) + 1
      );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$trigger$;

revoke all on function public.lm_invalidate_purchase_reconciliation()
  from public, anon, authenticated;

drop trigger if exists purchase_invoices_invalidate_reconciliation
  on public.purchase_invoices;
create trigger purchase_invoices_invalidate_reconciliation
after insert or update or delete on public.purchase_invoices
for each row execute function public.lm_invalidate_purchase_reconciliation();

drop trigger if exists purchase_items_invalidate_reconciliation
  on public.purchase_items;
create trigger purchase_items_invalidate_reconciliation
after insert or update or delete on public.purchase_items
for each row execute function public.lm_invalidate_purchase_reconciliation();

-- A one-row-per-invoice read model lets PostgREST apply all filters, exact
-- counts, stable ordering, and range pagination before returning item JSON.
-- Aggregating items into JSON also avoids nested rows being truncated by the
-- API max-row setting.
create or replace view public.v_purchase_invoice_index
with (security_invoker = true)
as
select
  inv.id,
  inv.import_batch_id,
  inv.invoice_source_key,
  inv.purchase_date,
  inv.supplier_id,
  inv.supplier_name_raw,
  inv.receipt_reference,
  inv.data_origin,
  inv.status,
  inv.notes,
  inv.created_at,
  inv.deleted_at,
  case
    when inv.deleted_at is not null then 'deleted'
    else inv.status
  end as record_state,
  case
    when supplier.id is null then null
    else jsonb_build_object(
      'id', supplier.id,
      'supplier_name', supplier.supplier_name
    )
  end as supplier,
  jsonb_build_object(
    'batch_key', batch.batch_key,
    'description', batch.description
  ) as import_batch,
  count(item.id)::integer as item_count,
  coalesce(sum(item.amount), 0)::numeric(18,2) as invoice_total,
  coalesce(
    bool_or(item.financial_class = 'hpp'),
    false
  ) as has_hpp,
  coalesce(
    bool_or(item.financial_class = 'operating_expense'),
    false
  ) as has_operating_expense,
  coalesce(
    bool_or(item.financial_class = 'asset'),
    false
  ) as has_asset,
  coalesce(
    bool_or(item.financial_class = 'other'),
    false
  ) as has_other,
  lower(
    concat_ws(
      ' ',
      inv.invoice_source_key,
      inv.receipt_reference,
      inv.supplier_name_raw,
      supplier.supplier_name,
      string_agg(item.item_name_raw, ' ' order by item.id)
    )
  ) as search_text,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', item.id,
        'line_source_key', item.line_source_key,
        'item_name_raw', item.item_name_raw,
        'item_name_normalized', item.item_name_normalized,
        'quantity', item.quantity,
        'unit', item.unit,
        'unit_price', item.unit_price,
        'amount', item.amount,
        'calculated_total', item.calculated_total,
        'amount_difference', item.amount_difference,
        'source_category', item.source_category,
        'financial_class', item.financial_class,
        'classification_policy', item.classification_policy,
        'asset_tracking', item.asset_tracking,
        'data_origin', item.data_origin,
        'deleted_at', item.deleted_at
      )
      order by item.source_row nulls last, item.created_at, item.id
    ) filter (where item.id is not null),
    '[]'::jsonb
  ) as purchase_items
from public.purchase_invoices inv
join public.data_import_batches batch
  on batch.id = inv.import_batch_id
left join public.suppliers supplier
  on supplier.id = inv.supplier_id
left join public.purchase_items item
  on item.import_batch_id = inv.import_batch_id
 and item.purchase_invoice_id = inv.id
 and item.deleted_at is null
group by inv.id, batch.id, supplier.id;

revoke all on table public.v_purchase_invoice_index
  from public, anon, authenticated, service_role;
grant select on table public.v_purchase_invoice_index
  to authenticated, service_role;

do $postconditions$
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_write_purchase_invoice_atomic'
      and p.prosecdef
  ) then
    raise exception
      'Atomic purchase postcondition failed: SECURITY DEFINER RPC is missing.';
  end if;

  if has_function_privilege(
       'anon',
       'public.admin_write_purchase_invoice_atomic(uuid,date,jsonb,uuid,uuid,text,text,text)',
       'EXECUTE'
     )
     or exists (
       select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n
         on n.oid = p.pronamespace
       cross join lateral pg_catalog.aclexplode(
         coalesce(
           p.proacl,
           pg_catalog.acldefault('f', p.proowner)
         )
       ) acl
       where n.nspname = 'public'
         and p.proname = 'admin_write_purchase_invoice_atomic'
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.admin_write_purchase_invoice_atomic(uuid,date,jsonb,uuid,uuid,text,text,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.admin_write_purchase_invoice_atomic(uuid,date,jsonb,uuid,uuid,text,text,text)',
       'EXECUTE'
     ) then
    raise exception
      'Atomic purchase postcondition failed: RPC grants are unsafe.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'v_purchase_invoice_index'
      and c.relkind = 'v'
      and coalesce(c.reloptions, array[]::text[])
          @> array['security_invoker=true']
  ) then
    raise exception
      'Atomic purchase postcondition failed: read view is not security_invoker.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger trg
    join pg_catalog.pg_class rel
      on rel.oid = trg.tgrelid
    join pg_catalog.pg_namespace ns
      on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname in ('purchase_invoices', 'purchase_items')
      and trg.tgname in (
        'purchase_invoices_invalidate_reconciliation',
        'purchase_items_invalidate_reconciliation'
      )
      and not trg.tgisinternal
      and trg.tgenabled <> 'D'
  ) <> 2 then
    raise exception
      'Atomic purchase postcondition failed: reconciliation invalidation triggers are missing.';
  end if;

  if has_table_privilege(
       'anon',
       'public.v_purchase_invoice_index',
       'SELECT'
     ) then
    raise exception
      'Atomic purchase postcondition failed: anon can select the read view.';
  end if;
end;
$postconditions$;

commit;
