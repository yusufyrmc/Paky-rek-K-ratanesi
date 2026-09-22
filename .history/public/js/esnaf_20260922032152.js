// Pakyürek Kıraathanesi - Esnaf & Çetele Paneli Mantığı
let socket;
let allMerchants = [];
let menuData = [];
let currentTypeFilter = 'all';
let searchQuery = '';
let isEsnafPrivacy = localStorage.getItem('pakyurek_esnaf_privacy') === 'true';

// Seçili Esnaf Referansları
let selectedMerchantForPay = null;
let selectedMerchantForOrder = null;
let currentStatementData = null;
let customOrderQuantities = {};
let currentMerchantPriceMap = {};
let selectedMerchantForPricing = null;

// 1. Verileri Yükle
async function loadAllData() {
  await Promise.all([
    loadMerchants(),
    loadSummary(),
    loadMenu()
  ]);
  updatePrivacyUI();
}

async function loadMerchants() {
  try {
    const res = await fetch('/api/merchants');
    const data = await res.json();
    if (data.success) {
      allMerchants = data.data;
      renderMerchants();
    }
  } catch (err) {
    console.error('Esnaflar yüklenemedi:', err);
    showToast('Esnaflar yüklenirken hata oluştu', 'danger');
  }
}

async function loadSummary() {
  try {
    const res = await fetch('/api/merchants/summary');
    const data = await res.json();
    if (data.success) {
      const s = data.summary;
      const totalDebtEl = document.getElementById('statTotalDebt');
      if (totalDebtEl) {
        totalDebtEl.dataset.realVal = (s.total_debt || 0).toFixed(2);
        totalDebtEl.textContent = isEsnafPrivacy ? '•••• ₺' : `${(s.total_debt || 0).toFixed(2)} ₺`;
      }
      document.getElementById('statMerchantCount').textContent = s.merchant_count || 0;
      document.getElementById('statTodayOrders').textContent = `${(s.today_orders || 0).toFixed(2)} ₺`;
      document.getElementById('statTodayPayments').textContent = `${(s.today_payments || 0).toFixed(2)} ₺`;
    }
  } catch (err) {
    console.error('Özet yüklenemedi:', err);
  }
}

async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    if (data.success) {
      menuData = data.data;
    }
  } catch (err) {
    console.error('Menü yüklenemedi:', err);
  }
}

// 2. Filtreleme ve Arama
function onSearchInput() {
  searchQuery = document.getElementById('merchantSearchInput').value.trim().toLowerCase();
  renderMerchants();
}

function filterMerchantType(type, btnElement) {
  currentTypeFilter = type;
  document.querySelectorAll('.btn-filter').forEach(btn => {
    btn.className = 'btn btn-outline btn-filter';
  });
  if (btnElement) {
    btnElement.className = 'btn btn-primary btn-filter';
  }
  renderMerchants();
}

