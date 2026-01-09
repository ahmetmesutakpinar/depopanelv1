/**
 * Integration Disabled Error
 * 
 * Thrown when API integration functionality is disabled.
 * This is used during v3.1 hard reset to prevent any external API calls.
 * 
 * TODO: Remove this error class and all guards when re-adding integrations from scratch.
 */

export class IntegrationDisabledError extends Error {
  constructor(message?: string) {
    super(
      message ||
      'API integrations disabled in v3.1 reset mode. WooCommerce will be re-added from scratch.'
    );
    this.name = 'IntegrationDisabledError';
    
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, IntegrationDisabledError);
    }
  }
}


