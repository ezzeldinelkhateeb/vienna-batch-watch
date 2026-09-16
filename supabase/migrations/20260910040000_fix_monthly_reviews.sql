-- ==============================================================================
-- Vienna Batch Watch: Fix & Ensure Monthly Audit Table (batch_monthly_reviews)
-- ==============================================================================

-- 1. Create batch_monthly_reviews table
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

-- 2. Indexes for fast monthly audits
CREATE INDEX IF NOT EXISTS idx_monthly_reviews_month_year ON public.batch_monthly_reviews (month_year);
CREATE INDEX IF NOT EXISTS idx_monthly_reviews_item_id ON public.batch_monthly_reviews (item_id);

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_monthly_reviews TO authenticated;
GRANT ALL ON public.batch_monthly_reviews TO service_role;

-- 4. Enable Row Level Security
ALTER TABLE public.batch_monthly_reviews ENABLE ROW LEVEL SECURITY;

-- 5. Safe RLS Policies (Clean syntax with no invalid FOR clauses in DROP POLICY)
DROP POLICY IF EXISTS "monthly_reviews select" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews select"
  ON public.batch_monthly_reviews
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "monthly_reviews insert" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews insert"
  ON public.batch_monthly_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "monthly_reviews update" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews update"
  ON public.batch_monthly_reviews
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "monthly_reviews delete" ON public.batch_monthly_reviews;
CREATE POLICY "monthly_reviews delete"
  ON public.batch_monthly_reviews
  FOR DELETE
  TO authenticated
  USING (true);
