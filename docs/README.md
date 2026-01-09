# 🏭 DepoPanel

**Multi-warehouse, Multi-platform Stock & Order Management System**

DepoPanel, e-ticaret şirketleri için tasarlanmış, çoklu depo ve çoklu pazaryeri entegrasyonu sunan profesyonel bir stok ve sipariş yönetim sistemidir.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

---

## 📋 Özellikler

### 🏢 Çoklu Depo Yönetimi
- Sınırsız depo tanımlama (Ana Depo, İstim, Ferhatpaşa, Mağaza vb.)
- Depolar arası stok transferi
- Depo bazlı stok takibi
- Varsayılan depo belirleme

### 🛒 Pazaryeri Entegrasyonları
- **WooCommerce** (Master Envanter)
- **Trendyol**
- **Hepsiburada** *(yakında)*
- **N11** *(yakında)*
- **Pazarama** *(yakında)*
- **Amazon** *(yakında)*
- **Shopify** *(yakında)*
- **Ikas** *(yakında)*

### 📦 Sipariş Yönetimi
- Otomatik sipariş çekme (15 dakikada bir)
- Sipariş durumu takibi
- Kargo entegrasyonu
- İade/Değişim yönetimi

### 📊 Stok Yönetimi
- Gerçek zamanlı stok takibi
- Stok hareket logları (IN, OUT, RETURN, ADJUSTMENT, TRANSFER)
- Düşük stok uyarıları
- Minimum stok belirleme

### 👥 Kullanıcı Yönetimi
- Rol bazlı yetkilendirme (SUPER_ADMIN, ADMIN, STAFF)
- Şirket kayıt ve onay sistemi
- JWT kimlik doğrulama

### 🖨️ Ek Özellikler
- Barkod yazdırma
- Kargo takip entegrasyonları
- Türkçe arayüz
- Responsive tasarım

---

## 🚀 Kurulum

### Gereksinimler

- Node.js 18+
- PostgreSQL 14+
- npm veya yarn

### 1. Projeyi Klonlayın

```bash
git clone https://github.com/your-username/depopanel.git
cd depopanel
```

### 2. Backend Kurulumu

```bash
cd backend

# Bağımlılıkları yükleyin
npm install

# .env dosyasını oluşturun
cp .env.example .env

# .env dosyasını düzenleyin (DATABASE_URL, JWT_SECRET vb.)

# Prisma client oluşturun
npm run db:generate

# Veritabanı şemasını uygulayın
npm run db:push

# Demo verileri yükleyin (opsiyonel)
npm run db:seed

# Sunucuyu başlatın
npm run dev
```

### 3. Frontend Kurulumu

```bash
cd frontend

# Bağımlılıkları yükleyin
npm install

# .env dosyasını oluşturun (opsiyonel)
cp .env.example .env

# Uygulamayı başlatın
npm run dev
```

### 4. Erişim

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000/api
- **API Health Check:** http://localhost:5000/api/health

---

## 🔑 Demo Hesapları

Seed çalıştırıldıktan sonra:

| Rol | E-posta | Şifre |
|-----|---------|-------|
| Super Admin | admin@depopanel.com | Admin123! |
| Demo Admin | demo@example.com | Admin123! |

---

## 📁 Proje Yapısı

```
DepoPanel/
├── backend/
│   ├── src/
│   │   ├── config/          # Veritabanı ve çevre değişkenleri
│   │   ├── controllers/     # Route handler'lar
│   │   ├── services/        # İş mantığı
│   │   ├── repositories/    # Veritabanı sorguları
│   │   ├── routes/          # API route tanımları
│   │   ├── middleware/      # Auth, error handling, validation
│   │   ├── utils/           # Yardımcı fonksiyonlar
│   │   ├── integrations/    # Pazaryeri entegrasyonları
│   │   ├── jobs/            # Cron job'lar
│   │   └── index.ts         # Ana uygulama dosyası
│   ├── prisma/
│   │   ├── schema.prisma    # Veritabanı şeması
│   │   └── seed.ts          # Demo verileri
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── components/      # React bileşenleri
│   │   │   ├── ui/          # Temel UI bileşenleri
│   │   │   └── layout/      # Layout bileşenleri
│   │   ├── pages/           # Sayfa bileşenleri
│   │   ├── context/         # React context'ler
│   │   ├── services/        # API servisleri
│   │   ├── hooks/           # Custom hook'lar
│   │   ├── types/           # TypeScript tipleri
│   │   ├── lib/             # Utility fonksiyonlar
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
└── README.md
```

