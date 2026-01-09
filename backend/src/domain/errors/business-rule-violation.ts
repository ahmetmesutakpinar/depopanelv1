/**
 * BusinessRuleViolation
 * 
 * Thrown when a business rule is violated.
 * 
 * Example: Trying to create an order with negative quantity.
 * 
 * TODO: Add rule validation helpers
 */

import { DomainError } from './domain-error.js';

export class BusinessRuleViolation extends DomainError {
  constructor(message: string, ruleName?: string, context?: Record<string, unknown>) {
    super(
      message,
      'BUSINESS_RULE_VIOLATION',
      { ruleName, ...context }
    );
    this.name = 'BusinessRuleViolation';
  }
}

