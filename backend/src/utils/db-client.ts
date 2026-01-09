import { prisma } from '../config/index.js';
import { logger } from './logger.js';

/**
 * Database client utility for scripts and jobs
 * Use this in scripts/jobs instead of importing the full app
 * This prevents accidentally starting the HTTP server
 */

export async function connectDB() {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected');
    return prisma;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
}

export async function disconnectDB() {
  try {
    await prisma.$disconnect();
    logger.info('✅ Database disconnected');
  } catch (error) {
    logger.error('❌ Database disconnection failed:', error);
    throw error;
  }
}

export { prisma };
