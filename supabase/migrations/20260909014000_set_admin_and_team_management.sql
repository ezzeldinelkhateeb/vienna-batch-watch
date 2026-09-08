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
