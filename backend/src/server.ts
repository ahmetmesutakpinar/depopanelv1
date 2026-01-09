import { createApp } from './app.js';
import { env, connectDatabase } from './config/index.js';
import { logger } from './utils/logger.js';
import { initCronJobs } from './utils/job-index.js';

/**
 * Server startup file
 * This file is ONLY responsible for starting the HTTP server
 * App configuration is in app.ts
 */

async function bootstrap() {
  try {
    // Connect to database
    logger.info('📦 Connecting to database...');
    await connectDatabase();
    logger.info('✅ Database connected');

    // Create Express app
    const app = createApp();

    // Initialize cron jobs
    // DISABLED v3.1: Integration sync cron jobs are disabled during hard reset
    // The initCronJobs() function itself contains guards and will skip integration jobs
    // TODO: Uncomment when re-adding integrations from scratch
    logger.info('⏰ Initializing cron jobs...');
    initCronJobs(); // Still called, but integration sync jobs are disabled inside

    // Start server
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 DepoPanel API sunucusu ${env.PORT} portunda çalışıyor`);
      logger.info(`📍 Environment: ${env.NODE_ENV}`);
      logger.info(`🔗 API URL: http://localhost:${env.PORT}/api`);
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${env.PORT} zaten kullanımda!`);
        logger.error('💡 Çözüm önerileri:');
        logger.error('   1. Windows: netstat -ano | findstr :5000');
        logger.error('   2. Process ID bulun ve kapatın: taskkill /PID <PID> /F');
        logger.error('   3. Veya farklı bir port kullanın: PORT=5001 npm run dev');
        process.exit(1);
      } else {
        logger.error('Server error:', error);
        process.exit(1);
      }
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} sinyali alındı. Sunucu kapatılıyor...`);
      
      server.close(() => {
        logger.info('✅ HTTP server kapatıldı');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('⚠️ Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('❌ Sunucu başlatılamadı:', error);
    process.exit(1);
  }
}

// Start server automatically when this file is executed
bootstrap();

export { bootstrap };
