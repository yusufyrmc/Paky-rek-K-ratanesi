// Pakyürek Kıraathanesi - Garson Mobil Mantığı
let socket;
let menuData = [];
let tablesData = [];
let currentCategory = 'all';
let selectedTable = null;
let currentSectionFilter = 'İçerisi';

// Sepet
let cart = [];
let orderSubmissionInProgress = false;

// Seçilen Ürün Modalı Geçici Durumu
let selectedProduct = null;
let modalQuantity = 1;
let selectedNotes = new Set();
let modalUnitPrice = 0;

// Çay ve Çay Ürünlerini (Oralet, Kuşburnu, Adaçayı, Ihlamur vb.) Tespit Eden Yardımcılar
function isTeaProduct(prod) {
  if (!prod || !prod.name) return false;
  const n = prod.name.trim().toLowerCase();
  return n.includes('çay') || n.includes('cay') ||
         n.includes('oralet') ||
         n.includes('kuşburnu') || n.includes('kusburnu') ||
         n.includes('adaçayı') || n.includes('adacayi') ||
         n.includes('ıhlamur') || n.includes('ihlamur');
}

function isSpecialTable(table) {
  if (!table) return false;
  return table.is_special === 1 || (table.custom_tea_price != null && table.custom_tea_price > 0);
}

function getProductEffectivePrice(prod) {
  if (!prod) return 0;
  if (selectedTable && isSpecialTable(selectedTable)) {
    if (isTeaProduct(prod) && selectedTable.custom_tea_price != null && selectedTable.custom_tea_price > 0) {
      return selectedTable.custom_tea_price;
    }
    if (prod.special_price != null && prod.special_price > 0) {
      return prod.special_price;
    }
  }
  return prod.price;
}

// Garson Adı & Garson Yönetimi
let allWaiters = [];

async function loadWaiters() {
  try {
    const res = await fetch('/api/waiters');
    const data = await res.json();
    if (data.success) {
      allWaiters = data.data;
      renderWaitersSelect();
      renderWaitersModalList();
    }
  } catch (err) {
    console.error('Garsonlar yüklenemedi:', err);
  }
}

function renderWaitersSelect() {
  const select = document.getElementById('waiterSelect');
  if (!select) return;
  const savedWaiter = localStorage.getItem('pakyurek_waiter_name');

  if (allWaiters.length === 0) {
    select.innerHTML = '<option value="Garson">Garson</option>';
    return;
  }

  select.innerHTML = allWaiters.map(w => `
    <option value="${escapeHtml(w.name)}">${escapeHtml(w.name)}</option>
  `).join('');

  if (savedWaiter && allWaiters.some(w => w.name === savedWaiter)) {
    select.value = savedWaiter;
  } else if (allWaiters.length > 0) {
    select.value = allWaiters[0].name;
    localStorage.setItem('pakyurek_waiter_name', allWaiters[0].name);
  }
}

function renderWaitersModalList() {
  const container = document.getElementById('waitersListContainer');
  const countLabel = document.getElementById('waiterCountLabel');
  if (!container) return;

  if (countLabel) {
    countLabel.textContent = `📋 Kayıtlı Garsonlar (${allWaiters.length})`;
  }

  if (allWaiters.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 16px;">Kayıtlı garson bulunmuyor.</div>`;
    return;
  }

  container.innerHTML = allWaiters.map(w => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); border-radius: 6px;">
      <div style="font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
        <span>👤</span> ${escapeHtml(w.name)}
      </div>
      <button class="btn btn-outline" style="padding: 4px 10px; color: #ef4444; border-color: rgba(239,68,68,0.4); font-size: 0.8rem;" onclick="deleteWaiter(${w.id}, '${escapeHtml(w.name)}')">
        🗑️ Sil
      </button>
    </div>
  `).join('');
}

function openManageWaitersModal() {
  const modal = document.getElementById('manageWaitersModal');
  if (modal) {
    modal.classList.add('active');
    loadWaiters();
    setTimeout(() => {
      const input = document.getElementById('newWaiterInput');
      if (input) { input.value = ''; input.focus(); }
    }, 150);
  }
}

function closeManageWaitersModal() {
  const modal = document.getElementById('manageWaitersModal');
  if (modal) modal.classList.remove('active');
}

async function addNewWaiter() {
  const input = document.getElementById('newWaiterInput');
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
      localStorage.setItem('pakyurek_waiter_name', name);
      loadWaiters();
    } else {
      showToast(data.error || 'Garson eklenemedi', 'danger');
    }
  } catch (err) {
    showToast('Bağlantı hatası oluştu', 'danger');
  }
}

async function deleteWaiter(id, name) {
  if (!confirm(`"${name}" isimli garsonu silmek istediğinize emin misiniz?`)) return;

  try {
    const res = await fetch(`/api/waiters/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`🗑️ "${name}" silindi.`, 'info');
      loadWaiters();
    } else {
      showToast(data.error || 'Garson silinemedi', 'danger');
    }
  } catch (err) {
    showToast('Silme işlemi başarısız', 'danger');
  }
}

