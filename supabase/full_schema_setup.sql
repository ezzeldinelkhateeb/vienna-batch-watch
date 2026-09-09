-- ==============================================================================
-- VIENNA BATCH WATCH - COMPLETE DATABASE INITIALIZATION SCRIPT
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- Project: ayhnzvvogzetsznfqxql
-- ==============================================================================

-- 1. Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'member');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qc_status') THEN
    CREATE TYPE public.qc_status AS ENUM ('quarantine', 'approved', 'rejected', 'conditional');
  END IF;
END $$;

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 3. User Roles Table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles readable by authenticated" ON public.user_roles;
CREATE POLICY "roles readable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- 4. Helper Function: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- 5. Items (Raw Materials & Batches) Table
CREATE TABLE IF NOT EXISTS public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code text,
  batch_number text,
  name text NOT NULL,
  supplier text,
  production_date date,
  expiry_date date NOT NULL,
  quantity numeric,
  unit text,
  notes text,
  photo_path text,
  last_notified_status text,
  qc_status public.qc_status NOT NULL DEFAULT 'quarantine',
  storage_location text,
  qc_notes text,
  qc_inspected_at timestamptz,
  qc_inspected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  coa_number text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Indexes & Constraints
CREATE INDEX IF NOT EXISTS items_expiry_idx ON public.items (expiry_date);
CREATE UNIQUE INDEX IF NOT EXISTS items_item_code_unique ON public.items (item_code) WHERE item_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_batch_number ON public.items(batch_number);

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_dates_check;
ALTER TABLE public.items ADD CONSTRAINT items_dates_check CHECK (production_date IS NULL OR production_date <= expiry_date);

-- RLS Policies for Items
DROP POLICY IF EXISTS "items shared read" ON public.items;
CREATE POLICY "items shared read" ON public.items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "items insert" ON public.items;
CREATE POLICY "items insert" ON public.items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "items update" ON public.items;
CREATE POLICY "items update" ON public.items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "items delete" ON public.items;
DROP POLICY IF EXISTS "items admin delete" ON public.items;
CREATE POLICY "items admin delete" ON public.items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- 6. App Settings Table
CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true,
  whatsapp_phone text,
  callmebot_apikey text,
  telegram_bot_token text,
  telegram_chat_id text,
  notify_channel text NOT NULL DEFAULT 'both',
  threshold_early integer NOT NULL DEFAULT 90,
  threshold_medium integer NOT NULL DEFAULT 60,
  threshold_critical integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id)
);
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings read" ON public.app_settings;
CREATE POLICY "settings read" ON public.app_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "settings admin insert" ON public.app_settings;
CREATE POLICY "settings admin insert" ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS "settings admin update" ON public.app_settings;
CREATE POLICY "settings admin update" ON public.app_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 7. Notification Log Table
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  status text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  message text,
  phone text,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "log read" ON public.notification_log;
CREATE POLICY "log read" ON public.notification_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "log insert" ON public.notification_log;
CREATE POLICY "log insert" ON public.notification_log FOR INSERT TO authenticated WITH CHECK (true);

-- 8. Triggers
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS items_updated_at ON public.items;
CREATE TRIGGER items_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Automatically assign midooda1995@gmail.com or the first user as 'admin'
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE admin_count integer; assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  
  IF lower(NEW.email) = 'midooda1995@gmail.com' THEN
    assigned_role := 'admin'::public.app_role;
  ELSE
    SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
    IF admin_count = 0 THEN
      assigned_role := 'admin'::public.app_role;
    ELSE
      assigned_role := 'member'::public.app_role;
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Storage Bucket: item-photos
INSERT INTO storage.buckets (id, name, public) VALUES ('item-photos', 'item-photos', false) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "item photos read" ON storage.objects;
CREATE POLICY "item photos read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'item-photos');

DROP POLICY IF EXISTS "item photos insert" ON storage.objects;
CREATE POLICY "item photos insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'item-photos');

DROP POLICY IF EXISTS "item photos update" ON storage.objects;
CREATE POLICY "item photos update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'item-photos') WITH CHECK (bucket_id = 'item-photos');

DROP POLICY IF EXISTS "item photos delete" ON storage.objects;
CREATE POLICY "item photos delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'item-photos');

-- 10. Direct Team Member Creation (Bypasses email rate limits & auto-confirms)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.create_team_member(
  _email text,
  _password text,
  _role public.app_role DEFAULT 'member'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _new_id uuid;
  _encrypted_pw text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can create team members';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(_email))) THEN
    RAISE EXCEPTION 'User with this email already exists';
  END IF;

  _new_id := gen_random_uuid();
  _encrypted_pw := extensions.crypt(_password, extensions.gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    _new_id,
    'authenticated',
    'authenticated',
    lower(trim(_email)),
    _encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    ''
  );

  INSERT INTO public.profiles (id, email)
  VALUES (_new_id, lower(trim(_email)))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_new_id, _role)
  ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team_member(text, text, public.app_role) TO authenticated;
