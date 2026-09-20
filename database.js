const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'pakyurek.db');
const db = new sqlite3.Database(dbPath);

// Helper for promises
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

async function initDatabase() {
  // Tabloları oluştur
  await run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,
    sort_order INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quick_notes TEXT,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    section TEXT DEFAULT 'Salon',
    status TEXT DEFAULT 'empty'
  )`);

  await run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL,
    table_name TEXT NOT NULL,
    waiter_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, preparing, ready, completed, cancelled
    total_amount REAL DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL,
    note TEXT,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  )`);

  await run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER,
    table_name TEXT,
    amount REAL NOT NULL,
    payment_type TEXT DEFAULT 'nakit', -- nakit, kart, veresiye
    waiter_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Esnaf & Veresiye / Çetele Tabloları
  await run(`CREATE TABLE IF NOT EXISTS merchants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    shop_type TEXT DEFAULT 'Esnaf', -- Berber, Terzi, Kasap, Eczane, Taksi vb.
    phone TEXT,
    notes TEXT,
    balance REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS merchant_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'order' (borç ekleme) veya 'payment' (tahsilat alma)
    amount REAL NOT NULL,
    description TEXT,
    payment_type TEXT DEFAULT 'nakit', -- nakit, kart
    waiter_name TEXT DEFAULT 'Kasa',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
  )`);

  // Garsonlar Tablosu
  await run(`CREATE TABLE IF NOT EXISTS waiters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT (datetime('now', 'localtime'))
  )`);

  // Başlangıç Garsonları kontrol et
  const waiterCount = await get('SELECT COUNT(*) as count FROM waiters');
  if (waiterCount.count === 0) {
    console.log('Başlangıç garsonları ekleniyor...');
    const defaultWaiters = ['Yusuf', 'Muhammed', 'Mehmet Salih', 'Ahmet'];
    for (const w of defaultWaiters) {
      await run('INSERT OR IGNORE INTO waiters (name) VALUES (?)', [w]);
    }
  }

  // Başlangıç Esnafları kontrol et
  const merchantCount = await get('SELECT COUNT(*) as count FROM merchants');
  if (merchantCount.count === 0) {
    console.log('Başlangıç çevre esnafları ekleniyor...');
    const initialMerchants = [
      { name: 'Berber Ahmet', shop_type: 'Berber', phone: '0555 111 2233', notes: 'Çarşı İçi No: 4', balance: 140 },
      { name: 'Terzi Mehmet Usta', shop_type: 'Terzi', phone: '0555 222 3344', notes: 'Pasaj İçi Kat 1', balance: 90 },
      { name: 'Kasap Veli', shop_type: 'Kasap', phone: '0555 333 4455', notes: 'Köşe Dükkan', balance: 250 },
      { name: 'Merkez Eczanesi', shop_type: 'Eczane', phone: '0555 444 5566', notes: 'Sağlık Ocağı Karşısı', balance: 60 },
      { name: 'Meydan Taksi Durağı', shop_type: 'Taksi', phone: '0555 555 6677', notes: 'Durağın İçi', balance: 180 }
    ];

    for (const m of initialMerchants) {
      const res = await run(
        'INSERT INTO merchants (name, shop_type, phone, notes, balance) VALUES (?, ?, ?, ?, ?)',
        [m.name, m.shop_type, m.phone, m.notes, m.balance]
      );
      // Başlangıç çetele hareketi
      if (m.balance > 0) {
        await run(
          "INSERT INTO merchant_transactions (merchant_id, type, amount, description, waiter_name, created_at) VALUES (?, 'order', ?, 'Açılış Çetele Bakiyesi', 'Sistem', datetime('now', 'localtime'))",
          [res.lastID, m.balance]
        );
      }
    }
  }

  // Başlangıç Kategorileri ve Ürünleri kontrol et
  const catCount = await get('SELECT COUNT(*) as count FROM categories');
  if (catCount.count === 0) {
    console.log('Başlangıç menü verileri ekleniyor...');

    await run(`INSERT INTO categories (name, icon, sort_order) VALUES 
      ('Çay & Sıcaklar', '☕', 1),
      ('Kahveler', '🫖', 2),
      ('Soğuk Meşrubatlar', '🥤', 3),
      ('Tost & Atıştırmalık', '🥪', 4)
    `);

    // Çay ve Sıcaklar
    const sicaklar = await get("SELECT id FROM categories WHERE name = 'Çay & Sıcaklar'");
    const kahveler = await get("SELECT id FROM categories WHERE name = 'Kahveler'");
    const soguklar = await get("SELECT id FROM categories WHERE name = 'Soğuk Meşrubatlar'");
    const yiyecek = await get("SELECT id FROM categories WHERE name = 'Tost & Atıştırmalık'");

    const defaultNotesCay = JSON.stringify(["Açık", "Koyu", "Duble", "Paşa", "Limonlu", "Fincan"]);
    const defaultNotesKahve = JSON.stringify(["Sade", "Az Şekerli", "Orta", "Şekerli", "Duble"]);
    const defaultNotesTost = JSON.stringify(["Çift Kaşar", "Acılı", "Ketçap/Mayonez", "İnce"]);

    // Ürünler
    const products = [
      { cat: sicaklar.id, name: 'Çay', price: 10, notes: defaultNotesCay },
      { cat: sicaklar.id, name: 'Oralet (Portakal)', price: 12, notes: JSON.stringify(["Sıcak", "Ilık"]) },
      { cat: sicaklar.id, name: 'Oralet (Kivi)', price: 12, notes: JSON.stringify(["Sıcak", "Ilık"]) },
      { cat: sicaklar.id, name: 'Kuşburnu', price: 15, notes: defaultNotesCay },
      { cat: sicaklar.id, name: 'Adaçayı', price: 15, notes: JSON.stringify(["Limonlu", "Ballı"]) },
      { cat: sicaklar.id, name: 'Ihlamur', price: 15, notes: JSON.stringify(["Limonlu", "Ballı"]) },
      { cat: sicaklar.id, name: 'Sıcak Süt', price: 20, notes: JSON.stringify(["Ballı", "Şekerli", "Sade"]) },
      { cat: sicaklar.id, name: 'Salep', price: 25, notes: JSON.stringify(["Bol Tarçınlı", "Tarçınsız"]) },

      { cat: kahveler.id, name: 'Türk Kahvesi', price: 30, notes: defaultNotesKahve },
      { cat: kahveler.id, name: 'Dibek Kahvesi', price: 35, notes: defaultNotesKahve },
      { cat: kahveler.id, name: 'Menengiç Kahvesi', price: 35, notes: defaultNotesKahve },
      { cat: kahveler.id, name: 'Nescafe (3ü1 Arada)', price: 20, notes: JSON.stringify(["Sütlü", "Sade"]) },

      { cat: soguklar.id, name: 'Maden Suyu (Sade)', price: 15, notes: JSON.stringify(["Limonlu", "Soğuk"]) },
      { cat: soguklar.id, name: 'Meyveli Soda (Limon)', price: 18, notes: JSON.stringify(["Soğuk"]) },
      { cat: soguklar.id, name: 'Meyveli Soda (Elma)', price: 18, notes: JSON.stringify(["Soğuk"]) },
      { cat: soguklar.id, name: 'Kola', price: 30, notes: JSON.stringify(["Soğuk", "Buzlu"]) },
      { cat: soguklar.id, name: 'Fanta', price: 30, notes: JSON.stringify(["Soğuk", "Buzlu"]) },
      { cat: soguklar.id, name: 'Gazoz', price: 25, notes: JSON.stringify(["Soğuk", "Limonlu"]) },
      { cat: soguklar.id, name: 'Ayran', price: 20, notes: JSON.stringify(["Açık", "Kapalı"]) },
      { cat: soguklar.id, name: 'Su (Küçük)', price: 8, notes: JSON.stringify(["Soğuk", "Oda Sıcaklığı"]) },

      { cat: yiyecek.id, name: 'Kaşarlı Tost', price: 50, notes: defaultNotesTost },
      { cat: yiyecek.id, name: 'Sucuklu Tost', price: 60, notes: defaultNotesTost },
      { cat: yiyecek.id, name: 'Karışık Tost', price: 65, notes: defaultNotesTost },
      { cat: yiyecek.id, name: 'Patates Tava', price: 50, notes: JSON.stringify(["Soslu", "Baharatlı"]) }
    ];

    for (const p of products) {
      await run(
        'INSERT INTO products (category_id, name, price, quick_notes) VALUES (?, ?, ?, ?)',
        [p.cat, p.name, p.price, p.notes]
      );
    }
  }

  // Masaları kontrol et
  const tableCount = await get('SELECT COUNT(*) as count FROM tables');
  if (tableCount.count === 0) {
    console.log('Başlangıç masaları ekleniyor...');
    // İçerisi Masaları 1 - 15
    for (let i = 1; i <= 15; i++) {
      await run('INSERT INTO tables (name, section, status) VALUES (?, ?, ?)', [`Masa ${i}`, 'İçerisi', 'empty']);
    }
    // Bahçe Masaları 1 - 10
    for (let i = 1; i <= 10; i++) {
      await run('INSERT INTO tables (name, section, status) VALUES (?, ?, ?)', [`Bahçe ${i}`, 'Bahçe', 'empty']);
    }
    // Dışarısı Masaları 1 - 5
    for (let i = 1; i <= 5; i++) {
      await run('INSERT INTO tables (name, section, status) VALUES (?, ?, ?)', [`Dışarısı ${i}`, 'Dışarısı', 'empty']);
    }
  }

  console.log('Veritabanı hazır ve güncel.');
}

module.exports = {
  db,
  run,
  all,
  get,
  initDatabase
};
