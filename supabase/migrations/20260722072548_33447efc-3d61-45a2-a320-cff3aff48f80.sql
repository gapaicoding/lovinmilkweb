
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'super_admin');

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- USER ROLES
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), false);
$$;

-- =========================================================
-- updated_at trigger helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- PROFILES RLS
-- =========================================================
CREATE POLICY "Authenticated can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Super admin can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin can insert profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR id = auth.uid());

-- =========================================================
-- USER ROLES RLS
-- =========================================================
CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

-- =========================================================
-- Auto-create profile + first user gets super_admin
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  SELECT COUNT(*) INTO user_count FROM public.profiles;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- SALES CATEGORIES
-- =========================================================
CREATE TABLE public.sales_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_categories TO authenticated;
GRANT ALL ON public.sales_categories TO service_role;
ALTER TABLE public.sales_categories ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_sales_categories_updated_at
BEFORE UPDATE ON public.sales_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated can read sales categories"
  ON public.sales_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Super admin manages sales categories"
  ON public.sales_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- =========================================================
-- EXPENSE CATEGORIES
-- =========================================================
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_expense_categories_updated_at
BEFORE UPDATE ON public.expense_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated can read expense categories"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Super admin manages expense categories"
  ON public.expense_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- =========================================================
-- SALES
-- =========================================================
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date DATE NOT NULL,
  sales_category_id UUID NOT NULL REFERENCES public.sales_categories(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_sales_date ON public.sales(transaction_date);
CREATE INDEX idx_sales_deleted_at ON public.sales(deleted_at);
CREATE INDEX idx_sales_category ON public.sales(sales_category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_sales_updated_at
BEFORE UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated read active sales"
  ON public.sales FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Authenticated insert sales"
  ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
    AND created_by = auth.uid()
  );

CREATE POLICY "Authenticated update sales"
  ON public.sales FOR UPDATE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "Super admin hard delete sales"
  ON public.sales FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- =========================================================
-- EXPENSES
-- =========================================================
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date DATE NOT NULL,
  expense_category_id UUID NOT NULL REFERENCES public.expense_categories(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_expenses_date ON public.expenses(transaction_date);
CREATE INDEX idx_expenses_deleted_at ON public.expenses(deleted_at);
CREATE INDEX idx_expenses_category ON public.expenses(expense_category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated read active expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authenticated insert expenses"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
    AND created_by = auth.uid()
  );

CREATE POLICY "Authenticated update expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (
    public.is_active_user(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "Super admin hard delete expenses"
  ON public.expenses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- =========================================================
-- SEED CATEGORIES
-- =========================================================
INSERT INTO public.sales_categories (name, description) VALUES
  ('Eatery', 'Penjualan dari area Eatery'),
  ('Playzone', 'Penjualan dari area Playzone'),
  ('Merchandise', 'Penjualan merchandise dan produk lainnya'),
  ('Event', 'Penjualan dari event dan booking khusus');

INSERT INTO public.expense_categories (name, description) VALUES
  ('Bahan Baku', 'Pembelian bahan baku dapur'),
  ('Gaji Karyawan', 'Pembayaran gaji dan bonus karyawan'),
  ('Utilitas', 'Listrik, air, internet, dan langganan lainnya'),
  ('Operasional', 'Biaya operasional harian'),
  ('Perawatan', 'Perawatan fasilitas dan peralatan'),
  ('Marketing', 'Pemasaran dan promosi');
