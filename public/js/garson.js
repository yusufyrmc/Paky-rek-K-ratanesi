// Pakyürek Kıraathanesi - Garson Mobil Mantığı
let socket;
let menuData = [];
let tablesData = [];
let currentCategory = 'all';
let selectedTable = null;
let currentSectionFilter = 'İçerisi';

// Sepet
let cart = [];

// Seçilen Ürün Modalı Geçici Durumu
let selectedProduct = null;
let modalQuantity = 1;
let selectedNotes = new Set();

// Garson Adı Yönetimi
function initWaiter() {
  const savedWaiter = localStorage.getItem('pakyurek_waiter_name');
  const select = document.getElementById('waiterSelect');
  if (savedWaiter) {
    select.value = savedWaiter;
  }
}

function onWaiterChange() {
  const waiterName = document.getElementById('waiterSelect').value;
  localStorage.setItem('pakyurek_waiter_name', waiterName);
  showToast(`Garson: ${waiterName} seçildi`, 'info');
}

function getWaiterName() {
  return document.getElementById('waiterSelect').value || 'Garson';
}

// Menü Verisini Yükle
async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    if (data.success) {
      menuData = data.data;
      renderCategories();
      renderProducts();
    }
  } catch (err) {
    console.error('Menü yüklenemedi:', err);
    showToast('Menü yüklenirken hata oluştu', 'danger');
  }
}

// Masaları Yükle
async function loadTables() {
  try {
    const res = await fetch('/api/tables');
    const data = await res.json();
    if (data.success) {
      tablesData = data.data;
      renderTablesModal();
      // Eğer seçili masa yoksa ilk masayı seç
      if (!selectedTable && tablesData.length > 0) {
        selectTable(tablesData[0]);
      } else if (selectedTable) {
        // Bilgilerini tazele
        const updated = tablesData.find(t => t.id === selectedTable.id);
        if (updated) selectTable(updated);
      }
    }
  } catch (err) {
    console.error('Masalar yüklenemedi:', err);
  }
}

// Kategorileri Render Et
function renderCategories() {
  const nav = document.getElementById('categoriesNav');
  let html = `
    <button class="category-chip ${currentCategory === 'all' ? 'active' : ''}" onclick="selectCategory('all')">
      ✨ Tümü
    </button>
  `;

  menuData.forEach(cat => {
    html += `
      <button class="category-chip ${currentCategory === String(cat.id) ? 'active' : ''}" onclick="selectCategory('${cat.id}')">
        ${cat.icon || '☕'} ${cat.name}
      </button>
    `;
  });

  nav.innerHTML = html;
}

function selectCategory(catId) {
  currentCategory = catId;
  renderCategories();
  renderProducts();
}

