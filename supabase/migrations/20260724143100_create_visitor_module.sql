-- Sprint 5 / 2: struktur visitor dan relasi tunggal ke sumber penjualan.

CREATE SEQUENCE IF NOT EXISTS public.visitor_code_seq START WITH 1 INCREMENT BY 1;
REVOKE ALL ON SEQUENCE public.visitor_code_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.visitor_code_seq TO service_role;

-- Database nyata tidak selalu memiliki helper dari migration historis.
-- Helper generic ini sengaja hanya mengatur updated_at.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_visitor_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.visitor_code IS NULL OR btrim(NEW.visitor_code) = '' THEN
    NEW.visitor_code := 'PG-' || lpad(nextval('public.visitor_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_visitor_code() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id),
  CONSTRAINT visitors_full_name_not_blank CHECK (btrim(full_name) <> ''),
  CONSTRAINT visitors_code_not_blank CHECK (btrim(visitor_code) <> ''),
  CONSTRAINT visitors_delete_audit_consistent CHECK (
    (deleted_at IS NULL AND deleted_by IS NULL)
    OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.visitor_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES public.visitors(id) ON DELETE RESTRICT,
  check_in_at timestamptz NOT NULL DEFAULT now(),
  check_out_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id),
  CONSTRAINT visitor_visits_checkout_valid CHECK (
    check_out_at IS NULL OR check_out_at >= check_in_at
  ),
  CONSTRAINT visitor_visits_delete_audit_consistent CHECK (
    (deleted_at IS NULL AND deleted_by IS NULL)
    OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
  )
);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS visitor_visit_id uuid,
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'manual';

UPDATE public.sales SET entry_source = 'manual' WHERE entry_source IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sales'::regclass
      AND conname = 'sales_entry_source_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_entry_source_check
      CHECK (entry_source IN ('manual', 'visitor'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sales'::regclass
      AND conname = 'sales_visitor_visit_id_fkey'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_visitor_visit_id_fkey
      FOREIGN KEY (visitor_visit_id)
      REFERENCES public.visitor_visits(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_visitors_name_lower ON public.visitors (lower(full_name));
CREATE INDEX IF NOT EXISTS idx_visitors_phone ON public.visitors (phone);
CREATE INDEX IF NOT EXISTS idx_visitors_deleted_at ON public.visitors (deleted_at);
CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON public.visitors (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_visits_one_active
  ON public.visitor_visits(visitor_id)
  WHERE check_out_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_visitor_visits_check_in ON public.visitor_visits(check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_check_out ON public.visitor_visits(check_out_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_visitor ON public.visitor_visits(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_deleted ON public.visitor_visits(deleted_at);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_created_by ON public.visitor_visits(created_by);

CREATE INDEX IF NOT EXISTS idx_sales_visitor_visit ON public.sales(visitor_visit_id);
CREATE INDEX IF NOT EXISTS idx_sales_entry_source ON public.sales(entry_source);
CREATE INDEX IF NOT EXISTS idx_sales_visit_deleted ON public.sales(visitor_visit_id, deleted_at);

ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_visits ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_visits TO authenticated;
GRANT ALL ON public.visitors, public.visitor_visits TO service_role;

-- Trigger dibuat terakhir setelah helper, tabel, kolom, constraint, dan index tersedia.
-- DROP IF EXISTS membuat rerun aman bila eksekusi sebelumnya berhenti sebagian.
DROP TRIGGER IF EXISTS set_visitors_code ON public.visitors;
CREATE TRIGGER set_visitors_code
BEFORE INSERT ON public.visitors
FOR EACH ROW EXECUTE FUNCTION public.generate_visitor_code();

DROP TRIGGER IF EXISTS update_visitors_updated_at ON public.visitors;
CREATE TRIGGER update_visitors_updated_at
BEFORE UPDATE ON public.visitors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_visitor_visits_updated_at ON public.visitor_visits;
CREATE TRIGGER update_visitor_visits_updated_at
BEFORE UPDATE ON public.visitor_visits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
