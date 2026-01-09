/**
 * Sync Orders Job Processor
 * 
 * Processes sync-orders background jobs.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Calls use cases (no business logic)
 * - Handles errors and retries
 * - Decoupled from HTTP layer
 */

// NOTE: BullMQ must be installed: npm install bullmq ioredis
// @ts-ignore - BullMQ types will be available after installation
import type { Job } from 'bullmq';
import { SyncOrdersJobPayload, JobResult } from '../types.js';
import { container } from '../../di/index.js';
import { MarketplaceType } from '@prisma/client';
import { withJobContext } from '../../observability/job-context.js';

/**
 * Process Sync Orders Job
 * 
 * This processor:
 * 1. Resolves use case from DI container
 * 2. Gets marketplace connection
 * 3. Creates marketplace adapter
 * 4. Executes use case
 * 5. Returns result
 * 
 * NOTE: This function signature matches BullMQ's Job type.
 * After installing BullMQ, remove @ts-ignore and use proper types.
 * 
 * @param job BullMQ job instance
 * @returns Job result
 */
export async function processSyncOrdersJob(
  // @ts-ignore - BullMQ Job type will be available after installation
  job: Job<SyncOrdersJobPayload>
): Promise<JobResult> {
  const { companyId, integrationId, startDate, endDate } = job.data;

  return withJobContext(
    {
      jobId: job.id as string | undefined,
      jobName: 'sync-orders',
      companyId,
      integrationId,
      metadata: {
        startDate,
        endDate,
      },
    },
    async () => {
      const startTime = Date.now();

      try {
            // Get marketplace connection repository
        const connectionRepository = container.getMarketplaceConnectionRepository();

        // Get marketplace connection
        const connection = await connectionRepository.findByIdAndCompany(
          integrationId,
          companyId
        );

        if (!connection) {
          throw new Error(`Marketplace connection not found: ${integrationId}`);
        }

        // Extract credentials from connection settings
        const credentials = {
          apiUrl: connection.settings?.apiUrl as string | undefined,
          apiKey: connection.settings?.apiKey as string | undefined,
          apiSecret: connection.settings?.apiSecret as string | undefined,
          sellerId: connection.settings?.sellerId as string | undefined,
          accessToken: connection.settings?.accessToken as string | undefined,
          refreshToken: connection.settings?.refreshToken as string | undefined,
          settings: connection.settings as Record<string, unknown> | undefined,
        };

        // Create marketplace adapter
        const adapter = container.createMarketplaceAdapter(
          connection.type as MarketplaceType,
          credentials
        );

        // Get use case from DI container
        const useCase = container.getSyncOrdersUseCase(adapter);

        // Execute use case
        const result = await useCase.execute({
          integrationId,
          companyId,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        });

        const executionTimeMs = Date.now() - startTime;

        return {
          success: true,
          data: result,
          metadata: {
            executionTimeMs,
            attempts: job.attemptsMade + 1,
          },
        };
      } catch (error) {
        const executionTimeMs = Date.now() - startTime;

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          metadata: {
            executionTimeMs,
            attempts: job.attemptsMade + 1,
            jobId: job.id,
          },
        };
      }
    }
  );
}

