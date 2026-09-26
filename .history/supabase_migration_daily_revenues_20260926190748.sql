-- PAKYÜREK KIRAATHANESİ - GÜNLÜK CİRO ÖZETİ VE VERESİYE KONTROLÜ
-- Supabase SQL Editor'de bir kez çalıştırın.
-- Veresiyeler merchants + merchant_transactions tablolarında zaten tutulur.

-- İş günü 01:40'ta değiştiği için ödeme kaydına iş günü tarihi eklenir.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS business_date DATE
  DEFAULT (((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour 40 minutes')::date);

ALTER TABLE payments
  ALTER COLUMN business_date
  SET DEFAULT (((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour 40 minutes')::date);

DROP TRIGGER IF EXISTS payments_refresh_daily_revenue ON payments;

UPDATE payments
SET business_date = ((created_at AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour 40 minutes')::date
WHERE business_date IS DISTINCT FROM ((created_at AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour 40 minutes')::date;

CREATE TABLE IF NOT EXISTS daily_revenues (
  business_date DATE PRIMARY KEY,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  nakit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  kart NUMERIC(12, 2) NOT NULL DEFAULT 0,
  veresiye NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION refresh_daily_revenue(target_date DATE)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO daily_revenues (business_date, total, nakit, kart, veresiye, transaction_count, updated_at)
  SELECT
    target_date,
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'nakit'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'kart'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'veresiye'), 0),
    COUNT(*),
    NOW()
  FROM payments
  WHERE business_date = target_date
  ON CONFLICT (business_date) DO UPDATE SET
    total = EXCLUDED.total,
    nakit = EXCLUDED.nakit,
    kart = EXCLUDED.kart,
    veresiye = EXCLUDED.veresiye,
    transaction_count = EXCLUDED.transaction_count,
    updated_at = NOW();

  IF NOT EXISTS (SELECT 1 FROM payments WHERE business_date = target_date) THEN
    DELETE FROM daily_revenues WHERE business_date = target_date;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION payments_refresh_daily_revenue_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_daily_revenue(OLD.business_date);
    RETURN OLD;
  END IF;

  PERFORM refresh_daily_revenue(NEW.business_date);
  IF TG_OP = 'UPDATE' AND OLD.business_date IS DISTINCT FROM NEW.business_date THEN
    PERFORM refresh_daily_revenue(OLD.business_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_refresh_daily_revenue ON payments;
CREATE TRIGGER payments_refresh_daily_revenue
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW
EXECUTE FUNCTION payments_refresh_daily_revenue_trigger();

-- Mevcut ödeme geçmişinden günlük özetleri ilk kez oluştur.
DELETE FROM daily_revenues d
WHERE NOT EXISTS (
  SELECT 1 FROM payments p WHERE p.business_date = d.business_date
);

INSERT INTO daily_revenues (business_date, total, nakit, kart, veresiye, transaction_count, updated_at)
SELECT
  business_date,
  COALESCE(SUM(amount), 0),
  COALESCE(SUM(amount) FILTER (WHERE payment_type = 'nakit'), 0),
  COALESCE(SUM(amount) FILTER (WHERE payment_type = 'kart'), 0),
  COALESCE(SUM(amount) FILTER (WHERE payment_type = 'veresiye'), 0),
  COUNT(*),
  NOW()
FROM payments
GROUP BY business_date
ON CONFLICT (business_date) DO UPDATE SET
  total = EXCLUDED.total,
  nakit = EXCLUDED.nakit,
  kart = EXCLUDED.kart,
  veresiye = EXCLUDED.veresiye,
  transaction_count = EXCLUDED.transaction_count,
  updated_at = NOW();

ALTER TABLE daily_revenues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Herkes daily_revenues okuyup yazabilir" ON daily_revenues;
CREATE POLICY "Herkes daily_revenues okuyup yazabilir"
  ON daily_revenues FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_payments_business_date ON payments (business_date);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_status ON orders (created_at, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_product ON order_items (order_id, product_name);
CREATE INDEX IF NOT EXISTS idx_merchant_transactions_merchant_date
  ON merchant_transactions (merchant_id, created_at DESC);
