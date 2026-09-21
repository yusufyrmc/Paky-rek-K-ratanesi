// ==============================================================================
// SQLite (pakyurek.db) -> Supabase SQL Veri Dışa Aktarma Aracı
// Mevcut tüm esnaf bakiyelerini, menüyü, masaları ve kasa hareketlerini
// Supabase SQL Editor'de çalıştırılacak SQL INSERT ifadelerine dönüştürür.
// ==============================================================================

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'pakyurek.db');
const db = new sqlite3.Database(dbPath);

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

async function exportAllData() {
  console.log('Mevcut SQLite veritabanı okunuyor...');

  let sqlOutput = `-- ==============================================================================
-- PAKYÜREK KIRAATHANESİ - MEVCUT VERİLERİN SUPABASE AKTARIM DOSYASI
-- Tarih: ${new Date().toLocaleString('tr-TR')}
-- Bu dosyayı Supabase Dashboard -> SQL Editor içerisine yapıştırıp "Run" butonuna basarak
-- mevcut tüm esnaf bakiyelerinizi, menüyü, masaları ve geçmişi anında yükleyebilirsiniz!
-- ==============================================================================

`;

  try {
    // 1. Kategoriler
    const categories = await all('SELECT * FROM categories ORDER BY id');
    if (categories.length > 0) {
      sqlOutput += `-- 1. KATEGORİLER (${categories.length} Adet)\n`;
      for (const c of categories) {
        sqlOutput += `INSERT INTO categories (id, name, icon, sort_order) VALUES (${c.id}, ${escapeSql(c.name)}, ${escapeSql(c.icon)}, ${c.sort_order || 0}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;\n`;
      }
      sqlOutput += `SELECT setval('categories_id_seq', (SELECT COALESCE(MAX(id), 1) FROM categories));\n\n`;
    }

    // 2. Ürünler
    const products = await all('SELECT * FROM products ORDER BY id');
    if (products.length > 0) {
      sqlOutput += `-- 2. ÜRÜNLER VE FİYATLAR (${products.length} Adet)\n`;
      for (const p of products) {
        sqlOutput += `INSERT INTO products (id, category_id, name, price, special_price, quick_notes, is_active) VALUES (${p.id}, ${p.category_id || 'NULL'}, ${escapeSql(p.name)}, ${p.price}, ${p.special_price !== null && p.special_price !== undefined ? p.special_price : 'NULL'}, ${escapeSql(p.quick_notes || '[]')}, ${p.is_active ?? 1}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, special_price = EXCLUDED.special_price, quick_notes = EXCLUDED.quick_notes, is_active = EXCLUDED.is_active;\n`;
      }
      sqlOutput += `SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM products));\n\n`;
    }

    // 3. Masalar
    const tables = await all('SELECT * FROM tables ORDER BY id');
    if (tables.length > 0) {
      sqlOutput += `-- 3. MASALAR (${tables.length} Adet)\n`;
      for (const t of tables) {
        sqlOutput += `INSERT INTO tables (id, name, section, status, custom_tea_price, is_special) VALUES (${t.id}, ${escapeSql(t.name)}, ${escapeSql(t.section || 'Salon')}, ${escapeSql(t.status || 'empty')}, ${t.custom_tea_price != null ? t.custom_tea_price : 'NULL'}, ${t.is_special || 0}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, section = EXCLUDED.section, custom_tea_price = EXCLUDED.custom_tea_price, is_special = EXCLUDED.is_special;\n`;
      }
      sqlOutput += `SELECT setval('tables_id_seq', (SELECT COALESCE(MAX(id), 1) FROM tables));\n\n`;
    }

    // 4. Esnaflar ve Veresiye Bakiyeleri
    const merchants = await all('SELECT * FROM merchants ORDER BY id');
    if (merchants.length > 0) {
      sqlOutput += `-- 4. ESNAFLAR VE VERESİYE BAKİYELERİ (${merchants.length} Adet)\n`;
      for (const m of merchants) {
        sqlOutput += `INSERT INTO merchants (id, name, shop_type, phone, notes, balance, created_at) VALUES (${m.id}, ${escapeSql(m.name)}, ${escapeSql(m.shop_type || 'Esnaf')}, ${escapeSql(m.phone)}, ${escapeSql(m.notes)}, ${m.balance || 0}, ${m.created_at ? escapeSql(m.created_at) : 'NOW()'}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, shop_type = EXCLUDED.shop_type, phone = EXCLUDED.phone, notes = EXCLUDED.notes, balance = EXCLUDED.balance;\n`;
      }
      sqlOutput += `SELECT setval('merchants_id_seq', (SELECT COALESCE(MAX(id), 1) FROM merchants));\n\n`;
    }

    // 5. Esnaf Çetele Hareketleri
    const merchantTransactions = await all('SELECT * FROM merchant_transactions ORDER BY id');
    if (merchantTransactions.length > 0) {
      sqlOutput += `-- 5. ESNAF ÇETELE HAREKETLERİ (${merchantTransactions.length} Adet)\n`;
      for (const mt of merchantTransactions) {
        sqlOutput += `INSERT INTO merchant_transactions (id, merchant_id, type, amount, description, payment_type, waiter_name, created_at) VALUES (${mt.id}, ${mt.merchant_id}, ${escapeSql(mt.type)}, ${mt.amount}, ${escapeSql(mt.description)}, ${escapeSql(mt.payment_type || 'nakit')}, ${escapeSql(mt.waiter_name || 'Kasa')}, ${mt.created_at ? escapeSql(mt.created_at) : 'NOW()'}) ON CONFLICT (id) DO NOTHING;\n`;
      }
      sqlOutput += `SELECT setval('merchant_transactions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM merchant_transactions));\n\n`;
    }

    // 6. Garsonlar
    const waiters = await all('SELECT * FROM waiters ORDER BY id');
    if (waiters.length > 0) {
      sqlOutput += `-- 6. GARSONLAR (${waiters.length} Adet)\n`;
      for (const w of waiters) {
        sqlOutput += `INSERT INTO waiters (id, name, created_at) VALUES (${w.id}, ${escapeSql(w.name)}, ${w.created_at ? escapeSql(w.created_at) : 'NOW()'}) ON CONFLICT (id) DO NOTHING;\n`;
      }
      sqlOutput += `SELECT setval('waiters_id_seq', (SELECT COALESCE(MAX(id), 1) FROM waiters));\n\n`;
    }

    // 7. Ödemeler / Kasa Geçmişi
    const payments = await all('SELECT * FROM payments ORDER BY id');
    if (payments.length > 0) {
      sqlOutput += `-- 7. KASA VE ÖDEMELER GEÇMİŞİ (${payments.length} Adet)\n`;
      for (const p of payments) {
        sqlOutput += `INSERT INTO payments (id, table_id, table_name, amount, payment_type, waiter_name, created_at) VALUES (${p.id}, ${p.table_id || 'NULL'}, ${escapeSql(p.table_name)}, ${p.amount}, ${escapeSql(p.payment_type || 'nakit')}, ${escapeSql(p.waiter_name)}, ${p.created_at ? escapeSql(p.created_at) : 'NOW()'}) ON CONFLICT (id) DO NOTHING;\n`;
      }
      sqlOutput += `SELECT setval('payments_id_seq', (SELECT COALESCE(MAX(id), 1) FROM payments));\n\n`;
    }

    // 8. Siparişler ve Kalemleri (Açık ve geçmiş adisyonlar)
    const orders = await all('SELECT * FROM orders ORDER BY id');
    if (orders.length > 0) {
      sqlOutput += `-- 8. SİPARİŞLER (${orders.length} Adet)\n`;
      for (const o of orders) {
        sqlOutput += `INSERT INTO orders (id, table_id, table_name, waiter_name, status, total_amount, created_at, updated_at) VALUES (${o.id}, ${o.table_id}, ${escapeSql(o.table_name)}, ${escapeSql(o.waiter_name)}, ${escapeSql(o.status)}, ${o.total_amount || 0}, ${o.created_at ? escapeSql(o.created_at) : 'NOW()'}, ${o.updated_at ? escapeSql(o.updated_at) : 'NOW()'}) ON CONFLICT (id) DO NOTHING;\n`;
      }
      sqlOutput += `SELECT setval('orders_id_seq', (SELECT COALESCE(MAX(id), 1) FROM orders));\n\n`;
    }

    const orderItems = await all('SELECT * FROM order_items ORDER BY id');
    if (orderItems.length > 0) {
      sqlOutput += `-- 9. SİPARİŞ KALEMLERİ (${orderItems.length} Adet)\n`;
      for (const oi of orderItems) {
        sqlOutput += `INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price, note, status) VALUES (${oi.id}, ${oi.order_id}, ${oi.product_id || 'NULL'}, ${escapeSql(oi.product_name)}, ${oi.quantity}, ${oi.unit_price}, ${escapeSql(oi.note || '')}, ${escapeSql(oi.status || 'pending')}) ON CONFLICT (id) DO NOTHING;\n`;
      }
      sqlOutput += `SELECT setval('order_items_id_seq', (SELECT COALESCE(MAX(id), 1) FROM order_items));\n\n`;
    }

    const targetFile = path.join(__dirname, 'supabase_data_export.sql');
    fs.writeFileSync(targetFile, sqlOutput, 'utf8');

    console.log(`\nBAŞARILI! Tüm verileriniz '${targetFile}' dosyasına aktarıldı.`);
    console.log(`Bu dosyadaki SQL komutlarını Supabase Dashboard -> SQL Editor alanına yapıştırarak çalıştırabilirsiniz.`);
  } catch (err) {
    console.error('Dışa aktarma hatası:', err);
  } finally {
    db.close();
  }
}

exportAllData();
