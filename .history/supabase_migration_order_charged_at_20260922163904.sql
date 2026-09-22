-- Sipariş ücretinin yalnızca Ocak onayından sonra ve tek kez yazılması için.
-- Supabase Dashboard > SQL Editor bölümünde bir kez çalıştırın.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS charged_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
