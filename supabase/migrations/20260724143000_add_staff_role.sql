-- Sprint 5 / 1: role Staff dan pembatasan data operasional.
-- Jalankan setelah audit_before_staff_visitor_module.sql ditinjau.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

CREATE OR REPLACE FUNCTION public.current_user_has_any_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.current_user_is_active()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text = ANY (p_roles)
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_has_any_role(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_any_role(text[]) TO authenticated;

DROP POLICY IF EXISTS "Authenticated read active sales" ON public.sales;
CREATE POLICY "Operational roles read permitted sales"
  ON public.sales FOR SELECT TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['staff', 'admin', 'super_admin'])
    AND (
      deleted_at IS NULL
      OR public.current_user_has_any_role(ARRAY['super_admin'])
    )
  );

DROP POLICY IF EXISTS "Authenticated read active expenses" ON public.expenses;
CREATE POLICY "Operational roles read permitted expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['staff', 'admin', 'super_admin'])
    AND (
      deleted_at IS NULL
      OR public.current_user_has_any_role(ARRAY['super_admin'])
    )
  );

-- Existing direct INSERT/UPDATE/DELETE policies remain Admin/Super Admin only.
-- RPC soft delete diperketat agar grant authenticated tidak memberi Staff hak mutasi.
CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.current_user_has_any_role(ARRAY['admin','super_admin']) THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin menghapus penjualan.';
  END IF;
  UPDATE public.sales
  SET deleted_at=now(), deleted_by=auth.uid(), updated_by=auth.uid(), updated_at=now()
  WHERE id=p_id AND deleted_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_expense(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.current_user_has_any_role(ARRAY['admin','super_admin']) THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin menghapus pengeluaran.';
  END IF;
  UPDATE public.expenses
  SET deleted_at=now(), deleted_by=auth.uid(), updated_by=auth.uid(), updated_at=now()
  WHERE id=p_id AND deleted_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_sale(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_expense(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_sale(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_expense(uuid) TO authenticated;
