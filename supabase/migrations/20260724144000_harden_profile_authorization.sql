BEGIN;

-- profiles.role is the canonical authorization source. New accounts must be
-- reviewed by an existing Super Admin before they can access the application.
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'staff'::public.app_role,
  ALTER COLUMN is_active SET DEFAULT false;

-- These helpers are used from RLS policies. SECURITY DEFINER avoids recursive
-- profile RLS evaluation, while the fixed search_path and auth.uid()-scoped
-- predicates keep them safe to expose to authenticated users.
CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.is_active
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.role = 'super_admin'::public.app_role
      AND profile.is_active
  );
$function$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.current_user_is_active()
  FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES
  ON FUNCTION public.is_super_admin()
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.current_user_is_active()
  TO authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.is_super_admin()
  TO authenticated, service_role;

-- Signup is intentionally non-privileged. In particular, authorization fields
-- from raw_user_meta_data are never copied into the profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $function$
DECLARE
  v_full_name text;
BEGIN
  v_full_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(SPLIT_PART(NEW.email, '@', 1)), ''),
    'Pengguna'
  );

  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    is_active
  )
  VALUES (
    NEW.id,
    v_full_name,
    'staff'::public.app_role,
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Trigger functions are not public RPCs. Revoking direct execution does not
-- prevent an already-created trigger from invoking its trigger function.
REVOKE ALL PRIVILEGES
  ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated, service_role;

-- Authorization changes have one narrow API. NULL means "leave the
-- field unchanged", allowing role and status changes to be issued separately.
CREATE OR REPLACE FUNCTION public.admin_update_profile_authorization(
  p_profile_id uuid,
  p_role public.app_role DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_current_role public.app_role;
  v_current_is_active boolean;
  v_next_role public.app_role;
  v_next_is_active boolean;
BEGIN
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles AS actor
    WHERE actor.id = v_actor_id
      AND actor.role = 'super_admin'::public.app_role
      AND actor.is_active
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Hanya Super Admin aktif yang dapat mengubah otorisasi pengguna.';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ID profil wajib diisi.';
  END IF;

  IF p_role IS NULL AND p_is_active IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Role atau status aktif yang baru wajib diisi.';
  END IF;

  IF p_profile_id = v_actor_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Anda tidak dapat mengubah otorisasi akun sendiri.';
  END IF;

  -- Serialize this RPC's authorization decisions. This prevents two concurrent
  -- demotions/deactivations from both observing another active Super Admin.
  PERFORM pg_catalog.pg_advisory_xact_lock(707246346224991957::bigint);

  -- Recheck after obtaining the lock so a queued caller cannot continue after
  -- another authorization transaction has removed its Super Admin access.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS actor
    WHERE actor.id = v_actor_id
      AND actor.role = 'super_admin'::public.app_role
      AND actor.is_active
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Otorisasi Super Admin Anda sudah tidak aktif.';
  END IF;

  SELECT target.role, target.is_active
  INTO v_current_role, v_current_is_active
  FROM public.profiles AS target
  WHERE target.id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Profil pengguna tidak ditemukan.';
  END IF;

  v_next_role := COALESCE(p_role, v_current_role);
  v_next_is_active := COALESCE(p_is_active, v_current_is_active);

  IF v_current_role = 'super_admin'::public.app_role
    AND v_current_is_active
    AND (
      v_next_role <> 'super_admin'::public.app_role
      OR NOT v_next_is_active
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles AS other_super_admin
      WHERE other_super_admin.id <> p_profile_id
        AND other_super_admin.role = 'super_admin'::public.app_role
        AND other_super_admin.is_active
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Minimal harus tersedia satu Super Admin aktif.';
  END IF;

  UPDATE public.profiles
  SET
    role = v_next_role,
    is_active = v_next_is_active
  WHERE id = p_profile_id;
END;
$function$;

COMMENT ON FUNCTION public.admin_update_profile_authorization(
  uuid,
  public.app_role,
  boolean
) IS
  'Changes profiles.role and/or profiles.is_active; active Super Admin only.';

REVOKE ALL PRIVILEGES
  ON FUNCTION public.admin_update_profile_authorization(
    uuid,
    public.app_role,
    boolean
  )
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
  ON FUNCTION public.admin_update_profile_authorization(
    uuid,
    public.app_role,
    boolean
  )
  TO authenticated, service_role;

-- Remove table-wide and any pre-existing column grants before applying the
-- least-privilege API contract.
REVOKE ALL PRIVILEGES
  ON TABLE public.profiles
  FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES (
  id,
  full_name,
  role,
  is_active,
  avatar_url,
  created_at,
  updated_at
)
  ON TABLE public.profiles
  FROM PUBLIC, anon, authenticated;

GRANT SELECT
  ON TABLE public.profiles
  TO authenticated;

GRANT UPDATE (full_name, avatar_url)
  ON TABLE public.profiles
  TO authenticated;

GRANT ALL PRIVILEGES
  ON TABLE public.profiles
  TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Remote history contains multiple overlapping permissive profile policies.
-- Rebuild the complete profile policy set so no stale policy can be OR-ed with
-- these predicates.
DO $migration$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  LOOP
    EXECUTE pg_catalog.format(
      'DROP POLICY %I ON public.profiles',
      v_policy.policyname
    );
  END LOOP;
END;
$migration$;

CREATE POLICY profiles_select_own_or_super_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
  );

CREATE POLICY profiles_update_own_display
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    AND public.current_user_is_active()
  )
  WITH CHECK (
    id = auth.uid()
    AND public.current_user_is_active()
  );

COMMIT;
