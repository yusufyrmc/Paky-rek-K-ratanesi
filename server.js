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

// ---------------- API ENDPOINTS ----------------

// Sistem Bilgisi ve QR Kodu
app.get('/api/info', async (req, res) => {
  try {
    const ip = getLocalIpAddress();
    const garsonUrl = `http://${ip}:${PORT}/garson.html`;
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
    res.json({ success: true, data: tables });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Yeni Masa Ekle
app.post('/api/tables', async (req, res) => {
  try {
    const { name, section } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Masa adı zorunlu' });
    const result = await run('INSERT INTO tables (name, section) VALUES (?, ?)', [name, section || 'Salon']);
    io.emit('tables_changed');
    res.json({ success: true, id: result.lastID });
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
    const products = await all('SELECT * FROM products WHERE is_active = 1 ORDER BY category_id, name ASC');

    const menu = categories.map(cat => ({
      ...cat,
      products: products
        .filter(p => p.category_id === cat.id)
        .map(p => ({
          ...p,
          quick_notes: p.quick_notes ? JSON.parse(p.quick_notes) : []
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
    const { category_id, name, price, quick_notes } = req.body;
    if (!name || price == null) return res.status(400).json({ success: false, error: 'Ad ve fiyat zorunludur' });
    const notesStr = quick_notes ? JSON.stringify(quick_notes) : '[]';
    const result = await run(
      'INSERT INTO products (category_id, name, price, quick_notes) VALUES (?, ?, ?, ?)',
      [category_id, name, parseFloat(price), notesStr]
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
    const { category_id, name, price, quick_notes, is_active } = req.body;
    const notesStr = quick_notes ? JSON.stringify(quick_notes) : '[]';
    await run(
      'UPDATE products SET category_id = ?, name = ?, price = ?, quick_notes = ?, is_active = ? WHERE id = ?',
      [category_id, name, parseFloat(price), notesStr, is_active ?? 1, id]
    );
    io.emit('menu_changed');
    res.json({ success: true });
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

// Ocak Ekranı İçin Aktif Siparişler
app.get('/api/orders/active', async (req, res) => {
  try {
    const orders = await all(`
      SELECT * FROM orders 
      WHERE status IN ('pending', 'preparing', 'ready')
      ORDER BY 
        CASE status 
          WHEN 'pending' THEN 1 
          WHEN 'preparing' THEN 2 
          WHEN 'ready' THEN 3 
        END,
        created_at ASC
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

    if (!['pending', 'preparing', 'ready', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Geçersiz durum' });
    }

    await run("UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [status, id]);
    
    // Kalemlerin durumunu da güncelle
    await run("UPDATE order_items SET status = ? WHERE order_id = ?", [status, id]);

    const updatedOrder = await get('SELECT * FROM orders WHERE id = ?', [id]);
    if (updatedOrder) {
      updatedOrder.items = await all('SELECT * FROM order_items WHERE order_id = ?', [id]);
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

// ---------------- WEBSOCKET ----------------
io.on('connection', (socket) => {
  console.log(`[Socket] Yeni istemci bağlandı: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket] İstemci ayrıldı: ${socket.id}`);
  });
});

// ---------------- BAŞLATMA ----------------
async function startServer() {
  try {
    await initDatabase();
    server.listen(PORT, '0.0.0.0', () => {
      const ip = getLocalIpAddress();
      console.log('====================================================');
      console.log('    PAKYÜREK KIRAATHANESİ SİPARİŞ SİSTEMİ ÇALIŞIYOR');
      console.log('====================================================');
      console.log(`-> Ocak PC Ekranı:        http://localhost:${PORT}/ocak.html`);
      console.log(`-> Garson Mobil Linki:    http://${ip}:${PORT}/garson.html`);
      console.log(`-> Kasa & Rapor Paneli:   http://localhost:${PORT}/kasa.html`);
      console.log(`-> Ana Giriş / QR Sayfası: http://localhost:${PORT}/`);
      console.log('====================================================');
    });
  } catch (err) {
    console.error('Sunucu başlatılırken hata oluştu:', err);
  }
}

startServer();
