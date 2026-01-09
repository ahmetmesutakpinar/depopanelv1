/**
 * Domain Errors
 * 
 * Domain-specific error classes that represent business rule violations.
 * 
 * Errors should be:
 * - Descriptive
 * - Include relevant context
 * - Be catchable by type
 * - Have error codes for programmatic handling
 */

export { DomainError } from './domain-error.js';
export { InvalidStateError } from './invalid-state-error.js';
export { BusinessRuleViolation } from './business-rule-violation.js';
export { ExternalServiceUnavailableError } from './external-service-unavailable.error.js';
export { ExternalAuthenticationError } from './external-authentication.error.js';
export { ExternalRateLimitError } from './external-rate-limit.error.js';
export { UnauthorizedError } from './unauthorized.error.js';
export { ForbiddenError } from './forbidden.error.js';
