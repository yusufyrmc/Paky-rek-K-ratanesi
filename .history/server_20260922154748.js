require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const { db, run, all, get, initDatabase } = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Yerel IP adresini bulma (Sanal ağları, WSL, Hyper-V ve Docker'ı filtreler)
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const devName in interfaces) {
    const lowerName = devName.toLowerCase();
    // Sanal ağ bağdaştırıcılarını atla
    if (lowerName.includes('vethernet') || 
        lowerName.includes('virtual') || 
        lowerName.includes('hyper-v') || 
        lowerName.includes('wsl') || 
        lowerName.includes('docker') || 
        lowerName.includes('bluetooth') || 
        lowerName.includes('loopback')) {
      continue;
    }

    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal) {
        // Otomatik IP (APIPA) 169.254'ü atla
        if (alias.address.startsWith('169.254.')) continue;

        // Wi-Fi bağdaştırıcısını veya 192.168.x.x IP'sini en başa koy
        if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('kablosuz') || alias.address.startsWith('192.168.')) {
          candidates.unshift(alias.address);
        } else {
          candidates.push(alias.address);
        }
      }
    }
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  // Yedek mekanizma
  return '192.168.1.110';
}

app.enable('trust proxy');

// ---------------- API ENDPOINTS ----------------

// Sistem Bilgisi ve QR Kodu (Render.com ve Yerel Ağ Uyumlu)
app.get('/api/info', async (req, res) => {
  try {
    const host = req.get('host') || 'localhost:3000';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';

    let garsonUrl;
    let ip;

    if (isLocal) {
      ip = getLocalIpAddress();
      garsonUrl = `http://${ip}:${PORT}/garson.html`;
    } else {
      // Render.com veya bulut sunucu: Doğrudan render alan adını (https://...onrender.com/garson.html) kullan!
      ip = host;
      garsonUrl = `${proto}://${host}/garson.html`;
    }

    const qrCodeDataUrl = await QRCode.toDataURL(garsonUrl, {
      width: 300,
      margin: 1,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      isCloud: !isLocal,
      host,
      ip,
      port: PORT,
      garsonUrl,
      qrCode: qrCodeDataUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Masalar Listesi (Açık hesap toplamı ile)
app.get('/api/tables', async (req, res) => {
  try {
    const tables = await all(`
      SELECT t.*, 
        COALESCE((
          SELECT SUM(o.total_amount) 
          FROM orders o 
          WHERE o.table_id = t.id AND o.status != 'completed' AND o.status != 'cancelled'
        ), 0) as current_total,
        COALESCE((
          SELECT COUNT(*) 
          FROM orders o 
          WHERE o.table_id = t.id AND o.status IN ('pending', 'preparing')
        ), 0) as pending_order_count
      FROM tables t
      ORDER BY t.section, t.id
    `);
    const formattedTables = tables.map(t => ({
      ...t,
      is_special: (t.is_special === 1 || (t.custom_tea_price != null && t.custom_tea_price > 0)) ? 1 : 0
    }));
    res.json({ success: true, data: formattedTables });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Yeni Masa Ekle
app.post('/api/tables', async (req, res) => {
  try {
    const { name, section, custom_tea_price, is_special } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Masa adı zorunlu' });
    const teaPrice = (custom_tea_price !== undefined && custom_tea_price !== '' && custom_tea_price !== null)
      ? parseFloat(custom_tea_price)
      : null;
    const specialVal = is_special ? 1 : (teaPrice !== null ? 1 : 0);
    const result = await run('INSERT INTO tables (name, section, custom_tea_price, is_special) VALUES (?, ?, ?, ?)', [name, section || 'Salon', teaPrice, specialVal]);
    io.emit('tables_changed');
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Masa Adı / Numarası / Özel Fiyat Durumu Güncelle
app.put('/api/tables/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, section, custom_tea_price, is_special } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Masa adı veya numarası zorunludur' });

    let teaPrice = null;
    if (custom_tea_price !== undefined && custom_tea_price !== '' && custom_tea_price !== null) {
      teaPrice = parseFloat(custom_tea_price);
    }

    let specialVal = undefined;
    if (is_special !== undefined && is_special !== null) {
      specialVal = is_special ? 1 : 0;
    } else if (teaPrice !== null && teaPrice > 0) {
      specialVal = 1;
    }

    await run(`
      UPDATE tables 
      SET name = ?, 
          section = COALESCE(?, section), 
          custom_tea_price = ?,
          is_special = COALESCE(?, is_special)
      WHERE id = ?
    `, [name, section || null, teaPrice, specialVal, id]);

    // Açık siparişlerdeki masa adını da güncelle
    await run("UPDATE orders SET table_name = ? WHERE table_id = ? AND status != 'completed' AND status != 'cancelled'", [name, id]);

    io.emit('tables_changed');
    res.json({ success: true, message: 'Masa bilgileri güncellendi' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Çoklu Masayı Özel Fiyatlı Yap / Standart Yap
app.post('/api/tables/bulk-special-pricing', async (req, res) => {
  try {
    const { table_ids, is_special, tea_price } = req.body;
    const specialVal = is_special ? 1 : 0;
    const price = (tea_price !== undefined && tea_price !== '' && tea_price !== null)
      ? parseFloat(tea_price)
      : null;

    if (Array.isArray(table_ids) && table_ids.length > 0) {
      const placeholders = table_ids.map(() => '?').join(',');
      await run(`UPDATE tables SET is_special = ?, custom_tea_price = ? WHERE id IN (${placeholders})`, [specialVal, price, ...table_ids]);
    }

    io.emit('tables_changed');
    res.json({ success: true, message: 'Masaların özel fiyat durumları güncellendi' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Çoklu Masaya Özel Çay Fiyatı Ayarla / Kaldır (Geriye Dönük Uyumluluk)
app.post('/api/tables/bulk-tea-price', async (req, res) => {
  try {
    const { table_ids, tea_price } = req.body;
    const price = (tea_price !== undefined && tea_price !== '' && tea_price !== null)
      ? parseFloat(tea_price)
      : null;
    const isSpecial = price !== null ? 1 : 0;

    if (Array.isArray(table_ids) && table_ids.length > 0) {
      const placeholders = table_ids.map(() => '?').join(',');
      await run(`UPDATE tables SET custom_tea_price = ?, is_special = ? WHERE id IN (${placeholders})`, [price, isSpecial, ...table_ids]);
    }

    io.emit('tables_changed');
    res.json({ success: true, message: 'Masaların çay fiyatları güncellendi' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Masa Sil
app.delete('/api/tables/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await run('DELETE FROM tables WHERE id = ?', [id]);
    io.emit('tables_changed');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Menü Kategorileri ve Ürünleri
app.get('/api/menu', async (req, res) => {
  try {
    const categories = await all('SELECT * FROM categories ORDER BY sort_order ASC');
    const products = await all(`
      SELECT * FROM products
      WHERE is_active = 1
      ORDER BY category_id, CASE WHEN LOWER(name) = 'çay' THEN 0 ELSE 1 END, name ASC
    `);

    const menu = categories.map(cat => ({
      ...cat,
      products: products
        .filter(p => p.category_id === cat.id)
        .map(p => ({
          ...p,
          special_price: p.special_price != null ? p.special_price : null,
          quick_notes: Array.isArray(p.quick_notes)
            ? p.quick_notes
            : (p.quick_notes ? JSON.parse(p.quick_notes) : [])
        }))
    }));

    res.json({ success: true, data: menu });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ürün Ekle
app.post('/api/products', async (req, res) => {
  try {
    const { category_id, name, price, quick_notes, special_price } = req.body;
    if (!name || price == null) return res.status(400).json({ success: false, error: 'Ad ve fiyat zorunludur' });
    const notesStr = quick_notes ? JSON.stringify(quick_notes) : '[]';
    const specPrice = (special_price !== undefined && special_price !== '' && special_price !== null)
      ? parseFloat(special_price)
      : null;

    const result = await run(
      'INSERT INTO products (category_id, name, price, quick_notes, special_price) VALUES (?, ?, ?, ?, ?)',
      [category_id, name, parseFloat(price), notesStr, specPrice]
    );
    io.emit('menu_changed');
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ürün Güncelle
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { category_id, name, price, quick_notes, is_active, special_price } = req.body;
    const notesStr = quick_notes ? JSON.stringify(quick_notes) : '[]';
    const specPrice = (special_price !== undefined && special_price !== '' && special_price !== null)
      ? parseFloat(special_price)
      : null;

    await run(
      'UPDATE products SET category_id = ?, name = ?, price = ?, quick_notes = ?, is_active = ?, special_price = ? WHERE id = ?',
      [category_id, name, parseFloat(price), notesStr, is_active ?? 1, specPrice, id]
    );
    io.emit('menu_changed');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Çoklu Ürün Özel Fiyatlarını Güncelle (Hangi Ürüne Ne Kadar Özel Fiyat Yazılacak?)
app.post('/api/products/bulk-special-prices', async (req, res) => {
  try {
    const { items } = req.body; // Array of { id, special_price }
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Geçersiz veri formatı' });
    }

    for (const item of items) {
      const specPrice = (item.special_price !== undefined && item.special_price !== '' && item.special_price !== null && !isNaN(item.special_price))
        ? parseFloat(item.special_price)
        : null;
      await run('UPDATE products SET special_price = ? WHERE id = ?', [specPrice, item.id]);
    }

    io.emit('menu_changed');
    res.json({ success: true, message: 'Ürün özel fiyatları güncellendi' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ürün Sil
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await run('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
    io.emit('menu_changed');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Genel Çay & Çay Ürünleri Fiyatını Güncelle (Örn: 15 TL)
app.post('/api/products/bulk-tea-price', async (req, res) => {
  try {
    const { price } = req.body;
    if (price == null || isNaN(price)) {
      return res.status(400).json({ success: false, error: 'Geçerli bir fiyat belirtilmelidir' });
    }

    const newPrice = parseFloat(price);
    await run(`
      UPDATE products 
      SET price = ? 
      WHERE id = 1 
         OR name = 'Çay' 
         OR name LIKE 'Oralet%' 
         OR name IN ('Kuşburnu', 'Adaçayı', 'Ihlamur')
    `, [newPrice]);

    io.emit('menu_changed');
    res.json({ success: true, message: `Genel çay ve çay ürünleri fiyatı ${newPrice.toFixed(2)} ₺ olarak güncellendi.` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ocak Ekranı İçin Aktif Siparişler
app.get('/api/orders/active', async (req, res) => {
  try {
    const orders = await all(`
      SELECT * FROM orders 
      WHERE status IN ('pending', 'preparing', 'ready', 'approved')
      ORDER BY 
        CASE status 
          WHEN 'pending' THEN 1 
          WHEN 'preparing' THEN 2 
          WHEN 'ready' THEN 3 
          WHEN 'approved' THEN 4
        END,
        created_at ASC, id ASC
    `);

    for (let order of orders) {
      order.items = await all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    }

    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Yeni Sipariş Girişi (Garson Telefondan Gönderir)
app.post('/api/orders', async (req, res) => {
  try {
    const { table_id, waiter_name, items } = req.body;

    if (!table_id || !items || !items.length) {
      return res.status(400).json({ success: false, error: 'Masa ve en az bir ürün seçilmelidir.' });
    }

    const table = await get('SELECT * FROM tables WHERE id = ?', [table_id]);
    if (!table) return res.status(404).json({ success: false, error: 'Masa bulunamadı.' });

    // Toplam tutarı hesapla
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += (parseFloat(item.unit_price) * parseInt(item.quantity));
    }

    // Siparişi kaydet
    const orderResult = await run(`
      INSERT INTO orders (table_id, table_name, waiter_name, status, total_amount, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `, [table.id, table.name, waiter_name || 'Garson', totalAmount]);

    const orderId = orderResult.lastID;

    // Sipariş kalemlerini kaydet
    for (const item of items) {
      await run(`
        INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, note, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `, [orderId, item.product_id || null, item.product_name, item.quantity, item.unit_price, item.note || '']);
    }

    // Masayı dolu yap
    await run("UPDATE tables SET status = 'occupied' WHERE id = ?", [table.id]);

    // Sipariş nesnesini tam olarak çekip ocağa ilet
    const fullOrder = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
    fullOrder.items = await all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    // CANLI YAYIN: Ocak ekranına ve garsonlara anında haber ver!
    io.emit('new_order', fullOrder);
    io.emit('tables_changed');

    res.json({ success: true, order: fullOrder });
  } catch (error) {
    console.error('Sipariş kayıt hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sipariş Durumu Güncelleme (Ocakçı "Hazırlanıyor", "Hazır", "Teslim Edildi" yapar)
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'preparing', 'ready', 'approved', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Geçersiz durum' });
    }

    await run("UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [status, id]);
    
    // Kalemlerin durumunu da güncelle
    await run("UPDATE order_items SET status = ? WHERE order_id = ?", [status, id]);

    const updatedOrder = await get('SELECT * FROM orders WHERE id = ?', [id]);
    if (updatedOrder) {
      updatedOrder.items = await all('SELECT * FROM order_items WHERE order_id = ?', [id]);

      // Eğer sipariş iptal edildiyse ve masada başka açık sipariş yoksa masayı 'empty' yap
      if (status === 'cancelled' && updatedOrder.table_id > 0) {
        const remainingOpen = await get(
          "SELECT COUNT(*) as count FROM orders WHERE table_id = ? AND status != 'completed' AND status != 'cancelled'",
          [updatedOrder.table_id]
        );
        if (remainingOpen.count === 0) {
          await run("UPDATE tables SET status = 'empty' WHERE id = ?", [updatedOrder.table_id]);
        }
      }
    }

    // CANLI YAYIN: Durum değişikliğini herkese bildir
    io.emit('order_status_updated', { orderId: parseInt(id), status, order: updatedOrder });
    io.emit('tables_changed');

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Masanın Açık Siparişleri ve Hesabı (Adisyonu)
app.get('/api/tables/:id/orders', async (req, res) => {
  try {
    const { id } = req.params;
    const table = await get('SELECT * FROM tables WHERE id = ?', [id]);
    if (!table) return res.status(404).json({ success: false, error: 'Masa bulunamadı.' });

    const orders = await all(`
      SELECT * FROM orders 
      WHERE table_id = ? AND status != 'completed' AND status != 'cancelled'
      ORDER BY created_at ASC
    `, [id]);

    for (let order of orders) {
      order.items = await all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    }

    const total = orders.reduce((sum, o) => sum + o.total_amount, 0);

    res.json({
      success: true,
      table,
      orders,
      total
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Masanın Hesabını Kapatma (Ödeme Alma)
app.post('/api/tables/:id/pay', async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_type, waiter_name } = req.body;

    const table = await get('SELECT * FROM tables WHERE id = ?', [id]);
    if (!table) return res.status(404).json({ success: false, error: 'Masa bulunamadı.' });

    const openOrders = await all(`
      SELECT * FROM orders 
      WHERE table_id = ? AND status != 'completed' AND status != 'cancelled'
    `, [id]);

    if (!openOrders.length) {
      return res.status(400).json({ success: false, error: 'Masanın açık hesabı yok.' });
    }

    const totalAmount = openOrders.reduce((sum, o) => sum + o.total_amount, 0);

    // Ödemeyi kaydet
    await run(`
      INSERT INTO payments (table_id, table_name, amount, payment_type, waiter_name, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [table.id, table.name, totalAmount, payment_type || 'nakit', waiter_name || 'Kasa']);

    // Masadaki açık siparişleri 'completed' yap
    await run(`
      UPDATE orders SET status = 'completed', updated_at = datetime('now', 'localtime')
      WHERE table_id = ? AND status != 'completed' AND status != 'cancelled'
    `, [id]);

    // Masayı boşalt
    await run("UPDATE tables SET status = 'empty' WHERE id = ?", [id]);

    io.emit('table_paid', { tableId: parseInt(id), tableName: table.name, amount: totalAmount });
    io.emit('tables_changed');

    res.json({ success: true, totalAmount, message: 'Hesap başarıyla kapatıldı.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Masa Taşıma / Aktarma
app.post('/api/tables/transfer', async (req, res) => {
  try {
    const { from_table_id, to_table_id } = req.body;
    const fromTable = await get('SELECT * FROM tables WHERE id = ?', [from_table_id]);
    const toTable = await get('SELECT * FROM tables WHERE id = ?', [to_table_id]);

    if (!fromTable || !toTable) return res.status(404).json({ success: false, error: 'Masa bulunamadı.' });

    await run(`
      UPDATE orders SET table_id = ?, table_name = ? 
      WHERE table_id = ? AND status != 'completed' AND status != 'cancelled'
    `, [toTable.id, toTable.name, fromTable.id]);

    await run("UPDATE tables SET status = 'empty' WHERE id = ?", [fromTable.id]);
    await run("UPDATE tables SET status = 'occupied' WHERE id = ?", [toTable.id]);

    io.emit('tables_changed');
    res.json({ success: true, message: `${fromTable.name} siparişleri ${toTable.name}'e aktarıldı.` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Günlük Rapor ve Satış İstatistikleri
app.get('/api/reports/daily', async (req, res) => {
  try {
    // Bugünkü toplam ciro ve ödeme dağılımı
    const totalRevenue = await get(`
      SELECT 
        COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(CASE WHEN payment_type = 'nakit' THEN amount ELSE 0 END), 0) as nakit,
        COALESCE(SUM(CASE WHEN payment_type = 'kart' THEN amount ELSE 0 END), 0) as kart,
        COALESCE(SUM(CASE WHEN payment_type = 'veresiye' THEN amount ELSE 0 END), 0) as veresiye,
        COUNT(*) as transaction_count
      FROM payments 
      WHERE date(created_at) = date('now', 'localtime')
    `);

    // Bugün en çok satılan ürünler ve adetleri
    const topProducts = await all(`
      SELECT 
        oi.product_name,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.quantity * oi.unit_price) as total_income
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE date(o.created_at) = date('now', 'localtime') AND o.status != 'cancelled'
      GROUP BY oi.product_name
      ORDER BY total_quantity DESC
    `);

    // Son tamamlanan ödemeler
    const recentPayments = await all(`
      SELECT * FROM payments 
      WHERE date(created_at) = date('now', 'localtime')
      ORDER BY created_at DESC 
      LIMIT 20
    `);

    res.json({
      success: true,
      summary: totalRevenue,
      topProducts,
      recentPayments
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------- GARSON YÖNETİMİ ENDPOINTS ----------------

// Tüm Garsonları Listele
app.get('/api/waiters', async (req, res) => {
  try {
    const waiters = await all('SELECT * FROM waiters ORDER BY name ASC');
    res.json({ success: true, data: waiters });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Yeni Garson Ekle
app.post('/api/waiters', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Garson adı zorunludur' });
    }

    const trimmedName = name.trim();
    const existing = await get('SELECT * FROM waiters WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Bu isimde bir garson zaten kayıtlı' });
    }

    const result = await run('INSERT INTO waiters (name) VALUES (?)', [trimmedName]);
    io.emit('waiters_changed');
    res.json({ success: true, id: result.lastID, name: trimmedName });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Garson Sil
app.delete('/api/waiters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const waiter = await get('SELECT * FROM waiters WHERE id = ?', [id]);
    if (!waiter) {
      return res.status(404).json({ success: false, error: 'Garson bulunamadı' });
    }

    await run('DELETE FROM waiters WHERE id = ?', [id]);
    io.emit('waiters_changed');
    res.json({ success: true, message: `${waiter.name} silindi` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------- ESNAF & ÇETELE / VERESİYE ENDPOINTS ----------------

// Tüm Esnafları Listele
app.get('/api/merchants', async (req, res) => {
  try {
    const merchants = await all(`
      SELECT m.*,
        (SELECT COUNT(*) FROM merchant_transactions WHERE merchant_id = m.id) as tx_count,
        (SELECT MAX(created_at) FROM merchant_transactions WHERE merchant_id = m.id) as last_tx_time
      FROM merchants m
      ORDER BY m.balance DESC, m.name ASC
    `);
    res.json({ success: true, data: merchants });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Esnaf Genel İstatistik Özeti
app.get('/api/merchants/summary', async (req, res) => {
  try {
    const totalBalance = await get('SELECT COALESCE(SUM(balance), 0) as total_debt, COUNT(*) as merchant_count FROM merchants');
    const todayOrders = await get(`
      SELECT COALESCE(SUM(amount), 0) as today_orders_amount, COUNT(*) as count 
      FROM merchant_transactions 
      WHERE type = 'order' AND date(created_at) = date('now', 'localtime')
    `);
    const todayPayments = await get(`
      SELECT COALESCE(SUM(amount), 0) as today_collected_amount, COUNT(*) as count 
      FROM merchant_transactions 
      WHERE type = 'payment' AND date(created_at) = date('now', 'localtime')
    `);

    res.json({
      success: true,
      summary: {
        total_debt: totalBalance.total_debt,
        merchant_count: totalBalance.merchant_count,
        today_orders: todayOrders.today_orders_amount,
        today_payments: todayPayments.today_collected_amount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Yeni Esnaf Ekle
app.post('/api/merchants', async (req, res) => {
  try {
    const { name, shop_type, phone, notes, initial_balance } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Esnaf adı zorunludur' });

    const balance = parseFloat(initial_balance) || 0;
    const result = await run(
      'INSERT INTO merchants (name, shop_type, phone, notes, balance) VALUES (?, ?, ?, ?, ?)',
      [name, shop_type || 'Esnaf', phone || '', notes || '', balance]
    );

    const newId = result.lastID;
    if (balance > 0) {
      await run(
        "INSERT INTO merchant_transactions (merchant_id, type, amount, description, waiter_name, created_at) VALUES (?, 'order', ?, 'Açılış Bakiyesi', 'Kasa', datetime('now', 'localtime'))",
        [newId, balance]
      );
    }

    io.emit('merchants_changed');
    res.json({ success: true, id: newId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Esnaf Bilgisi Güncelle
app.put('/api/merchants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, shop_type, phone, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Esnaf adı zorunludur' });

    await run(
      'UPDATE merchants SET name = ?, shop_type = ?, phone = ?, notes = ? WHERE id = ?',
      [name, shop_type || 'Esnaf', phone || '', notes || '', id]
    );

    io.emit('merchants_changed');
    res.json({ success: true, message: 'Esnaf bilgisi güncellendi' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Esnaf Sil
app.delete('/api/merchants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await run('DELETE FROM merchant_transactions WHERE merchant_id = ?', [id]);
    await run('DELETE FROM merchants WHERE id = ?', [id]);

    io.emit('merchants_changed');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Esnafın özel menü fiyatlarını getir
app.get('/api/merchants/:id/prices', async (req, res) => {
  try {
    const { id } = req.params;
    const merchant = await get('SELECT * FROM merchants WHERE id = ?', [id]);
    if (!merchant) return res.status(404).json({ success: false, error: 'Esnaf bulunamadı' });

    const rows = await all('SELECT * FROM merchant_product_prices WHERE merchant_id = ? ORDER BY product_id ASC', [id]);
    const products = await all('SELECT * FROM products WHERE is_active = 1 ORDER BY category_id, name ASC');

    const byProductId = {};
    rows.forEach(row => {
      byProductId[row.product_id] = row.custom_price != null ? parseFloat(row.custom_price) : null;
    });

    res.json({
      success: true,
      merchant,
      data: products.map(p => ({
        ...p,
        quick_notes: p.quick_notes ? JSON.parse(p.quick_notes || '[]') : [],
        custom_price: byProductId[p.id] != null ? byProductId[p.id] : null
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Esnafın özel menü fiyatlarını güncelle
app.put('/api/merchants/:id/prices', async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Geçersiz fiyat listesi' });
    }

    const merchant = await get('SELECT * FROM merchants WHERE id = ?', [id]);
    if (!merchant) return res.status(404).json({ success: false, error: 'Esnaf bulunamadı' });

    for (const item of items) {
      const productId = item.product_id;
      const rawPrice = item.custom_price;
      const customPrice = (rawPrice === '' || rawPrice === null || rawPrice === undefined || Number.isNaN(Number(rawPrice)) || Number(rawPrice) <= 0)
        ? null
        : parseFloat(rawPrice);

      await run(`
        INSERT INTO merchant_product_prices (merchant_id, product_id, custom_price)
        VALUES (?, ?, ?)
        ON CONFLICT(merchant_id, product_id)
        DO UPDATE SET custom_price = excluded.custom_price, updated_at = CURRENT_TIMESTAMP
      `, [id, productId, customPrice]);
    }

    io.emit('merchants_changed');
    res.json({ success: true, message: 'Esnaf menü fiyatları güncellendi' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Esnafın Hareket Geçmişi (Çetele & Tahsilat Listesi)
app.get('/api/merchants/:id/transactions', async (req, res) => {
  try {
    const { id } = req.params;
    const merchant = await get('SELECT * FROM merchants WHERE id = ?', [id]);
    if (!merchant) return res.status(404).json({ success: false, error: 'Esnaf bulunamadı' });

    const transactions = await all(`
      SELECT * FROM merchant_transactions 
      WHERE merchant_id = ? 
      ORDER BY created_at DESC 
      LIMIT 100
    `, [id]);

    res.json({ success: true, merchant, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Esnafa Hızlı Çetele / Sipariş Yazma
app.post('/api/merchants/:id/order', async (req, res) => {
  try {
    const { id } = req.params;
    const { items, notify_kitchen, waiter_name, note } = req.body;

    const merchant = await get('SELECT * FROM merchants WHERE id = ?', [id]);
    if (!merchant) return res.status(404).json({ success: false, error: 'Esnaf bulunamadı' });

    if (!items || !items.length) {
      return res.status(400).json({ success: false, error: 'En az bir ürün eklenmelidir' });
    }

    let orderTotal = 0;
    const itemSummaries = [];
    const normalizedItems = [];

    for (const it of items) {
      let unitPrice = parseFloat(it.unit_price);
      if (it.product_id) {
        const priceRow = await get('SELECT custom_price FROM merchant_product_prices WHERE merchant_id = ? AND product_id = ?', [id, it.product_id]);
        if (priceRow && priceRow.custom_price != null) {
          unitPrice = parseFloat(priceRow.custom_price);
        }
      }

      const quantity = parseInt(it.quantity) || 0;
      if (quantity <= 0) continue;

      const lineTotal = unitPrice * quantity;
      orderTotal += lineTotal;
      itemSummaries.push(`${quantity}x ${it.product_name}`);
      normalizedItems.push({
        ...it,
        quantity,
        unit_price: unitPrice
      });
    }

    if (!normalizedItems.length) {
      return res.status(400).json({ success: false, error: 'En az bir ürün eklenmelidir' });
    }

    const description = itemSummaries.join(', ') + (note ? ` (${note})` : '');

    // Bakiyeyi artır
    await run('UPDATE merchants SET balance = balance + ? WHERE id = ?', [orderTotal, id]);

    // Hareketi kaydet
    await run(`
      INSERT INTO merchant_transactions (merchant_id, type, amount, description, waiter_name, created_at)
      VALUES (?, 'order', ?, ?, ?, datetime('now', 'localtime'))
    `, [id, orderTotal, description, waiter_name || 'Esnaf Paneli']);

    // Eğer ocağa iletilsin istenmişse (Ocak ekranına sesli ve canlı düşsün!)
    if (notify_kitchen) {
      const orderResult = await run(`
        INSERT INTO orders (table_id, table_name, waiter_name, status, total_amount, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `, [0, `[Esnaf] ${merchant.name}`, waiter_name || 'Esnaf Paneli', orderTotal]);

      const orderId = orderResult.lastID;
      for (const it of normalizedItems) {
        await run(`
          INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, note, status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `, [orderId, it.product_id || null, it.product_name, it.quantity, it.unit_price, note || '']);
      }

      const fullOrder = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
      fullOrder.items = await all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

      io.emit('new_order', fullOrder);
      io.emit('tables_changed');
    }

    res.json({ success: true, orderTotal, message: 'Çetele kaydedildi' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

initDatabase()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Sunucu ${PORT} portunda çalışıyor.`);
    });
  })
  .catch((error) => {
    console.error('Sunucu başlatılamadı:', error);
    process.exit(1);
  });
