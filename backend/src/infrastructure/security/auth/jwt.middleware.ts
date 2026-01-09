/**
 * JWT Authentication Middleware
 * 
 * Express middleware for JWT authentication.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Reads Authorization header
 * - Verifies JWT token
 * - Attaches auth context to request and observability context
 * - Throws domain errors
 * 
 * Usage:
 * ```ts
 * import { jwtMiddleware } from './infrastructure/security/index.js';
 * router.use(jwtMiddleware);
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import { jwtService } from './jwt.service.js';
import { AuthContext } from '../types.js';
import { UnauthorizedError } from '../../../domain/errors/unauthorized.error.js';
import { runWithContext, getContext } from '../../observability/context.js';
import { logger } from '../../observability/logger.js';
import { sendErrorResponse } from '../../../interfaces/http/error-mapper.js';

/**
 * Extended Request with Auth Context
 */
export interface AuthenticatedRequest extends Request {
  /**
   * Authentication context
   */
  auth?: AuthContext;
}

/**
 * JWT Authentication Middleware
 * 
 * Reads Authorization: Bearer <token> header, verifies token,
 * and attaches auth context to request and observability context.
 */
export function jwtMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('JWT authentication failed: missing token', {
      path: req.path,
      method: req.method,
    });
    sendErrorResponse(res, new UnauthorizedError('Authentication token required'));
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token || token.trim().length === 0) {
    logger.warn('JWT authentication failed: empty token', {
      path: req.path,
      method: req.method,
    });
    sendErrorResponse(res, new UnauthorizedError('Invalid token format'));
    return;
  }

  try {
    // Verify token
    const payload = jwtService.verify(token);

    // Create auth context
    const authContext: AuthContext = {
      userId: payload.userId,
      companyId: payload.companyId,
      role: payload.role,
      authMethod: 'jwt',
    };

    // Attach to request
    req.auth = authContext;

    // Get existing observability context or create new one
    const existingContext = getContext() || {};

    // Update observability context with auth info
    runWithContext(
      {
        ...existingContext,
        userId: authContext.userId,
        companyId: authContext.companyId,
        metadata: {
          ...(existingContext.metadata || {}),
          role: authContext.role,
          authMethod: authContext.authMethod,
        },
      },
      () => {
        next();
      }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      logger.warn('JWT authentication failed', {
        path: req.path,
        method: req.method,
        error: error.message,
      });
      sendErrorResponse(res, error);
      return;
    }

    logger.error('JWT authentication error', error, {
      path: req.path,
      method: req.method,
    });
    sendErrorResponse(res, new UnauthorizedError('Authentication failed'));
  }
}

