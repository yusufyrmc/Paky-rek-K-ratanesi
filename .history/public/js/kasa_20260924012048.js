// Pakyürek Kıraathanesi - Kasa & Yönetim Mantığı
let socket;
let allTables = [];
let selectedTable = null;
let rawMenuData = [];
let isRevenueHidden = localStorage.getItem('pakyurek_hide_revenue') === 'true';
let latestDailySummary = { total: 0, nakit: 0, kart: 0, transaction_count: 0 };

function formatOrderStatus(status) {
  const labels = { approved: 'AÇIK', preparing: 'HAZIRLANIYOR', ready: 'HAZIR', completed: 'ÖDENDİ' };
  return labels[status] || status.toUpperCase();
}

function formatOrderDate(value) {
  return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function cancelRecentOrder(orderId, tableName) {
  if (!confirm(`${tableName} siparişi iptal edilsin mi? Açık masa hesabından düşülecek.`)) return;

  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' })
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Sipariş iptal edilemedi', 'danger');
      return;
    }

    showToast('Sipariş iptal edildi ve masa hesabından düşüldü.', 'success');
    await openRecentOrdersModal();
    await loadTables();
  } catch (err) {
    console.error('Son sipariş iptal hatası:', err);
    showToast('Sipariş iptal edilirken bağlantı hatası oluştu', 'danger');
  }
}

