-- 1. Create QC Status enum
DO $\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qc_status') THEN
    CREATE TYPE public.qc_status AS ENUM ('quarantine', 'approved', 'rejected', 'conditional');
  END IF;
END $\$;

-- 2. Add QC & Storage columns to items table
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS qc_status public.qc_status NOT NULL DEFAULT 'quarantine';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS storage_location text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS qc_notes text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS qc_inspected_at timestamptz;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS qc_inspected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Enhance RLS Security: Restrict deletion of raw material batches to admins only
DROP POLICY IF EXISTS "items delete" ON public.items;
CREATE POLICY "items admin delete" ON public.items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- 4. Ensure production_date is before or equal to expiry_date at DB level
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_dates_check;
ALTER TABLE public.items ADD CONSTRAINT items_dates_check CHECK (production_date IS NULL OR production_date <= expiry_date);
