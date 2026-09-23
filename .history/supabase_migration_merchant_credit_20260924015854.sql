-- VERESIYE TABLOLARI ICIN GUVENLI SUPABASE MIGRATION
-- Supabase SQL Editor'de bir kez calistirin.

CREATE TABLE IF NOT EXISTS merchants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  shop_type TEXT DEFAULT 'Esnaf',
  phone TEXT,
  notes TEXT,
  balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_transactions (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('order', 'payment')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  payment_type TEXT DEFAULT 'nakit',
  waiter_name TEXT DEFAULT 'Kasa',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE merchant_transactions
  ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'nakit';

ALTER TABLE merchant_transactions
  ADD COLUMN IF NOT EXISTS waiter_name TEXT DEFAULT 'Kasa';

ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes merchants okuyup yazabilir') THEN
    CREATE POLICY "Herkes merchants okuyup yazabilir"
      ON merchants FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes merchant_transactions okuyup yazabilir') THEN
    CREATE POLICY "Herkes merchant_transactions okuyup yazabilir"
      ON merchant_transactions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_merchant_transactions_merchant_created
  ON merchant_transactions (merchant_id, created_at DESC);

-- Hareketlerden bakiyeleri yeniden hesapla.
UPDATE merchants AS m
SET balance = COALESCE(t.balance, 0)
FROM (
  SELECT
    merchant_id,
    SUM(CASE WHEN type = 'order' THEN amount ELSE -amount END) AS balance
  FROM merchant_transactions
  GROUP BY merchant_id
) AS t
WHERE m.id = t.merchant_id;