async function openRecentOrdersModal() {
  document.getElementById('recentOrdersModal').classList.add('active');
  const list = document.getElementById('recentOrdersList');
  list.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 24px;">Siparişler yükleniyor...</div>';

  try {
    const res = await fetch('/api/orders/recent?limit=30');
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Siparişler alınamadı');
    if (!data.data.length) {
      list.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 24px;">Henüz sipariş bulunmuyor.</div>';
      return;
    }

    list.innerHTML = data.data.map(order => `
      <div style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); border-left: 3px solid ${order.status === 'completed' ? '#10b981' : 'var(--primary)'}; border-radius: 8px; padding: 10px 12px;">
        <div style="display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 5px;">
          <strong style="color: #fff;">${escapeHtml(order.table_name)}</strong>
          <span style="font-size: 0.75rem; color: var(--text-secondary);">${formatOrderDate(order.created_at)}</span>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 6px;">Garson: ${escapeHtml(order.waiter_name || 'Garson')} · ${formatOrderStatus(order.status)}</div>
        <div style="display: flex; justify-content: space-between; gap: 10px; align-items: center;">
          <span style="color: #e2e8f0;">${(order.items || []).map(item => `${item.quantity}x ${escapeHtml(item.product_name)}`).join(', ')}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="color: var(--primary); white-space: nowrap;">${Number(order.total_amount || 0).toFixed(2)} ₺</strong>
            ${order.status !== 'completed' ? `<button class="btn btn-outline" style="padding: 4px 8px; color: #fca5a5; border-color: rgba(239,68,68,0.45); font-size: 0.72rem; white-space: nowrap;" onclick="cancelRecentOrder(${order.id}, '${escapeHtml(order.table_name)}')">🗑️ İptal</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Son siparişler alınamadı:', err);
    list.innerHTML = `<div style="text-align: center; color: #fca5a5; padding: 24px;">Son siparişler alınamadı.</div>`;
  }
}

function closeRecentOrdersModal() {
  document.getElementById('recentOrdersModal').classList.remove('active');
}

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

function renderTablesGrid() {
  const container = document.getElementById('tablesGrid');
  const occupiedCount = allTables.filter(t => t.status === 'occupied' || t.current_total > 0).length;
  document.getElementById('occupiedCountLabel').textContent = `Dolu Masalar: ${occupiedCount} / ${allTables.length}`;
  const mobileOccEl = document.getElementById('mobileOccupiedCount');
  if (mobileOccEl) mobileOccEl.textContent = occupiedCount;

  container.innerHTML = allTables.map(t => {
    const isOccupied = t.status === 'occupied' || t.current_total > 0;
    const isSelected = selectedTable && selectedTable.id === t.id;
    const hasSpecial = t.is_special === 1 || (t.custom_tea_price != null && t.custom_tea_price > 0);

    return `
      <div class="kasa-table-card ${isOccupied ? 'occupied' : 'empty'} ${isSelected ? 'active-selected' : ''}" onclick="selectKasaTableById(${t.id})">
        <div style="display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%;">
          <span style="font-size: 1.15rem; font-weight: 800; color: #fff;">${escapeHtml(t.name)}</span>
          <span style="font-size: 0.8rem; cursor: pointer; opacity: 0.7;" onclick="event.stopPropagation(); quickRenameTable(${t.id}, '${escapeHtml(t.name)}')" title="Masa Ayarlarını Düzenle">✏️</span>
        </div>
        ${hasSpecial ? `<span style="font-size: 0.72rem; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 1px 6px; border-radius: 4px; font-weight: 800; margin: 2px 0;">⭐ Özel Fiyat</span>` : ''}
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
  document.getElementById('btnDeleteTable').style.display = 'inline-flex';
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

// Masa İsim / Numara / Özel Fiyat Değiştirme Fonksiyonları
function openRenameModal() {
  if (!selectedTable) return;
  document.getElementById('renameTableInput').value = selectedTable.name;
  const isSpecEl = document.getElementById('renameTableIsSpecial');
  if (isSpecEl) isSpecEl.checked = (selectedTable.is_special === 1 || (selectedTable.custom_tea_price != null && selectedTable.custom_tea_price > 0));
  const teaInput = document.getElementById('renameTableTeaPriceInput');
  if (teaInput) teaInput.value = (selectedTable.custom_tea_price != null) ? selectedTable.custom_tea_price : '';
  document.getElementById('renameModal').classList.add('active');
  document.getElementById('renameTableInput').focus();
}

function quickRenameTable(id, currentName) {
  const table = allTables.find(t => t.id === id);
  if (table) selectedTable = table;
  document.getElementById('renameTableInput').value = currentName;
  const isSpecEl = document.getElementById('renameTableIsSpecial');
  if (isSpecEl) isSpecEl.checked = (table && (table.is_special === 1 || (table.custom_tea_price != null && table.custom_tea_price > 0)));
  const teaInput = document.getElementById('renameTableTeaPriceInput');
  if (teaInput) teaInput.value = (table && table.custom_tea_price != null) ? table.custom_tea_price : '';
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

  const isSpecEl = document.getElementById('renameTableIsSpecial');
  const isSpecial = isSpecEl ? (isSpecEl.checked ? 1 : 0) : 0;
  const teaPriceVal = document.getElementById('renameTableTeaPriceInput').value.trim();
  const customTeaPrice = teaPriceVal !== '' ? parseFloat(teaPriceVal) : null;

  try {
    const res = await fetch(`/api/tables/${selectedTable.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: newName,
        is_special: isSpecial,
        custom_tea_price: customTeaPrice
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Masa ayarları güncellendi!`, 'success');
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
  document.getElementById('btnRenameTable').style.display = 'none';
  document.getElementById('btnDeleteTable').style.display = 'none';
  document.getElementById('btnTransferTable').style.display = 'none';
  renderTablesGrid();
}

// Seçili Masayı Sil
async function deleteSelectedTable() {
  if (!selectedTable) return;
  const table = selectedTable;

  if (table.status === 'occupied' || table.current_total > 0) {
    const proceed = confirm(
      `⚠️ DİKKAT: "${table.name}" masasında ${formatPrice(table.current_total || 0)} tutarında AÇIK HESAP var!\n\n` +
      `Masayı silerseniz adisyon veritabanından silinir.\n` +
      `Yine de "${table.name}" masasını tamamen silmek istiyor musunuz?`
    );
    if (!proceed) return;
  } else {
    const proceed = confirm(`"${table.name}" masasını kalıcı olarak silmek istediğinize emin misiniz?`);
    if (!proceed) return;
  }

  try {
    const res = await fetch(`/api/tables/${table.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`"${table.name}" masası silindi`, 'success');
      closeRenameModal();
      deselectTable();
      await loadTables();
    } else {
      showToast('Masa silinemedi: ' + (data.error || 'Hata oluştu'), 'danger');
    }
  } catch (err) {
    console.error('Masa silme hatası:', err);
    showToast('Bağlantı hatası: Masa silinemedi', 'danger');
  }
}

// Masanın Hesabını Kapat (Ödeme Al)
function openPartialPaymentModal() {
  if (!selectedTable) return;
  document.getElementById('partialPaymentTableName').textContent = selectedTable.name;
  document.getElementById('partialPaymentCurrentTotal').textContent = `${Number(selectedTable.current_total || 0).toFixed(2)} ₺`;
  document.getElementById('partialPaymentAmount').value = '';
  document.getElementById('partialPaymentModal').classList.add('active');
  setTimeout(() => document.getElementById('partialPaymentAmount').focus(), 120);
}

function closePartialPaymentModal() {
  document.getElementById('partialPaymentModal').classList.remove('active');
}

async function submitPartialPayment() {
  if (!selectedTable) return;
  const amount = Number(document.getElementById('partialPaymentAmount').value);
  const paymentType = document.getElementById('partialPaymentType').value;
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('Lütfen geçerli bir tutar girin.', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/tables/${selectedTable.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, payment_type: paymentType, waiter_name: 'Kasa' })
    });
    const data = await res.json();
    if (!data.success) {
      showToast('Ödeme alınamadı: ' + data.error, 'danger');
      return;
    }

    closePartialPaymentModal();
    showToast(`✓ ${data.paidAmount.toFixed(2)} ₺ alındı. Kalan: ${data.remainingAmount.toFixed(2)} ₺`, 'success');
    if (data.remainingAmount <= 0) deselectTable();
    await loadTables();
    loadDailyReports();
  } catch (err) {
    console.error('Kısmi ödeme hatası:', err);
    showToast('Ödeme işlemi sırasında hata oluştu', 'danger');
  }
}

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
      showToast(`✓ ${selectedTable.name} hesabı kapatıldı (${data.paidAmount.toFixed(2)} ₺)`, 'success');
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

      // Son 7 İş Günü Ciro
      const businessDaysContainer = document.getElementById('lastSevenBusinessDaysList');
      if (!data.lastSevenBusinessDays || data.lastSevenBusinessDays.length === 0) {
        businessDaysContainer.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 20px;">İş günü verisi yok.</div>`;
      } else {
        businessDaysContainer.innerHTML = data.lastSevenBusinessDays.map(day => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; background: rgba(255,255,255,0.03);">
            <span style="color: #fff; font-weight: 600;">${escapeHtml(day.label)}</span>
            <span style="color: var(--primary); font-weight: 800;">${Number(day.total || 0).toFixed(2)} ₺</span>
          </div>
        `).join('');
      }

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
    html += `<h4 style="color: var(--primary); margin: 14px 0 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">${cat.icon || '☕'} ${cat.name}</h4>`;
    cat.products.forEach(p => {
      const notesCount = (p.quick_notes || []).length;
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(255,255,255,0.04); border-radius: 6px; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <div style="flex: 1; min-width: 140px;">
            <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">${escapeHtml(p.name)}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
              ${notesCount > 0 
                ? (p.quick_notes.slice(0, 4).join(', ') + (notesCount > 4 ? '...' : '')) 
                : '<span style="opacity: 0.5;">(Kolay tuş yok)</span>'}
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <input type="number" id="price-input-${p.id}" value="${p.price}" style="width: 65px; padding: 6px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 4px; color: #fff; text-align: right; font-weight: 700;">
            <span style="font-weight: 700; color: var(--primary);">₺</span>
            
            <button class="btn btn-outline" style="padding: 6px 10px; font-size: 0.8rem; color: #fbbf24; border-color: #fbbf24;" onclick="openProductNotesModal(${p.id})" title="Şekerli, Sade vb. Kolay Tuşları Ayarla">
              ⚙️ Kolay Tuşlar (${notesCount})
            </button>
            <button class="btn btn-primary" style="padding: 6px 10px; font-size: 0.8rem;" onclick="updateProductPrice(${p.id}, ${p.category_id}, '${escapeHtml(p.name)}')">Fiyatı Kaydet</button>
            <button class="btn btn-outline" style="padding: 6px 8px; color: #ef4444; font-size: 0.8rem;" onclick="deleteProduct(${p.id})">🗑️</button>
          </div>
        </div>
      `;
    });
  });

  container.innerHTML = html;
}

