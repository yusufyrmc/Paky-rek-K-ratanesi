// Pakyürek Kıraathanesi - Kasa & Yönetim Mantığı
let socket;
let allTables = [];
let currentSection = 'Salon';
let selectedTable = null;
let rawMenuData = [];
let isRevenueHidden = localStorage.getItem('pakyurek_hide_revenue') === 'true';
let latestDailySummary = { total: 0, nakit: 0, kart: 0, transaction_count: 0 };

// Tüm Verileri Yükle
async function loadAllData() {
  await Promise.all([
    loadTables(),
    loadDailyReports(),
    loadMenuForManage()
  ]);
}

// Masaları Yükle
async function loadTables() {
  try {
    const res = await fetch('/api/tables');
    const data = await res.json();
    if (data.success) {
      allTables = data.data;
      renderTablesGrid();

      // Seçili masa varsa bilgilerini yenile
      if (selectedTable) {
        const updated = allTables.find(t => t.id === selectedTable.id);
        if (updated) {
          selectKasaTable(updated);
        } else {
          deselectTable();
        }
      }
    }
  } catch (err) {
    console.error('Masalar yüklenemedi:', err);
  }
}

function filterSection(section) {
  currentSection = section;
  document.getElementById('btnFilterSalon').className = section === 'Salon' ? 'btn btn-primary' : 'btn btn-outline';
  document.getElementById('btnFilterBahce').className = section === 'Bahçe' ? 'btn btn-primary' : 'btn btn-outline';
  document.getElementById('btnFilterAll').className = section === 'All' ? 'btn btn-primary' : 'btn btn-outline';
  renderTablesGrid();
}

function renderTablesGrid() {
  const container = document.getElementById('tablesGrid');
  let filtered = allTables;
  if (currentSection !== 'All') {
    filtered = allTables.filter(t => t.section === currentSection);
  }

  const occupiedCount = allTables.filter(t => t.status === 'occupied' || t.current_total > 0).length;
  document.getElementById('occupiedCountLabel').textContent = `Dolu Masalar: ${occupiedCount} / ${allTables.length}`;

  container.innerHTML = filtered.map(t => {
    const isOccupied = t.status === 'occupied' || t.current_total > 0;
    const isSelected = selectedTable && selectedTable.id === t.id;

    return `
      <div class="kasa-table-card ${isOccupied ? 'occupied' : 'empty'} ${isSelected ? 'active-selected' : ''}" onclick="selectKasaTableById(${t.id})">
        <div style="display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%;">
          <span style="font-size: 1.15rem; font-weight: 800; color: #fff;">${escapeHtml(t.name)}</span>
          <span style="font-size: 0.8rem; cursor: pointer; opacity: 0.7;" onclick="event.stopPropagation(); quickRenameTable(${t.id}, '${escapeHtml(t.name)}')" title="İsim / No Değiştir">✏️</span>
        </div>
        <div class="amount-tag" style="${isOccupied ? 'color: #ef4444; font-size: 1.25rem; font-weight: 800;' : 'color: var(--text-muted); font-size: 0.85rem;'}">
          ${isOccupied ? `${t.current_total.toFixed(2)} ₺` : '0.00 ₺ (Boş)'}
        </div>
        ${t.pending_order_count > 0 ? `<span class="badge badge-pending" style="font-size: 0.7rem;">${t.pending_order_count} Yeni Sipariş</span>` : ''}
      </div>
    `;
  }).join('');
}

function selectKasaTableById(id) {
  const table = allTables.find(t => t.id === id);
  if (table) selectKasaTable(table);
}

// Masa Seçildiğinde Adisyonunu Çek
async function selectKasaTable(table) {
  selectedTable = table;
  renderTablesGrid();

  document.getElementById('receiptTableName').textContent = table.name;
  document.getElementById('btnRenameTable').style.display = 'inline-flex';
  document.getElementById('btnTransferTable').style.display = (table.status === 'occupied' || table.current_total > 0) ? 'inline-flex' : 'none';

  try {
    const res = await fetch(`/api/tables/${table.id}/orders`);
    const data = await res.json();
    if (data.success) {
      renderReceiptDetails(data);
    }
  } catch (err) {
    console.error('Masa detayları alınamadı:', err);
  }
}

