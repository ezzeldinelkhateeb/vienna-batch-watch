ALTER TABLE public.items ADD COLUMN IF NOT EXISTS item_code text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS photo_path text;
CREATE UNIQUE INDEX IF NOT EXISTS items_item_code_unique ON public.items (item_code) WHERE item_code IS NOT NULL;