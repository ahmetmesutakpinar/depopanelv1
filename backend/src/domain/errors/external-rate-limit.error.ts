/**
 * External Rate Limit Error
 * 
 * Represents an error when an external service rate limit is exceeded.
 * This is a retryable error with a specific retry-after time.
 */

import { DomainError } from './domain-error.js';

export class ExternalRateLimitError extends DomainError {
  constructor(
    message: string,
    public readonly serviceName: string,
    public readonly retryAfterMs?: number,
    context?: Record<string, unknown>
  ) {
    super(
      message || `Rate limit exceeded for external service ${serviceName}`,
      'EXTERNAL_RATE_LIMIT_ERROR',
      {
        serviceName,
        retryAfterMs,
        ...context,
      }
    );
    this.name = 'ExternalRateLimitError';
  }
}

