# Authentication & Server Architecture Fixes

Bu dokümanda iki kritik problem ve çözümleri açıklanmaktadır:
1. Frontend'de login olmadan API çağrısı yapılması
2. Backend'de EADDRINUSE (port zaten kullanımda) hatası

## Problem 1: Frontend Authentication Issues

### ❌ Hatalı Durum (Önceki Kod)

```typescript
// ❌ YANLIŞ: Token kontrolü yok, her durumda istek gönderilir
this.client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config; // Token yoksa bile istek gönderilir!
  }
);
```

**Sorunlar:**
- Token yokken bile protected endpoint'lere istek atılıyor
- Backend'de 401 ve 429 hataları oluşuyor
- Rate limit gereksiz yere tetikleniyor
- Kullanıcı deneyimi kötü

### ✅ Doğru Durum (Yeni Kod)

```typescript
// ✅ DOĞRU: Token yoksa istek engellenir
this.client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    
    // Public endpoints tanımla
    const publicEndpoints = ['/auth/login', '/auth/register', '/health'];
    const isPublicEndpoint = publicEndpoints.some(endpoint => 
      config.url?.includes(endpoint)
    );
    
    // Public değilse ve token yoksa, isteği reddet
    if (!isPublicEndpoint && !token) {
      console.warn('🚫 API request blocked: No authentication token', config.url);
      return Promise.reject(new Error('Authentication required'));
    }
    
    // Token varsa header'a ekle
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  }
);
```

### Response Interceptor - 401 & 429 Handling

```typescript
// ✅ DOĞRU: 401 ve 429 hataları düzgün yönetilir
this.client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // 401 Unauthorized - Auth temizle ve login'e yönlendir
    if (error.response?.status === 401) {
      console.warn('🔒 401 Unauthorized - Clearing auth');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      if (!window.location.pathname.includes('/login')) {
        toast.error('Oturum süreniz doldu. Lütfen tekrar giriş yapın.');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    // 429 Rate Limit - Kullanıcıya bilgi ver
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const waitTime = retryAfter ? `${retryAfter} saniye` : 'birkaç dakika';
      toast.error(`Çok fazla istek gönderildi. Lütfen ${waitTime} bekleyip tekrar deneyin.`);
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);
```

### AuthContext İyileştirmeleri

```typescript
// ✅ DOĞRU: Auth verification sırasında hata yönetimi
useEffect(() => {
  const loadUser = async () => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        
        const response = await api.getProfile();
        if (response.success && response.data) {
          setUser(response.data);
          localStorage.setItem('user', JSON.stringify(response.data));
        }
      } catch (error: any) {
        // Sadece auth hatalarında temizle
        if (error.response?.status === 401 || error.message === 'Authentication required') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        } else {
          // Network hatası - cached user'ı kullan
          console.warn('Using cached user data due to network error');
        }
      }
    }
    setIsLoading(false);
  };

  loadUser();
}, []);
```

### Protected Route Component

```typescript
// ✅ Zaten doğru implement edilmiş
export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
}
```

---

## Problem 2: Backend EADDRINUSE Error

### ❌ Hatalı Durum (Önceki Kod)

```typescript
// ❌ YANLIŞ: index.ts içinde hem app oluşturma hem server başlatma
import express from 'express';

const app = express();
// ... middleware setup ...

async function bootstrap() {
  await connectDatabase();
  initCronJobs();
  
  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
  });
}

bootstrap();
export default app; // Bu export edildiğinde server tekrar başlayabilir!
```

**Sorunlar:**
- Script'ler bu dosyayı import ettiğinde server başlıyor
- Job dosyaları çalıştığında server başlıyor
- Aynı portta birden fazla server ayağa kalkıyor
- EADDRINUSE: address already in use :::5000 hatası

### ✅ Doğru Durum (Yeni Mimari)

#### 1. `src/app.ts` - Sadece App Oluşturma

```typescript
// ✅ DOĞRU: Sadece Express app'i oluştur, server başlatma!
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Rate limiting - Akıllı yapılandırma
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 5, // 5 başarısız deneme
    skipSuccessfulRequests: true, // Sadece başarısız istekleri say
  });

  const apiLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.isDevelopment ? 1000 : env.RATE_LIMIT_MAX,
    skip: (req) => {
      // Auth endpoint'leri atla (kendi limiter'ları var)
      return req.path.startsWith('/api/auth/');
    },
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api', apiLimiter);

  // Routes
  app.use('/api', routes);

  return app;
}

export default createApp;
```

#### 2. `src/server.ts` - Sadece Server Başlatma

```typescript
// ✅ DOĞRU: Sadece server'ı başlat
import { createApp } from './app.js';
import { env, connectDatabase } from './config/index.js';
import { logger } from './utils/logger.js';
import { initCronJobs } from './utils/job-index.js';

async function bootstrap() {
  try {
    // Database bağlantısı
    await connectDatabase();

    // App oluştur
    const app = createApp();

    // Cron jobs başlat
    initCronJobs();

    // Server başlat
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running on port ${env.PORT}`);
    });

    // EADDRINUSE hatası yönetimi
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${env.PORT} zaten kullanımda!`);
        logger.error('💡 Çözüm:');
        logger.error('   Windows: netstat -ano | findstr :5000');
        logger.error('   Process ID bulun: taskkill /PID <PID> /F');
        process.exit(1);
      }
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} - Shutting down...`);
      server.close(() => {
        logger.info('✅ Server closed');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('⚠️ Forced shutdown');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('❌ Server failed to start:', error);
    process.exit(1);
  }
}

