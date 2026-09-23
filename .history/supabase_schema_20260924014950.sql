-- ==============================================================================
-- PAKYÜREK KIRAATHANESİ - SUPABASE (POSTGRESQL) VERİTABANI ŞEMASI
-- Bu dosyayı Supabase Dashboard -> SQL Editor içerisine yapıştırıp "Run" butonuna basın.
-- ==============================================================================

-- 1. KATEGORİLER TABLOSU
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0
);

-- 2. ÜRÜNLER VE FİYATLAR TABLOSU
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  special_price NUMERIC(10, 2) DEFAULT NULL, -- Özel Masa Fiyatı (10 TL vb.)
  quick_notes TEXT DEFAULT '[]', -- Hızlı Seçenekler (Açık, Şekerli vb.)
  is_active INTEGER DEFAULT 1
);

-- 3. MASALAR TABLOSU
CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  section TEXT DEFAULT 'Salon',
  status TEXT DEFAULT 'empty',
  custom_tea_price NUMERIC(10, 2) DEFAULT NULL,
  is_special INTEGER DEFAULT 0 -- 1: Özel Fiyat Tarifesi Uygulansın, 0: Standart
);

-- 4. SİPARİŞLER (ADİSYONLAR) TABLOSU
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  table_id INTEGER NOT NULL,
  table_name TEXT NOT NULL,
  waiter_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, preparing, ready, completed, cancelled
  total_amount NUMERIC(10, 2) DEFAULT 0,
  charged_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. SİPARİŞ KALEMLERİ TABLOSU
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2) NOT NULL,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending'
);

-- 6. ÖDEMELER VE GÜNLÜK KAZANÇ / KASA TABLOSU
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  table_id INTEGER,
  table_name TEXT,
  amount NUMERIC(10, 2) NOT NULL,
  payment_type TEXT DEFAULT 'nakit', -- nakit, kart, veresiye
  waiter_name TEXT,
  business_date DATE DEFAULT (((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul') - INTERVAL '1 hour 50 minutes')::date),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Günlük iş günü bazında otomatik ciro özeti
CREATE TABLE IF NOT EXISTS daily_revenues (
  business_date DATE PRIMARY KEY,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  nakit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  kart NUMERIC(12, 2) NOT NULL DEFAULT 0,
  veresiye NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 7. ESNAF LİSTESİ VE VERESİYE ÇETELE TABLOSU
CREATE TABLE IF NOT EXISTS merchants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  shop_type TEXT DEFAULT 'Esnaf', -- Berber, Terzi, Kasap, Eczane, Taksi vb.
  phone TEXT,
  notes TEXT,
  balance NUMERIC(10, 2) DEFAULT 0, -- Güncel Borç / Bakiye
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. ESNAF ÇETELE HAREKETLERİ (BORÇ EKLEME VE TAHSİLAT)
CREATE TABLE IF NOT EXISTS merchant_transactions (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'order' (borç ekleme) veya 'payment' (tahsilat alma)
  amount NUMERIC(10, 2) NOT NULL,
  description TEXT,
  payment_type TEXT DEFAULT 'nakit', -- nakit, kart
  waiter_name TEXT DEFAULT 'Kasa',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. ESNAF ÖZEL MENÜ FİYATLARI TABLOSU
CREATE TABLE IF NOT EXISTS merchant_product_prices (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  custom_price NUMERIC(10, 2) DEFAULT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (merchant_id, product_id)
);

-- 10. GARSONLAR TABLOSU
CREATE TABLE IF NOT EXISTS waiters (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- GÜVENLİK (ROW LEVEL SECURITY - RLS) AYARLARI
-- Kıraathane içi tablet ve telefonların sorunsuz erişebilmesi için tablolara tam okuma/yazma izni verilir.
-- ==============================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Herkes categories okuyup yazabilir" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Herkes products okuyup yazabilir" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Herkes tables okuyup yazabilir" ON tables FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Herkes orders okuyup yazabilir" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Herkes order_items okuyup yazabilir" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Herkes payments okuyup yazabilir" ON payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Herkes daily_revenues okuyup yazabilir" ON daily_revenues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Herkes merchants okuyup yazabilir" ON merchants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Herkes merchant_transactions okuyup yazabilir" ON merchant_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Herkes merchant_product_prices okuyup yazabilir" ON merchant_product_prices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Herkes waiters okuyup yazabilir" ON waiters FOR ALL USING (true) WITH CHECK (true);
