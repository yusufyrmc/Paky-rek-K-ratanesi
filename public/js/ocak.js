// Pakyürek Kıraathanesi - Ocak KDS Mantığı
let socket;
let allOrders = [];
let currentFilter = 'active'; // 'active', 'pending', 'preparing', 'ready'
let soundEnabled = true;
let audioCtx = null;

// Ses sentezleme (Web Audio API - tarayıcıda sıfır gecikmeli melodik çan)
function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function unlockAudio() {
  initAudio();
  playBellSound();
  const banner = document.getElementById('audioUnlockBanner');
  if (banner) banner.style.display = 'none';
  showToast('🔔 Sesli bildirimler başarıyla etkinleştirildi!', 'success');
}

function playBellSound() {
  if (!soundEnabled) return;
  try {
    initAudio();
    const now = audioCtx.currentTime;

    // 1. Ton (Yüksek)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    // 2. Ton (Melodik Çan - Düşük)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1174.66, now + 0.15); // D6
    gain2.gain.setValueAtTime(0.35, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.9);

  } catch (err) {
    console.warn('Ses çalınamadı:', err);
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const icon = document.getElementById('soundIcon');
  const text = document.getElementById('soundText');
  if (soundEnabled) {
    icon.textContent = '🔔';
    text.textContent = 'Ses Açık';
    unlockAudio();
  } else {
    icon.textContent = '🔕';
    text.textContent = 'Ses Kapalı';
    showToast('Sesli bildirimler kapatıldı.', 'warning');
  }
}

// Canlı Saat & Tarih
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('liveClock').textContent = `${hours}:${minutes}:${seconds}`;
}
setInterval(updateClock, 1000);
updateClock();

// Tam Ekran Modu
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn('Tam ekrana geçilemedi:', err);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
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
  }, 4000);
}

// Süre Hesaplama (Örn: 2 dk önce)
function getTimeAgo(dateString) {
  const orderTime = new Date(dateString).getTime();
  const now = new Date().getTime();
  const diffSec = Math.floor((now - orderTime) / 1000);

  if (diffSec < 45) return { text: 'Yeni geldi', isUrgent: false, isWarning: false };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return {
      text: `${diffMin} dk önce`,
      isWarning: diffMin >= 3 && diffMin < 6,
      isUrgent: diffMin >= 6
    };
  }
  const diffHours = Math.floor(diffMin / 60);
  return { text: `${diffHours} sa önce`, isUrgent: true, isWarning: false };
}

// Siparişleri API'den Çekme
async function fetchOrders() {
  try {
    const res = await fetch('/api/orders/active');
    const data = await res.json();
    if (data.success) {
      allOrders = data.data;
      renderOrders();
    }
  } catch (err) {
    console.error('Siparişler yüklenemedi:', err);
  }
}

// Filtre Değiştirme
function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  event.currentTarget.classList.add('active');
  renderOrders();
}

// Sayaçları Güncelle
function updateCounts() {
  const pending = allOrders.filter(o => o.status === 'pending').length;
  const preparing = allOrders.filter(o => o.status === 'preparing').length;
  const ready = allOrders.filter(o => o.status === 'ready').length;
  const active = pending + preparing;

  document.getElementById('countActive').textContent = active;
  document.getElementById('countPending').textContent = pending;
  document.getElementById('countPreparing').textContent = preparing;
  document.getElementById('countReady').textContent = ready;
}