function onWaiterChange() {
  const waiterName = document.getElementById('waiterSelect').value;
  localStorage.setItem('pakyurek_waiter_name', waiterName);
  showToast(`Garson: ${waiterName} seçildi`, 'info');
}

function getWaiterName() {
  const sel = document.getElementById('waiterSelect');
  return (sel && sel.value) ? sel.value : (localStorage.getItem('pakyurek_waiter_name') || 'Garson');
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
      if (selectedTable) {
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

    const effPrice = getProductEffectivePrice(prod);
    const isSpecialApplied = effPrice < prod.price;

    return `
      <div class="product-card" id="prod-card-${prod.id}">
        ${inCartQty > 0 ? `<div class="product-cart-badge">${inCartQty}</div>` : ''}
        
        <div class="product-card-top" onclick="quickDirectAdd(${prod.id})">
          <div class="product-title">${escapeHtml(prod.name)}</div>
          <div class="product-price" style="${isSpecialApplied ? 'color: #10b981; font-weight: 800;' : ''}">
            ${effPrice.toFixed(2)} ₺
            ${isSpecialApplied ? `<span style="font-size: 0.72rem; text-decoration: line-through; color: var(--text-muted); margin-left: 3px;">${prod.price.toFixed(0)} ₺</span><span style="font-size: 0.65rem; background: rgba(16,185,129,0.2); color: #34d399; padding: 1px 5px; border-radius: 4px; display: inline-block; margin-left: 3px; border: 1px solid rgba(16,185,129,0.4);">⭐ Özel</span>` : ''}
          </div>
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

  const unitPrice = getProductEffectivePrice(prod);
  const existingIndex = cart.findIndex(item => item.product_id === prod.id && item.unit_price === unitPrice && (!item.note || item.note === ''));
  if (existingIndex !== -1) {
    cart[existingIndex].quantity += 1;
  } else {
    cart.push({
      product_id: prod.id,
      product_name: prod.name,
      unit_price: unitPrice,
      quantity: 1,
      note: ''
    });
  }

  if (navigator.vibrate) navigator.vibrate(30);
  updateCartUI();
  renderProducts();
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
  modalUnitPrice = getProductEffectivePrice(prod);

  document.getElementById('modalProdName').textContent = prod.name;
  document.getElementById('modalProdPrice').textContent = `${modalUnitPrice.toFixed(2)} ₺`;
  document.getElementById('modalQtyDisplay').textContent = '1';
  document.getElementById('modalCustomNote').value = '';

  // Özel Fiyat Seçici Satırı
  const specRow = document.getElementById('modalSpecialPriceRow');
  const hasSpecialPriceAvailable = (prod.special_price != null && prod.special_price > 0) || (isTeaProduct(prod) && selectedTable && selectedTable.custom_tea_price != null && selectedTable.custom_tea_price > 0);
  
  if (specRow) {
    if (hasSpecialPriceAvailable) {
      specRow.style.display = 'block';
      let targetSpecPrice = prod.special_price;
      if (isTeaProduct(prod) && selectedTable && selectedTable.custom_tea_price != null && selectedTable.custom_tea_price > 0) {
        targetSpecPrice = selectedTable.custom_tea_price;
      }
      if (!targetSpecPrice) targetSpecPrice = 10;

      const specPriceLabel = document.getElementById('modalSpecialPriceLabel');
      if (specPriceLabel) specPriceLabel.textContent = targetSpecPrice.toFixed(2);
      const stdPriceLabel = document.getElementById('modalStdPriceLabel');
      if (stdPriceLabel) stdPriceLabel.textContent = prod.price.toFixed(2);

      updateModalSpecialPriceButtons(targetSpecPrice);
    } else {
      specRow.style.display = 'none';
    }
  }

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

function selectModalSpecialPrice(useSpecial) {
  if (!selectedProduct) return;
  let targetSpecPrice = selectedProduct.special_price;
  if (isTeaProduct(selectedProduct) && selectedTable && selectedTable.custom_tea_price != null && selectedTable.custom_tea_price > 0) {
    targetSpecPrice = selectedTable.custom_tea_price;
  }
  if (!targetSpecPrice) targetSpecPrice = 10;

  modalUnitPrice = useSpecial ? targetSpecPrice : selectedProduct.price;
  updateModalSpecialPriceButtons(targetSpecPrice);
  updateModalTotalPrice();
  document.getElementById('modalProdPrice').textContent = `${modalUnitPrice.toFixed(2)} ₺`;
}

function updateModalSpecialPriceButtons(targetSpecPrice) {
  const btnSpec = document.getElementById('modalBtnSpecialPrice');
  const btnStd = document.getElementById('modalBtnStdPrice');
  if (!btnSpec || !btnStd || !selectedProduct) return;

  if (modalUnitPrice === targetSpecPrice) {
    btnSpec.className = 'btn btn-primary';
    btnStd.className = 'btn btn-outline';
  } else {
    btnSpec.className = 'btn btn-outline';
    btnStd.className = 'btn btn-primary';
  }
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
  const total = modalUnitPrice * modalQuantity;
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

  // Sepette aynı ürün, aynı birim fiyat ve aynı not var mı kontrol et
  const existingIndex = cart.findIndex(item => item.product_id === selectedProduct.id && item.unit_price === modalUnitPrice && item.note === finalNote);
  if (existingIndex !== -1) {
    cart[existingIndex].quantity += modalQuantity;
  } else {
    cart.push({
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      unit_price: modalUnitPrice,
      quantity: modalQuantity,
      note: finalNote
    });
  }

  // Hafif titreşim ver
  if (navigator.vibrate) navigator.vibrate(40);

  updateCartUI();
  renderProducts();
  closeOptionsModal();
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
  if (orderSubmissionInProgress) return;

  if (!selectedTable) {
    showToast('Lütfen masa seçin!', 'danger');
    return;
  }
  if (cart.length === 0) {
    showToast('Sepet boş!', 'warning');
    return;
  }

  orderSubmissionInProgress = true;
  const sendButtons = document.querySelectorAll('#btnSendOrder, #cartModal button[onclick="submitOrderToKitchen()"]');
  sendButtons.forEach(button => {
    button.disabled = true;
    button.style.opacity = '0.6';
  });

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
  } finally {
    orderSubmissionInProgress = false;
    sendButtons.forEach(button => {
      button.disabled = false;
    });
    updateCartUI();
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
    const hasSpecial = isSpecialTable(t);

    return `
      <div class="table-btn ${isOccupied ? 'occupied' : 'empty'} ${isSelected ? 'selected' : ''}" 
           onclick="selectTableById(${t.id})" style="position: relative;">
        <button type="button" class="btn-table-quick-rename" onclick="event.stopPropagation(); openGarsonRenameModalById(${t.id}, '${escapeHtml(t.name)}')" title="İsim / No / Fiyat Değiştir" style="position: absolute; top: 6px; right: 6px; border: none; background: rgba(0,0,0,0.35); color: #fff; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; cursor: pointer; line-height: 1;">
          ✏️
        </button>
        <div style="width: 8px; height: 8px; border-radius: 50%;" class="status-dot"></div>
        <div class="table-btn-title" style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
          <span>${escapeHtml(t.name)}</span>
          ${hasSpecial ? `<span style="font-size: 0.68rem; background: rgba(16,185,129,0.3); color: #34d399; padding: 1px 5px; border-radius: 4px; font-weight: 800; border: 1px solid rgba(16,185,129,0.5);">⭐ Özel ${t.custom_tea_price ? `(${t.custom_tea_price.toFixed(0)} ₺)` : ''}</span>` : ''}
        </div>
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

  const isSpecEl = document.getElementById('garsonRenameIsSpecial');
  if (isSpecEl) {
    isSpecEl.checked = isSpecialTable(tableToRename);
  }

  const teaPriceInput = document.getElementById('garsonRenameTeaPriceInput');
  if (teaPriceInput) {
    teaPriceInput.value = (tableToRename && tableToRename.custom_tea_price != null) ? tableToRename.custom_tea_price : '';
  }

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

  const isSpecEl = document.getElementById('garsonRenameIsSpecial');
  const isSpecial = isSpecEl ? (isSpecEl.checked ? 1 : 0) : 0;
  const teaPriceInput = document.getElementById('garsonRenameTeaPriceInput');
  const customTeaPrice = teaPriceInput ? teaPriceInput.value.trim() : '';

  try {
    const res = await fetch(`/api/tables/${tableToRename.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: newName,
        is_special: isSpecial,
        custom_tea_price: customTeaPrice !== '' ? parseFloat(customTeaPrice) : null
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Masa bilgileri güncellendi!`, 'success');
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

  const isSpecial = isSpecialTable(table);
  const teaBadgeHtml = isSpecial
    ? ` <span class="badge-tea-special" style="font-size: 0.72rem; background: rgba(16,185,129,0.25); color: #34d399; border: 1px solid rgba(16,185,129,0.5); padding: 1px 6px; border-radius: 4px; font-weight: 800; vertical-align: middle; margin-left: 4px;">⭐ Özel Fiyatlı ${table.custom_tea_price ? `(${table.custom_tea_price.toFixed(0)} ₺)` : ''}</span>`
    : '';

  document.getElementById('currentTableName').innerHTML = escapeHtml(table.name) + teaBadgeHtml;
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

  // Masaya özel çay fiyatı değişmiş olabileceğinden menü fiyatlarını anında tazele!
  renderProducts();
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

  socket.on('waiters_changed', () => {
    loadWaiters();
  });
}

// Başlangıç
window.addEventListener('DOMContentLoaded', () => {
  loadWaiters();
  loadMenu();
  loadTables().then(() => openTableModal());
  setupSocket();
});
