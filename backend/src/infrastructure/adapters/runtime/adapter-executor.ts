/**
 * Adapter Executor
 * 
 * Wraps marketplace adapter operations with retry logic, error handling, and execution tracking.
 * This is the central execution layer for all adapter operations.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Wraps adapter operations (does not modify adapters)
 * - Handles retries, timeouts, and error transformation
 * - Prepares for job-based execution
 * 
 * Responsibilities:
 * - Wrap adapter execution
 * - Catch and transform errors
 * - Decide retry strategy
 * - Apply exponential backoff
 * - Track execution metrics
 * - Prepare for job queue integration
 */

import { MarketplaceAdapter } from '../../../contracts/marketplace.contract.js';
import { RetryPolicy } from './retry-policy.js';
import { AdapterContext } from './adapter-context.js';
import {
  AdapterError,
  RetryableAdapterError,
  NonRetryableAdapterError,
  AdapterTimeoutError,
  isRetryableError,
} from './adapter-errors.js';
import { logger } from '../../observability/logger.js';
import { metrics } from '../../observability/metrics.js';
import { getContext } from '../../observability/context.js';

/**
 * Execution Result
 * 
 * Contains result and metadata about the execution.
 */
export interface ExecutionResult<T> {
  /**
   * Operation result
   */
  result: T;

  /**
   * Number of retry attempts made
   */
  attempts: number;

  /**
   * Total execution time in milliseconds
   */
  executionTimeMs: number;

  /**
   * Whether the operation was retried
   */
  wasRetried: boolean;
}

/**
 * Execution Options
 */
export interface ExecutionOptions {
  /**
   * Operation timeout in milliseconds
   */
  timeoutMs?: number;

  /**
   * Whether to throw errors or return them
   */
  throwOnError?: boolean;

  /**
   * Custom retry policy (overrides default)
   */
  retryPolicy?: RetryPolicy;

  /**
   * Operation metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Adapter Executor
 * 
 * Executes adapter operations with retry logic and error handling.
 */
export class AdapterExecutor {
  constructor(
    private readonly retryPolicy: RetryPolicy,
    private readonly context: AdapterContext
  ) {}

