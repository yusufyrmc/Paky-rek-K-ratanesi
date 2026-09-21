# 🚀 Pakyürek Kıraathanesi - Supabase Bulut Veritabanı Kurulum Kılavuzu

Bu kılavuz, projenizdeki **tüm esnaf borçlarını/çetelelerini, menüyü, masaları, fiyatları ve günlük kazançları** Supabase bulut veritabanına aktarmanız için adım adım hazırlanmıştır.

---

## 📌 Adım 1: Ücretsiz Supabase Projesi Oluşturun (1 Dakika)

1. Tarayıcınızda [https://supabase.com](https://supabase.com) adresine gidin.
2. **"Start your project"** veya **"Sign In"** butonuna basarak (varsa GitHub hesabınızla veya e-posta ile) ücretsiz giriş yapın.
3. Açılan ekranda **"New Project"** (Yeni Proje) butonuna tıklayın:
   - **Name (Proje Adı):** `Pakyurek Kirathanesi`
   - **Database Password:** Güçlü bir şifre belirleyin (veya otomatik üretin ve bir yere not edin).
   - **Region:** `Frankfurt (eu-central-1)` (Türkiye'ye en yakın ve hızlı bölgedir).
4. **"Create new project"** butonuna basın ve projenin hazırlanmasını (yaklaşık 1-2 dakika) bekleyin.

---

## 📌 Adım 2: Tabloları ve Mevcut Verileri Tek Tıkla Yükleyin

Projeniz için tüm şemayı ve mevcut verilerinizi içeren hazır bir SQL dosyası oluşturduk:
📁 **[supabase_full_setup.sql](file:///c:/Users/yusuf/OneDrive/Masaüstü/Pakyürek kıratanesi/supabase_full_setup.sql)**

1. Sol menüden **"SQL Editor"** simgesine tıklayın.
2. Üstteki **"+ New query"** butonuna basın.
3. Proje klasöründeki [supabase_full_setup.sql](file:///c:/Users/yusuf/OneDrive/Masaüstü/Pakyürek kıratanesi/supabase_full_setup.sql) dosyasının **tüm içeriğini kopyalayıp** bu alana yapıştırın.
4. Sağ alttaki yeşil **"Run"** (Çalıştır) butonuna basın.

🎉 **Tebrikler!**
- Tüm kategoriler, menü ürünleri ve özel fiyatlar (10 ₺ çay vb.)
- Salon, Bahçe ve Dışarısı masaları
- Berber Ahmet, Terzi Mehmet, Kasap Veli ve tüm esnaflarınızın veresiye bakiyeleri
- Garsonlar ve kasa sistemi
**tek seferde eksiksiz olarak Supabase bulutuna yüklendi!**

---

## 📌 Adım 3: Supabase Bağlantı Bilgilerini Alma

Projenizi doğrudan Supabase'e bağlamak için:
1. Supabase Dashboard'da sol menünün en altındaki **"Project Settings" (Çark / Ayarlar)** simgesine tıklayın.
2. **"Data API"** (veya **"API"**) sekmesini açın.
3. Burada iki bilgi göreceksiniz:
   - **Project URL:** `https://xxxxxxxxxxxxxxxxxxxx.supabase.co`
   - **Project API keys (anon / public):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

Bu iki bilgiyi projenizdeki `.env` dosyasına aşağıdaki gibi yazabilirsiniz:
```env
SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📌 Adım 4: Verilerinizi Supabase Panelinden İnceleme

Sol menüdeki **"Table Editor"** sekmesine tıkladığınızda:
- **`merchants`**: Esnafların borç bakiyelerini canlı olarak görebilir ve düzenleyebilirsiniz.
- **`products`**: Ürünlerinizi, standart ve özel masa fiyatlarını (`special_price`) görebilirsiniz.
- **`tables`**: Masaların durumunu inceleyebilirsiniz.
- **`payments`**: Kasa tahsilatlarını ve günlük kazançları takip edebilirsiniz.
- **`merchant_transactions`**: Esnafların çetele hareketlerini görebilirsiniz.

---

## 💡 İpuçları
- Bilgisayarınızdaki yerel veriler güncellenirse, istediğiniz zaman terminalden `node export_to_supabase.js` komutunu çalıştırarak en güncel verilerinizin SQL dosyasını yeniden oluşturabilirsiniz.