function renderReceiptDetails(data) {
  const list = document.getElementById('receiptItemsList');
  const actions = document.getElementById('receiptActions');
  const statusLabel = document.getElementById('receiptTableStatus');

  if (data.orders.length === 0) {
    statusLabel.textContent = 'Masa boş - açık sipariş bulunmuyor.';
    list.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 30px;">Bu masanın açık siparişi yok.</div>`;
    actions.style.display = 'none';
    return;
  }

  statusLabel.textContent = `${data.orders.length} Adet Sipariş Kaydı (Ödenene kadar masada kalır)`;
  actions.style.display = 'flex';
  document.getElementById('receiptTotalAmount').textContent = `${data.total.toFixed(2)} ₺`;

  // Kalemleri birleştirip göster
  let allItems = [];
  data.orders.forEach(order => {
    (order.items || []).forEach(item => {
      allItems.push({
        ...item,
        orderStatus: order.status,
        waiter: order.waiter_name,
        time: order.created_at
      });
    });
  });

  list.innerHTML = allItems.map(item => {
    const isApproved = item.orderStatus === 'approved' || item.orderStatus === 'ready';
    return `
      <div class="receipt-row">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: #fff;">${item.quantity}x ${escapeHtml(item.product_name)}</span>
            ${isApproved 
              ? `<span style="font-size: 0.7rem; background: rgba(16,185,129,0.2); color: #34d399; padding: 2px 6px; border-radius: 4px; font-weight: 700;">✓ Ocak Onayladı</span>` 
              : `<span style="font-size: 0.7rem; background: rgba(245,158,11,0.2); color: #fbbf24; padding: 2px 6px; border-radius: 4px; font-weight: 700;">⏳ Ocakta Bekliyor</span>`}
          </div>
          ${item.note ? `<div style="font-size: 0.8rem; color: #fde047; margin-top: 2px;">[${escapeHtml(item.note)}]</div>` : ''}
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">Garson: ${escapeHtml(item.waiter)} | ${item.unit_price.toFixed(2)} ₺ x ${item.quantity}</div>
        </div>
        <div style="font-weight: 800; color: var(--primary); font-size: 1.15rem;">
          ${(item.quantity * item.unit_price).toFixed(2)} ₺
        </div>
      </div>
    `;
  }).join('');
}

// Masa İsim / Numara Değiştirme Fonksiyonları
function openRenameModal() {
  if (!selectedTable) return;
  document.getElementById('renameTableInput').value = selectedTable.name;
  document.getElementById('renameModal').classList.add('active');
  document.getElementById('renameTableInput').focus();
}

function quickRenameTable(id, currentName) {
  const table = allTables.find(t => t.id === id);
  if (table) selectedTable = table;
  document.getElementById('renameTableInput').value = currentName;
  document.getElementById('renameModal').classList.add('active');
  document.getElementById('renameTableInput').focus();
}

function closeRenameModal() {
  document.getElementById('renameModal').classList.remove('active');
}

