/**
 * Observability Middleware
 * 
 * Express middleware for request context propagation and logging.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Creates request context
 * - Logs request start/end
 * - Records metrics
 * 
 * Usage:
 * ```ts
 * import { observabilityMiddleware } from './infrastructure/observability/middleware.js';
 * app.use(observabilityMiddleware);
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import { runWithContext, generateRequestId, getContext } from './context.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

/**
 * Observability Middleware
 * 
 * Creates request context and logs request lifecycle.
 */
export function observabilityMiddleware(
  req: Request | AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Extract context from request
  const companyId = 'context' in req && req.context?.companyId ? req.context.companyId : undefined;
  const userId = 'context' in req && req.context?.userId ? req.context.userId : undefined;
  const marketplace = req.headers['x-marketplace'] as string | undefined;

  // Create request context
  const context = {
    requestId,
    companyId,
    userId,
    marketplace,
    metadata: {
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.socket.remoteAddress,
    },
  };

  // Run request within context
  runWithContext(context, () => {
    // Log request start
    logger.info('HTTP request started', {
      method: req.method,
      path: req.path,
    });

    // Record metrics
    metrics.increment('http.request', {
      method: req.method,
      path: req.path,
    });

    // Track response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Log request end
      logger.info('HTTP request completed', {
        method: req.method,
        path: req.path,
        statusCode,
        duration,
      });

      // Record metrics
      metrics.timing('http.request.duration', duration, {
        method: req.method,
        path: req.path,
        statusCode: String(statusCode),
      });

      metrics.increment('http.response', {
        method: req.method,
        path: req.path,
        statusCode: String(statusCode),
      });

      // Log errors for 5xx status codes
      if (statusCode >= 500) {
        logger.error('HTTP request failed', undefined, {
          method: req.method,
          path: req.path,
          statusCode,
          duration,
        });

        metrics.increment('http.error', {
          method: req.method,
          path: req.path,
          statusCode: String(statusCode),
        });
      }
    });

    next();
  });
}

