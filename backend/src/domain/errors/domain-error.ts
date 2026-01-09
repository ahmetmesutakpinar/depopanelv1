/**
 * DomainError Base Class
 * 
 * Base class for all domain-specific errors.
 * Domain errors represent business rule violations.
 * 
 * TODO: Add error code system
 * TODO: Add error metadata
 * TODO: Add error serialization
 */

export class DomainError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(message: string, code: string = 'DOMAIN_ERROR', context?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.context = context;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DomainError);
    }
  }
}