// Ürünleri Render Et (Hızlı Ekleme ve Not Butonlu)
function renderProducts() {
  const container = document.getElementById('productsContainer');
  let products = [];

  if (currentCategory === 'all') {
    menuData.forEach(cat => {
      products.push(...cat.products);
    });
  } else {
    const cat = menuData.find(c => String(c.id) === currentCategory);
    if (cat) products = cat.products;
  }

  if (products.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px;">Ürün bulunamadı.</div>`;
    return;
  }

  container.innerHTML = products.map(prod => {
    // Sepette bu üründen kaç adet var?
    const inCartQty = cart
      .filter(item => item.product_id === prod.id)
      .reduce((sum, item) => sum + item.quantity, 0);

    return `
      <div class="product-card" id="prod-card-${prod.id}">
        ${inCartQty > 0 ? `<div class="product-cart-badge">${inCartQty}</div>` : ''}
        
        <div class="product-card-top" onclick="quickDirectAdd(${prod.id})">
          <div class="product-title">${escapeHtml(prod.name)}</div>
          <div class="product-price">${prod.price.toFixed(2)} ₺</div>
        </div>

        <div class="card-quick-actions">
          <button class="btn-quick-add" onclick="quickDirectAdd(${prod.id})" title="Hızlı 1 Adet Ekle">
            + Ekle
          </button>
          <button class="btn-quick-option" onclick="openProductOptions(${prod.id})" title="Özel Not / Seçenek">
            ⚙️ Not
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Tek Dokunuşla Doğrudan Sepete Ekleme (Modal Beklemeden!)
function quickDirectAdd(prodId) {
  let prod = null;
  for (const cat of menuData) {
    const found = cat.products.find(p => p.id === prodId);
    if (found) { prod = found; break; }
  }
  if (!prod) return;

  const existingIndex = cart.findIndex(item => item.product_id === prod.id && (!item.note || item.note === ''));
  if (existingIndex !== -1) {
    cart[existingIndex].quantity += 1;
  } else {
    cart.push({
      product_id: prod.id,
      product_name: prod.name,
      unit_price: prod.price,
      quantity: 1,
      note: ''
    });
  }

  if (navigator.vibrate) navigator.vibrate(30);
  updateCartUI();
  renderProducts();
  showToast(`+1 ${prod.name} eklendi`, 'info');
}

// Ürün Hızlı Not & Adet Modalı
function openProductOptions(prodId) {
  let prod = null;
  for (const cat of menuData) {
    const found = cat.products.find(p => p.id === prodId);
    if (found) { prod = found; break; }
  }

  if (!prod) return;

  selectedProduct = prod;
  modalQuantity = 1;
  selectedNotes.clear();

  document.getElementById('modalProdName').textContent = prod.name;
  document.getElementById('modalProdPrice').textContent = `${prod.price.toFixed(2)} ₺`;
  document.getElementById('modalQtyDisplay').textContent = '1';
  document.getElementById('modalCustomNote').value = '';

  const chipsContainer = document.getElementById('modalNotesChips');
  const quickNotes = prod.quick_notes || [];

  if (quickNotes.length > 0) {
    chipsContainer.innerHTML = quickNotes.map(note => `
      <div class="note-chip" onclick="toggleNoteChip('${escapeHtml(note)}')">${escapeHtml(note)}</div>
    `).join('');
    chipsContainer.parentElement.style.display = 'block';
  } else {
    chipsContainer.innerHTML = '';
  }

  updateModalTotalPrice();
  document.getElementById('productOptionsModal').classList.add('active');
}

function toggleNoteChip(note) {
  if (selectedNotes.has(note)) {
    selectedNotes.delete(note);
    event.currentTarget.classList.remove('selected');
  } else {
    selectedNotes.add(note);
    event.currentTarget.classList.add('selected');
  }
}

function changeModalQty(delta) {
  modalQuantity = Math.max(1, modalQuantity + delta);
  document.getElementById('modalQtyDisplay').textContent = modalQuantity;
  updateModalTotalPrice();
}

function updateModalTotalPrice() {
  if (!selectedProduct) return;
  const total = selectedProduct.price * modalQuantity;
  document.getElementById('modalItemTotalPrice').textContent = `${total.toFixed(2)} ₺`;
}

function closeOptionsModal() {
  document.getElementById('productOptionsModal').classList.remove('active');
  selectedProduct = null;
}

// Sepete Onaylayıp Ekle
function confirmAddToCart() {
  if (!selectedProduct) return;

  // Notları birleştir
  const customNote = document.getElementById('modalCustomNote').value.trim();
  const notesArr = Array.from(selectedNotes);
  if (customNote) notesArr.push(customNote);
  const finalNote = notesArr.join(', ');

  // Sepette aynı ürün ve aynı not var mı kontrol et
  const existingIndex = cart.findIndex(item => item.product_id === selectedProduct.id && item.note === finalNote);
  if (existingIndex !== -1) {
    cart[existingIndex].quantity += modalQuantity;
  } else {
    cart.push({
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      unit_price: selectedProduct.price,
      quantity: modalQuantity,
      note: finalNote
    });
  }

  // Hafif titreşim ver
  if (navigator.vibrate) navigator.vibrate(40);

  updateCartUI();
  renderProducts();
  closeOptionsModal();
  showToast(`${modalQuantity}x ${selectedProduct.name} sepete eklendi`, 'success');
}

// Sepet UI Güncelle
function updateCartUI() {
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  const cartCountText = document.getElementById('cartCountText');
  const cartTotalText = document.getElementById('cartTotalText');
  const btnSend = document.getElementById('btnSendOrder');

  if (totalQty === 0) {
    cartCountText.textContent = 'Sepet Boş';
    cartTotalText.textContent = '0.00 ₺';
    btnSend.innerHTML = `Siparişi Gönder ➜`;
    btnSend.style.opacity = '0.6';
  } else {
    cartCountText.textContent = `${totalQty} Ürün (Detay için tıkla)`;
    cartTotalText.textContent = `${totalPrice.toFixed(2)} ₺`;
    btnSend.innerHTML = `🚀 Ocağa Gönder (${totalQty})`;
    btnSend.style.opacity = '1';
  }
}

// Hızlı Ocağa Gönder Butonu Tıklanması
function onFastSendClick() {
  if (!selectedTable) {
    showToast('Lütfen önce bir masa seçin!', 'warning');
    openTableModal();
    return;
  }

  if (cart.length === 0) {
    showToast('Sepetiniz boş. Ürün ekleyin.', 'warning');
    return;
  }

  // Tek dokunuşla hemen ocağa gönder!
  submitOrderToKitchen();
}

// Sepet Modalı Aç / Kapat
function openCartModal() {
  if (!selectedTable) {
    showToast('Lütfen önce bir masa seçin!', 'warning');
    openTableModal();
    return;
  }

  if (cart.length === 0) {
    showToast('Sepetiniz boş. Lütfen menüden ürün ekleyin.', 'warning');
    return;
  }

  document.getElementById('cartTableName').textContent = selectedTable.name;
  document.getElementById('cartWaiterName').textContent = getWaiterName();

  renderCartItemsList();
  document.getElementById('cartModal').classList.add('active');
}

function closeCartModal() {
  document.getElementById('cartModal').classList.remove('active');
}

function renderCartItemsList() {
  const container = document.getElementById('cartItemsList');
  let totalPrice = 0;

  container.innerHTML = cart.map((item, idx) => {
    const itemTotal = item.quantity * item.unit_price;
    totalPrice += itemTotal;
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 10px 12px; border-radius: 8px;">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: #fff;">${escapeHtml(item.product_name)}</div>
          ${item.note ? `<div style="font-size: 0.8rem; color: #fbbf24;">${escapeHtml(item.note)}</div>` : ''}
          <div style="font-size: 0.85rem; color: var(--text-secondary);">${item.unit_price.toFixed(2)} ₺ x ${item.quantity} = <strong>${itemTotal.toFixed(2)} ₺</strong></div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="qty-btn" style="width: 32px; height: 32px; font-size: 1rem;" onclick="changeCartItemQty(${idx}, -1)">-</button>
          <span style="font-weight: 700; min-width: 20px; text-align: center;">${item.quantity}</span>
          <button class="qty-btn" style="width: 32px; height: 32px; font-size: 1rem;" onclick="changeCartItemQty(${idx}, 1)">+</button>
          <button class="btn btn-outline" style="padding: 4px 8px; color: #ef4444; margin-left: 4px;" onclick="removeCartItem(${idx})">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('cartModalTotal').textContent = `${totalPrice.toFixed(2)} ₺`;
}

function changeCartItemQty(index, delta) {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }
  if (cart.length === 0) {
    closeCartModal();
  } else {
    renderCartItemsList();
  }
  updateCartUI();
  renderProducts();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  if (cart.length === 0) {
    closeCartModal();
  } else {
    renderCartItemsList();
  }
  updateCartUI();
  renderProducts();
}

// SİPARİŞİ OCAĞA GÖNDER!
async function submitOrderToKitchen() {
  if (!selectedTable) {
    showToast('Lütfen masa seçin!', 'danger');
    return;
  }
  if (cart.length === 0) {
    showToast('Sepet boş!', 'warning');
    return;
  }

  const payload = {
    table_id: selectedTable.id,
    waiter_name: getWaiterName(),
    items: cart
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      // Başarılı titreşim (2 kısa nabız)
      if (navigator.vibrate) navigator.vibrate([80, 50, 80]);

      showToast(`🚀 ${selectedTable.name} siparişi ocağa iletildi!`, 'success');
      cart = [];
      updateCartUI();
      closeCartModal();
      loadTables();
    } else {
      showToast('Sipariş iletilemedi: ' + data.error, 'danger');
    }
  } catch (err) {
    console.error('Sipariş gönderme hatası:', err);
    showToast('Bağlantı hatası oluştu!', 'danger');
  }
}

// Masa Seçim Modalı
function openTableModal() {
  renderTablesModal();
  document.getElementById('tableModal').classList.add('active');
}

function closeTableModal() {
  document.getElementById('tableModal').classList.remove('active');
}

function filterTableSection(section) {
  currentSectionFilter = section;
  const tabIcerisi = document.getElementById('tabIcerisi');
  const tabBahce = document.getElementById('tabBahce');
  const tabDisarisi = document.getElementById('tabDisarisi');
  const tabAll = document.getElementById('tabAll');

  if (tabIcerisi) tabIcerisi.className = section === 'İçerisi' ? 'btn btn-primary' : 'btn btn-outline';
  if (tabBahce) tabBahce.className = section === 'Bahçe' ? 'btn btn-primary' : 'btn btn-outline';
  if (tabDisarisi) tabDisarisi.className = section === 'Dışarısı' ? 'btn btn-primary' : 'btn btn-outline';
  if (tabAll) tabAll.className = section === 'All' ? 'btn btn-primary' : 'btn btn-outline';

  renderTablesModal();
}

function renderTablesModal() {
  const container = document.getElementById('tablesModalGrid');
  let filtered = tablesData;
  if (currentSectionFilter !== 'All') {
    if (currentSectionFilter === 'İçerisi') {
      filtered = tablesData.filter(t => t.section === 'İçerisi' || t.section === 'Salon');
    } else {
      filtered = tablesData.filter(t => t.section === currentSectionFilter);
    }
  }

  container.innerHTML = filtered.map(t => {
    const isSelected = selectedTable && selectedTable.id === t.id;
    const isOccupied = t.status === 'occupied' || t.current_total > 0;

    return `
      <div class="table-btn ${isOccupied ? 'occupied' : 'empty'} ${isSelected ? 'selected' : ''}" 
           onclick="selectTableById(${t.id})" style="position: relative;">
        <button type="button" class="btn-table-quick-rename" onclick="event.stopPropagation(); openGarsonRenameModalById(${t.id}, '${escapeHtml(t.name)}')" title="İsim / No Değiştir" style="position: absolute; top: 6px; right: 6px; border: none; background: rgba(0,0,0,0.35); color: #fff; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; cursor: pointer; line-height: 1;">
          ✏️
        </button>
        <div style="width: 8px; height: 8px; border-radius: 50%;" class="status-dot"></div>
        <div class="table-btn-title">${escapeHtml(t.name)}</div>
        <div class="table-btn-amount">
          ${isOccupied ? `${t.current_total.toFixed(2)} ₺` : 'Boş'}
        </div>
      </div>
    `;
  }).join('');
}

function selectTableById(id) {
  const table = tablesData.find(t => t.id === id);
  if (table) {
    selectTable(table);
    closeTableModal();
  }
}

// Masa İsmi Değiştirme (Garson Modalı)
let tableToRename = null;

function openGarsonRenameModal() {
  if (!selectedTable) {
    showToast('Lütfen önce bir masa seçin', 'warning');
    return;
  }
  openGarsonRenameModalById(selectedTable.id, selectedTable.name);
}

function openGarsonRenameModalById(id, currentName) {
  tableToRename = tablesData.find(t => t.id === id) || { id, name: currentName };
  const input = document.getElementById('garsonRenameInput');
  input.value = currentName || (tableToRename ? tableToRename.name : '');
  document.getElementById('renameModal').classList.add('active');
  setTimeout(() => input.focus(), 120);
}

function closeGarsonRenameModal() {
  document.getElementById('renameModal').classList.remove('active');
  tableToRename = null;
}

function setGarsonRenameSuggestion(text) {
  const input = document.getElementById('garsonRenameInput');
  input.value = text;
  input.focus();
}

async function saveGarsonRenameTable() {
  if (!tableToRename) return;
  const newName = document.getElementById('garsonRenameInput').value.trim();
  if (!newName) {
    showToast('Lütfen geçerli bir masa adı girin!', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/tables/${tableToRename.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Masa adı "${newName}" olarak güncellendi!`, 'success');
      closeGarsonRenameModal();
      await loadTables();
    } else {
      showToast('Güncellenemedi: ' + (data.error || 'Hata oluştu'), 'danger');
    }
  } catch (err) {
    console.error('Masa ismi güncelleme hatası:', err);
    showToast('Bağlantı hatası oluştu!', 'danger');
  }
}