  /**
   * Execute an adapter operation with retry logic
   * 
   * @param adapterName Name of the adapter (for logging/errors)
   * @param operation Operation to execute
   * @param options Execution options
   * @returns Promise resolving to execution result
   */
  async execute<T>(
    adapterName: string,
    operation: () => Promise<T>,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult<T>> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? this.retryPolicy.getTimeoutMs();
    const policy = options.retryPolicy ?? this.retryPolicy;
    const throwOnError = options.throwOnError ?? true;

    // Log adapter operation start
    const context = getContext();
    logger.info('Adapter operation started', {
      adapterName,
      marketplace: this.context.marketplaceType,
      operation: options.metadata?.operation as string,
    });

    metrics.increment('adapter.operation.started', {
      adapterName,
      marketplace: this.context.marketplaceType,
    });

    let lastError: unknown;
    let attempts = 0;
    const maxAttempts = policy.getMaxRetries() + 1; // +1 for initial attempt

    while (attempts < maxAttempts) {
      attempts++;

      try {
        // Execute with timeout
        const result = await this.executeWithTimeout(
          operation,
          timeoutMs,
          adapterName,
          options.metadata
        );

        const executionTimeMs = Date.now() - startTime;

        // Log adapter operation success
        logger.info('Adapter operation completed', {
          adapterName,
          marketplace: this.context.marketplaceType,
          operation: options.metadata?.operation as string,
          attempts,
          duration: executionTimeMs,
        });

        metrics.timing('adapter.operation.duration', executionTimeMs, {
          adapterName,
          marketplace: this.context.marketplaceType,
        });

        metrics.increment('adapter.operation.completed', {
          adapterName,
          marketplace: this.context.marketplaceType,
        });

        return {
          result,
          attempts,
          executionTimeMs,
          wasRetried: attempts > 1,
        };
      } catch (error) {
        lastError = error;

        // Log retry attempt
        if (attempts < maxAttempts && policy.shouldRetry(error, attempts - 1)) {
          logger.warn('Adapter operation retrying', {
            adapterName,
            marketplace: this.context.marketplaceType,
            operation: options.metadata?.operation as string,
            attempt: attempts,
            maxAttempts,
            error: error instanceof Error ? error.message : String(error),
          });

          metrics.increment('adapter.operation.retry', {
            adapterName,
            marketplace: this.context.marketplaceType,
          });
        }

        // Check if we should retry
        if (!policy.shouldRetry(error, attempts - 1)) {
          break; // Don't retry, break out of loop
        }

        // Calculate retry delay
        const delayMs = policy.getRetryDelay(error, attempts - 1);

        // TODO: Add job queue integration for long-running retries
        // TODO: Add metrics/logging for retry attempts
        // TODO: Add circuit breaker pattern

        // Wait before retrying
        await this.sleep(delayMs);
      }
    }

    // All retries exhausted or error is non-retryable
    const executionTimeMs = Date.now() - startTime;
    const adapterError = this.transformError(
      lastError,
      adapterName,
      'execute',
      attempts,
      executionTimeMs,
      options.metadata
    );

    if (throwOnError) {
      throw adapterError;
    }

    // Return error as result (for non-throwing mode)
    throw adapterError; // Still throw, but with transformed error
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    adapterName: string,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    return Promise.race([
      operation(),
      this.createTimeoutPromise(timeoutMs, adapterName, metadata),
    ]);
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise<T>(
    timeoutMs: number,
    adapterName: string,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new AdapterTimeoutError(
            `Operation timed out after ${timeoutMs}ms`,
            adapterName,
            'execute',
            timeoutMs,
            undefined,
            metadata
          )
        );
      }, timeoutMs);
    });
  }

  /**
   * Transform error to AdapterError
   */
  private transformError(
    error: unknown,
    adapterName: string,
    operation: string,
    attempts: number,
    executionTimeMs: number,
    metadata?: Record<string, unknown>
  ): AdapterError {
    // If already an AdapterError, return as-is (but add metadata)
    if (error instanceof AdapterError) {
      return error;
    }

    // Create appropriate error type
    const isRetryable = isRetryableError(error);
    const errorMetadata = {
      ...metadata,
      attempts,
      executionTimeMs,
      context: {
        marketplaceType: this.context.marketplaceType,
        companyId: this.context.companyId,
        integrationId: this.context.integrationId,
      },
    };

    if (isRetryable) {
      return new RetryableAdapterError(
        error instanceof Error ? error.message : String(error),
        adapterName,
        operation,
        error,
        errorMetadata
      );
    } else {
      return new NonRetryableAdapterError(
        error instanceof Error ? error.message : String(error),
        adapterName,
        operation,
        error,
        errorMetadata
      );
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute adapter testConnection with retry
   */
  async testConnection(adapter: MarketplaceAdapter, options?: ExecutionOptions): Promise<ExecutionResult<void>> {
    return this.execute(
      this.context.marketplaceType,
      () => adapter.testConnection(),
      {
        ...options,
        metadata: {
          ...options?.metadata,
          operation: 'testConnection',
        },
      }
    );
  }

  /**
   * Execute adapter syncProducts with retry
   */
  async syncProducts(
    adapter: MarketplaceAdapter,
    startDate?: Date,
    options?: ExecutionOptions
  ): Promise<ExecutionResult<any>> {
    return this.execute(
      this.context.marketplaceType,
      () => adapter.syncProducts(startDate),
      {
        ...options,
        metadata: {
          ...options?.metadata,
          operation: 'syncProducts',
          startDate: startDate?.toISOString(),
        },
      }
    );
  }

  /**
   * Execute adapter syncOrders with retry
   */
  async syncOrders(
    adapter: MarketplaceAdapter,
    startDate?: Date,
    options?: ExecutionOptions
  ): Promise<ExecutionResult<any>> {
    return this.execute(
      this.context.marketplaceType,
      () => adapter.syncOrders(startDate),
      {
        ...options,
        metadata: {
          ...options?.metadata,
          operation: 'syncOrders',
          startDate: startDate?.toISOString(),
        },
      }
    );
  }

  /**
   * Execute adapter updateStock with retry
   */
  async updateStock(
    adapter: MarketplaceAdapter,
    updates: any[],
    options?: ExecutionOptions
  ): Promise<ExecutionResult<void>> {
    return this.execute(
      this.context.marketplaceType,
      () => adapter.updateStock(updates),
      {
        ...options,
        metadata: {
          ...options?.metadata,
          operation: 'updateStock',
          updateCount: updates.length,
        },
      }
    );
  }

  /**
   * Execute adapter updatePrice with retry
   */
  async updatePrice(
    adapter: MarketplaceAdapter,
    updates: any[],
    options?: ExecutionOptions
  ): Promise<ExecutionResult<void>> {
    return this.execute(
      this.context.marketplaceType,
      () => adapter.updatePrice(updates),
      {
        ...options,
        metadata: {
          ...options?.metadata,
          operation: 'updatePrice',
          updateCount: updates.length,
        },
      }
    );
  }
}

