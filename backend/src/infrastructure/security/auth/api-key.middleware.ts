/**
 * API Key Authentication Middleware
 * 
 * Express middleware for API key authentication.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Reads X-API-Key header
 * - Validates API key (mock for now)
 * - Attaches auth context with system role
 * - Used for integrations and webhooks
 * 
 * Usage:
 * ```ts
 * import { apiKeyMiddleware } from './infrastructure/security/index.js';
 * router.use(apiKeyMiddleware);
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import { AuthContext } from '../types.js';
import { UnauthorizedError } from '../../../domain/errors/unauthorized.error.js';
import { runWithContext, getContext } from '../../observability/context.js';
import { logger } from '../../observability/logger.js';
import { sendErrorResponse } from '../../../interfaces/http/error-mapper.js';
import { ApiKeyInfo } from '../types.js';

/**
 * Extended Request with Auth Context
 */
export interface ApiKeyAuthenticatedRequest extends Request {
  /**
   * Authentication context
   */
  auth?: AuthContext;
}

/**
 * API Key Store (Mock)
 * 
 * TODO: Replace with repository when persistence is added
 * This should query from database or cache.
 */
class ApiKeyStore {
  /**
   * Validate API Key
   * 
   * TODO: Implement actual validation against database
   * For now, this is a mock that accepts any key starting with "sk_"
   * 
   * @param apiKey API key to validate
   * @returns API key info or null if invalid
   */
  async validate(apiKey: string): Promise<ApiKeyInfo | null> {
    // Mock validation - accept keys starting with "sk_"
    // TODO: Replace with actual database lookup
    if (!apiKey || !apiKey.startsWith('sk_')) {
      return null;
    }

    // Mock API key info
    // TODO: Fetch from database using repository
    return {
      id: 'mock-key-id',
      companyId: 'mock-company-id', // TODO: Get from database
      name: 'Mock API Key',
      hashedKey: apiKey, // TODO: Hash comparison
      isActive: true,
      permissions: ['api:read', 'api:write'], // TODO: Get from database
    };
  }
}

const apiKeyStore = new ApiKeyStore();

/**
 * API Key Authentication Middleware
 * 
 * Reads X-API-Key header, validates key, and attaches auth context.
 */
export async function apiKeyMiddleware(
  req: ApiKeyAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Extract API key from header
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey || apiKey.trim().length === 0) {
    logger.warn('API key authentication failed: missing key', {
      path: req.path,
      method: req.method,
    });
    sendErrorResponse(res, new UnauthorizedError('API key required'));
    return;
  }

  try {
    // Validate API key
    const keyInfo = await apiKeyStore.validate(apiKey);

    if (!keyInfo) {
      logger.warn('API key authentication failed: invalid key', {
        path: req.path,
        method: req.method,
      });
      sendErrorResponse(res, new UnauthorizedError('Invalid API key'));
      return;
    }

    if (!keyInfo.isActive) {
      logger.warn('API key authentication failed: inactive key', {
        path: req.path,
        method: req.method,
        keyId: keyInfo.id,
      });
      sendErrorResponse(res, new UnauthorizedError('API key is inactive'));
      return;
    }

    // Check expiration
    if (keyInfo.expiresAt && keyInfo.expiresAt < new Date()) {
      logger.warn('API key authentication failed: expired key', {
        path: req.path,
        method: req.method,
        keyId: keyInfo.id,
      });
      sendErrorResponse(res, new UnauthorizedError('API key has expired'));
      return;
    }

    // Create auth context with system role
    const authContext: AuthContext = {
      userId: `api-key-${keyInfo.id}`, // System user ID for API keys
      companyId: keyInfo.companyId,
      role: 'SYSTEM' as any, // TODO: Define SYSTEM role in UserRole enum
      permissions: keyInfo.permissions,
      authMethod: 'api-key',
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
          apiKeyId: keyInfo.id,
        },
      },
      () => {
        next();
      }
    );
  } catch (error) {
    logger.error('API key authentication error', error, {
      path: req.path,
      method: req.method,
    });
    sendErrorResponse(res, new UnauthorizedError('API key authentication failed'));
  }
}

