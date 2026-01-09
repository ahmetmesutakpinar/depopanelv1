/**
 * Retry Policy
 * 
 * Defines retry behavior for adapter operations.
 * Handles exponential backoff, max retries, and retryable error detection.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - No business logic
 * - Used by adapter executor
 */

import { isRetryableError, RetryableAdapterError } from './adapter-errors.js';

/**
 * Retry Policy Configuration
 */
export interface RetryPolicyConfig {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds for exponential backoff
   * @default 1000
   */
  baseDelayMs?: number;

  /**
   * Maximum delay in milliseconds
   * @default 30000
   */
  maxDelayMs?: number;

  /**
   * Multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Jitter range in milliseconds (random delay to avoid thundering herd)
   * @default 500
   */
  jitterMs?: number;

  /**
   * Timeout for the entire operation (including retries)
   * @default 60000
   */
  timeoutMs?: number;

  /**
   * Function to determine if an error is retryable
   * @default isRetryableError
   */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Retry Policy
 * 
 * Manages retry logic for adapter operations.
 */
export class RetryPolicy {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly backoffMultiplier: number;
  private readonly jitterMs: number;
  private readonly timeoutMs: number;
  private readonly isRetryable: (error: unknown) => boolean;

  constructor(config: RetryPolicyConfig = {}) {
    this.maxRetries = config.maxRetries ?? 3;
    this.baseDelayMs = config.baseDelayMs ?? 1000;
    this.maxDelayMs = config.maxDelayMs ?? 30000;
    this.backoffMultiplier = config.backoffMultiplier ?? 2;
    this.jitterMs = config.jitterMs ?? 500;
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.isRetryable = config.isRetryable ?? isRetryableError;
  }

  /**
   * Calculate delay for a given retry attempt
   * Uses exponential backoff with jitter
   */
  calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * (multiplier ^ attempt)
    const exponentialDelay = this.baseDelayMs * Math.pow(this.backoffMultiplier, attempt);
    
    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);
    
    // Add jitter to avoid thundering herd problem
    const jitter = Math.random() * this.jitterMs;
    
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Check if an error is retryable
   */
  shouldRetry(error: unknown, attempt: number): boolean {
    // Don't retry if we've exceeded max retries
    if (attempt >= this.maxRetries) {
      return false;
    }

    // Check if error is retryable
    if (!this.isRetryable(error)) {
      return false;
    }

    // If error has retryAfterMs, respect it
    if (error instanceof RetryableAdapterError && error.retryAfterMs) {
      return true; // Will use retryAfterMs instead of calculated delay
    }

    return true;
  }

  /**
   * Get delay for a retry attempt
   * Respects retryAfterMs from error if present
   */
  getRetryDelay(error: unknown, attempt: number): number {
    // If error specifies retryAfterMs, use it
    if (error instanceof RetryableAdapterError && error.retryAfterMs) {
      return error.retryAfterMs;
    }

    // Otherwise, calculate exponential backoff delay
    return this.calculateDelay(attempt);
  }

  /**
   * Get maximum number of retries
   */
  getMaxRetries(): number {
    return this.maxRetries;
  }

  /**
   * Get timeout for the entire operation
   */
  getTimeoutMs(): number {
    return this.timeoutMs;
  }
}

/**
 * Default Retry Policy
 * 
 * Standard retry policy for most adapter operations.
 */
export const defaultRetryPolicy = new RetryPolicy();

/**
 * Aggressive Retry Policy
 * 
 * More retries with longer delays for critical operations.
 */
export const aggressiveRetryPolicy = new RetryPolicy({
  maxRetries: 5,
  baseDelayMs: 2000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  timeoutMs: 120000,
});

/**
 * Conservative Retry Policy
 * 
 * Fewer retries with shorter delays for non-critical operations.
 */
export const conservativeRetryPolicy = new RetryPolicy({
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 1.5,
  timeoutMs: 30000,
});

/**
 * No Retry Policy
 * 
 * Disables retries (useful for testing or when retries are handled elsewhere).
 */
export const noRetryPolicy = new RetryPolicy({
  maxRetries: 0,
  baseDelayMs: 0,
  maxDelayMs: 0,
  timeoutMs: 30000,
});