// 3. Esnaf Kartlarını Render Etme
function renderMerchants() {
  const container = document.getElementById('merchantsContainer');
  let list = allMerchants;

  // Tip Filtresi
  if (currentTypeFilter === 'debt') {
    list = list.filter(m => m.balance > 0);
  } else if (currentTypeFilter !== 'all') {
    list = list.filter(m => m.shop_type === currentTypeFilter);
  }

  // Arama Filtresi
  if (searchQuery) {
    list = list.filter(m => 
      m.name.toLowerCase().includes(searchQuery) ||
      (m.shop_type && m.shop_type.toLowerCase().includes(searchQuery)) ||
      (m.phone && m.phone.toLowerCase().includes(searchQuery)) ||
      (m.notes && m.notes.toLowerCase().includes(searchQuery))
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 50px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed var(--border-color);">
        <div style="font-size: 2.5rem; margin-bottom: 10px;">🏬</div>
        <h3>Aradığınız Kriterde Esnaf Bulunamadı</h3>
        <p style="margin-top: 6px;">Filtreleri değiştirebilir veya sağ üstteki "Yeni Esnaf Ekle" butonuyla ekleyebilirsiniz.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(m => {
    const hasDebt = m.balance > 0;
    const icon = getShopIcon(m.shop_type);
    const balanceDisplay = isEsnafPrivacy ? '•••• ₺' : `${m.balance.toFixed(2)} ₺`;

    return `
      <div class="merchant-card" id="merchant-card-${m.id}">
        <div>
          <div class="merchant-header">
            <div class="merchant-avatar">${icon}</div>
            <div class="merchant-title-box">
              <div class="merchant-name">${escapeHtml(m.name)}</div>
              <div class="merchant-badge">${escapeHtml(m.shop_type || 'Esnaf')} ${m.phone ? `· 📞 ${escapeHtml(m.phone)}` : ''}</div>
              ${m.notes ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">📍 ${escapeHtml(m.notes)}</div>` : ''}
            </div>
            <button class="btn btn-outline" style="padding: 2px 7px; font-size: 0.75rem;" onclick="openEditMerchantModal(${m.id})" title="Bilgileri Düzenle">✏️</button>
          </div>

          <div class="merchant-bakiye-box">
            <div>
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); font-weight: 700;">Açık Veresiye</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${m.tx_count || 0} İşlem Kaydı</div>
            </div>
            <div class="bakiye-amount ${hasDebt ? 'has-debt' : 'zero-debt'}" data-balance="${m.balance.toFixed(2)}">
              ${balanceDisplay}
            </div>
          </div>

          <div class="quick-cetele-label">⚡ Hızlı Çetele Yaz (Tek Tık)</div>
          <div class="quick-cetele-grid">
            <button class="btn-cetele" onclick="quickAddCetele(${m.id}, 'Çay', 10, 1)" title="1 Çay Yaz">
              +1 ☕ Çay <small style="opacity:0.7;">(10₺)</small>
            </button>
            <button class="btn-cetele" onclick="quickAddCetele(${m.id}, 'Çay', 10, 2)" title="2 Çay Yaz">
              +2 ☕ Çay <small style="opacity:0.7;">(20₺)</small>
            </button>
            <button class="btn-cetele" onclick="quickAddCetele(${m.id}, 'Türk Kahvesi', 30, 1)" title="1 Kahve Yaz">
              +1 🫖 Kahve <small style="opacity:0.7;">(30₺)</small>
            </button>
            <button class="btn-cetele" onclick="quickAddCetele(${m.id}, 'Maden Suyu (Sade)', 15, 1)" title="1 Soda Yaz">
              +1 🥤 Soda <small style="opacity:0.7;">(15₺)</small>
            </button>
          </div>
        </div>

        <div>
          <div class="merchant-footer-actions">
            <button class="btn-pay" onclick="openPayModal(${m.id})">
              💵 Tahsilat Al
            </button>
            <button class="btn-statement" onclick="viewStatement(${m.id})" title="Hesap Ekstresi ve Geçmiş">
              📋 Ekstre
            </button>
            <button class="btn-statement" onclick="openCustomOrderModal(${m.id})" title="Menüden Detaylı Yaz">
              ☕ Menü
            </button>
            <button class="btn-statement" onclick="openMerchantPricingModal(${m.id})" title="Esnaf Menü Fiyatlarını Ayarla">
              💲 Fiyatlar
            </button>
            <button class="btn-statement" onclick="deleteMerchant(${m.id}, '${escapeHtml(m.name)}')" title="Esnafı Sil" style="border-color: rgba(239, 68, 68, 0.4); color: #fca5a5;">
              🗑️ Sil
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function getShopIcon(type) {
  const map = {
    'Berber': '✂️',
    'Terzi': '🧵',
    'Kasap': '🥩',
    'Eczane': '💊',
    'Taksi': '🚕',
    'Market': '🛒',
    'Nalbur': '🔧',
    'Kuyumcu': '💍'
  };
  return map[type] || '🏬';
}

// 4. Hızlı Çetele Yazma (+1 Çay, +2 Çay vb.)
async function quickAddCetele(merchantId, productName, unitPrice, quantity) {
  const merchant = allMerchants.find(m => m.id === merchantId);
  const mName = merchant ? merchant.name : 'Esnaf';

  const payload = {
    items: [{
      product_name: productName,
      unit_price: unitPrice,
      quantity: quantity
    }],
    notify_kitchen: true, // Ocağa da canlı sipariş olarak düşsün
    waiter_name: 'Esnaf Paneli'
  };

  try {
    const res = await fetch(`/api/merchants/${merchantId}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      if (navigator.vibrate) navigator.vibrate(60);
      showToast(`✓ ${mName} hesabına ${quantity}x ${productName} (+${data.orderTotal.toFixed(2)} ₺) yazıldı!`, 'success');
      loadMerchants();
      loadSummary();
    } else {
      showToast('Çetele işlenemedi: ' + data.error, 'danger');
    }
  } catch (err) {
    console.error('Hızlı çetele hatası:', err);
    showToast('Bağlantı hatası', 'danger');
  }
}

// 5. Tahsilat Alma (Ödeme Alma)
function openPayModal(merchantId) {
  const merchant = allMerchants.find(m => m.id === merchantId);
  if (!merchant) return;

  selectedMerchantForPay = merchant;
  document.getElementById('payMerchantId').value = merchant.id;
  document.getElementById('payMerchantName').textContent = `${merchant.name} (${merchant.shop_type || 'Esnaf'})`;
  document.getElementById('payCurrentDebt').textContent = `${merchant.balance.toFixed(2)} ₺`;

  // Varsayılan olarak tam borç tutarı gelsin
  document.getElementById('payAmountInput').value = merchant.balance > 0 ? merchant.balance : '';
  document.getElementById('payNoteInput').value = '';
  selectPayType('nakit');

  document.getElementById('payModal').classList.add('active');
  setTimeout(() => document.getElementById('payAmountInput').focus(), 150);
}

function closePayModal() {
  document.getElementById('payModal').classList.remove('active');
  selectedMerchantForPay = null;
}

function setPayAmountFull() {
  if (selectedMerchantForPay) {
    document.getElementById('payAmountInput').value = selectedMerchantForPay.balance;
  }
}

function setPayAmountHalf() {
  if (selectedMerchantForPay && selectedMerchantForPay.balance > 0) {
    document.getElementById('payAmountInput').value = (selectedMerchantForPay.balance / 2).toFixed(2);
  }
}

function selectPayType(type) {
  document.getElementById('payTypeVal').value = type;
  const btnNakit = document.getElementById('btnPayNakit');
  const btnKart = document.getElementById('btnPayKart');

  if (type === 'nakit') {
    btnNakit.className = 'btn btn-success';
    btnKart.className = 'btn btn-outline';
  } else {
    btnNakit.className = 'btn btn-outline';
    btnKart.className = 'btn btn-info';
  }
}

async function submitPayment() {
  if (!selectedMerchantForPay) return;

  const amount = parseFloat(document.getElementById('payAmountInput').value);
  if (isNaN(amount) || amount <= 0) {
    showToast('Lütfen geçerli bir tahsilat tutarı girin!', 'warning');
    return;
  }

  const paymentType = document.getElementById('payTypeVal').value;
  const note = document.getElementById('payNoteInput').value.trim();

  try {
    const res = await fetch(`/api/merchants/${selectedMerchantForPay.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        payment_type: paymentType,
        note,
        waiter_name: 'Esnaf Paneli'
      })
    });

    const data = await res.json();
    if (data.success) {
      if (navigator.vibrate) navigator.vibrate([70, 40, 70]);
      showToast(`✓ ${data.message}`, 'success');
      closePayModal();
      loadMerchants();
      loadSummary();
    } else {
      showToast('Tahsilat kaydedilemedi: ' + data.error, 'danger');
    }
  } catch (err) {
    console.error('Tahsilat hatası:', err);
    showToast('Bağlantı hatası oluştu', 'danger');
  }
}

// 6. Hesap Ekstresi (Çetele Geçmişi)
async function viewStatement(merchantId) {
  try {
    const res = await fetch(`/api/merchants/${merchantId}/transactions`);
    const data = await res.json();
    if (data.success) {
      currentStatementData = data;
      const m = data.merchant;

      document.getElementById('statementMerchantName').textContent = m.name;
      document.getElementById('statementMerchantInfo').textContent = `${m.shop_type || 'Esnaf'} ${m.phone ? `· ${m.phone}` : ''}`;
      document.getElementById('statementBalance').textContent = `${m.balance.toFixed(2)} ₺`;

      const listContainer = document.getElementById('statementList');
      if (data.transactions.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 30px;">Henüz bir hareket kaydı bulunmuyor.</div>`;
      } else {
        listContainer.innerHTML = data.transactions.map(t => {
          const isOrder = t.type === 'order';
          return `
            <div class="statement-item ${isOrder ? 'order' : 'payment'}">
              <div>
                <div style="font-weight: 700; color: #fff;">
                  ${isOrder ? '☕ Sipariş / Çetele' : '💵 Tahsilat Alındı'}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">
                  ${escapeHtml(t.description || '')}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                  🕒 ${formatDate(t.created_at)} · Yetkili: ${escapeHtml(t.waiter_name || 'Kasa')}
                </div>
              </div>
              <div style="font-weight: 800; font-size: 1.15rem; color: ${isOrder ? '#f59e0b' : '#10b981'};">
                ${isOrder ? `+${t.amount.toFixed(2)} ₺` : `-${t.amount.toFixed(2)} ₺`}
              </div>
            </div>
          `;
        }).join('');
      }

      document.getElementById('statementModal').classList.add('active');
    }
  } catch (err) {
    console.error('Ekstre alınamadı:', err);
    showToast('Ekstre yüklenirken hata oluştu', 'danger');
  }
}

function closeStatementModal() {
  document.getElementById('statementModal').classList.remove('active');
  currentStatementData = null;
}

function copyStatementText() {
  if (!currentStatementData) return;
  const m = currentStatementData.merchant;
  let text = `*PAKYÜREK KIRAATHANESİ - ESNAF HESAP EKSTRESİ*\n`;
  text += `Esnaf: ${m.name} (${m.shop_type || 'Esnaf'})\n`;
  text += `Tarih: ${new Date().toLocaleDateString('tr-TR')}\n`;
  text += `Kalan Borç Bakiyesi: ${m.balance.toFixed(2)} ₺\n`;
  text += `------------------------------------\n`;
  
  currentStatementData.transactions.slice(0, 15).forEach(t => {
    const typeStr = t.type === 'order' ? '(+) Borç' : '(-) Ödeme';
    text += `${t.created_at.slice(5, 16)} | ${typeStr}: ${t.amount.toFixed(2)} ₺ | ${t.description || ''}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 Ekstre panoya kopyalandı (WhatsApp için hazır)', 'success');
  }).catch(() => {
    showToast('Kopyalanamadı', 'warning');
  });
}

// 7. Yeni Esnaf Ekleme / Düzenleme
function openAddMerchantModal() {
  document.getElementById('merchantModalTitle').textContent = '➕ Yeni Esnaf Kaydı';
  document.getElementById('editMerchantId').value = '';
  document.getElementById('merchantNameInput').value = '';
  document.getElementById('merchantTypeSelect').value = 'Berber';
  document.getElementById('merchantPhoneInput').value = '';
  document.getElementById('merchantNotesInput').value = '';
  document.getElementById('merchantInitialBalanceInput').value = '';
  document.getElementById('initialBalanceField').style.display = 'block';

  document.getElementById('merchantModal').classList.add('active');
  setTimeout(() => document.getElementById('merchantNameInput').focus(), 150);
}

function openEditMerchantModal(merchantId) {
  const m = allMerchants.find(x => x.id === merchantId);
  if (!m) return;

  document.getElementById('merchantModalTitle').textContent = '✏️ Esnaf Bilgilerini Düzenle';
  document.getElementById('editMerchantId').value = m.id;
  document.getElementById('merchantNameInput').value = m.name;
  document.getElementById('merchantTypeSelect').value = m.shop_type || 'Diğer';
  document.getElementById('merchantPhoneInput').value = m.phone || '';
  document.getElementById('merchantNotesInput').value = m.notes || '';
  document.getElementById('initialBalanceField').style.display = 'none';

  document.getElementById('merchantModal').classList.add('active');
}

function closeMerchantModal() {
  document.getElementById('merchantModal').classList.remove('active');
}

async function saveMerchant() {
  const editId = document.getElementById('editMerchantId').value;
  const name = document.getElementById('merchantNameInput').value.trim();
  const shopType = document.getElementById('merchantTypeSelect').value;
  const phone = document.getElementById('merchantPhoneInput').value.trim();
  const notes = document.getElementById('merchantNotesInput').value.trim();
  const initialBalance = parseFloat(document.getElementById('merchantInitialBalanceInput').value) || 0;

  if (!name) {
    showToast('Lütfen esnaf adını girin!', 'warning');
    return;
  }

  const isEdit = !!editId;
  const url = isEdit ? `/api/merchants/${editId}` : '/api/merchants';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        shop_type: shopType,
        phone,
        notes,
        initial_balance: initialBalance
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(isEdit ? '✓ Esnaf güncellendi' : '✓ Yeni esnaf başarıyla kaydedildi', 'success');
      closeMerchantModal();
      loadMerchants();
      loadSummary();
    } else {
      showToast('Kayıt başarısız: ' + data.error, 'danger');
    }
  } catch (err) {
    console.error('Esnaf kaydetme hatası:', err);
    showToast('Bağlantı hatası', 'danger');
  }
}

// 8. Menüden Detaylı Sipariş Modalı
function openCustomOrderModal(merchantId) {
  const merchant = allMerchants.find(m => m.id === merchantId);
  if (!merchant) return;

  selectedMerchantForOrder = merchant;
  customOrderQuantities = {};

  document.getElementById('customOrderMerchantName').textContent = `${merchant.name} (${merchant.shop_type || 'Esnaf'})`;
  renderCustomOrderItems();
  updateCustomOrderTotal();

  document.getElementById('customOrderModal').classList.add('active');
}

function closeCustomOrderModal() {
  document.getElementById('customOrderModal').classList.remove('active');
  selectedMerchantForOrder = null;
  customOrderQuantities = {};
}

function renderCustomOrderItems() {
  const container = document.getElementById('customOrderItemsContainer');
  let allProducts = [];
  menuData.forEach(cat => {
    (cat.products || []).forEach(p => allProducts.push(p));
  });

  container.innerHTML = allProducts.map(p => {
    const qty = customOrderQuantities[p.id] || 0;
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 6px;">
        <div>
          <div style="font-weight: 700; color: #fff;">${escapeHtml(p.name)}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">${p.price.toFixed(2)} ₺</div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="qty-btn" style="width: 28px; height: 28px; font-size: 0.9rem;" onclick="changeCustomOrderQty(${p.id}, -1)">-</button>
          <span style="font-weight: 700; min-width: 20px; text-align: center;">${qty}</span>
          <button class="qty-btn" style="width: 28px; height: 28px; font-size: 0.9rem;" onclick="changeCustomOrderQty(${p.id}, 1)">+</button>
        </div>
      </div>
    `;
  }).join('');
}

function changeCustomOrderQty(productId, delta) {
  const current = customOrderQuantities[productId] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    delete customOrderQuantities[productId];
  } else {
    customOrderQuantities[productId] = next;
  }
  renderCustomOrderItems();
  updateCustomOrderTotal();
}

