# DepoPanel - Warehouse Management System

Modern, production-ready Warehouse Management System (WMS) built with TypeScript, React, and Node.js.

## Features

- 🏢 Multi-company support with role-based access control
- 📦 Complete inventory management (products, variants, stock tracking)
- 🚚 Order management and fulfillment
- 📍 Location and warehouse management
- 🔄 Marketplace integrations (WooCommerce, Trendyol, etc.)
- 📊 Inventory counting and cycle counting
- 📦 Picking waves and order picking
- 🔄 Returns management
- 📈 Real-time stock synchronization
- 🔍 Advanced barcode matching system
- ⚡ High-performance with database indexing
- 🔒 Secure authentication and authorization

## Tech Stack

### Backend
- Node.js + Express.js
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT Authentication
- Winston Logging

### Frontend
- React 18
- TypeScript
- Vite
- React Query
- Tailwind CSS
- Shadcn UI

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd DepoPanel
```

2. Install dependencies
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. Set up environment variables
```bash
# Backend
cp .env.example .env
# Edit .env with your database credentials

# Frontend
cd ../frontend
cp .env.example .env
```

4. Set up database
```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

5. Start development servers
```bash
# Backend (from backend directory)
npm run dev

# Frontend (from frontend directory)
npm run dev
```

## Docker Deployment

### Using Docker Compose

1. Copy environment file
```bash
cp .env.example .env
# Edit .env with your configuration
```

2. Start services
```bash
docker-compose up -d
```

3. Run migrations
```bash
docker-compose exec backend npx prisma migrate deploy
```

### Manual Docker Build

```bash
# Build backend
cd backend
docker build -t depopanel-backend .

# Build frontend
cd ../frontend
docker build -t depopanel-frontend .
```

## API Endpoints

### Health & Monitoring
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health with metrics
- `GET /api/cron/status` - Cron job execution status

### Authentication
- `POST /api/auth/register` - Register new company
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update profile

### Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `GET /api/products/:id` - Get product details
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Orders
- `GET /api/orders` - List orders
- `POST /api/orders` - Create order
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id/status` - Update order status
- `POST /api/orders/:id/scan` - Scan order item

### Stock
- `GET /api/stock` - List stock
- `POST /api/stock/move` - Move stock
- `POST /api/stock/adjust` - Adjust stock

## Project Structure

```
DepoPanel/
├── backend/
│   ├── src/
│   │   ├── controllers/    # Request handlers
│   │   ├── services/      # Business logic
│   │   ├── repositories/  # Data access layer
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Express middleware
│   │   ├── utils/         # Utilities
│   │   └── config/        # Configuration
│   ├── prisma/            # Database schema
│   └── scripts/           # Utility scripts
├── frontend/
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── services/      # API services
│   │   ├── context/       # React context
│   │   └── hooks/        # Custom hooks
└── docker-compose.yml     # Docker configuration
```

## Architecture

The application follows a strict layered architecture:

1. **Controllers** - Handle HTTP requests/responses, validation
2. **Services** - Business logic and orchestration
3. **Repositories** - Database operations and data access
4. **Models** - Prisma schema definitions

## Database

The application uses PostgreSQL with Prisma ORM. Key features:
- Comprehensive indexing for performance
- Cascade deletes for data integrity
- Foreign key constraints
- Optimized queries

## Security

- JWT-based authentication
- Role-based access control (SUPER_ADMIN, ADMIN, STAFF)
- Password hashing with bcrypt
- CORS protection
- Helmet security headers
- Rate limiting

## Monitoring

- Health check endpoints
- Cron job status tracking
- Detailed error logging
- Sync log tracking
- Performance metrics

## Development

### Running Tests
```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

### Code Quality
```bash
# TypeScript check
npm run type-check

# Linting
npm run lint
```

## Production Checklist

- [ ] Update `.env` with production values
- [ ] Set secure `JWT_SECRET`
- [ ] Configure database backups
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (nginx)
- [ ] Set up monitoring and alerts
- [ ] Review and update rate limits
- [ ] Enable database connection pooling
- [ ] Configure log rotation
- [ ] Set up CI/CD pipeline

## License

Proprietary - All rights reserved

## Support

For support, please contact the development team.