// Kolay Tuşlar (Hızlı Notlar) Düzenleme Modalı
let activeProductForNotes = null;
let currentProductNotesList = [];

function openProductNotesModal(prodId) {
  let found = null;
  for (const cat of rawMenuData) {
    const p = cat.products.find(x => x.id === prodId);
    if (p) {
      found = p;
      break;
    }
  }

  if (!found) return;

  activeProductForNotes = found;
  currentProductNotesList = Array.isArray(found.quick_notes) ? [...found.quick_notes] : [];

  document.getElementById('notesModalProdTitle').textContent = `${found.name} (${found.price.toFixed(2)} ₺)`;
  document.getElementById('newNoteInput').value = '';
  renderNotesChips();

  document.getElementById('productNotesModal').classList.add('active');
  setTimeout(() => document.getElementById('newNoteInput').focus(), 150);
}

function closeProductNotesModal() {
  document.getElementById('productNotesModal').classList.remove('active');
  activeProductForNotes = null;
  currentProductNotesList = [];
}

function renderNotesChips() {
  const container = document.getElementById('notesChipsList');
  if (currentProductNotesList.length === 0) {
    container.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic;">Henüz kolay tuş eklenmemiş. Aşağıdan yazarak ekleyebilirsiniz.</span>`;
    return;
  }

  container.innerHTML = currentProductNotesList.map((note, idx) => `
    <span style="display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; padding: 5px 10px; border-radius: 16px; font-size: 0.85rem; font-weight: 700;">
      ${escapeHtml(note)}
      <button type="button" onclick="removeNoteByIndex(${idx})" style="background: none; border: none; color: #f87171; font-weight: 800; cursor: pointer; padding: 0 2px; font-size: 0.9rem; line-height: 1;" title="Sil">✕</button>
    </span>
  `).join('');
}

function removeNoteByIndex(idx) {
  currentProductNotesList.splice(idx, 1);
  renderNotesChips();
}