async function saveRenameTable() {
  if (!selectedTable) return;
  const newName = document.getElementById('renameTableInput').value.trim();
  if (!newName) {
    showToast('Lütfen masa adı veya numarası girin!', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/tables/${selectedTable.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Masa adı "${newName}" olarak güncellendi!`, 'success');
      closeRenameModal();
      loadTables();
    } else {
      showToast('Güncellenemedi: ' + data.error, 'danger');
    }
  } catch (err) {
    showToast('Bağlantı hatası', 'danger');
  }
}

function deselectTable() {
  selectedTable = null;
  document.getElementById('receiptTableName').textContent = 'Masa Seçiniz';
  document.getElementById('receiptTableStatus').textContent = 'Detayları görmek için masaya tıklayın';
  document.getElementById('receiptItemsList').innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 30px;">Masaya tıklayarak açık adisyonu görebilir ve ödeme alabilirsiniz.</div>`;
  document.getElementById('receiptActions').style.display = 'none';
  document.getElementById('btnTransferTable').style.display = 'none';
  renderTablesGrid();
}

// Masanın Hesabını Kapat (Ödeme Al)
async function closeTableAccount(paymentType) {
  if (!selectedTable) return;

  const typeName = paymentType === 'nakit' ? 'NAKİT' : (paymentType === 'kart' ? 'KREDİ KARTI' : 'VERESİYE');
  const confirmMsg = `${selectedTable.name} masasının hesabı ${typeName} olarak kapatılsın mı?`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch(`/api/tables/${selectedTable.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_type: paymentType, waiter_name: 'Kasa' })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`✓ ${selectedTable.name} hesabı kapatıldı (${data.totalAmount.toFixed(2)} ₺)`, 'success');
      deselectTable();
      loadTables();
      loadDailyReports();
    } else {
      showToast('Ödeme alınamadı: ' + data.error, 'danger');
    }
  } catch (err) {
    console.error('Ödeme işlemi hatası:', err);
    showToast('Ödeme işlemi sırasında hata oluştu', 'danger');
  }
}

// Ciro ve Rakam Gizliliği Yönetimi
function toggleRevenuePrivacy() {
  isRevenueHidden = !isRevenueHidden;
  localStorage.setItem('pakyurek_hide_revenue', isRevenueHidden ? 'true' : 'false');
  updateRevenuePrivacyUI();
  showToast(isRevenueHidden ? '🙈 Ciro rakamları gizlendi' : '👁️ Ciro rakamları gösteriliyor', 'info');
}

function updateRevenuePrivacyUI() {
  const btn = document.getElementById('btnToggleRevenuePrivacy');
  const icon = document.getElementById('privacyIcon');
  const text = document.getElementById('privacyText');

  const headerIcon = document.getElementById('headerPrivacyIcon');
  const headerText = document.getElementById('headerPrivacyText');

  const statTotal = document.getElementById('statTotalRev');
  const statNakit = document.getElementById('statNakitRev');
  const statKart = document.getElementById('statKartRev');
  const statsGrid = document.getElementById('statsGrid');

  if (isRevenueHidden) {
    if (icon) icon.textContent = '🙈';
    if (text) text.textContent = 'Rakamları Göster';
    if (btn) {
      btn.style.borderColor = 'var(--primary)';
      btn.style.color = 'var(--primary)';
    }

    if (headerIcon) headerIcon.textContent = '🙈';
    if (headerText) headerText.textContent = 'Ciroyu Göster';

    if (statTotal) statTotal.textContent = '•••• ₺';
    if (statNakit) statNakit.textContent = '•••• ₺';
    if (statKart) statKart.textContent = '•••• ₺';

    if (statsGrid) statsGrid.classList.add('revenue-hidden');
  } else {
    if (icon) icon.textContent = '👁️';
    if (text) text.textContent = 'Rakamları Gizle';
    if (btn) {
      btn.style.borderColor = 'var(--border-color)';
      btn.style.color = 'inherit';
    }

    if (headerIcon) headerIcon.textContent = '👁️';
    if (headerText) headerText.textContent = 'Ciroyu Gizle';

    if (statTotal) statTotal.textContent = `${(latestDailySummary.total || 0).toFixed(2)} ₺`;
    if (statNakit) statNakit.textContent = `${(latestDailySummary.nakit || 0).toFixed(2)} ₺`;
    if (statKart) statKart.textContent = `${(latestDailySummary.kart || 0).toFixed(2)} ₺`;

    if (statsGrid) statsGrid.classList.remove('revenue-hidden');
  }
}

// Günlük Rapor ve İstatistikler
async function loadDailyReports() {
  try {
    const res = await fetch('/api/reports/daily');
    const data = await res.json();
    if (data.success) {
      latestDailySummary = data.summary || { total: 0, nakit: 0, kart: 0, transaction_count: 0 };

      // Ciro Özeti ve Gizlilik UI Güncelle
      updateRevenuePrivacyUI();
      document.getElementById('statTxCount').textContent = latestDailySummary.transaction_count || 0;

      // En Çok Satanlar
      const topContainer = document.getElementById('topProductsList');
      if (data.topProducts.length === 0) {
        topContainer.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Bugün henüz satış kaydı yok.</div>`;
      } else {
        topContainer.innerHTML = data.topProducts.map((p, idx) => `
          <div class="ranking-item">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="ranking-badge">${idx + 1}</div>
              <span style="font-weight: 600; color: #fff;">${escapeHtml(p.product_name)}</span>
            </div>
            <div>
              <span style="font-weight: 800; color: var(--primary); font-size: 1.1rem;">${p.total_quantity} Adet</span>
              <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 6px;">(${p.total_income.toFixed(2)} ₺)</span>
            </div>
          </div>
        `).join('');
      }

      // Son Ödemeler
      const paymentsContainer = document.getElementById('recentPaymentsList');
      if (data.recentPayments.length === 0) {
        paymentsContainer.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Henüz ödeme yok.</div>`;
      } else {
        paymentsContainer.innerHTML = data.recentPayments.map(p => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div>
              <strong style="color: #fff;">${escapeHtml(p.table_name)}</strong>
              <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 8px;">${escapeHtml(p.payment_type.toUpperCase())}</span>
            </div>
            <div style="font-weight: 700; color: #10b981;">
              +${p.amount.toFixed(2)} ₺
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Raporlar alınamadı:', err);
  }
}

// Masa Taşıma Modalı
function openTransferModal() {
  if (!selectedTable) return;
  document.getElementById('transferFromTableName').textContent = selectedTable.name;

  const select = document.getElementById('transferToTableSelect');
  select.innerHTML = allTables
    .filter(t => t.id !== selectedTable.id)
    .map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${t.section})</option>`)
    .join('');

  document.getElementById('transferModal').classList.add('active');
}

function closeTransferModal() {
  document.getElementById('transferModal').classList.remove('active');
}

async function confirmTransferTable() {
  const targetId = document.getElementById('transferToTableSelect').value;
  try {
    const res = await fetch('/api/tables/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_table_id: selectedTable.id, to_table_id: targetId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeTransferModal();
      deselectTable();
      loadTables();
    }
  } catch (err) {
    showToast('Aktarım hatası!', 'danger');
  }
}

// Menü & Fiyat Yönetimi Modalı
async function loadMenuForManage() {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    if (data.success) {
      rawMenuData = data.data;
      renderManageProducts();

      // Yeni ürün kategori dropdown'unu doldur
      const catSelect = document.getElementById('newProdCat');
      catSelect.innerHTML = rawMenuData.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');
    }
  } catch (err) {
    console.error('Menü yönetimi yüklenemedi:', err);
  }
}

function renderManageProducts() {
  const container = document.getElementById('manageProductsList');
  let html = '';

  rawMenuData.forEach(cat => {
    html += `<h4 style="color: var(--primary); margin: 12px 0 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">${cat.icon || '☕'} ${cat.name}</h4>`;
    cat.products.forEach(p => {
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.04); border-radius: 6px; margin-bottom: 6px;">
          <span style="font-weight: 600; color: #fff;">${escapeHtml(p.name)}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="number" id="price-input-${p.id}" value="${p.price}" style="width: 70px; padding: 6px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 4px; color: #fff; text-align: right;">
            <span style="font-weight: 700;">₺</span>
            <button class="btn btn-primary" style="padding: 6px 10px; font-size: 0.8rem;" onclick="updateProductPrice(${p.id}, ${p.category_id}, '${escapeHtml(p.name)}')">Kaydet</button>
            <button class="btn btn-outline" style="padding: 6px 10px; color: #ef4444; font-size: 0.8rem;" onclick="deleteProduct(${p.id})">Sil</button>
          </div>
        </div>
      `;
    });
  });

  container.innerHTML = html;
}

function openMenuManageModal() {
  loadMenuForManage();
  document.getElementById('menuManageModal').classList.add('active');
}

function closeMenuManageModal() {
  document.getElementById('menuManageModal').classList.remove('active');
}

async function updateProductPrice(prodId, catId, name) {
  const newPrice = document.getElementById(`price-input-${prodId}`).value;
  try {
    const res = await fetch(`/api/products/${prodId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: catId, name, price: parseFloat(newPrice) })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} fiyatı ${newPrice} ₺ olarak güncellendi!`, 'success');
      loadMenuForManage();
    }
  } catch (err) {
    showToast('Fiyat güncellenemedi', 'danger');
  }
}

async function addNewProduct() {
  const name = document.getElementById('newProdName').value.trim();
  const price = document.getElementById('newProdPrice').value;
  const category_id = document.getElementById('newProdCat').value;

  if (!name || !price) {
    showToast('Lütfen ürün adı ve fiyatını girin!', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: parseInt(category_id), name, price: parseFloat(price) })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} menüye eklendi!`, 'success');
      document.getElementById('newProdName').value = '';
      document.getElementById('newProdPrice').value = '';
      loadMenuForManage();
    }
  } catch (err) {
    showToast('Ürün eklenemedi', 'danger');
  }
}

