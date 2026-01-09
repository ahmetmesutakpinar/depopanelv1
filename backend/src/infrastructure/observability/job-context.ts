/**
 * Job Context Helpers
 * 
 * Utilities for creating job context in job processors.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Creates job context
 * - Logs job start/end
 * - Records metrics
 * 
 * Usage:
 * ```ts
 * import { withJobContext } from './infrastructure/observability/job-context.js';
 * 
 * export async function processJob(job: Job) {
 *   return withJobContext(job, async () => {
 *     // Job processing logic
 *   });
 * }
 * ```
 */

import { runWithContext, generateJobId } from './context.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';
import { ObservabilityContext } from './context.js';

/**
 * Job Context Data
 * 
 * Data extracted from job for context creation.
 */
export interface JobContextData {
  jobId?: string;
  jobName: string;
  companyId?: string;
  integrationId?: string;
  marketplace?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Run function with job context
 * 
 * Creates job context and runs function within it.
 * Logs job start/end and records metrics.
 * 
 * @param jobData Job context data
 * @param fn Function to execute
 * @returns Result of function execution
 */
export async function withJobContext<T>(
  jobData: JobContextData,
  fn: () => Promise<T>
): Promise<T> {
  const jobId = jobData.jobId || generateJobId();
  const startTime = Date.now();

  // Create job context
  const context: ObservabilityContext = {
    jobId,
    companyId: jobData.companyId,
    marketplace: jobData.marketplace,
    metadata: {
      jobName: jobData.jobName,
      integrationId: jobData.integrationId,
      ...jobData.metadata,
    },
  };

  return runWithContext(context, async () => {
    // Log job start
    logger.info('Job started', {
      jobName: jobData.jobName,
      jobId,
    });

    // Record metrics
    metrics.increment('job.started', {
      jobName: jobData.jobName,
    });

    try {
      // Execute job
      const result = await fn();

      const duration = Date.now() - startTime;

      // Log job completion
      logger.info('Job completed', {
        jobName: jobData.jobName,
        jobId,
        duration,
      });

      // Record metrics
      metrics.timing('job.duration', duration, {
        jobName: jobData.jobName,
      });

      metrics.increment('job.completed', {
        jobName: jobData.jobName,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log job failure
      logger.error('Job failed', error, {
        jobName: jobData.jobName,
        jobId,
        duration,
      });

      // Record metrics
      metrics.increment('job.failed', {
        jobName: jobData.jobName,
      });

      throw error;
    }
  });
}

