/**
 * Retry Helper Utility
 * 
 * Provides retry logic with exponential backoff for API calls
 * and other operations that may fail due to transient errors.
 */

import { logger } from './logger.js';
import { sleep } from './helpers.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: number[]; // HTTP status codes to retry
  onRetry?: (attempt: number, error: any) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> & { onRetry?: (attempt: number, error: any) => void } = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableErrors: [408, 429, 500, 502, 503, 504], // Timeout, Rate limit, Server errors
};

/**
 * Check if an error is retryable based on status code
 */
function isRetryableError(error: any, retryableErrors: number[]): boolean {
  const status = error?.response?.status || error?.status || error?.code;
  
  if (status && retryableErrors.includes(status)) {
    return true;
  }

  // Network errors are always retryable
  if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND') {
    return true;
  }

  // Axios timeout
  if (error?.code === 'ECONNABORTED' && error?.message?.includes('timeout')) {
    return true;
  }

  return false;
}

/**
 * Calculate delay for exponential backoff
 */
function calculateDelay(attempt: number, options: Required<Omit<RetryOptions, 'onRetry'>>): number {
  const delay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt);
  return Math.min(delay, options.maxDelay);
}

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Function to retry
 * @param options - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt >= config.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error, config.retryableErrors)) {
        logger.warn(`[Retry] Error is not retryable, stopping: ${error?.message || error}`);
        throw error;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, config);
      
      logger.warn(`[Retry] Attempt ${attempt + 1}/${config.maxRetries + 1} failed, retrying in ${delay}ms:`, {
        error: error?.message || error,
        status: error?.response?.status,
        code: error?.code,
      });

      // Call onRetry callback if provided
      if (config.onRetry) {
        config.onRetry(attempt + 1, error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All retries failed
  logger.error(`[Retry] All ${config.maxRetries + 1} attempts failed`);
  throw lastError;
}

/**
 * Retry with custom retry condition
 */
export async function retryWithCondition<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: any, attempt: number) => boolean,
  options: Omit<RetryOptions, 'retryableErrors'> = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt >= config.maxRetries) {
        break;
      }

      // Check custom retry condition
      if (!shouldRetry(error, attempt)) {
        logger.warn(`[Retry] Custom condition not met, stopping: ${error?.message || error}`);
        throw error;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, config);
      
      logger.warn(`[Retry] Attempt ${attempt + 1}/${config.maxRetries + 1} failed, retrying in ${delay}ms:`, {
        error: error?.message || error,
      });

      // Call onRetry callback if provided
      if (config.onRetry) {
        config.onRetry(attempt + 1, error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All retries failed
  logger.error(`[Retry] All ${config.maxRetries + 1} attempts failed`);
  throw lastError;
}

