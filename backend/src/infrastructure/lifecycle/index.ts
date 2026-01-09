/**
 * Application Lifecycle Management
 * 
 * Handles application startup and shutdown.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Coordinates resource lifecycle
 * - Graceful shutdown handling
 * 
 * Components:
 * - shutdown.ts - Graceful shutdown handler
 * 
 * Usage:
 * ```ts
 * import { setupGracefulShutdown } from './infrastructure/lifecycle/index.js';
 * 
 * const server = app.listen(port);
 * setupGracefulShutdown(server, workers);
 * ```
 */

export {
  setupGracefulShutdown,
  shutdown,
  registerWorkers,
  isShuttingDownState,
} from './shutdown.js';

