-- Sprint 5 / 3: RPC atomik, list aman, administrasi visitor, RLS, dan grants.

CREATE OR REPLACE FUNCTION public.require_visitor_role(p_roles text[])
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak valid. Silakan masuk kembali.';
  END IF;
  IF NOT public.current_user_is_active() THEN
    RAISE EXCEPTION 'Akun Anda tidak aktif.';
  END IF;
  IF NOT public.current_user_has_any_role(p_roles) THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk tindakan ini.';
  END IF;
  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.require_visitor_role(text[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.insert_visitor_sales(
  p_visit_id uuid,
  p_items jsonb,
  p_user_id uuid,
  p_transaction_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_total_quantity numeric := 0;
  v_total_amount numeric := 0;
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Daftar produk harus berupa array.';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 20 THEN
    RAISE EXCEPTION 'Pilih minimal 1 dan maksimal 20 produk.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) item
    GROUP BY item->>'product_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Produk yang sama tidak boleh dipilih lebih dari sekali.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;
      v_unit_price := (v_item->>'unit_price')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Data produk, quantity, atau harga tidak valid.';
    END;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity harus lebih besar dari nol.';
    END IF;
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'Harga satuan tidak boleh negatif.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id
      AND deleted_at IS NULL
      AND is_active
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produk tidak ditemukan, nonaktif, atau telah dihapus.';
    END IF;

    -- Harga master adalah sumber kebenaran; client hanya mengirim snapshot UI.
    v_unit_price := v_product.selling_price;
    IF v_quantity * v_unit_price <= 0 THEN
      RAISE EXCEPTION 'Nilai penjualan harus lebih besar dari nol.';
    END IF;

    INSERT INTO public.sales (
      transaction_date, sales_category_id, product_id, quantity,
      unit_price, amount, notes, created_by, updated_by,
      visitor_visit_id, entry_source
    ) VALUES (
      (p_transaction_at AT TIME ZONE 'Asia/Jakarta')::date,
      v_product.sales_category_id, v_product.id, v_quantity,
      v_unit_price, v_quantity * v_unit_price, NULL,
      p_user_id, p_user_id, p_visit_id, 'visitor'
    );
    v_total_quantity := v_total_quantity + v_quantity;
    v_total_amount := v_total_amount + (v_quantity * v_unit_price);
  END LOOP;

  RETURN jsonb_build_object(
    'total_items', v_count,
    'total_quantity', v_total_quantity,
    'total_amount', v_total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insert_visitor_sales(uuid, jsonb, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_operational_visitors(
  p_query text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid, visitor_code text, full_name text, phone text,
  has_active_visit boolean, active_visit_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_visitor_role(ARRAY['staff', 'admin', 'super_admin']);
  RETURN QUERY
  SELECT v.id, v.visitor_code, v.full_name, v.phone,
    av.id IS NOT NULL, av.id
  FROM public.visitors v
  LEFT JOIN public.visitor_visits av
    ON av.visitor_id = v.id
   AND av.check_out_at IS NULL
   AND av.deleted_at IS NULL
  WHERE v.deleted_at IS NULL
    AND (
      nullif(btrim(p_query), '') IS NULL
      OR v.visitor_code ILIKE '%' || btrim(p_query) || '%'
      OR v.full_name ILIKE '%' || btrim(p_query) || '%'
      OR coalesce(v.phone, '') ILIKE '%' || btrim(p_query) || '%'
    )
  ORDER BY lower(v.full_name), v.visitor_code
  LIMIT least(greatest(coalesce(p_limit, 10), 1), 20);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_visitor_purchase(
  p_items jsonb,
  p_visitor_id uuid DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_visit_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_visitor public.visitors%ROWTYPE;
  v_visit public.visitor_visits%ROWTYPE;
  v_summary jsonb;
  v_now timestamptz := now();
  v_active_id uuid;
BEGIN
  v_user_id := public.require_visitor_role(ARRAY['staff', 'admin', 'super_admin']);

  IF p_visitor_id IS NULL THEN
    IF nullif(btrim(p_full_name), '') IS NULL THEN
      RAISE EXCEPTION 'Nama pengunjung wajib diisi.';
    END IF;
    INSERT INTO public.visitors (
      visitor_code, full_name, phone, created_by, updated_by
    ) VALUES (
      NULL, btrim(p_full_name), nullif(btrim(p_phone), ''), v_user_id, v_user_id
    ) RETURNING * INTO v_visitor;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(p_visitor_id::text, 0));
    SELECT * INTO v_visitor
    FROM public.visitors
    WHERE id = p_visitor_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pengunjung tidak ditemukan atau telah dihapus.';
    END IF;
    SELECT id INTO v_active_id
    FROM public.visitor_visits
    WHERE visitor_id = p_visitor_id
      AND check_out_at IS NULL
      AND deleted_at IS NULL;
    IF v_active_id IS NOT NULL THEN
      RAISE EXCEPTION 'Pengunjung masih berada di lokasi. Tambahkan pembelian pada kunjungan aktif (%).', v_active_id;
    END IF;
  END IF;

  INSERT INTO public.visitor_visits (
    visitor_id, check_in_at, notes, created_by, updated_by
  ) VALUES (
    v_visitor.id, v_now, nullif(btrim(p_visit_notes), ''), v_user_id, v_user_id
  ) RETURNING * INTO v_visit;

  v_summary := public.insert_visitor_sales(v_visit.id, p_items, v_user_id, v_now);
  RETURN jsonb_build_object(
    'visitor_id', v_visitor.id,
    'visitor_code', v_visitor.visitor_code,
    'full_name', v_visitor.full_name,
    'visitor_visit_id', v_visit.id,
    'check_in_at', v_visit.check_in_at,
    'total_items', v_summary->'total_items',
    'total_quantity', v_summary->'total_quantity',
    'total_amount', v_summary->'total_amount'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_visitor_purchase(
  p_visit_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_visit public.visitor_visits%ROWTYPE;
  v_visitor public.visitors%ROWTYPE;
  v_summary jsonb;
  v_now timestamptz := now();
BEGIN
  v_user_id := public.require_visitor_role(ARRAY['staff', 'admin', 'super_admin']);
  SELECT * INTO v_visit FROM public.visitor_visits
  WHERE id = p_visit_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_visit.check_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'Kunjungan tidak ditemukan atau pengunjung sudah pulang.';
  END IF;
  SELECT * INTO v_visitor FROM public.visitors
  WHERE id = v_visit.visitor_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengunjung tidak ditemukan atau telah dihapus.';
  END IF;
  v_summary := public.insert_visitor_sales(v_visit.id, p_items, v_user_id, v_now);
  RETURN v_summary || jsonb_build_object(
    'visitor_visit_id', v_visit.id,
    'visitor_id', v_visitor.id,
    'visitor_code', v_visitor.visitor_code,
    'full_name', v_visitor.full_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_out_visitor(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_visit public.visitor_visits%ROWTYPE;
  v_visitor public.visitors%ROWTYPE;
BEGIN
  v_user_id := public.require_visitor_role(ARRAY['staff', 'admin', 'super_admin']);
  SELECT * INTO v_visit FROM public.visitor_visits
  WHERE id = p_visit_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kunjungan tidak ditemukan.'; END IF;
  IF v_visit.check_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pengunjung sudah ditandai pulang.';
  END IF;
  UPDATE public.visitor_visits
  SET check_out_at = now(), updated_at = now(), updated_by = v_user_id
  WHERE id = p_visit_id
  RETURNING * INTO v_visit;
  SELECT * INTO v_visitor FROM public.visitors WHERE id = v_visit.visitor_id;
  RETURN jsonb_build_object(
    'visitor_visit_id', v_visit.id, 'visitor_id', v_visitor.id,
    'visitor_code', v_visitor.visitor_code, 'full_name', v_visitor.full_name,
    'check_out_at', v_visit.check_out_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_visitor_visits(
  p_status text DEFAULT 'active',
  p_query text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.require_visitor_role(ARRAY['staff', 'admin', 'super_admin']);
  WITH filtered AS (
    SELECT vv.id, vv.visitor_id, v.visitor_code, v.full_name, v.phone,
      vv.check_in_at, vv.check_out_at, vv.notes, vv.updated_at,
      coalesce(sum(s.quantity) FILTER (WHERE s.deleted_at IS NULL), 0) total_quantity,
      coalesce(sum(s.amount) FILTER (WHERE s.deleted_at IS NULL), 0) total_amount,
      coalesce(jsonb_agg(
        jsonb_build_object('product_id', p.id, 'name', p.name, 'quantity', s.quantity, 'amount', s.amount)
        ORDER BY s.created_at
      ) FILTER (WHERE s.id IS NOT NULL AND s.deleted_at IS NULL), '[]'::jsonb) products
    FROM public.visitor_visits vv
    JOIN public.visitors v ON v.id = vv.visitor_id
    LEFT JOIN public.sales s ON s.visitor_visit_id = vv.id
    LEFT JOIN public.products p ON p.id = s.product_id
    WHERE vv.deleted_at IS NULL AND v.deleted_at IS NULL
      AND (p_status = 'all' OR (p_status = 'active' AND vv.check_out_at IS NULL)
           OR (p_status = 'history' AND vv.check_out_at IS NOT NULL))
      AND (nullif(btrim(p_query), '') IS NULL OR v.visitor_code ILIKE '%'||btrim(p_query)||'%'
           OR v.full_name ILIKE '%'||btrim(p_query)||'%' OR coalesce(v.phone,'') ILIKE '%'||btrim(p_query)||'%')
      AND (p_from IS NULL OR (vv.check_in_at AT TIME ZONE 'Asia/Jakarta')::date >= p_from)
      AND (p_to IS NULL OR (vv.check_in_at AT TIME ZONE 'Asia/Jakarta')::date <= p_to)
    GROUP BY vv.id, v.visitor_code, v.full_name, v.phone
  ), counted AS (SELECT count(*) total FROM filtered),
  paged AS (
    SELECT * FROM filtered ORDER BY check_in_at DESC
    LIMIT least(greatest(p_page_size, 1), 100)
    OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb),
    'total', (SELECT total FROM counted),
    'page', greatest(p_page, 1),
    'page_size', least(greatest(p_page_size, 1), 100)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_visitors_admin(
  p_query text DEFAULT NULL,
  p_deleted boolean DEFAULT false,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.require_visitor_role(
    CASE WHEN p_deleted THEN ARRAY['super_admin'] ELSE ARRAY['admin','super_admin'] END
  );
  WITH aggregated AS (
    SELECT v.id, v.visitor_code, v.full_name, v.phone, v.notes, v.updated_at, v.deleted_at,
      min(vv.check_in_at) first_visit_at, max(vv.check_in_at) last_visit_at,
      count(DISTINCT vv.id) FILTER (WHERE vv.deleted_at IS NULL) visit_count,
      coalesce(sum(s.quantity) FILTER (WHERE s.deleted_at IS NULL), 0) total_quantity,
      coalesce(sum(s.amount) FILTER (WHERE s.deleted_at IS NULL), 0) total_amount,
      bool_or(vv.check_out_at IS NULL AND vv.deleted_at IS NULL) is_visiting
    FROM public.visitors v
    LEFT JOIN public.visitor_visits vv ON vv.visitor_id = v.id
    LEFT JOIN public.sales s ON s.visitor_visit_id = vv.id
    WHERE (p_deleted = (v.deleted_at IS NOT NULL))
      AND (nullif(btrim(p_query), '') IS NULL OR v.visitor_code ILIKE '%'||btrim(p_query)||'%'
        OR v.full_name ILIKE '%'||btrim(p_query)||'%' OR coalesce(v.phone,'') ILIKE '%'||btrim(p_query)||'%')
    GROUP BY v.id
  ), counted AS (SELECT count(*) total FROM aggregated),
  paged AS (
    SELECT * FROM aggregated ORDER BY updated_at DESC
    LIMIT least(greatest(p_page_size,1),100)
    OFFSET (greatest(p_page,1)-1)*least(greatest(p_page_size,1),100)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb),
    'total', (SELECT total FROM counted)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_visitor_identity(
  p_visitor_id uuid, p_full_name text, p_phone text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS public.visitors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_user_id uuid; v_result public.visitors;
BEGIN
  v_user_id := public.require_visitor_role(ARRAY['admin','super_admin']);
  IF nullif(btrim(p_full_name),'') IS NULL THEN RAISE EXCEPTION 'Nama pengunjung wajib diisi.'; END IF;
  UPDATE public.visitors SET full_name=btrim(p_full_name), phone=nullif(btrim(p_phone),''),
    notes=nullif(btrim(p_notes),''), updated_by=v_user_id
  WHERE id=p_visitor_id AND deleted_at IS NULL RETURNING * INTO v_result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengunjung tidak ditemukan.'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_visitor(p_visitor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id uuid;
BEGIN
  v_user_id:=public.require_visitor_role(ARRAY['admin','super_admin']);
  IF EXISTS (SELECT 1 FROM public.visitor_visits WHERE visitor_id=p_visitor_id AND check_out_at IS NULL AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'Pengunjung yang masih berada di lokasi tidak dapat dihapus.'; END IF;
  UPDATE public.visitors SET deleted_at=now(),deleted_by=v_user_id,updated_by=v_user_id
  WHERE id=p_visitor_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengunjung tidak ditemukan atau sudah dihapus.'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.soft_delete_visitor_visit(p_visit_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id uuid;
BEGIN
  v_user_id:=public.require_visitor_role(ARRAY['admin','super_admin']);
  UPDATE public.visitor_visits SET deleted_at=now(),deleted_by=v_user_id,updated_by=v_user_id
  WHERE id=p_visit_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kunjungan tidak ditemukan atau sudah dihapus.'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.restore_visitor(p_visitor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id uuid;
BEGIN
  v_user_id:=public.require_visitor_role(ARRAY['super_admin']);
  UPDATE public.visitors SET deleted_at=NULL,deleted_by=NULL,updated_by=v_user_id
  WHERE id=p_visitor_id AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Data pengunjung terhapus tidak ditemukan.'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.restore_visitor_visit(p_visit_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id uuid;
BEGIN
  v_user_id:=public.require_visitor_role(ARRAY['super_admin']);
  UPDATE public.visitor_visits SET deleted_at=NULL,deleted_by=NULL,updated_by=v_user_id
  WHERE id=p_visit_id AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Data kunjungan terhapus tidak ditemukan.'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.hard_delete_visitor(p_visitor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_visitor_role(ARRAY['super_admin']);
  IF EXISTS (SELECT 1 FROM public.visitor_visits WHERE visitor_id=p_visitor_id)
    THEN RAISE EXCEPTION 'Pengunjung memiliki riwayat kunjungan dan tidak dapat dihapus permanen.'; END IF;
  DELETE FROM public.visitors WHERE id=p_visitor_id AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Data pengunjung terhapus tidak ditemukan.'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.hard_delete_visitor_visit(p_visit_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_visitor_role(ARRAY['super_admin']);
  IF EXISTS (SELECT 1 FROM public.sales WHERE visitor_visit_id=p_visit_id)
    THEN RAISE EXCEPTION 'Kunjungan memiliki penjualan terkait dan tidak dapat dihapus permanen.'; END IF;
  DELETE FROM public.visitor_visits WHERE id=p_visit_id AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Data kunjungan terhapus tidak ditemukan.'; END IF;
END; $$;

DROP POLICY IF EXISTS "Admin reads active visitors" ON public.visitors;
CREATE POLICY "Admin reads active visitors" ON public.visitors FOR SELECT TO authenticated
USING (public.current_user_has_any_role(ARRAY['admin','super_admin'])
  AND (deleted_at IS NULL OR public.current_user_has_any_role(ARRAY['super_admin'])));

DROP POLICY IF EXISTS "Visitor roles read visits" ON public.visitor_visits;
CREATE POLICY "Visitor roles read visits" ON public.visitor_visits FOR SELECT TO authenticated
USING (public.current_user_has_any_role(ARRAY['staff','admin','super_admin'])
  AND (deleted_at IS NULL OR public.current_user_has_any_role(ARRAY['super_admin'])));

-- Semua write tabel visitor dilakukan melalui RPC SECURITY DEFINER.
REVOKE INSERT, UPDATE, DELETE ON public.visitors, public.visitor_visits FROM authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'search_operational_visitors(text,integer)',
    'record_visitor_purchase(jsonb,uuid,text,text,text)',
    'add_visitor_purchase(uuid,jsonb)',
    'check_out_visitor(uuid)',
    'list_visitor_visits(text,text,date,date,integer,integer)',
    'list_visitors_admin(text,boolean,integer,integer)',
    'update_visitor_identity(uuid,text,text,text)',
    'soft_delete_visitor(uuid)',
    'soft_delete_visitor_visit(uuid)',
    'restore_visitor(uuid)',
    'restore_visitor_visit(uuid)',
    'hard_delete_visitor(uuid)',
    'hard_delete_visitor_visit(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END;
$$;
