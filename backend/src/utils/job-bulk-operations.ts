import { logger } from './logger.js';
import { prisma } from '../config/index.js';
import { bulkOperationsService } from '../services/bulk-operations.service.js';
import { runJobWithRetry } from './job-wrapper.js';

/**
 * Bulk Operations Job
 * 
 * Processes pending bulk operations
 * Runs periodically to process queued bulk operations
 */
export async function processPendingBulkOperations(): Promise<void> {
  logger.info('[BulkOperations] Processing pending bulk operations...');

  const pendingOperations = await prisma.bulkOperation.findMany({
    where: {
      status: 'PENDING',
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: 10, // Process up to 10 at a time
  });

  if (pendingOperations.length === 0) {
    logger.info('[BulkOperations] No pending bulk operations found');
    return;
  }

  logger.info(`[BulkOperations] Found ${pendingOperations.length} pending bulk operations`);

  for (const operation of pendingOperations) {
    try {
      await runJobWithRetry(
        {
          jobName: `bulk-operation-${operation.id}`,
          companyId: operation.companyId,
          metadata: {
            bulkOperationId: operation.id,
            operationType: operation.operationType,
          },
        },
        () => bulkOperationsService.processBulkOperation(operation.id),
        {
          maxRetries: 1, // Bulk operations already have retry logic
          timeout: 3600000, // 1 hour timeout
          logToDatabase: true,
        }
      );
    } catch (error: any) {
      logger.error(`[BulkOperations] Failed to process bulk operation: ${operation.id}`, error);
      
      // Mark as failed
      await prisma.bulkOperation.update({
        where: { id: operation.id },
        data: {
          status: 'FAILED',
          error: error.message || 'Unknown error',
          completedAt: new Date(),
        },
      });
    }
  }

  logger.info(`[BulkOperations] Completed processing ${pendingOperations.length} bulk operations`);
}