// Sipariş Kartlarını Render Etme
function renderOrders() {
  updateCounts();
  const container = document.getElementById('ordersContainer');

  let filtered = [];
  if (currentFilter === 'active') {
    filtered = allOrders.filter(o => o.status === 'pending' || o.status === 'preparing');
  } else if (currentFilter === 'pending') {
    filtered = allOrders.filter(o => o.status === 'pending');
  } else if (currentFilter === 'preparing') {
    filtered = allOrders.filter(o => o.status === 'preparing');
  } else if (currentFilter === 'ready') {
    filtered = allOrders.filter(o => o.status === 'ready');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-orders">
        <div class="empty-icon">☕</div>
        <h3>Bu Filtrede Sipariş Yok</h3>
        <p>${currentFilter === 'ready' ? 'Hazır bekleyen sipariş bulunmuyor.' : 'Ocak tertemiz! Yeni sipariş bekleniyor.'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(order => {
    const timeInfo = getTimeAgo(order.created_at);
    let timeClass = '';
    if (timeInfo.isUrgent) timeClass = 'danger';
    else if (timeInfo.isWarning) timeClass = 'warning';

    const itemsHtml = (order.items || []).map(item => `
      <div class="order-item-row">
        <div class="item-left">
          <div class="item-qty">${item.quantity}x</div>
          <div class="item-details">
            <span class="item-name">${escapeHtml(item.product_name)}</span>
            ${item.note ? `<span class="item-note">${escapeHtml(item.note)}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    let actionButtons = '';
    if (order.status === 'pending') {
      actionButtons = `
        <button class="btn btn-info btn-status" onclick="updateOrderStatus(${order.id}, 'preparing')">
          ⚙️ Hazırlanıyor
        </button>
        <button class="btn btn-success btn-status" onclick="updateOrderStatus(${order.id}, 'ready')">
          ✓ HAZIR (Çıktı)
        </button>
      `;
    } else if (order.status === 'preparing') {
      actionButtons = `
        <button class="btn btn-success btn-status" style="width:100%; font-size:1.15rem;" onclick="updateOrderStatus(${order.id}, 'ready')">
          ✓ HAZIR (Çıktı)
        </button>
      `;
    } else if (order.status === 'ready') {
      actionButtons = `
        <button class="btn btn-outline btn-status" style="width:100%; border-color: var(--status-ready); color: var(--status-ready);" onclick="updateOrderStatus(${order.id}, 'completed')">
          Tamamlandı Olarak Arşivle ✓
        </button>
      `;
    }

    return `
      <div class="order-card ${order.status} ${timeInfo.isUrgent ? 'urgent' : ''}" id="order-${order.id}">
        <div class="order-card-header">
          <div class="table-info">
            <div class="table-badge">
              <span>☕</span> ${escapeHtml(order.table_name)}
            </div>
            <div class="waiter-label">👤 ${escapeHtml(order.waiter_name || 'Garson')}</div>
          </div>
          <div class="time-info">
            <span class="time-ago ${timeClass}">${timeInfo.text}</span>
          </div>
        </div>

        <div class="order-items-list">
          ${itemsHtml}
        </div>

        <div class="order-card-footer">
          ${actionButtons}
        </div>
      </div>
    `;
  }).join('');
}

// Durum Güncelle
async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      if (newStatus === 'ready') {
        showToast(`Masa siparişi hazırlandı! 🚀`, 'success');
      }
      // Liste socket bildirimiyle veya yerel olarak güncellenecek
      const idx = allOrders.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        if (newStatus === 'completed' || newStatus === 'cancelled') {
          allOrders.splice(idx, 1);
        } else {
          allOrders[idx].status = newStatus;
        }
        renderOrders();
      }
    }
  } catch (err) {
    console.error('Durum güncellenemedi:', err);
    showToast('Durum güncellenirken hata oluştu', 'danger');
  }
}

// QR Kod Modalı
async function openQrModal() {
  try {
    const res = await fetch('/api/info');
    const data = await res.json();
    if (data.success) {
      document.getElementById('modalQrImg').src = data.qrCode;
      document.getElementById('modalGarsonUrl').textContent = data.garsonUrl;
      document.getElementById('qrModal').classList.add('active');
    }
  } catch (e) {
    console.error('QR Kod alınamadı:', e);
  }
}

function closeQrModal() {
  document.getElementById('qrModal').classList.remove('active');
}

// XSS Koruması
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Her 15 saniyede bir süreleri güncelle (sayaç tazeleme)
setInterval(() => {
  renderOrders();
}, 15000);

// WebSocket Bağlantısı ve Olay Dinleyicileri
function setupSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('[Ocak] Canlı soket bağlandı.');
  });

  // YENİ SİPARİŞ GELDİ! (EN ÖNEMLİ KISIM)
  socket.on('new_order', (order) => {
    console.log('[Ocak] Yeni sipariş alındı:', order);
    
    // Sesli çan çal
    playBellSound();

    // Sipariş listesine ekle
    allOrders.unshift(order);
    renderOrders();

    // Görsel Toast Göster
    showToast(`🔔 YENİ SİPARİŞ: ${order.table_name} (${order.waiter_name})`, 'warning');
  });

  // Sipariş durumu değişti
  socket.on('order_status_updated', (data) => {
    const idx = allOrders.findIndex(o => o.id === data.orderId);
    if (idx !== -1) {
      if (data.status === 'completed' || data.status === 'cancelled') {
        allOrders.splice(idx, 1);
      } else {
        allOrders[idx].status = data.status;
      }
      renderOrders();
    }
  });

  // Masa hesabı kapatıldı
  socket.on('table_paid', (data) => {
    // Masanın bekleyen siparişleri kapatıldıysa listeden çıkar
    allOrders = allOrders.filter(o => o.table_id !== data.tableId);
    renderOrders();
  });
}

// İlk Yükleme
window.addEventListener('DOMContentLoaded', () => {
  fetchOrders();
  setupSocket();
});
