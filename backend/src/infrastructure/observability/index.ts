/**
 * Observability Infrastructure
 * 
 * Production-grade observability for the application.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Structured logging with context propagation
 * - Metrics collection hooks
 * - Request/job correlation
 * - Error tracing
 * 
 * Components:
 * - logger.ts - Structured logging (pino-based)
 * - context.ts - Context propagation (AsyncLocalStorage)
 * - metrics.ts - Metrics hooks (abstraction)
 * 
 * Usage:
 * ```ts
 * import { logger, metrics, runWithContext, generateRequestId } from './infrastructure/observability/index.js';
 * 
 * // In HTTP middleware
 * runWithContext({ requestId: generateRequestId() }, async () => {
 *   logger.info('Request started');
 *   metrics.increment('http.request');
 * });
 * 
 * // In job processor
 * runWithContext({ jobId: job.id, companyId: job.data.companyId }, async () => {
 *   logger.info('Job started');
 *   metrics.increment('job.started');
 * });
 * 
 * // In adapter executor
 * const startTime = Date.now();
 * logger.info('Adapter operation started', { operation: 'syncOrders' });
 * // ... execute operation
 * const duration = Date.now() - startTime;
 * metrics.timing('adapter.execution', duration, { operation: 'syncOrders' });
 * logger.info('Adapter operation completed', { operation: 'syncOrders', duration });
 * ```
 * 
 * NOTE: pino must be installed for structured logging:
 * npm install pino
 * 
 * After installation, remove @ts-ignore comments in logger.ts
 */

// Logger
export {
  logger,
  createLogger,
  type Logger,
  type LogContext,
} from './logger.js';

// Context
export {
  runWithContext,
  getContext,
  updateContext,
  createChildContext,
  generateRequestId,
  generateJobId,
  type ObservabilityContext,
} from './context.js';

// Metrics
export {
  metrics,
  type Metrics,
  type MetricLabels,
} from './metrics.js';

// Middleware
export { observabilityMiddleware } from './middleware.js';

// Job Context
export {
  withJobContext,
  type JobContextData,
} from './job-context.js';

