-- ==============================================================================
-- Vienna Batch Watch: App Lock, Monthly Review & 3-Tier Roles Migration
-- ==============================================================================

-- 1. Expand app_role ENUM to support 'admin', 'quality', 'view_only'
DO $$ BEGIN
  -- If quality does not exist
  BEGIN
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'quality';
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  -- If view_only does not exist
  BEGIN
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'view_only';
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;
END $$;

-- 2. Add App Lock / Maintenance Mode columns to app_settings
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS is_app_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS lock_message text DEFAULT 'التطبيق متوقف مؤقتاً لأعمال الصيانة والجرد. يُرجى مراجعة إدارة المصنع.';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Monthly Inventory Audit & Batch Reviews Table
CREATE TABLE IF NOT EXISTS public.batch_monthly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  month_year text NOT NULL, -- Format: YYYY-MM e.g. '2026-09'
  is_reviewed boolean NOT NULL DEFAULT true,
  physical_count numeric,
  notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batch_monthly_review_unique UNIQUE (item_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_monthly_reviews_month_year ON public.batch_monthly_reviews (month_year);
CREATE INDEX IF NOT EXISTS idx_monthly_reviews_item_id ON public.batch_monthly_reviews (item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_monthly_reviews TO authenticated;
GRANT ALL ON public.batch_monthly_reviews TO service_role;
ALTER TABLE public.batch_monthly_reviews ENABLE ROW LEVEL SECURITY;

-- 4. RLS for batch_monthly_reviews
DROP POLICY IF EXISTS "monthly_reviews select" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews select" ON public.batch_monthly_reviews FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "monthly_reviews insert" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews insert" ON public.batch_monthly_reviews FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role::text IN ('admin', 'quality')
    )
  );

DROP POLICY IF EXISTS "monthly_reviews update" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews update" ON public.batch_monthly_reviews FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role::text IN ('admin', 'quality')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role::text IN ('admin', 'quality')
    )
  );

DROP POLICY IF EXISTS "monthly_reviews delete" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews delete" ON public.batch_monthly_reviews FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role::text = 'admin'
    )
  );

-- 5. Update items RLS to enforce Role permissions & App Lock
-- Admin can always insert/update/delete. Quality can insert/update only when app is NOT locked. View-only can only read.
DROP POLICY IF EXISTS "items insert" ON public.items;
CREATE POLICY "items insert" ON public.items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() AND ur.role::text = 'quality'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.app_settings WHERE id = true AND is_app_locked = true
      )
    )
  );

DROP POLICY IF EXISTS "items update" ON public.items;
CREATE POLICY "items update" ON public.items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() AND ur.role::text = 'quality'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.app_settings WHERE id = true AND is_app_locked = true
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() AND ur.role::text = 'quality'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.app_settings WHERE id = true AND is_app_locked = true
      )
    )
  );
