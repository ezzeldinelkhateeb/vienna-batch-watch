-- 1. Ensure user midooda1995@gmail.com is assigned admin role
DO $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Look up user id from auth.users
  SELECT id INTO target_user_id FROM auth.users WHERE lower(email) = 'midooda1995@gmail.com' LIMIT 1;
  
  IF target_user_id IS NOT NULL THEN
    -- Ensure profile exists
    INSERT INTO public.profiles (id, email)
    VALUES (target_user_id, 'midooda1995@gmail.com')
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

    -- Delete any old role and assign admin
    DELETE FROM public.user_roles WHERE user_id = target_user_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'admin'::public.app_role);
  END IF;
END $$;

-- 2. Update handle_new_user trigger to always prioritize midooda1995@gmail.com as admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count integer;
  assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

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
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Ensure profiles and user_roles can be queried and managed by authenticated users / admins
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "roles readable by authenticated" ON public.user_roles;
CREATE POLICY "roles readable by authenticated" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "roles manageable by admin" ON public.user_roles;
CREATE POLICY "roles manageable by admin" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Enable pgcrypto extension for secure password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 5. Direct team member creation function (bypasses email rate limits & auto-confirms)
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
  -- Check admin authorization
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can create team members';
  END IF;

  -- Check if user already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(_email))) THEN
    RAISE EXCEPTION 'User with this email already exists';
  END IF;

  _new_id := gen_random_uuid();
  _encrypted_pw := extensions.crypt(_password, extensions.gen_salt('bf'));

  -- Insert directly into auth.users as fully confirmed
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

  -- Ensure profile exists
  INSERT INTO public.profiles (id, email)
  VALUES (_new_id, lower(trim(_email)))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  -- Ensure user role is assigned
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_new_id, _role)
  ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team_member(text, text, public.app_role) TO authenticated;