function selectTable(table) {
  selectedTable = table;
  document.getElementById('currentTableName').textContent = table.name;
  document.getElementById('headerTableIcon').textContent = table.name.replace(/\D/g, '') || 'M';

  const isOccupied = table.status === 'occupied' || table.current_total > 0;
  document.getElementById('currentTableStatus').textContent = isOccupied
    ? `Açık Hesap: ${table.current_total.toFixed(2)} ₺`
    : 'Masa Boş (Dokunarak Değiştir)';

  const adisyonBtn = document.getElementById('btnTableAdisyon');
  if (adisyonBtn) {
    if (isOccupied && table.current_total > 0) {
      adisyonBtn.innerHTML = `📋 Adisyon (${table.current_total.toFixed(0)} ₺)`;
      adisyonBtn.classList.remove('btn-outline');
      adisyonBtn.classList.add('btn-primary');
    } else {
      adisyonBtn.innerHTML = `📋 Adisyon`;
      adisyonBtn.classList.remove('btn-primary');
      adisyonBtn.classList.add('btn-outline');
    }
  }
}

// Masa Adisyonunu Görüntüleme
async function openTableAdisyon() {
  if (!selectedTable) {
    showToast('Lütfen bir masa seçin', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/tables/${selectedTable.id}/orders`);
    const data = await res.json();
    if (data.success) {
      document.getElementById('adisyonTableName').textContent = `${data.table.name} - Güncel Adisyon`;
      document.getElementById('adisyonTotalAmount').textContent = `${data.total.toFixed(2)} ₺`;

      const list = document.getElementById('adisyonOrdersList');
      if (data.orders.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 30px;">Bu masanın açık siparişi yok.</div>`;
      } else {
        list.innerHTML = data.orders.map(order => `
          <div style="background: rgba(255,255,255,0.04); border-radius: 8px; padding: 10px; border-left: 3px solid ${order.status === 'ready' ? '#10b981' : (order.status === 'preparing' ? '#3b82f6' : '#f59e0b')}">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 6px;">
              <span>Garson: ${escapeHtml(order.waiter_name)}</span>
              <span class="badge badge-${order.status}">${order.status === 'ready' ? 'HAZIR' : (order.status === 'preparing' ? 'HAZIRLANIYOR' : 'BEKLİYOR')}</span>
            </div>
            ${order.items.map(item => `
              <div style="display: flex; justify-content: space-between; font-size: 0.95rem; padding: 2px 0;">
                <span>${item.quantity}x ${escapeHtml(item.product_name)} ${item.note ? `<small style="color:#fbbf24;">(${escapeHtml(item.note)})</small>` : ''}</span>
                <span>${(item.quantity * item.unit_price).toFixed(2)} ₺</span>
              </div>
            `).join('')}
          </div>
        `).join('');
      }

      document.getElementById('adisyonModal').classList.add('active');
    }
  } catch (err) {
    console.error('Adisyon alınamadı:', err);
  }
}

