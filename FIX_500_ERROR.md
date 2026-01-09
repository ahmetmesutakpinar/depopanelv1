# 🔴 500 Internal Server Error - Çözüm

## Sorun
Backend server eski kodla çalışıyor. Yeni değişiklikleri yüklemek için yeniden başlatılması gerekiyor.

## Çözüm (Sırayla Yap)

### 1. Mevcut Backend Process'ini Durdur

```powershell
# PID: 15412 olan process'i durdur
taskkill /PID 15412 /F
```

### 2. Backend'i Yeniden Başlat

```bash
cd backend
npm run dev
```

### 3. Server'ın Başladığını Kontrol Et

Terminal'de şu mesajları görmelisin:
```
📦 Connecting to database...
✅ Database connected
⏰ Initializing cron jobs...
🚀 DepoPanel API sunucusu 5000 portunda çalışıyor
📍 Environment: development
🔗 API URL: http://localhost:5000/api
```

### 4. Frontend'i Yenile

Browser'da `Ctrl + Shift + R` (hard refresh)

### 5. Tekrar Dene

Barkod okutmayı tekrar dene. Artık çalışmalı.

---

## Alternatif: Tüm Node Process'lerini Durdur

Eğer yukarıdaki çalışmazsa:

```powershell
# Tüm node process'lerini durdur
taskkill /IM node.exe /F

# Backend'i başlat
cd backend
npm run dev

# Frontend'i başlat (başka terminal)
cd frontend
npm run dev
```

---

## Neden Bu Hata Oluştu?

1. Backend server eski kodla çalışıyordu
2. Yeni değişiklikler (`app.ts`, `server.ts`) henüz yüklenmedi
3. `tsx watch` hot reload bazen tüm değişiklikleri yakalamıyor
4. Manuel restart gerekiyor

---

## Gelecekte Bunu Önlemek İçin

Backend'de büyük değişiklikler yaptıktan sonra:
1. `Ctrl + C` ile server'ı durdur
2. `npm run dev` ile yeniden başlat
3. Log'ları kontrol et

---

## Hala Çalışmıyorsa?

### Backend Log'larını Kontrol Et

```bash
cd backend
# Terminal'de hata mesajlarını oku
```

### Database Kontrolü

```bash
cd backend
npx prisma studio
# Açılıyorsa DB çalışıyor
```

### .env Kontrolü

```bash
cd backend
cat .env
# DATABASE_URL ve JWT_SECRET var mı?
```

### Migration Kontrolü

```bash
cd backend
npx prisma migrate deploy
```

---

## Test

```bash
# Health check
curl http://localhost:5000/api/health

# Beklenen yanıt:
# {"success":true,"message":"API is running"}
```
