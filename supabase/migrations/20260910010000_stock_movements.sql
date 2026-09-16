-- ==============================================================================
-- Vienna Batch Watch: Production Dispense & Stock Movements Migration
-- ==============================================================================

-- 1. Create stock_movements table for tracking all raw material dispatches and consumptions
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  batch_number text,
  movement_type text NOT NULL DEFAULT 'production_dispense',
  quantity_dispensed numeric NOT NULL,
  unit text,
  previous_quantity numeric NOT NULL,
  remaining_quantity numeric NOT NULL,
  production_line text NOT NULL,
  recipient_name text,
  notes text,
  dispensed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dispensed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for efficient lookup and timeline reporting
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_id ON public.stock_movements (item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_line ON public.stock_movements (production_line);

-- 3. Permissions & RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "stock_movements select" ON public.stock_movements;
CREATE POLICY "stock_movements select" ON public.stock_movements FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "stock_movements insert" ON public.stock_movements;
CREATE POLICY "stock_movements insert" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() 
        AND ur.role::text IN ('admin', 'quality')
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.app_settings WHERE id = true AND is_app_locked = true
    )
  );

DROP POLICY IF EXISTS "stock_movements delete" ON public.stock_movements;
CREATE POLICY "stock_movements delete" ON public.stock_movements FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role::text = 'admin'
    )
  );