function addNewNoteToActiveProduct() {
  const input = document.getElementById('newNoteInput');
  const val = input.value.trim();
  if (!val) return;

  if (currentProductNotesList.includes(val)) {
    showToast('Bu seçenek zaten ekli!', 'warning');
    return;
  }

  currentProductNotesList.push(val);
  input.value = '';
  renderNotesChips();
  input.focus();
}

function addPresetNote(note) {
  if (currentProductNotesList.includes(note)) {
    showToast(`"${note}" zaten ekli`, 'info');
    return;
  }
  currentProductNotesList.push(note);
  renderNotesChips();
}

async function saveActiveProductNotes() {
  if (!activeProductForNotes) return;

  try {
    const res = await fetch(`/api/products/${activeProductForNotes.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: activeProductForNotes.category_id,
        name: activeProductForNotes.name,
        price: activeProductForNotes.price,
        quick_notes: currentProductNotesList
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`✓ ${activeProductForNotes.name} kolay tuşları kaydedildi!`, 'success');
      activeProductForNotes.quick_notes = [...currentProductNotesList];
      closeProductNotesModal();
      await loadMenuForManage();
    } else {
      showToast('Kaydedilemedi: ' + data.error, 'danger');
    }
  } catch (err) {
    console.error('Kolay tuş kayıt hatası:', err);
    showToast('Bağlantı hatası!', 'danger');
  }
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
  let found = null;
  for (const cat of rawMenuData) {
    const p = cat.products.find(x => x.id === prodId);
    if (p) { found = p; break; }
  }
  const quickNotes = found ? (found.quick_notes || []) : [];

  try {
    const res = await fetch(`/api/products/${prodId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: catId,
        name,
        price: parseFloat(newPrice),
        quick_notes: quickNotes
      })
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
  const teaPriceVal = document.getElementById('newTableTeaPrice').value.trim();
  const customTeaPrice = teaPriceVal !== '' ? parseFloat(teaPriceVal) : null;

  if (!name) {
    showToast('Masa adı giriniz!', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, section, custom_tea_price: customTeaPrice })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} masası oluşturuldu!`, 'success');
      document.getElementById('newTableName').value = '';
      document.getElementById('newTableTeaPrice').value = '';
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

// ================= ESNAF YÖNETİMİ (EKLE & SİL) =================
let kasaMerchantsData = [];

function openManageMerchantsModal() {
  document.getElementById('manageMerchantsModal').classList.add('active');
  const searchInput = document.getElementById('kasaSearchMerchantInput');
  if (searchInput) searchInput.value = '';
  loadKasaMerchants();
}

function closeManageMerchantsModal() {
  document.getElementById('manageMerchantsModal').classList.remove('active');
}

async function loadKasaMerchants() {
  const container = document.getElementById('kasaMerchantsList');
  if (container) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Esnaflar yükleniyor...</div>';
  }

  try {
    const res = await fetch('/api/merchants');
    const data = await res.json();
    if (data.success) {
      kasaMerchantsData = data.data || [];
      kasaFilterMerchantsList();
    } else {
      if (container) container.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 20px;">Esnaflar alınamadı!</div>';
    }
  } catch (err) {
    console.error('Kasa esnaf verileri yüklenemedi:', err);
    if (container) container.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 20px;">Bağlantı hatası!</div>';
  }
}

function getMerchantTypeIcon(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('berber') || t.includes('kuaför')) return '✂️';
  if (t.includes('terzi')) return '🧵';
  if (t.includes('kasap')) return '🥩';
  if (t.includes('manav')) return '🍎';
  if (t.includes('eczane')) return '💊';
  if (t.includes('taksi')) return '🚕';
  if (t.includes('kırtasiye')) return '📚';
  if (t.includes('büfe') || t.includes('bakkal')) return '🥪';
  if (t.includes('lokanta') || t.includes('kebap')) return '🍲';
  if (t.includes('ayakkabı')) return '👞';
  return '🏬';
}

function kasaFilterMerchantsList() {
  const q = (document.getElementById('kasaSearchMerchantInput')?.value || '').trim().toLowerCase();
  if (!q) {
    renderKasaMerchants(kasaMerchantsData);
    return;
  }

  const filtered = kasaMerchantsData.filter(m => 
    (m.name && m.name.toLowerCase().includes(q)) ||
    (m.shop_type && m.shop_type.toLowerCase().includes(q)) ||
    (m.phone && m.phone.toLowerCase().includes(q)) ||
    (m.notes && m.notes.toLowerCase().includes(q))
  );
  renderKasaMerchants(filtered);
}

function renderKasaMerchants(list) {
  const container = document.getElementById('kasaMerchantsList');
  const countLabel = document.getElementById('kasaMerchantCountLabel');
  if (!container) return;

  if (countLabel) {
    countLabel.textContent = `📋 Kayıtlı Esnaflar (${list.length} Esnaf)`;
  }

  if (!list || list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-secondary); padding: 30px; background: rgba(255,255,255,0.02); border-radius: 8px;">
        Kayıtlı esnaf bulunamadı. Yukarıdaki formdan yeni esnaf ekleyebilirsiniz.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(m => {
    const icon = getMerchantTypeIcon(m.shop_type);
    const balance = parseFloat(m.balance) || 0;
    const isDebt = balance > 0;

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); border-radius: 8px; gap: 12px; transition: all 0.2s; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
          <div style="font-size: 1.6rem; line-height: 1; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 8px;">${icon}</div>
          <div style="min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: #fff; font-size: 1rem;">${escapeHtml(m.name)}</span>
              <span style="font-size: 0.75rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3);">
                ${escapeHtml(m.shop_type || 'Esnaf')}
              </span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; display: flex; gap: 10px; flex-wrap: wrap;">
              ${m.phone ? `<span>📞 ${escapeHtml(m.phone)}</span>` : ''}
              ${m.notes ? `<span style="font-style: italic;">📝 ${escapeHtml(m.notes)}</span>` : ''}
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="text-align: right;">
            <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">Güncel Bakiye</div>
            <div style="font-weight: 800; font-size: 1.15rem; ${isDebt ? 'color: #ef4444;' : 'color: #10b981;'}">
              ${balance.toFixed(2)} ₺
            </div>
          </div>

          <div style="display: flex; gap: 6px;">
            <a href="esnaf.html" class="btn btn-outline" style="padding: 6px 10px; font-size: 0.8rem; text-decoration: none;" title="Esnaf Detayını & Çetelesini Aç">
              📋 Çetele
            </a>
            <button class="btn btn-outline" style="padding: 6px 10px; color: #ef4444; border-color: rgba(239,68,68,0.5); font-size: 0.85rem;" onclick="kasaDeleteMerchant(${m.id}, '${escapeHtml(m.name)}')" title="Esnafı ve tüm kayıtlarını sil">
              🗑️ Sil
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function kasaAddNewMerchant() {
  const nameInput = document.getElementById('kasaNewMerchantName');
  const typeInput = document.getElementById('kasaNewMerchantType');
  const balanceInput = document.getElementById('kasaNewMerchantBalance');
  const phoneInput = document.getElementById('kasaNewMerchantPhone');
  const notesInput = document.getElementById('kasaNewMerchantNotes');

  const name = nameInput.value.trim();
  const shop_type = typeInput.value;
  const initial_balance = parseFloat(balanceInput.value) || 0;
  const phone = phoneInput.value.trim();
  const notes = notesInput.value.trim();

  if (!name) {
    showToast('Lütfen esnaf adını veya dükkan ismini girin!', 'warning');
    nameInput.focus();
    return;
  }

  try {
    const res = await fetch('/api/merchants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        shop_type,
        initial_balance,
        phone,
        notes
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🏬 "${name}" başarıyla eklendi!`, 'success');
      nameInput.value = '';
      balanceInput.value = '0';
      phoneInput.value = '';
      notesInput.value = '';
      loadKasaMerchants();
    } else {
      showToast(data.error || 'Esnaf eklenemedi', 'danger');
    }
  } catch (err) {
    console.error('Esnaf ekleme hatası:', err);
    showToast('Bağlantı hatası oluştu', 'danger');
  }
}

