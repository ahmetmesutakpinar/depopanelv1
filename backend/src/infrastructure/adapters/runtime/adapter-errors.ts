/**
 * Adapter Error Types
 * 
 * Custom error types for marketplace adapter operations.
 * These errors provide context about adapter failures and help with retry decisions.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - No business logic
 * - Used by adapter executor for error handling
 */

/**
 * Base Adapter Error
 * 
 * All adapter-related errors extend this base class.
 */
export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly adapterName: string,
    public readonly operation: string,
    public readonly originalError?: unknown,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AdapterError';
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AdapterError);
    }
  }

  /**
   * Get error details as a plain object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      adapterName: this.adapterName,
      operation: this.operation,
      originalError: this.originalError instanceof Error
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : this.originalError,
      metadata: this.metadata,
    };
  }
}

/**
 * Retryable Adapter Error
 * 
 * Indicates that the error is transient and the operation can be retried.
 * Examples: network timeouts, rate limits, temporary service unavailability
 */
export class RetryableAdapterError extends AdapterError {
  constructor(
    message: string,
    adapterName: string,
    operation: string,
    originalError?: unknown,
    metadata?: Record<string, unknown>,
    public readonly retryAfterMs?: number
  ) {
    super(message, adapterName, operation, originalError, metadata);
    this.name = 'RetryableAdapterError';
  }
}

/**
 * Non-Retryable Adapter Error
 * 
 * Indicates that the error is permanent and retrying will not help.
 * Examples: authentication failures, invalid credentials, malformed requests
 */
export class NonRetryableAdapterError extends AdapterError {
  constructor(
    message: string,
    adapterName: string,
    operation: string,
    originalError?: unknown,
    metadata?: Record<string, unknown>
  ) {
    super(message, adapterName, operation, originalError, metadata);
    this.name = 'NonRetryableAdapterError';
  }
}

/**
 * Adapter Timeout Error
 * 
 * Indicates that the adapter operation timed out.
 * This is always retryable.
 */
export class AdapterTimeoutError extends RetryableAdapterError {
  constructor(
    message: string,
    adapterName: string,
    operation: string,
    public readonly timeoutMs: number,
    originalError?: unknown,
    metadata?: Record<string, unknown>
  ) {
    super(
      message || `Adapter operation timed out after ${timeoutMs}ms`,
      adapterName,
      operation,
      originalError,
      metadata
    );
    this.name = 'AdapterTimeoutError';
  }
}

/**
 * Adapter Rate Limit Error
 * 
 * Indicates that the adapter operation was rate limited.
 * This is retryable, and includes retry-after information.
 */
export class AdapterRateLimitError extends RetryableAdapterError {
  constructor(
    message: string,
    adapterName: string,
    operation: string,
    public readonly retryAfterMs: number,
    originalError?: unknown,
    metadata?: Record<string, unknown>
  ) {
    super(
      message || `Adapter rate limit exceeded. Retry after ${retryAfterMs}ms`,
      adapterName,
      operation,
      originalError,
      metadata,
      retryAfterMs
    );
    this.name = 'AdapterRateLimitError';
  }
}

/**
 * Adapter Authentication Error
 * 
 * Indicates that the adapter authentication failed.
 * This is typically non-retryable unless credentials can be refreshed.
 */
export class AdapterAuthenticationError extends NonRetryableAdapterError {
  constructor(
    message: string,
    adapterName: string,
    operation: string,
    originalError?: unknown,
    metadata?: Record<string, unknown>,
    public readonly canRefresh?: boolean
  ) {
    super(message, adapterName, operation, originalError, metadata);
    this.name = 'AdapterAuthenticationError';
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableAdapterError) {
    return true;
  }
  if (error instanceof NonRetryableAdapterError) {
    return false;
  }
  if (error instanceof AdapterError) {
    return false; // Base adapter errors are not retryable by default
  }
  
  // Check common retryable error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    
    // Network errors
    if (name.includes('timeout') || name.includes('network') || name.includes('econnreset')) {
      return true;
    }
    
    // Rate limit errors
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return true;
    }
    
    // Service unavailable
    if (message.includes('service unavailable') || message.includes('503')) {
      return true;
    }
    
    // Authentication errors are typically not retryable
    if (name.includes('auth') || message.includes('unauthorized') || message.includes('401')) {
      return false;
    }
  }
  
  // Default to non-retryable for unknown errors
  return false;
}

