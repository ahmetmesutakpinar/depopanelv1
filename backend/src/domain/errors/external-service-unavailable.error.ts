/**
 * External Service Unavailable Error
 * 
 * Represents an error when an external service (marketplace API) is unavailable.
 * This is a domain-level error that can be retried.
 */

import { DomainError } from './domain-error.js';

export class ExternalServiceUnavailableError extends DomainError {
  constructor(
    message: string,
    public readonly serviceName: string,
    context?: Record<string, unknown>
  ) {
    super(
      message || `External service ${serviceName} is currently unavailable`,
      'EXTERNAL_SERVICE_UNAVAILABLE',
      {
        serviceName,
        ...context,
      }
    );
    this.name = 'ExternalServiceUnavailableError';
  }
}

