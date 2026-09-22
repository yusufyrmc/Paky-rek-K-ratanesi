-- Esnaf özel ürün fiyatları için eksik tabloyu oluşturur.
-- Supabase Dashboard > SQL Editor bölümünde bir kez çalıştırın.

CREATE TABLE IF NOT EXISTS public.merchant_product_prices (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  custom_price NUMERIC(10, 2) DEFAULT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT merchant_product_prices_merchant_product_key UNIQUE (merchant_id, product_id)
);

ALTER TABLE public.merchant_product_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Herkes merchant_product_prices okuyup yazabilir" ON public.merchant_product_prices;
CREATE POLICY "Herkes merchant_product_prices okuyup yazabilir"
  ON public.merchant_product_prices
  FOR ALL
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