---

## 📡 API Endpoints

### Auth
- `POST /api/auth/register` - Şirket kaydı
- `POST /api/auth/login` - Giriş
- `GET /api/auth/profile` - Profil bilgisi
- `PUT /api/auth/profile` - Profil güncelleme
- `POST /api/auth/change-password` - Şifre değiştirme

### Warehouses
- `GET /api/warehouses` - Depo listesi
- `GET /api/warehouses/active` - Aktif depolar
- `GET /api/warehouses/:id` - Depo detayı
- `POST /api/warehouses` - Depo oluştur
- `PUT /api/warehouses/:id` - Depo güncelle
- `DELETE /api/warehouses/:id` - Depo sil
- `POST /api/warehouses/:id/set-default` - Varsayılan yap

### Products
- `GET /api/products` - Ürün listesi
- `GET /api/products/stats` - Ürün istatistikleri
- `GET /api/products/low-stock` - Düşük stoklu ürünler
- `GET /api/products/:id` - Ürün detayı
- `POST /api/products` - Ürün oluştur
- `PUT /api/products/:id` - Ürün güncelle
- `DELETE /api/products/:id` - Ürün sil

### Stocks
- `GET /api/stocks/product/:productId` - Ürün stokları
- `GET /api/stocks/warehouse/:warehouseId` - Depo stokları
- `GET /api/stocks/logs` - Stok hareketleri
- `POST /api/stocks/adjust` - Stok düzelt
- `POST /api/stocks/transfer` - Stok transferi
- `POST /api/stocks/min-quantity` - Minimum stok ayarla

### Orders
- `GET /api/orders` - Sipariş listesi
- `GET /api/orders/stats` - Sipariş istatistikleri
- `GET /api/orders/:id` - Sipariş detayı
- `POST /api/orders` - Sipariş oluştur
- `PUT /api/orders/:id/status` - Sipariş durumu güncelle
- `POST /api/orders/:id/cancel` - Sipariş iptal

---

## ⏰ Cron Jobs

| Job | Zamanlama | Açıklama |
|-----|-----------|----------|
| Sipariş Sync | Her 15 dakika | Pazaryerlerinden sipariş çekme |
| Stok Sync | Her 30 dakika | Stoklarüı pazaryerlerine gönderme |
| Düşük Stok Kontrolü | Her saat | Düşük stok uyarıları |
| Günlük Temizlik | Her gün 03:00 | Eski logları temizleme |

---

## 🛠️ Geliştirme

### Backend Development

```bash
cd backend
npm run dev        # Development sunucusu
npm run build      # Production build
npm run db:studio  # Prisma Studio (GUI)
```

### Frontend Development

```bash
cd frontend
npm run dev        # Development sunucusu
npm run build      # Production build
npm run preview    # Build önizleme
```

---

## 📦 Production Deployment

### Backend

```bash
cd backend
npm run build
npm start
```

### Frontend

```bash
cd frontend
npm run build
# dist/ klasörünü bir web sunucusuna deploy edin
```

### PM2 ile Çalıştırma

```bash
# Backend
pm2 start dist/index.js --name depopanel-api

# Durumu kontrol
pm2 status
pm2 logs depopanel-api
```

---

## 🔒 Güvenlik

- JWT tabanlı kimlik doğrulama
- Bcrypt ile şifre hashleme
- Rate limiting
- CORS koruması
- Helmet güvenlik başlıkları
- Input validation (Zod)

---

## 📄 Lisans

MIT License - [LICENSE](LICENSE)

---

## 👨‍💻 Geliştirici

**DepoPanel Team**

---

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request açın

---

<p align="center">
  Made with ❤️ in Turkey
</p>

