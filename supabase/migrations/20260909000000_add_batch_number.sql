-- Add batch_number to items table for manufacturing lot/batch tracking
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS batch_number text;

-- Create index for fast batch number search and filtering
CREATE INDEX IF NOT EXISTS idx_items_batch_number ON public.items(batch_number);
