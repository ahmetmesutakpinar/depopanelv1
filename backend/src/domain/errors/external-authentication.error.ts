/**
 * External Authentication Error
 * 
 * Represents an error when authentication with an external service fails.
 * This is typically a non-retryable error unless credentials can be refreshed.
 */

import { DomainError } from './domain-error.js';

export class ExternalAuthenticationError extends DomainError {
  constructor(
    message: string,
    public readonly serviceName: string,
    public readonly canRefresh: boolean = false,
    context?: Record<string, unknown>
  ) {
    super(
      message || `Authentication failed for external service ${serviceName}`,
      'EXTERNAL_AUTHENTICATION_ERROR',
      {
        serviceName,
        canRefresh,
        ...context,
      }
    );
    this.name = 'ExternalAuthenticationError';
  }
}

