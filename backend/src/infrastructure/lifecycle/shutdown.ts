/**
 * Graceful Shutdown Handler
 * 
 * Handles application shutdown gracefully.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Coordinates shutdown of all resources
 * - Idempotent (can be called multiple times safely)
 * - Timeout protection
 * - Logging at each step
 * 
 * Usage:
 * ```ts
 * import { setupGracefulShutdown } from './infrastructure/lifecycle/shutdown.js';
 * 
 * const server = app.listen(port);
 * setupGracefulShutdown(server);
 * ```
 */

import { Server } from 'http';
import { logger } from '../observability/index.js';
import { disconnectDatabase } from '../../config/database.js';
import { shutdownJobQueues, shutdownWorkers } from '../jobs/index.js';

/**
 * Shutdown State
 * 
 * Tracks shutdown state to ensure idempotency.
 */
let isShuttingDown = false;
let shutdownTimeout: NodeJS.Timeout | null = null;
let workers: any[] = [];

/**
 * Shutdown Timeout (milliseconds)
 * 
 * Maximum time to wait for graceful shutdown before forcing exit.
 */
const SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Setup Graceful Shutdown
 * 
 * Registers signal handlers and sets up graceful shutdown.
 * Should be called once during application bootstrap.
 * 
 * @param server HTTP server instance
 * @param registeredWorkers Optional array of workers to shut down
 */
export function setupGracefulShutdown(server: Server, registeredWorkers: any[] = []): void {
  workers = registeredWorkers;

  // Register signal handlers
  process.on('SIGTERM', () => shutdown('SIGTERM', server));
  process.on('SIGINT', () => shutdown('SIGINT', server));
  
  // SIGUSR2 is used by some process managers for reload
  process.on('SIGUSR2', () => shutdown('SIGUSR2', server));

  logger.info('Graceful shutdown handlers registered', {
    signals: ['SIGTERM', 'SIGINT', 'SIGUSR2'],
  });
}

/**
 * Shutdown Application
 * 
 * Performs graceful shutdown of all resources.
 * Idempotent - can be called multiple times safely.
 * 
 * @param reason Shutdown reason (signal name)
 * @param server HTTP server instance
 */
export async function shutdown(reason: string, server: Server): Promise<void> {
  // Prevent multiple shutdowns
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, ignoring signal', { reason });
    return;
  }

  isShuttingDown = true;
  logger.info('Shutdown initiated', { reason });

  // Set timeout to force exit if shutdown takes too long
  shutdownTimeout = setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit', {
      timeout: SHUTDOWN_TIMEOUT_MS,
    });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    // Step 1: Stop accepting new HTTP requests
    await stopHttpServer(server);

    // Step 2: Stop job workers
    await stopJobWorkers();

    // Step 3: Close Redis connections (via job queues)
    await closeRedisConnections();

    // Step 4: Close Prisma connections
    await closePrismaConnections();

    // Step 5: Flush logs
    await flushLogs();

    // Clear shutdown timeout
    if (shutdownTimeout) {
      clearTimeout(shutdownTimeout);
      shutdownTimeout = null;
    }

    logger.info('Shutdown completed successfully', { reason });
    process.exit(0);
  } catch (error) {
    logger.error('Shutdown error', error, { reason });
    
    // Clear shutdown timeout
    if (shutdownTimeout) {
      clearTimeout(shutdownTimeout);
      shutdownTimeout = null;
    }
    
    // Force exit on error
    process.exit(1);
  }
}

/**
 * Stop HTTP Server
 * 
 * Stops accepting new HTTP requests and closes server.
 * 
 * @param server HTTP server instance
 */
async function stopHttpServer(server: Server): Promise<void> {
  logger.info('Stopping HTTP server...');

  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        logger.error('Error closing HTTP server', error);
        reject(error);
      } else {
        logger.info('HTTP server stopped');
        resolve();
      }
    });
  });
}

/**
 * Stop Job Workers
 * 
 * Gracefully stops all job workers.
 * 
 */
async function stopJobWorkers(): Promise<void> {
  if (workers.length === 0) {
    logger.info('No workers to stop');
    return;
  }

  logger.info('Stopping job workers...', { workerCount: workers.length });

  try {
    await shutdownWorkers(workers);
    logger.info('Job workers stopped');
  } catch (error) {
    logger.error('Error stopping job workers', error);
    // Continue shutdown even if workers fail to stop
  }
}

/**
 * Close Redis Connections
 * 
 * Closes Redis connections via job queue infrastructure.
 * 
 */
async function closeRedisConnections(): Promise<void> {
  logger.info('Closing Redis connections...');

  try {
    await shutdownJobQueues();
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error closing Redis connections', error);
    // Continue shutdown even if Redis fails to close
  }
}

/**
 * Close Prisma Connections
 * 
 * Disconnects from database.
 * 
 */
async function closePrismaConnections(): Promise<void> {
  logger.info('Closing Prisma connections...');

  try {
    await disconnectDatabase();
    logger.info('Prisma connections closed');
  } catch (error) {
    logger.error('Error closing Prisma connections', error);
    // Continue shutdown even if Prisma fails to close
  }
}

/**
 * Flush Logs
 * 
 * Ensures all pending log entries are written.
 * 
 */
async function flushLogs(): Promise<void> {
  logger.info('Flushing logs...');

  // Give logger a moment to flush
  // Most loggers (like pino) flush automatically, but we wait a bit to be sure
  await new Promise((resolve) => setTimeout(resolve, 100));

  logger.info('Logs flushed');
}

/**
 * Register Workers
 * 
 * Registers workers for shutdown.
 * Can be called multiple times to add more workers.
 * 
 * @param newWorkers Workers to register
 */
export function registerWorkers(newWorkers: any[]): void {
  workers.push(...newWorkers);
  logger.info('Workers registered for shutdown', { 
    totalWorkers: workers.length,
    newWorkers: newWorkers.length,
  });
}

/**
 * Get Shutdown State
 * 
 * Returns whether shutdown is in progress.
 * 
 * @returns True if shutting down, false otherwise
 */
export function isShuttingDownState(): boolean {
  return isShuttingDown;
}