async function kasaDeleteMerchant(id, name) {
  const confirmed = confirm(`"${name}" isimli esnafı silmek istediğinize emin misiniz?\n\n⚠️ Bu işlem esnafın tüm geçmiş çetele ve tahsilat kayıtlarını da silecektir!`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/merchants/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🗑️ "${name}" esnafı ve verileri başarıyla silindi.`, 'info');
      loadKasaMerchants();
    } else {
      showToast(data.error || 'Esnaf silinemedi', 'danger');
    }
  } catch (err) {
    console.error('Esnaf silme hatası:', err);
    showToast('Silme işlemi sırasında hata oluştu', 'danger');
  }
}

// ================= GARSON YÖNETİMİ (KASA) =================
let kasaWaitersData = [];

function openManageWaitersModal() {
  document.getElementById('manageWaitersModal').classList.add('active');
  const input = document.getElementById('kasaNewWaiterName');
  if (input) { input.value = ''; input.focus(); }
  loadKasaWaiters();
}

function closeManageWaitersModal() {
  document.getElementById('manageWaitersModal').classList.remove('active');
}

async function loadKasaWaiters() {
  const container = document.getElementById('kasaWaitersList');
  const countLabel = document.getElementById('kasaWaitersCountLabel');
  if (container) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 15px;">Garsonlar yükleniyor...</div>';
  }

  try {
    const res = await fetch('/api/waiters');
    const data = await res.json();
    if (data.success) {
      kasaWaitersData = data.data || [];
      renderKasaWaiters();
    } else {
      if (container) container.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 15px;">Garsonlar alınamadı!</div>';
    }
  } catch (err) {
    if (container) container.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 15px;">Bağlantı hatası!</div>';
  }
}

function renderKasaWaiters() {
  const container = document.getElementById('kasaWaitersList');
  const countLabel = document.getElementById('kasaWaitersCountLabel');
  if (!container) return;

  if (countLabel) {
    countLabel.textContent = `📋 Kayıtlı Garsonlar (${kasaWaitersData.length} Garson)`;
  }

  if (kasaWaitersData.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-secondary); padding: 20px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        Kayıtlı garson bulunamadı. Yukarıdan yeni garson ekleyebilirsiniz.
      </div>
    `;
    return;
  }

  container.innerHTML = kasaWaitersData.map(w => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); border-radius: 8px;">
      <div style="font-weight: 700; color: #fff; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 1.2rem;">👤</span> ${escapeHtml(w.name)}
      </div>
      <button class="btn btn-outline" style="padding: 5px 12px; color: #ef4444; border-color: rgba(239,68,68,0.4); font-size: 0.85rem;" onclick="kasaDeleteWaiter(${w.id}, '${escapeHtml(w.name)}')">
        🗑️ Sil
      </button>
    </div>
  `).join('');
}

async function kasaAddNewWaiter() {
  const input = document.getElementById('kasaNewWaiterName');
  const name = input ? input.value.trim() : '';

  if (!name) {
    showToast('Lütfen garson adını girin!', 'warning');
    if (input) input.focus();
    return;
  }

  try {
    const res = await fetch('/api/waiters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`👤 "${name}" garson olarak eklendi!`, 'success');
      if (input) input.value = '';
      loadKasaWaiters();
    } else {
      showToast(data.error || 'Garson eklenemedi', 'danger');
    }
  } catch (err) {
    showToast('Bağlantı hatası oluştu', 'danger');
  }
}

async function kasaDeleteWaiter(id, name) {
  if (!confirm(`"${name}" isimli garsonu silmek istediğinize emin misiniz?`)) return;

  try {
    const res = await fetch(`/api/waiters/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`🗑️ "${name}" silindi.`, 'info');
      loadKasaWaiters();
    } else {
      showToast(data.error || 'Garson silinemedi', 'danger');
    }
  } catch (err) {
    showToast('Silme hatası oluştu', 'danger');
  }
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
    const teaModal = document.getElementById('customTeaPriceModal');
    if (teaModal && teaModal.classList.contains('active')) {
      renderCustomTeaPriceList();
    }
  });

  socket.on('table_paid', () => {
    loadTables();
    loadDailyReports();
  });

  socket.on('merchants_changed', () => {
    const modal = document.getElementById('manageMerchantsModal');
    if (modal && modal.classList.contains('active')) {
      loadKasaMerchants();
    }
  });

  socket.on('waiters_changed', () => {
    const modal = document.getElementById('manageWaitersModal');
    if (modal && modal.classList.contains('active')) {
      loadKasaWaiters();
    }
  });
}

