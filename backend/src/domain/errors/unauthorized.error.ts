/**
 * Unauthorized Error
 * 
 * Thrown when authentication fails or is missing.
 * Maps to HTTP 401.
 */

import { DomainError } from './domain-error.js';

export class UnauthorizedError extends DomainError {
  constructor(
    message: string = 'Authentication required',
    context?: Record<string, unknown>
  ) {
    super(message, 'UNAUTHORIZED', context);
    this.name = 'UnauthorizedError';
  }
}

