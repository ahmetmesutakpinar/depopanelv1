# Backend Server Başlatma

Backend server çalışmıyor. Başlatmak için:

## 1. Backend Dizinine Gidin

```bash
cd backend
```

## 2. Backend Server'ı Başlatın

Development modunda:
```bash
npm run dev
```

veya

Production modunda:
```bash
npm run build
npm start
```

## 3. Server Başladığında

Şu mesajı görmelisiniz:
```
🚀 DepoPanel API sunucusu 5000 portunda çalışıyor
🔗 API URL: http://localhost:5000/api
```

## Notlar

- Backend server 5000 portunda çalışmalı
- Frontend (Vite) 3000 portunda çalışıyor ve 5000'e proxy yapıyor
- Eğer port değiştirmek isterseniz, `backend/.env` dosyasında `PORT=5000` değerini değiştirin
- Database bağlantısı için `DATABASE_URL` environment variable'ı gerekli

## Sorun Giderme

Eğer hala bağlantı hatası alıyorsanız:

1. Backend server'ın çalıştığından emin olun
2. Port 5000'in başka bir uygulama tarafından kullanılmadığından emin olun
3. Firewall ayarlarını kontrol edin
4. `backend/.env` dosyasının doğru yapılandırıldığından emin olun

