/**
 * Forbidden Error
 * 
 * Thrown when authorization fails (user lacks required permissions).
 * Maps to HTTP 403.
 */

import { DomainError } from './domain-error.js';

export class ForbiddenError extends DomainError {
  constructor(
    message: string = 'Access forbidden',
    context?: Record<string, unknown>
  ) {
    super(message, 'FORBIDDEN', context);
    this.name = 'ForbiddenError';
  }
}

