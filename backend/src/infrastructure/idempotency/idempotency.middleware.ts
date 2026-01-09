/**
 * Idempotency Middleware
 * 
 * Express middleware for HTTP request idempotency.
 * 
 * Architecture:
 * - Interface layer only
 * - Reads Idempotency-Key header
 * - Stores and retrieves responses
 * - No business logic
 * 
 * Usage:
 * ```ts
 * import { idempotencyMiddleware } from './infrastructure/idempotency/index.js';
 * 
 * router.post('/endpoint', idempotencyMiddleware, controller.method);
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import { idempotencyService } from './idempotency.service.js';
import { logger } from '../observability/logger.js';
import { metrics } from '../observability/metrics.js';

/**
 * Extended Request with Idempotency
 */
export interface IdempotentRequest extends Request {
  /**
   * Idempotency key (if present)
   */
  idempotencyKey?: string;
}

/**
 * Idempotency Middleware
 * 
 * Handles Idempotency-Key header for POST/PUT requests.
 * 
 * NOTE: This middleware attaches the idempotency key to the request.
 * Controllers should use idempotencyService.execute() to wrap their operations.
 * 
 * For automatic idempotency handling, use idempotencyWrapper() instead.
 */
export function idempotencyMiddleware(
  req: IdempotentRequest,
  res: Response,
  next: NextFunction
): void {
  // Only apply to POST, PUT, PATCH requests
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    next();
    return;
  }

  // Extract idempotency key from header
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (idempotencyKey && idempotencyKey.trim().length > 0) {
    // Attach to request for use in controllers
    req.idempotencyKey = idempotencyKey.trim();
    
    logger.debug('Idempotency key found in request', {
      key: req.idempotencyKey,
      path: req.path,
      method: req.method,
    });
  }

  next();
}

/**
 * Idempotency Wrapper
 * 
 * Wraps a request handler with idempotency protection.
 * Use this for automatic idempotency handling.
 * 
 * @param handler Request handler to wrap
 * @returns Wrapped handler with idempotency
 */
export function idempotencyWrapper(
  handler: (req: IdempotentRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return async (req: IdempotentRequest, res: Response, next: NextFunction): Promise<void> => {
    // Only apply to POST, PUT, PATCH requests
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return handler(req, res, next);
    }

    // Extract idempotency key
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      // No idempotency key - execute normally
      return handler(req, res, next);
    }

    const key = idempotencyKey.trim();
    req.idempotencyKey = key;

    try {
      // Execute handler with idempotency
      await idempotencyService.execute(
        key,
        async () => {
          // Capture response
          let responseBody: any = null;
          let responseStatusCode: number = 200;

          // Store original methods
          const originalJson = res.json.bind(res);
          const originalSend = res.send.bind(res);

          // Override to capture response
          res.json = function (body: any): Response {
            responseBody = body;
            responseStatusCode = res.statusCode || 200;
            return originalJson(body);
          };

          res.send = function (body: any): Response {
            responseBody = body;
            responseStatusCode = res.statusCode || 200;
            return originalSend(body);
          };

          // Execute handler
          await handler(req, res, next);

          // Return captured response for storage
          return {
            statusCode: responseStatusCode,
            body: responseBody,
          };
        },
        {
          ttlSeconds: 3600, // 1 hour
          lockTimeoutSeconds: 300, // 5 minutes
        }
      );
    } catch (error) {
      // If operation is in progress, return 409 Conflict
      if (error instanceof Error && error.message.includes('already in progress')) {
        logger.warn('Idempotency wrapper: operation in progress', {
          key,
          path: req.path,
        });
        metrics.increment('idempotency.middleware.conflict', {
          method: req.method,
          path: req.path,
        });

        res.status(409).json({
          success: false,
          error: {
            code: 'OPERATION_IN_PROGRESS',
            message: 'An operation with this idempotency key is already in progress',
          },
        });
        return;
      }

      // Other errors - pass to error handler
      next(error);
    }
  };
}