function closeAdisyonModal() {
  document.getElementById('adisyonModal').classList.remove('active');
}

// Toast Bildirimi
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

// WebSocket Bağlantısı
function setupSocket() {
  socket = io({
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('[Garson] Canlı bağlantı sağlandı.');
  });

  // Yeni sipariş eklendiğinde masaları tazele
  socket.on('new_order', (order) => {
    loadTables();
    const adisyonModal = document.getElementById('adisyonModal');
    if (adisyonModal && adisyonModal.classList.contains('active') && selectedTable && order && order.table_id === selectedTable.id) {
      openTableAdisyon();
    }
  });

  // Ocakçı siparişi "ONAYLADI" veya "İPTAL ETTİ" ise telefona uyarı düşsün!
  socket.on('order_status_updated', (data) => {
    if (data.status === 'cancelled') {
      if (navigator.vibrate) navigator.vibrate([150, 100, 150]);
      showToast(`⚠️ ${data.order ? data.order.table_name : 'Masa'} siparişi ocak tarafından İPTAL EDİLDİ!`, 'danger');
    } else if ((data.status === 'approved' || data.status === 'ready') && data.order) {
      if (navigator.vibrate) navigator.vibrate([100, 80, 100]);
      showToast(`✓ ${data.order.table_name} siparişi ocak tarafından ONAYLANDI!`, 'success');
    }
    loadTables();
    const adisyonModal = document.getElementById('adisyonModal');
    if (adisyonModal && adisyonModal.classList.contains('active')) {
      openTableAdisyon();
    }
  });

  socket.on('tables_changed', () => {
    loadTables();
    const adisyonModal = document.getElementById('adisyonModal');
    if (adisyonModal && adisyonModal.classList.contains('active')) {
      openTableAdisyon();
    }
  });

  socket.on('table_paid', () => {
    loadTables();
    const adisyonModal = document.getElementById('adisyonModal');
    if (adisyonModal && adisyonModal.classList.contains('active')) {
      openTableAdisyon();
    }
  });

  socket.on('menu_changed', () => {
    loadMenu();
  });
}

// Başlangıç
window.addEventListener('DOMContentLoaded', () => {
  initWaiter();
  loadMenu();
  loadTables();
  setupSocket();
});
