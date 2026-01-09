# 🚀 DepoPanel Başlatma Kılavuzu

## ⚠️ ÖNEMLİ: İlk Kurulum Sonrası

Yeni mimari değişikliklerden sonra backend'i başlatmadan önce:

### 1. Mevcut Node Process'lerini Temizle

```powershell
# Tüm node process'lerini kapat
taskkill /IM node.exe /F

# Veya sadece port 5000'i kullanan process'i kapat
netstat -ano | findstr :5000
# PID'yi not al ve:
taskkill /PID <PID> /F
```

### 2. Backend'i Başlat

```bash
cd backend

# Development mode
npm run dev

# Veya production build
npm run build
npm start
```

### 3. Frontend'i Başlat

```bash
cd frontend
npm run dev
```

## 🔍 Sorun Giderme

### Backend 500 Hatası

Eğer API istekleri 500 hatası veriyorsa:

1. **Backend çalışıyor mu kontrol et:**
   ```bash
   # Backend terminal'inde log'ları kontrol et
   # "🚀 DepoPanel API sunucusu 5000 portunda çalışıyor" mesajını görmelisin
   ```

2. **Database bağlantısı:**
   ```bash
   cd backend
   npx prisma studio
   # Prisma Studio açılıyorsa DB bağlantısı çalışıyor
   ```

3. **Backend log'larını kontrol et:**
   - Terminal'de hata mesajlarını oku
   - `backend/logs/` klasöründeki log dosyalarını kontrol et

### Frontend Auth Hataları

Eğer "Authentication required" hatası alıyorsan:

1. **Önce login ol:**
   - `/login` sayfasına git
   - Giriş yap
   - Token localStorage'a kaydedilecek

2. **Token'ı kontrol et:**
   ```javascript
   // Browser console'da:
   localStorage.getItem('token')
   // Bir token görmeli
   ```

3. **Logout ve tekrar login:**
   ```javascript
   // Browser console'da:
   localStorage.clear()
   // Sonra tekrar login yap
   ```

## 📝 Yapılan Değişiklikler

### Backend Mimarisi
- `src/app.ts` - Express app oluşturma (server başlatmaz)
- `src/server.ts` - Server başlatma (sadece buradan)
- `src/index.ts` - Entry point (server.ts'i import eder)

### Frontend Auth
- Token yokken API çağrısı engellenir
- 401 hatası otomatik logout yapar
- 429 rate limit kullanıcı dostu mesaj gösterir

## ✅ Test

### Backend Test
```bash
cd backend

# Server'ı başlat
npm run dev

# Başka terminal'de health check
curl http://localhost:5000/api/health
# {"success":true,"message":"API is running"} görmeli
```

### Frontend Test
```bash
cd frontend
npm run dev

# Browser'da http://localhost:3000
# Login ol
# Console'da hata olmamalı
```

## 🐛 Hata Durumunda

### EADDRINUSE Hatası
```powershell
# Port 5000 zaten kullanımda
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Veya farklı port kullan
# .env dosyasında: PORT=5001
```

### 500 Internal Server Error
1. Backend terminal'ini kontrol et - hata mesajı var mı?
2. Database çalışıyor mu? `npx prisma studio`
3. `.env` dosyası doğru mu? `DATABASE_URL`, `JWT_SECRET` var mı?
4. Migration'lar çalıştı mı? `npx prisma migrate deploy`

### Token/Auth Hataları
1. Logout ve tekrar login
2. Browser cache temizle
3. localStorage temizle: `localStorage.clear()`
4. Backend'de JWT_SECRET doğru mu kontrol et

## 📞 Destek

Sorun devam ederse:
1. Backend terminal log'larını kaydet
2. Browser console log'larını kaydet
3. Network tab'de failed request'leri kontrol et
4. `docs/AUTH_AND_SERVER_FIXES.md` dökümanını oku