bootstrap();
```

#### 3. `src/index.ts` - Entry Point

```typescript
// ✅ DOĞRU: Sadece server'ı import et
import './server.js';
```

#### 4. `src/utils/db-client.ts` - Script'ler İçin

```typescript
// ✅ DOĞRU: Script'ler bu dosyayı kullanır (server başlatmaz)
import { prisma } from '../config/index.js';
import { logger } from './logger.js';

export async function connectDB() {
  await prisma.$connect();
  logger.info('✅ Database connected');
  return prisma;
}

export async function disconnectDB() {
  await prisma.$disconnect();
  logger.info('✅ Database disconnected');
}

export { prisma };
```

#### 5. Script Örneği - Server Başlatmadan DB Kullanımı

```typescript
// ✅ DOĞRU: Script'ler db-client kullanır
import { connectDB, disconnectDB, prisma } from '../src/utils/db-client.js';
import { logger } from '../src/utils/logger.js';

async function myScript() {
  try {
    await connectDB();
    
    // Database işlemleri
    const users = await prisma.user.findMany();
    logger.info(`Found ${users.length} users`);
    
    await disconnectDB();
  } catch (error) {
    logger.error('Script error:', error);
    process.exit(1);
  }
}

myScript();
```

---

## Backend Auth Middleware (Zaten Doğru)

```typescript
// ✅ Auth middleware zaten doğru implement edilmiş
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    // Token kontrolü
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendUnauthorized(res, 'Token gerekli');
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // User kontrolü
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { company: true },
    });

    if (!user || !user.isActive) {
      sendUnauthorized(res, 'Kullanıcı bulunamadı veya aktif değil');
      return;
    }

    // Company kontrolü (SUPER_ADMIN hariç)
    if (user.role !== 'SUPER_ADMIN' && user.company?.status !== 'APPROVED') {
      sendForbidden(res, 'Şirket hesabınız henüz onaylanmamış');
      return;
    }

    req.user = user;
    req.context = {
      companyId: user.companyId,
      userId: user.id,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      sendUnauthorized(res, 'Token süresi dolmuş');
      return;
    }
    sendUnauthorized(res, 'Geçersiz token');
  }
}
```

---

## Windows'ta Port Kontrolü ve Temizleme

### Port'u Kullanan Process'i Bulma

```powershell
# Port 5000'i kullanan process'i bul
netstat -ano | findstr :5000

# Çıktı örneği:
# TCP    0.0.0.0:5000    0.0.0.0:0    LISTENING    12345
# Son sütun PID (Process ID)
```

### Process'i Kapatma

```powershell
# PID ile process'i kapat
taskkill /PID 12345 /F

# Veya tüm node process'lerini kapat (DİKKATLİ!)
taskkill /IM node.exe /F
```

### Alternatif Port Kullanma

```bash
# .env dosyasında
PORT=5001

# Veya komut satırında
PORT=5001 npm run dev
```

---

## Özet: Yapılan İyileştirmeler

### Frontend ✅
1. **Axios Interceptor**: Token yokken protected endpoint'lere istek engellendi
2. **401 Handling**: Auth temizleme ve login'e yönlendirme düzeltildi
3. **429 Handling**: Rate limit hataları kullanıcı dostu mesajlarla gösteriliyor
4. **AuthContext**: Network hatalarında cached user kullanılıyor
5. **Protected Routes**: Zaten doğru çalışıyor

### Backend ✅
1. **Mimari Ayrımı**: app.ts (config) ve server.ts (startup) ayrıldı
2. **EADDRINUSE Fix**: Server sadece tek yerde başlatılıyor
3. **Rate Limiting**: Auth ve API için ayrı limiter'lar
4. **Script Support**: db-client.ts ile server başlatmadan DB kullanımı
5. **Error Handling**: EADDRINUSE hatası için detaylı log ve çözüm önerileri
6. **Graceful Shutdown**: SIGTERM/SIGINT sinyalleri düzgün yönetiliyor

### Best Practices ✅
- Token yokken API çağrısı yapılmıyor
- Rate limit sadece authenticated request'lerde tetikleniyor
- Auth endpoint'leri ayrı rate limit'e sahip
- Script'ler server başlatmıyor
- Cron job'lar server başlatmıyor
- Hata mesajları açıklayıcı ve çözüm odaklı

---

## Test Etme

### Frontend Test
```bash
cd frontend
npm run dev

# Browser console'da:
# 1. Login olmadan bir API endpoint'e istek atılmaya çalışıldığında
#    "🚫 API request blocked: No authentication token" görülmeli
# 2. 401 hatası aldığında otomatik logout olmalı
# 3. 429 hatası aldığında kullanıcı dostu mesaj görülmeli
```

### Backend Test
```bash
cd backend

# Server'ı başlat
npm run dev

# Başka bir terminal'de tekrar başlatmayı dene
npm run dev
# EADDRINUSE hatası ve çözüm önerileri görülmeli

# Script çalıştır (server başlatmamalı)
tsx scripts/test-login.ts
# Sadece DB işlemleri yapılmalı, server başlamamalı
```

---

## Migration Checklist

- [x] Frontend axios interceptor güncellendi
- [x] AuthContext error handling iyileştirildi
- [x] Backend app.ts ve server.ts ayrıldı
- [x] Rate limiting iyileştirildi
- [x] db-client.ts oluşturuldu
- [x] package.json scripts güncellendi
- [x] Dokümantasyon oluşturuldu
- [ ] Mevcut server process'leri temizlendi (manuel)
- [ ] Test edildi (manuel)
