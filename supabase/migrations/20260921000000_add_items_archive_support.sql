-- ==============================================================================
-- Vienna Batch Watch: Items Archive & Stock Exit Support Migration
-- ==============================================================================

-- 1. Add Archive Columns to Items Table
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS archived_reason text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS archived_by_email text;

-- 2. Performance Indexes for Filtering Active vs Archived
CREATE INDEX IF NOT EXISTS idx_items_is_archived ON public.items (is_archived);
CREATE INDEX IF NOT EXISTS idx_items_archived_at ON public.items (archived_at DESC);