function updateCustomOrderTotal() {
  let total = 0;
  menuData.forEach(cat => {
    (cat.products || []).forEach(p => {
      if (customOrderQuantities[p.id]) {
        total += (customOrderQuantities[p.id] * p.price);
      }
    });
  });
  document.getElementById('customOrderTotal').textContent = `${total.toFixed(2)} ₺`;
}

async function submitCustomOrder() {
  if (!selectedMerchantForOrder) return;

  let items = [];
  menuData.forEach(cat => {
    (cat.products || []).forEach(p => {
      if (customOrderQuantities[p.id]) {
        items.push({
          product_id: p.id,
          product_name: p.name,
          quantity: customOrderQuantities[p.id],
          unit_price: p.price
        });
      }
    });
  });

  if (items.length === 0) {
    showToast('Lütfen en az 1 ürün seçin!', 'warning');
    return;
  }

  const notifyKitchen = document.getElementById('checkNotifyKitchen').checked;

  try {
    const res = await fetch(`/api/merchants/${selectedMerchantForOrder.id}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        notify_kitchen: notifyKitchen,
        waiter_name: 'Esnaf Paneli'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`✓ ${selectedMerchantForOrder.name} çetelesine ${data.orderTotal.toFixed(2)} ₺ işlendi!`, 'success');
      closeCustomOrderModal();
      loadMerchants();
      loadSummary();
    } else {
      showToast('Hata: ' + data.error, 'danger');
    }
  } catch (err) {
    console.error('Sipariş hatası:', err);
    showToast('Bağlantı hatası', 'danger');
  }
}

// 9. Bakiye Gizlilik Modu (Mahremiyet)
function toggleEsnafPrivacy() {
  isEsnafPrivacy = !isEsnafPrivacy;
  localStorage.setItem('pakyurek_esnaf_privacy', isEsnafPrivacy ? 'true' : 'false');
  updatePrivacyUI();
  renderMerchants();
  loadSummary();
  showToast(isEsnafPrivacy ? '🙈 Bakiyeler gizlendi' : '👁️ Bakiyeler gösteriliyor', 'info');
}

function updatePrivacyUI() {
  const icon = document.getElementById('esnafPrivacyIcon');
  const text = document.getElementById('esnafPrivacyText');
  if (icon) icon.textContent = isEsnafPrivacy ? '🙈' : '👁️';
  if (text) text.textContent = isEsnafPrivacy ? 'Bakiyeleri Göster' : 'Bakiyeleri Gizle';
}

// 10. Yardımcı Fonksiyonlar
function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return `${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'success') toast.style.borderLeftColor = 'var(--status-ready)';
  if (type === 'warning') toast.style.borderLeftColor = 'var(--status-pending)';
  if (type === 'danger') toast.style.borderLeftColor = 'var(--status-danger)';

  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 11. WebSocket Bağlantısı
function setupSocket() {
  socket = io({
    transports: ['websocket', 'polling']
  });

  socket.on('merchants_changed', () => {
    loadMerchants();
    loadSummary();
  });

  socket.on('table_paid', () => {
    loadSummary();
  });
}

// Başlatma
window.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  setupSocket();
});

// 4.5 Esnaf Silme ve Menü Fiyatları
async function deleteMerchant(merchantId, name) {
  const confirmed = confirm(`"${name}" isimli esnafı silmek istediğinize emin misiniz?\n\n⚠️ Bu işlem esnafın tüm çetele ve ödeme kayıtlarını da silecektir.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/merchants/${merchantId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`🗑️ "${name}" esnafı silindi.`, 'info');
      loadMerchants();
      loadSummary();
    } else {
      showToast(data.error || 'Esnaf silinemedi', 'danger');
    }
  } catch (err) {
    console.error('Esnaf silme hatası:', err);
    showToast('Silme işlemi sırasında hata oluştu', 'danger');
  }
}

function getEffectiveProductPrice(product, merchantId) {
  const prices = currentMerchantPriceMap[merchantId] || {};
  const override = prices[product.id];
  return override != null && override !== '' ? Number(override) : Number(product.price || 0);
}

async function loadMerchantPriceMap(merchantId) {
  try {
    const res = await fetch(`/api/merchants/${merchantId}/prices`);
    const data = await res.json();
    if (data.success) {
      const prices = {};
      (data.data || []).forEach(item => {
        prices[item.id] = item.custom_price != null ? Number(item.custom_price) : null;
      });
      currentMerchantPriceMap[merchantId] = prices;
      return prices;
    }
    return {};
  } catch (err) {
    console.error('Esnaf fiyat listesi alınamadı:', err);
    return {};
  }
}

async function openMerchantPricingModal(merchantId) {
  const merchant = allMerchants.find(m => m.id === merchantId);
  if (!merchant) return;

  selectedMerchantForPricing = merchant;
  document.getElementById('merchantPricingMerchantName').textContent = `${merchant.name} (${merchant.shop_type || 'Esnaf'})`;

  const prices = await loadMerchantPriceMap(merchantId);
  const listContainer = document.getElementById('merchantPricingList');
  const allProducts = [];
  menuData.forEach(cat => {
    (cat.products || []).forEach(p => allProducts.push({ ...p, category_name: cat.name }));
  });

  listContainer.innerHTML = allProducts.map(p => {
    const value = prices[p.id] != null ? prices[p.id].toFixed(2) : '';
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; background: rgba(255,255,255,0.03); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 700; color: #fff;">${escapeHtml(p.name)}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">Standart: ${Number(p.price || 0).toFixed(2)} ₺</div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="font-size: 0.78rem; color: var(--text-secondary);">Fiyat</label>
          <input type="number" min="0" step="0.5" value="${value}" data-product-id="${p.id}" placeholder="${Number(p.price || 0).toFixed(2)}" style="width: 110px; padding: 8px 10px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; color: #fff; font-size: 0.9rem;">
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('merchantPricingModal').classList.add('active');
}

function closeMerchantPricingModal() {
  document.getElementById('merchantPricingModal').classList.remove('active');
  selectedMerchantForPricing = null;
}

async function saveMerchantPricing() {
  if (!selectedMerchantForPricing) return;

  const inputs = document.querySelectorAll('#merchantPricingList input[data-product-id]');
  const items = Array.from(inputs).map(input => {
    const productId = Number(input.dataset.productId);
    const customPrice = input.value.trim();
    return {
      product_id: productId,
      custom_price: customPrice === '' ? null : customPrice
    };
  }).filter(item => item.product_id != null);

  try {
    const res = await fetch(`/api/merchants/${selectedMerchantForPricing.id}/prices`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✓ Esnaf menü fiyatları kaydedildi', 'success');
      closeMerchantPricingModal();
      loadMerchants();
      if (selectedMerchantForOrder && selectedMerchantForOrder.id === selectedMerchantForPricing.id) {
        openCustomOrderModal(selectedMerchantForPricing.id);
      }
    } else {
      showToast(data.error || 'Fiyat kaydedilemedi', 'danger');
    }
  } catch (err) {
    console.error('Esnaf menu fiyat kaydetme hatası:', err);
    showToast('Bağlantı hatası oluştu', 'danger');
  }
}
