/**
 * InvalidStateError
 * 
 * Thrown when an entity is in an invalid state for the requested operation.
 * 
 * Example: Trying to ship an order that is not packed.
 * 
 * TODO: Add state validation helpers
 */

import { DomainError } from './domain-error.js';

export class InvalidStateError extends DomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INVALID_STATE', context);
    this.name = 'InvalidStateError';
  }
}

