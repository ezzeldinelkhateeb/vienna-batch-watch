-- Master Admin Control Center: App Logo & Icon Customization
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS app_logo_url TEXT DEFAULT NULL;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS app_icon TEXT DEFAULT '🏭';

UPDATE public.app_settings
SET
  app_logo_url = COALESCE(app_logo_url, NULL),
  app_icon = COALESCE(app_icon, '🏭')
WHERE id = true;
