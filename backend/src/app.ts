import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';

/**
 * Create and configure Express application
 * This file ONLY creates the app, does NOT start the server
 * Server is started in server.ts
 */
export function createApp() {
  const app = express();

  // ==================== MIDDLEWARE ====================

  // Security
  app.use(helmet());

  // CORS
  app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Rate limiting - Separate limits for auth and protected endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    message: {
      success: false,
      message: 'Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only count failed attempts
  });

  const apiLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.isDevelopment ? 1000 : env.RATE_LIMIT_MAX,
    message: {
      success: false,
      message: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limit for health checks and auth endpoints (they have their own limiter)
      const skipPaths = ['/api/health', '/api/static', '/api/auth/'];
      return skipPaths.some(path => req.path.startsWith(path));
    },
  });

  // Apply auth limiter only to auth endpoints
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  
  // Apply general limiter to all other API endpoints
  app.use('/api', apiLimiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // ==================== ROUTES ====================

  app.use('/api', routes);

  // ==================== ERROR HANDLING ====================

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