// ================= MASALARA ÖZEL FİYAT VE ÜRÜN YÖNETİMİ =================
let currentSpecialTab = 'products';
let isFilterOnlySpecialTea = false;

function switchSpecialTab(tab) {
  currentSpecialTab = tab;
  const btnProducts = document.getElementById('tabBtnSpecialProducts');
  const btnTables = document.getElementById('tabBtnSpecialTables');
  const contentProducts = document.getElementById('tabContentSpecialProducts');
  const contentTables = document.getElementById('tabContentSpecialTables');

  if (tab === 'products') {
    if (btnProducts) btnProducts.className = 'btn btn-primary';
    if (btnTables) btnTables.className = 'btn btn-outline';
    if (contentProducts) contentProducts.style.display = 'flex';
    if (contentTables) contentTables.style.display = 'none';
    renderSpecialProductsList();
  } else {
    if (btnProducts) btnProducts.className = 'btn btn-outline';
    if (btnTables) btnTables.className = 'btn btn-primary';
    if (contentProducts) contentProducts.style.display = 'none';
    if (contentTables) contentTables.style.display = 'flex';
    renderCustomTeaPriceList();
  }
}

function openCustomTeaPriceModal() {
  document.getElementById('customTeaPriceModal').classList.add('active');
  const searchInput = document.getElementById('teaPriceTableSearch');
  if (searchInput) searchInput.value = '';
  const prodSearch = document.getElementById('specialProductSearch');
  if (prodSearch) prodSearch.value = '';
  isFilterOnlySpecialTea = false;
  const filterBtn = document.getElementById('btnFilterOnlySpecialTea');
  if (filterBtn) filterBtn.className = 'btn btn-outline';

  switchSpecialTab(currentSpecialTab || 'products');
}

function closeCustomTeaPriceModal() {
  document.getElementById('customTeaPriceModal').classList.remove('active');
}

