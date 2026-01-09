/**
 * Request Context Helper
 * 
 * Extracts context information from authenticated requests.
 * 
 * Architecture:
 * - Interface layer only
 * - Provides type-safe access to request context
 * - Used by controllers to get companyId, userId, etc.
 */

import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

/**
 * Request Context
 * 
 * Extracted context from authenticated request.
 */
export interface RequestContext {
  companyId: string;
  userId: string;
  role: string;
  permissions?: string[];
}

/**
 * Extract Request Context
 * 
 * Gets context from authenticated request.
 * Throws error if context is missing (should not happen if middleware is correct).
 */
export function extractRequestContext(req: AuthenticatedRequest): RequestContext {
  const companyId = req.context?.companyId;
  const userId = req.context?.userId;
  const role = req.context?.role;

  if (!companyId || !userId || !role) {
    throw new Error('Request context is missing. Ensure authenticate middleware is applied.');
  }

  return {
    companyId,
    userId,
    role,
    permissions: req.context?.permissions,
  };
}

