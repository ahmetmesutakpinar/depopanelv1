/**
 * Health and Readiness Endpoints
 * 
 * System health checks for deployment, monitoring, and orchestration.
 * 
 * Architecture:
 * - Interface layer only
 * - No business logic
 * - Fast execution
 * - No authentication required
 * 
 * Endpoints:
 * - GET /health - Basic health check (no dependencies)
 * - GET /ready - Readiness check (all dependencies)
 * 
 * Usage:
 * ```ts
 * import { createHealthRoutes } from './interfaces/http/health/index.js';
 * 
 * const healthRouter = createHealthRoutes();
 * app.use('/', healthRouter);
 * ```
 */

import { Router } from 'express';
import { healthController } from './health.controller.js';
import { readinessController } from './readiness.controller.js';

// Services
export {
  HealthService,
  healthService,
  type HealthCheckResult,
  type ReadinessCheckResult,
} from './health.service.js';

// Controllers
export {
  HealthController,
  healthController,
} from './health.controller.js';

export {
  ReadinessController,
  readinessController,
} from './readiness.controller.js';

/**
 * Create Health Routes
 * 
 * Sets up health and readiness endpoints.
 * 
 * @returns Express router with health endpoints
 */
export function createHealthRoutes(): Router {
  const router = Router();

  // Health endpoint (basic check)
  router.get('/health', healthController.check.bind(healthController));

  // Readiness endpoint (dependency checks)
  router.get('/ready', readinessController.check.bind(readinessController));

  return router;
}

