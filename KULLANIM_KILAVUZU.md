# Pakyürek Kıraathanesi - Garson & Ocak Sipariş Sistemi Kullanım Kılavuzu

Pakyürek Kıraathanesi için garsonların cep telefonlarından anında masa siparişi girebildiği, ocak başındaki bilgisayarda ise siparişlerin sesli çan uyarısıyla ve renkli sayaçlarla salisesinde görüntülendiği tam teşekküllü otomasyon sistemi hazırlandı.

---

## 🚀 Sistemi Başlatma (Tek Tıkla)

Masaüstündeki proje klasöründe yer alan **`baslat.bat`** dosyasına çift tıklayarak sistemi başlatabilirsiniz.
- Sunucu otomatik olarak başlar.
- Ocak Ekranı tarayıcınızda açılır.

---

## 📱 Garsonlar Telefondan Nasıl Bağlanır?

1. Garsonların telefonunun kahvehanenin **Wi-Fi ağına** bağlı olduğundan emin olun.
2. Bilgisayar ekranındaki (Ana Sayfada veya Ocak ekranının sağ üstündeki **"Garson QR Kod"** butonunda) **QR Kodu** telefon kamerasından okutun.
3. Garsonun telefonu otomatik olarak sipariş ekranına bağlanır (Herhangi bir uygulama indirmeye gerek yoktur).

---

## 🖥️ Ekranlar ve Adresler

- **Ana Giriş Portalı:** `http://localhost:3000/`
- **Ocak / Mutfak Ekranı:** `http://localhost:3000/ocak.html`
- **Garson Mobil Ekranı:** `http://localhost:3000/garson.html` (Telefondan: `http://<BİLGİSAYAR-IP>:3000/garson.html` veya QR Kod)
- **Kasa & Yönetim Paneli:** `http://localhost:3000/kasa.html`

---

## ☕ Sistem Özellikleri

1. **Sesli Çan Bildirimi**: Ocağa yeni bir sipariş geldiğinde dikkat çekici çift tonlu çan melodisi çalar.
2. **Süre Sayaçları**: Bekleyen siparişler kaç dakika önce geldiğini gösterir; 5 dakikayı geçenler kırmızı alarm verir.
3. **Tek Dokunuş Notlar**: Çay için (Açık, Koyu, Duble, Paşa, Limonlu), Kahve için (Sade, Orta, Şekerli) hızlı çip seçimi.
4. **Masa Adisyonu ve Kasa**: Nakit, Kredi Kartı ve Veresiye hesap kapatma, masa taşıma.
5. **Günlük Rapor & En Çok Satanlar**: Günlük ciro ve satılan çay, kahve, tost adetleri.
6. **Kalıcı SQLite Veritabanı**: Bilgisayar kapansa bile siparişler ve hesaplar silinmez.
