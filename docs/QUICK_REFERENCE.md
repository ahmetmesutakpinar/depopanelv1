# Quick Reference - Auth & Server Fixes

## Frontend: Token Kontrolü

### ❌ Önce (Hatalı)
```typescript
// Token yokken bile istek gönderilir
if (token) {
  config.headers.Authorization = `Bearer ${token}`;
}
return config;
```

### ✅ Sonra (Doğru)
```typescript
// Token yoksa istek engellenir
const publicEndpoints = ['/auth/login', '/auth/register', '/health'];
const isPublic = publicEndpoints.some(e => config.url?.includes(e));

if (!isPublic && !token) {
  return Promise.reject(new Error('Authentication required'));
}

if (token) {
  config.headers.Authorization = `Bearer ${token}`;
}
return config;
```

## Backend: Server Mimarisi

### ❌ Önce (Hatalı)
```typescript
// index.ts - Her import'ta server başlar!
const app = express();
// ... setup ...
app.listen(PORT);
export default app; // ❌ Tehlikeli!
```

### ✅ Sonra (Doğru)
```typescript
// app.ts - Sadece app oluştur
export function createApp() {
  const app = express();
  // ... setup ...
  return app; // ✅ Server başlatmaz
}

// server.ts - Sadece server başlat
import { createApp } from './app.js';
const app = createApp();
app.listen(PORT);

// index.ts - Entry point
import './server.js';
```

## Rate Limiting

### ✅ Akıllı Yapılandırma
```typescript
// Auth için ayrı limiter (sadece başarısız denemeler)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // ✅ Önemli!
});

// API için ayrı limiter (auth endpoint'leri hariç)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skip: (req) => req.path.startsWith('/api/auth/'),
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', apiLimiter);
```

## Windows Port Temizleme

```powershell
# 1. Port'u kullanan process'i bul
netstat -ano | findstr :5000

# 2. PID'yi not al (son sütun)
# Örnek: TCP 0.0.0.0:5000 ... LISTENING 12345

# 3. Process'i kapat
taskkill /PID 12345 /F

# Veya tüm node process'lerini kapat
taskkill /IM node.exe /F
```

## Script Yazarken

### ❌ Hatalı
```typescript
// Server başlatır!
import app from '../src/index.js';
```

### ✅ Doğru
```typescript
// Server başlatmaz
import { connectDB, disconnectDB, prisma } from '../src/utils/db-client.js';

async function myScript() {
  await connectDB();
  // DB işlemleri...
  await disconnectDB();
}
```

## Dosya Yapısı

```
backend/src/
├── app.ts          ✅ Express app oluştur (export)
├── server.ts       ✅ Server başlat (app.listen)
├── index.ts        ✅ Entry point (import server)
├── config/
│   └── index.ts    ✅ Sadece config/prisma export
└── utils/
    └── db-client.ts ✅ Script'ler için (server başlatmaz)
```

## Test Komutları

```bash
# Frontend
cd frontend
npm run dev
# Console'da token kontrollerini izle

# Backend
cd backend
npm run dev
# İkinci kez çalıştırma - EADDRINUSE hatası almalı

# Script test
tsx scripts/test-login.ts
# Server başlamamalı, sadece DB işlemi yapmalı
```

## Önemli Noktalar

1. ✅ **Frontend**: Token yoksa istek atılmaz
2. ✅ **Backend**: Server sadece server.ts'de başlar
3. ✅ **Rate Limit**: Auth ve API ayrı limiter'lara sahip
4. ✅ **Script'ler**: db-client.ts kullanır, server başlatmaz
5. ✅ **401 Error**: Otomatik logout ve login'e yönlendir
6. ✅ **429 Error**: Kullanıcı dostu mesaj göster
