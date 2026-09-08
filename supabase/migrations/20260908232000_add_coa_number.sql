-- Add COA (Certificate of Analysis) reference column to items
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS coa_number text;
