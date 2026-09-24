-- ==============================================================================
-- Vienna Batch Watch: Permanent RLS & 3-Tier Permissions Fix
-- Run this in Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. Ensure enum app_role supports 'quality' and 'view_only' if possible
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'quality';
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'view_only';
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- 2. Grant table permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_monthly_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs TO authenticated;
GRANT ALL ON public.items TO service_role;
GRANT ALL ON public.stock_movements TO service_role;
GRANT ALL ON public.batch_monthly_reviews TO service_role;
GRANT ALL ON public.activity_logs TO service_role;

-- 3. Items Table RLS Policies
-- Shared read: All authenticated users can view items
DROP POLICY IF EXISTS "items shared read" ON public.items;
DROP POLICY IF EXISTS "items select" ON public.items;
CREATE POLICY "items select" ON public.items FOR SELECT TO authenticated USING (true);

-- Insert: Any authenticated user EXCEPT view_only/viewer can insert (Admin bypasses lock, others blocked if locked)
DROP POLICY IF EXISTS "items insert" ON public.items;
CREATE POLICY "items insert" ON public.items FOR INSERT TO authenticated
  WITH CHECK (
    (
      NOT EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() 
        AND (ur.role::text = 'view_only' OR ur.role::text = 'viewer')
      )
    )
    AND (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin')
      OR NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id = true AND is_app_locked = true)
    )
  );

-- Update: Any authenticated user EXCEPT view_only/viewer can update (Admin bypasses lock)
DROP POLICY IF EXISTS "items update" ON public.items;
CREATE POLICY "items update" ON public.items FOR UPDATE TO authenticated
  USING (
    (
      NOT EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() 
        AND (ur.role::text = 'view_only' OR ur.role::text = 'viewer')
      )
    )
    AND (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin')
      OR NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id = true AND is_app_locked = true)
    )
  )
  WITH CHECK (
    (
      NOT EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() 
        AND (ur.role::text = 'view_only' OR ur.role::text = 'viewer')
      )
    )
    AND (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin')
      OR NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id = true AND is_app_locked = true)
    )
  );

-- Delete: Only Admin can delete items
DROP POLICY IF EXISTS "items delete" ON public.items;
DROP POLICY IF EXISTS "items admin delete" ON public.items;
CREATE POLICY "items admin delete" ON public.items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role::text = 'admin'
    )
  );

-- 4. Stock Movements Table RLS Policies
DROP POLICY IF EXISTS "stock_movements select" ON public.stock_movements;
CREATE POLICY "stock_movements select" ON public.stock_movements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "stock_movements insert" ON public.stock_movements;
CREATE POLICY "stock_movements insert" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    (
      NOT EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() 
        AND (ur.role::text = 'view_only' OR ur.role::text = 'viewer')
      )
    )
    AND (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin')
      OR NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id = true AND is_app_locked = true)
    )
  );

-- 5. Batch Monthly Reviews Table RLS Policies
DROP POLICY IF EXISTS "monthly_reviews select" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews select" ON public.batch_monthly_reviews FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "monthly_reviews insert" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews insert" ON public.batch_monthly_reviews FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND (ur.role::text = 'view_only' OR ur.role::text = 'viewer')
    )
  );

DROP POLICY IF EXISTS "monthly_reviews update" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews update" ON public.batch_monthly_reviews FOR UPDATE TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND (ur.role::text = 'view_only' OR ur.role::text = 'viewer')
    )
  )
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND (ur.role::text = 'view_only' OR ur.role::text = 'viewer')
    )
  );

-- 6. Storage Bucket item-photos policies
INSERT INTO storage.buckets (id, name, public) VALUES ('item-photos', 'item-photos', false) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "item photos read" ON storage.objects;
CREATE POLICY "item photos read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'item-photos');

DROP POLICY IF EXISTS "item photos insert" ON storage.objects;
CREATE POLICY "item photos insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'item-photos');

DROP POLICY IF EXISTS "item photos update" ON storage.objects;
CREATE POLICY "item photos update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'item-photos') WITH CHECK (bucket_id = 'item-photos');

DROP POLICY IF EXISTS "item photos delete" ON storage.objects;
CREATE POLICY "item photos delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'item-photos');

-- 7. Items Archive Support
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS archived_reason text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS archived_by_email text;
CREATE INDEX IF NOT EXISTS idx_items_is_archived ON public.items (is_archived);
CREATE INDEX IF NOT EXISTS idx_items_archived_at ON public.items (archived_at DESC);