async function deleteProduct(prodId) {
  if (!confirm('Bu ürünü menüden kaldırmak istediğinize emin misiniz?')) return;
  try {
    const res = await fetch(`/api/products/${prodId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Ürün kaldırıldı', 'info');
      loadMenuForManage();
    }
  } catch (err) {
    showToast('Silme hatası', 'danger');
  }
}

// Yeni Masa Ekleme
function openAddTableModal() {
  document.getElementById('addTableModal').classList.add('active');
}

function closeAddTableModal() {
  document.getElementById('addTableModal').classList.remove('active');
}

async function addNewTable() {
  const name = document.getElementById('newTableName').value.trim();
  const section = document.getElementById('newTableSection').value;
  if (!name) {
    showToast('Masa adı giriniz!', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, section })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} masası oluşturuldu!`, 'success');
      document.getElementById('newTableName').value = '';
      closeAddTableModal();
      loadTables();
    }
  } catch (err) {
    showToast('Masa eklenemedi', 'danger');
  }
}

// Toast
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

// WebSocket
function setupSocket() {
  socket = io({
    transports: ['websocket', 'polling']
  });

  socket.on('new_order', (order) => {
    loadTables();
    loadDailyReports();
    if (order && order.table_name) {
      showToast(`🔔 Yeni Sipariş: ${order.table_name} (${order.waiter_name || 'Garson'}) - ${order.total_amount ? order.total_amount.toFixed(2) : ''} ₺`, 'warning');
      if (selectedTable && selectedTable.id === order.table_id) {
        selectKasaTable(selectedTable);
      }
    }
  });

  socket.on('order_status_updated', () => {
    loadTables();
    if (selectedTable) {
      selectKasaTable(selectedTable);
    }
  });

  socket.on('tables_changed', () => {
    loadTables();
  });

  socket.on('table_paid', () => {
    loadTables();
    loadDailyReports();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  setupSocket();
});
