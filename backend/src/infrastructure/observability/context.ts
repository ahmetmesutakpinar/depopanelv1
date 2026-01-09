/**
 * Context Propagation
 * 
 * Provides request/job context propagation using AsyncLocalStorage.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Thread-local storage for context
 * - Used across HTTP, jobs, and adapters
 * - Enables correlation IDs and shared context
 * 
 * NOTE: AsyncLocalStorage requires Node.js 14+
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * Observability Context
 * 
 * Shared context for request/job correlation and tracing.
 */
export interface ObservabilityContext {
  /**
   * Request ID (for HTTP requests)
   */
  requestId?: string;

  /**
   * Job ID (for background jobs)
   */
  jobId?: string;

  /**
   * Company ID (for multi-tenant isolation)
   */
  companyId?: string;

  /**
   * Marketplace type (for marketplace operations)
   */
  marketplace?: string;

  /**
   * User ID (for user operations)
   */
  userId?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * AsyncLocalStorage instance for context propagation
 */
const contextStore = new AsyncLocalStorage<ObservabilityContext>();

/**
 * Run function with context
 * 
 * Executes a function within a context scope.
 * Context is automatically propagated to all async operations.
 * 
 * @param context Context to set
 * @param fn Function to execute
 * @returns Result of function execution
 */
export function runWithContext<T>(
  context: ObservabilityContext,
  fn: () => T | Promise<T>
): Promise<T> {
  return contextStore.run(context, fn);
}

/**
 * Get current context
 * 
 * Returns the current context from AsyncLocalStorage.
 * Returns undefined if no context is set.
 * 
 * @returns Current context or undefined
 */
export function getContext(): ObservabilityContext | undefined {
  return contextStore.getStore();
}

/**
 * Update context
 * 
 * Merges new values into the current context.
 * Creates a new context if none exists.
 * 
 * @param updates Context updates
 * @returns Updated context
 */
export function updateContext(updates: Partial<ObservabilityContext>): ObservabilityContext {
  const current = getContext() || {};
  const updated = { ...current, ...updates };
  
  // Update metadata
  if (updates.metadata || current.metadata) {
    updated.metadata = {
      ...(current.metadata || {}),
      ...(updates.metadata || {}),
    };
  }

  // Note: AsyncLocalStorage doesn't support updating the store directly
  // This function returns the updated context, but doesn't modify the store
  // To actually update, you need to run a new context scope
  return updated;
}

/**
 * Create child context
 * 
 * Creates a new context based on the current context with additional fields.
 * Useful for creating nested contexts (e.g., job within request).
 * 
 * @param additional Additional context fields
 * @returns Child context
 */
export function createChildContext(
  additional: Partial<ObservabilityContext>
): ObservabilityContext {
  const current = getContext() || {};
  return {
    ...current,
    ...additional,
    metadata: {
      ...(current.metadata || {}),
      ...(additional.metadata || {}),
    },
  };
}

/**
 * Generate Request ID
 * 
 * Generates a unique request ID for correlation.
 * 
 * @returns Request ID
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate Job ID
 * 
 * Generates a unique job ID for correlation.
 * 
 * @returns Job ID
 */
export function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

