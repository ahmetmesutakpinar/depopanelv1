/**
 * Adapter Error Mapper
 * 
 * Maps infrastructure-level adapter errors to domain-level errors.
 * This keeps the application layer free from infrastructure error types.
 * 
 * Architecture:
 * - Application layer only
 * - Maps AdapterError to DomainError
 * - Preserves error context and metadata
 */

import {
  AdapterError,
  AdapterTimeoutError,
  AdapterAuthenticationError,
  AdapterRateLimitError,
  RetryableAdapterError,
} from '../../infrastructure/adapters/runtime/adapter-errors.js';
import {
  ExternalServiceUnavailableError,
  ExternalAuthenticationError,
  ExternalRateLimitError,
} from '../../domain/errors/index.js';

/**
 * Map adapter error to domain error
 * 
 * Converts infrastructure-level adapter errors to domain-level errors
 * that can be handled by the application layer.
 * 
 * @param error Adapter error to map
 * @returns Domain error
 */
export function mapAdapterErrorToDomainError(error: unknown): Error {
  // If already a domain error, return as-is
  if (error instanceof ExternalServiceUnavailableError ||
      error instanceof ExternalAuthenticationError ||
      error instanceof ExternalRateLimitError) {
    return error;
  }

  // Map adapter errors to domain errors
  if (error instanceof AdapterTimeoutError) {
    return new ExternalServiceUnavailableError(
      `Service ${error.adapterName} timed out after ${error.timeoutMs}ms`,
      error.adapterName,
      {
        operation: error.operation,
        timeoutMs: error.timeoutMs,
        metadata: error.metadata,
      }
    );
  }

  if (error instanceof AdapterAuthenticationError) {
    return new ExternalAuthenticationError(
      `Authentication failed for service ${error.adapterName}: ${error.message}`,
      error.adapterName,
      error.canRefresh ?? false,
      {
        operation: error.operation,
        metadata: error.metadata,
      }
    );
  }

  if (error instanceof AdapterRateLimitError) {
    return new ExternalRateLimitError(
      `Rate limit exceeded for service ${error.adapterName}: ${error.message}`,
      error.adapterName,
      error.retryAfterMs,
      {
        operation: error.operation,
        metadata: error.metadata,
      }
    );
  }

  if (error instanceof RetryableAdapterError) {
    return new ExternalServiceUnavailableError(
      `Service ${error.adapterName} is temporarily unavailable: ${error.message}`,
      error.adapterName,
      {
        operation: error.operation,
        retryAfterMs: error.retryAfterMs,
        metadata: error.metadata,
      }
    );
  }

  if (error instanceof AdapterError) {
    // Generic adapter error - map to service unavailable
    return new ExternalServiceUnavailableError(
      `Service ${error.adapterName} error: ${error.message}`,
      error.adapterName,
      {
        operation: error.operation,
        metadata: error.metadata,
      }
    );
  }

  // Unknown error - wrap in generic domain error
  if (error instanceof Error) {
    return new ExternalServiceUnavailableError(
      error.message,
      'unknown',
      {
        originalError: error.name,
      }
    );
  }

  // Fallback for non-Error types
  return new ExternalServiceUnavailableError(
    String(error),
    'unknown'
  );
}

