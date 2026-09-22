-- ==============================================================================
-- PAKYÜREK KIRAATHANESİ - TEK TIKLA TAM SUPABASE KURULUMU & VERİ YÜKLEME
-- ==============================================================================
-- Bu dosya hem TÜM TABLOLARI oluşturur hem de mevcut tüm esnaf bakiyelerini,
-- çeteleleri, menüyü, masaları ve geçmiş kasa hareketlerini Supabase'e yükler.
-- 
-- NASIL KULLANILIR?
-- 1. https://supabase.com adresinde oturum açıp projenize girin.
-- 2. Sol menüden "SQL Editor" bölümüne tıklayın.
-- 3. Bu dosyanın TÜM içeriğini kopyalayıp oraya yapıştırın ve "Run" butonuna basın!
-- ==============================================================================

-- 1. TABLOLARI OLUŞTUR
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  special_price NUMERIC(10, 2) DEFAULT NULL,
  quick_notes TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  section TEXT DEFAULT 'Salon',
  status TEXT DEFAULT 'empty',
  custom_tea_price NUMERIC(10, 2) DEFAULT NULL,
  is_special INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  table_id INTEGER NOT NULL,
  table_name TEXT NOT NULL,
  waiter_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  total_amount NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  table_id INTEGER,
  table_name TEXT,
  amount NUMERIC(10, 2) NOT NULL,
  payment_type TEXT DEFAULT 'nakit',
  waiter_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  shop_type TEXT DEFAULT 'Esnaf',
  phone TEXT,
  notes TEXT,
  balance NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_transactions (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  description TEXT,
  payment_type TEXT DEFAULT 'nakit',
  waiter_name TEXT DEFAULT 'Kasa',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waiters (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_product_prices (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  custom_price NUMERIC(10, 2) DEFAULT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (merchant_id, product_id)
);

-- GÜVENLİK (RLS) AYARLARI
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiters ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_product_prices ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes categories okuyup yazabilir') THEN
    CREATE POLICY "Herkes categories okuyup yazabilir" ON categories FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes products okuyup yazabilir') THEN
    CREATE POLICY "Herkes products okuyup yazabilir" ON products FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes tables okuyup yazabilir') THEN
    CREATE POLICY "Herkes tables okuyup yazabilir" ON tables FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes orders okuyup yazabilir') THEN
    CREATE POLICY "Herkes orders okuyup yazabilir" ON orders FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes order_items okuyup yazabilir') THEN
    CREATE POLICY "Herkes order_items okuyup yazabilir" ON order_items FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes payments okuyup yazabilir') THEN
    CREATE POLICY "Herkes payments okuyup yazabilir" ON payments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes merchants okuyup yazabilir') THEN
    CREATE POLICY "Herkes merchants okuyup yazabilir" ON merchants FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes merchant_transactions okuyup yazabilir') THEN
    CREATE POLICY "Herkes merchant_transactions okuyup yazabilir" ON merchant_transactions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes merchant_product_prices okuyup yazabilir') THEN
    CREATE POLICY "Herkes merchant_product_prices okuyup yazabilir" ON merchant_product_prices FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Herkes waiters okuyup yazabilir') THEN
    CREATE POLICY "Herkes waiters okuyup yazabilir" ON waiters FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ==============================================================================
-- 2. MEVCUT TÜM VERİLERİ YÜKLE
-- ==============================================================================

-- KATEGORİLER
INSERT INTO categories (id, name, icon, sort_order) VALUES (1, 'Çay & Sıcaklar', '☕', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;
INSERT INTO categories (id, name, icon, sort_order) VALUES (2, 'Kahveler', '🫖', 2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;
INSERT INTO categories (id, name, icon, sort_order) VALUES (3, 'Soğuk Meşrubatlar', '🥤', 3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;
SELECT setval('categories_id_seq', (SELECT COALESCE(MAX(id), 1) FROM categories));

-- ÜRÜNLER VE FİYATLAR (Standart ve Masalara Özel 10 TL Fiyatları Dahil)
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (1, 1, 'Çay', 15, 10, '["Açık","Koyu","Duble","Paşa","Limonlu","Fincan"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (2, 1, 'Oralet (Portakal)', 15, 10, '["Sıcak","Ilık"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (3, 1, 'Oralet (Kivi)', 15, 10, '["Sıcak","Ilık"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (4, 1, 'Kuşburnu', 15, 10, '["Açık","Koyu","Duble","Paşa","Limonlu","Fincan"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (5, 1, 'Adaçayı', 15, 10, '["Limonlu","Ballı"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (6, 1, 'Ihlamur', 15, 10, '["Limonlu","Ballı"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (7, 1, 'Sıcak Süt', 20, NULL, '["Ballı","Şekerli","Sade"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (8, 1, 'Salep', 25, NULL, '["Bol Tarçınlı","Tarçınsız"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (9, 2, 'Türk Kahvesi', 30, NULL, '["Sade","Az Şekerli","Orta","Şekerli","Duble"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (10, 2, 'Dibek Kahvesi', 35, NULL, '["Sade","Az Şekerli","Orta","Şekerli","Duble"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (11, 2, 'Menengiç Kahvesi', 35, NULL, '["Sade","Az Şekerli","Orta","Şekerli","Duble"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (12, 2, 'Nescafe (3ü1 Arada)', 20, NULL, '["Sütlü","Sade"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (13, 3, 'Maden Suyu (Sade)', 15, NULL, '["Limonlu","Soğuk"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (14, 3, 'Meyveli Soda (Limon)', 18, NULL, '["Soğuk"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (15, 3, 'Meyveli Soda (Elma)', 18, NULL, '["Soğuk"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (16, 3, 'Kola', 30, NULL, '["Soğuk","Buzlu"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (17, 3, 'Fanta', 30, NULL, '["Soğuk","Buzlu"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (18, 3, 'Gazoz', 25, NULL, '["Soğuk","Limonlu"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (19, 3, 'Ayran', 20, NULL, '["Açık","Kapalı"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (20, 3, 'Su (Küçük)', 8, NULL, '["Soğuk","Oda Sıcaklığı"]', 1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;
SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM products));

-- MASALAR (Salon, Bahçe, Dışarısı)
INSERT INTO tables (id, name, section, status, custom_tea_price, is_special) VALUES 
(1, 'Masa 1', 'İçerisi', 'empty', NULL, 0),
(2, 'Masa 2', 'İçerisi', 'empty', NULL, 0),
(3, 'Masa 3', 'İçerisi', 'empty', NULL, 0),
(4, 'Masa 4', 'İçerisi', 'empty', NULL, 0),
(5, 'Masa 5', 'İçerisi', 'empty', NULL, 0),
(6, 'Masa 6', 'İçerisi', 'empty', NULL, 0),
(7, 'Masa 7', 'İçerisi', 'empty', NULL, 0),
(8, 'Masa 8', 'İçerisi', 'empty', NULL, 0),
(9, 'Masa 9', 'İçerisi', 'empty', NULL, 0),
(10, 'Masa 10', 'İçerisi', 'empty', NULL, 0),
(11, 'Masa 11', 'İçerisi', 'empty', NULL, 0),
(12, 'Masa 12', 'İçerisi', 'empty', NULL, 0),
(13, 'Masa 13', 'İçerisi', 'empty', NULL, 0),
(14, 'Masa 14', 'İçerisi', 'empty', NULL, 0),
(15, 'Masa 15', 'İçerisi', 'empty', NULL, 0),
(16, 'Bahçe 1', 'Bahçe', 'empty', NULL, 0),
(17, 'Bahçe 2', 'Bahçe', 'empty', NULL, 0),
(18, 'Bahçe 3', 'Bahçe', 'empty', NULL, 0),
(19, 'Bahçe 4', 'Bahçe', 'empty', NULL, 0),
(20, 'Bahçe 5', 'Bahçe', 'empty', NULL, 0),
(21, 'Bahçe 6', 'Bahçe', 'empty', NULL, 0),
(22, 'Bahçe 7', 'Bahçe', 'empty', NULL, 0),
(23, 'Bahçe 8', 'Bahçe', 'empty', NULL, 0),
(24, 'Bahçe 9', 'Bahçe', 'empty', NULL, 0),
(25, 'Bahçe 10', 'Bahçe', 'empty', NULL, 0),
(26, 'Dışarısı 1', 'Dışarısı', 'empty', NULL, 0),
(27, 'Dışarısı 2', 'Dışarısı', 'empty', NULL, 0),
(28, 'Dışarısı 3', 'Dışarısı', 'empty', NULL, 0),
(29, 'Dışarısı 4', 'Dışarısı', 'empty', NULL, 0),
(30, 'Dışarısı 5', 'Dışarısı', 'empty', NULL, 0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, section = EXCLUDED.section, custom_tea_price = EXCLUDED.custom_tea_price, is_special = EXCLUDED.is_special;
SELECT setval('tables_id_seq', (SELECT COALESCE(MAX(id), 1) FROM tables));

-- ESNAFLAR VE MEVCUT VERESİYE BAKİYELERİ
INSERT INTO merchants (id, name, shop_type, phone, notes, balance) VALUES 
(1, 'Berber Ahmet', 'Berber', '0555 111 2233', 'Çarşı İçi No: 4', 140),
(2, 'Terzi Mehmet Usta', 'Terzi', '0555 222 3344', 'Pasaj İçi Kat 1', 90),
(3, 'Kasap Veli', 'Kasap', '0555 333 4455', 'Köşe Dükkan', 250),
(4, 'Merkez Eczanesi', 'Eczane', '0555 444 5566', 'Sağlık Ocağı Karşısı', 60),
(5, 'Meydan Taksi Durağı', 'Taksi', '0555 555 6677', 'Durağın İçi', 180)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, shop_type = EXCLUDED.shop_type, phone = EXCLUDED.phone, notes = EXCLUDED.notes, balance = EXCLUDED.balance;
SELECT setval('merchants_id_seq', (SELECT COALESCE(MAX(id), 1) FROM merchants));

-- ESNAF ÇETELE AÇILIŞ HAREKETLERİ
INSERT INTO merchant_transactions (id, merchant_id, type, amount, description, payment_type, waiter_name) VALUES 
(1, 1, 'order', 140, 'Açılış Çetele Bakiyesi', 'nakit', 'Sistem'),
(2, 2, 'order', 90, 'Açılış Çetele Bakiyesi', 'nakit', 'Sistem'),
(3, 3, 'order', 250, 'Açılış Çetele Bakiyesi', 'nakit', 'Sistem'),
(4, 4, 'order', 60, 'Açılış Çetele Bakiyesi', 'nakit', 'Sistem'),
(5, 5, 'order', 180, 'Açılış Çetele Bakiyesi', 'nakit', 'Sistem')
ON CONFLICT (id) DO NOTHING;
SELECT setval('merchant_transactions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM merchant_transactions));

-- GARSONLAR
INSERT INTO waiters (id, name) VALUES 
(1, 'Yusuf'),
(2, 'Muhammed'),
(3, 'Mehmet Salih'),
(4, 'Ahmet')
ON CONFLICT (id) DO NOTHING;
SELECT setval('waiters_id_seq', (SELECT COALESCE(MAX(id), 1) FROM waiters));