// 1. Sekme: Ürün Özel Fiyatları Listesi
function renderSpecialProductsList() {
  const container = document.getElementById('specialProductsListContainer');
  if (!container) return;

  const searchQuery = (document.getElementById('specialProductSearch')?.value || '').trim().toLowerCase();

  // Menüdeki tüm ürünleri topla
  let allProds = [];
  for (const cat of rawMenuData) {
    for (const p of cat.products) {
      allProds.push({
        ...p,
        categoryName: cat.name,
        categoryIcon: cat.icon || '☕'
      });
    }
  }

  if (searchQuery) {
    allProds = allProds.filter(p => 
      p.name.toLowerCase().includes(searchQuery) || 
      p.categoryName.toLowerCase().includes(searchQuery)
    );
  }

  const countLabel = document.getElementById('specialProductCountLabel');
  if (countLabel) {
    countLabel.textContent = `${allProds.length} ürün listeleniyor`;
  }

  if (allProds.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 30px;">Aradığınız kriterde ürün bulunamadı.</div>';
    return;
  }

  container.innerHTML = allProds.map(p => {
    const hasSpec = p.special_price != null && p.special_price > 0;
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.04); border: 1px solid ${hasSpec ? 'rgba(16,185,129,0.35)' : 'var(--border-color)'}; border-radius: 8px; gap: 8px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 180px;">
          <span style="font-size: 1.2rem;">${p.categoryIcon}</span>
          <div>
            <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">${escapeHtml(p.name)}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHtml(p.categoryName)} &bull; Standart: <b style="color: #fbbf24;">${p.price.toFixed(2)} ₺</b></div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 0.8rem; color: #34d399; font-weight: 700;">⭐ Özel Fiyat:</span>
            <input type="number" 
              class="special-price-input" 
              data-prod-id="${p.id}" 
              data-prod-name="${escapeHtml(p.name)}" 
              value="${p.special_price != null ? p.special_price : ''}" 
              step="0.5" 
              min="0" 
              placeholder="Standart (${p.price.toFixed(0)} ₺)" 
              style="width: 105px; padding: 6px 8px; background: rgba(0,0,0,0.4); border: 1px solid ${hasSpec ? 'rgba(16,185,129,0.5)' : 'var(--border-color)'}; border-radius: 6px; color: #10b981; font-weight: 800; font-size: 0.95rem; text-align: center;">
            <span style="font-weight: 800; color: #10b981;">₺</span>
          </div>

          <button class="btn btn-outline" style="padding: 6px 8px; font-size: 0.75rem; color: var(--text-secondary);" title="Standart Menü Fiyatına Döndür" onclick="clearProductSpecialInput(${p.id})">
            ✕
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function clearProductSpecialInput(prodId) {
  const input = document.querySelector(`.special-price-input[data-prod-id="${prodId}"]`);
  if (input) {
    input.value = '';
    input.focus();
  }
}

function setQuickTeaSpecialPrices(price) {
  const inputs = document.querySelectorAll('.special-price-input');
  let count = 0;
  inputs.forEach(input => {
    const name = (input.dataset.prodName || '').toLowerCase();
    if (name.includes('çay') || name.includes('cay') || name.includes('oralet') || name.includes('kuşburnu') || name.includes('kusburnu') || name.includes('adaçayı') || name.includes('adacayi') || name.includes('ıhlamur') || name.includes('ihlamur')) {
      input.value = price;
      count++;
    }
  });
  showToast(`✓ ${count} adet çay ve oralet ürününe ${price} ₺ yazıldı. Kaydetmek için 'Fiyat Değişikliklerini Kaydet' butonuna basın.`, 'info');
}

async function saveBulkSpecialPrices() {
  const inputs = document.querySelectorAll('.special-price-input');
  const items = [];

  inputs.forEach(input => {
    const id = parseInt(input.dataset.prodId);
    const val = input.value.trim();
    items.push({
      id: id,
      special_price: val !== '' ? parseFloat(val) : null
    });
  });

  try {
    const res = await fetch('/api/products/bulk-special-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✓ Ürün özel fiyatları başarıyla kaydedildi!', 'success');
      await loadMenuForManage();
      renderSpecialProductsList();
    } else {
      showToast('Hata: ' + data.error, 'danger');
    }
  } catch (err) {
    showToast('Bağlantı hatası', 'danger');
  }
}

// 2. Sekme: Özel Fiyatlı Masalar Listesi
function toggleFilterOnlySpecialTea() {
  isFilterOnlySpecialTea = !isFilterOnlySpecialTea;
  const filterBtn = document.getElementById('btnFilterOnlySpecialTea');
  if (filterBtn) {
    filterBtn.className = isFilterOnlySpecialTea ? 'btn btn-primary' : 'btn btn-outline';
  }
  renderCustomTeaPriceList();
}

function toggleAllTableCheckboxes(check) {
  const checkboxes = document.querySelectorAll('.table-tea-checkbox');
  checkboxes.forEach(cb => cb.checked = check);
}

function renderCustomTeaPriceList() {
  const container = document.getElementById('customTeaPriceTablesList');
  if (!container) return;

  const searchQuery = (document.getElementById('teaPriceTableSearch')?.value || '').trim().toLowerCase();
  
  let list = allTables;
  if (searchQuery) {
    list = list.filter(t => t.name.toLowerCase().includes(searchQuery) || (t.section && t.section.toLowerCase().includes(searchQuery)));
  }
  if (isFilterOnlySpecialTea) {
    list = list.filter(t => t.is_special === 1 || (t.custom_tea_price != null && t.custom_tea_price > 0));
  }

  const specialCount = allTables.filter(t => t.is_special === 1 || (t.custom_tea_price != null && t.custom_tea_price > 0)).length;
  const statsLabel = document.getElementById('customTeaStatsLabel');
  if (statsLabel) {
    statsLabel.textContent = `Özel Fiyatlı Masa: ${specialCount} / ${allTables.length}`;
  }

  if (list.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 30px;">Eşleşen masa bulunamadı.</div>';
    return;
  }

  container.innerHTML = list.map(t => {
    const hasSpecial = t.is_special === 1 || (t.custom_tea_price != null && t.custom_tea_price > 0);
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.04); border: 1px solid ${hasSpecial ? 'rgba(16,185,129,0.4)' : 'var(--border-color)'}; border-radius: 8px; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <input type="checkbox" class="table-tea-checkbox" value="${t.id}" style="width: 18px; height: 18px; cursor: pointer; accent-color: #10b981;">
          <div>
            <div style="font-weight: 700; color: #fff; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
              ${escapeHtml(t.name)}
              <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: normal;">(${escapeHtml(t.section || 'Salon')})</span>
            </div>
            <div style="font-size: 0.8rem; margin-top: 2px;">
              ${hasSpecial 
                ? `<span style="color: #34d399; font-weight: 700;">⭐ Özel Fiyat Tarifesi Aktif ${t.custom_tea_price ? `(Çay: ${t.custom_tea_price.toFixed(0)} ₺)` : ''}</span>` 
                : `<span style="color: var(--text-secondary);">Standart Menü</span>`}
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          ${hasSpecial ? `
            <button class="btn btn-outline" style="padding: 6px 12px; font-size: 0.8rem; color: #f87171; border-color: rgba(248,113,113,0.4);" onclick="setSingleTableSpecialStatus(${t.id}, false)">
              ✕ Standart Yap
            </button>
          ` : `
            <button class="btn btn-success" style="padding: 6px 12px; font-size: 0.8rem; font-weight: 700;" onclick="setSingleTableSpecialStatus(${t.id}, true)">
              ⭐ Özel Fiyatlı Yap
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

async function setSingleTableSpecialStatus(tableId, isSpecial) {
  const table = allTables.find(t => t.id === tableId);
  if (!table) return;

  try {
    const res = await fetch(`/api/tables/${tableId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: table.name,
        section: table.section,
        is_special: isSpecial ? 1 : 0,
        custom_tea_price: isSpecial ? (table.custom_tea_price || null) : null
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${table.name} ${isSpecial ? 'özel fiyatlı yapıldı!' : 'standart menüye döndürüldü.'}`, 'success');
      await loadTables();
      renderCustomTeaPriceList();
    } else {
      showToast('Güncellenemedi: ' + data.error, 'danger');
    }
  } catch (err) {
    showToast('Bağlantı hatası', 'danger');
  }
}

async function applyBulkSpecialToSelected(isSpecial) {
  const checkedBoxes = Array.from(document.querySelectorAll('.table-tea-checkbox:checked'));
  if (checkedBoxes.length === 0) {
    showToast('Lütfen en az bir masa seçin!', 'warning');
    return;
  }

  const tableIds = checkedBoxes.map(cb => parseInt(cb.value));

  try {
    const res = await fetch('/api/tables/bulk-special-pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_ids: tableIds, is_special: isSpecial ? 1 : 0 })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✓ ${tableIds.length} masanın özel fiyat durumu güncellendi!`, 'success');
      await loadTables();
      renderCustomTeaPriceList();
    } else {
      showToast('İşlem başarısız: ' + data.error, 'danger');
    }
  } catch (err) {
    showToast('Bağlantı hatası', 'danger');
  }
}

async function applyBulkSpecialToAll(isSpecial) {
  const actionText = isSpecial ? 'özel fiyatlı yapılsın' : 'standart yapılsın';
  if (!confirm(`Tüm masalar (${allTables.length} masa) ${actionText} mı?`)) return;

  const tableIds = allTables.map(t => t.id);

  try {
    const res = await fetch('/api/tables/bulk-special-pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_ids: tableIds, is_special: isSpecial ? 1 : 0 })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`★ Tüm masalar (${tableIds.length} masa) güncellendi!`, 'success');
      await loadTables();
      renderCustomTeaPriceList();
    } else {
      showToast('İşlem başarısız: ' + data.error, 'danger');
    }
  } catch (err) {
    showToast('Bağlantı hatası', 'danger');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  setupSocket();
});
