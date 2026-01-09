/**
 * Adapter Runtime Layer
 * 
 * Provides robust execution layer for marketplace adapters.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Wraps adapter operations (does not modify adapters)
 * - Handles retries, timeouts, and error transformation
 * - Prepares for job-based execution
 * 
 * Structure:
 * - adapter-executor.ts - Main executor that wraps adapter calls
 * - retry-policy.ts - Retry policy configuration and logic
 * - adapter-errors.ts - Custom error types for adapter operations
 * - adapter-context.ts - Context object for adapter execution
 * 
 * Usage:
 * ```ts
 * import { AdapterExecutor, defaultRetryPolicy, createAdapterContext } from './infrastructure/adapters/runtime/index.js';
 * 
 * const context = createAdapterContext(marketplaceType, companyId, integrationId, credentials);
 * const executor = new AdapterExecutor(defaultRetryPolicy, context);
 * 
 * const result = await executor.testConnection(adapter);
 * ```
 * 
 * Future Enhancements:
 * - Token refresh hooks
 * - Job queue integration for long-running operations
 * - Circuit breaker pattern
 * - Metrics and logging
 * - Distributed tracing
 */

// Adapter Executor
export { AdapterExecutor, ExecutionResult, ExecutionOptions } from './adapter-executor.js';

// Retry Policy
export {
  RetryPolicy,
  RetryPolicyConfig,
  defaultRetryPolicy,
  aggressiveRetryPolicy,
  conservativeRetryPolicy,
  noRetryPolicy,
} from './retry-policy.js';

// Adapter Errors
export {
  AdapterError,
  RetryableAdapterError,
  NonRetryableAdapterError,
  AdapterTimeoutError,
  AdapterRateLimitError,
  AdapterAuthenticationError,
  isRetryableError,
} from './adapter-errors.js';

// Adapter Context
export {
  AdapterContext,
  createAdapterContext,
  validateAdapterContext,
} from './adapter-context.js';

