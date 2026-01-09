/**
 * Permission Guard
 * 
 * Authorization guard for permission-based access control.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Reads context (not request directly)
 * - Throws domain errors
 * - No business logic
 * 
 * Usage:
 * ```ts
 * import { ensurePermission } from './infrastructure/security/index.js';
 * 
 * // In controller or middleware
 * ensurePermission('products:write');
 * ```
 */

import { getContext } from '../../observability/context.js';
import { ForbiddenError } from '../../../domain/errors/forbidden.error.js';
import { logger } from '../../observability/logger.js';

/**
 * Ensure User Has Required Permission
 * 
 * Checks if the current user (from context) has the required permission.
 * Admins and super admins have all permissions.
 * 
 * @param permissionName Required permission name
 * @throws ForbiddenError if user lacks required permission
 */
export function ensurePermission(permissionName: string): void {
  const context = getContext();

  if (!context?.userId) {
    throw new ForbiddenError('Authentication required');
  }

  // Get role from context metadata
  const userRole = context.metadata?.role as string | undefined;

  if (!userRole) {
    logger.warn('Permission guard failed: role not found in context', {
      userId: context.userId,
    });
    throw new ForbiddenError('User role not found');
  }

  // Admins and super admins have all permissions
  if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
    return;
  }

  // Get permissions from context metadata
  const permissions = context.metadata?.permissions as string[] | undefined;

  if (!permissions || !Array.isArray(permissions)) {
    logger.warn('Permission guard failed: permissions not found in context', {
      userId: context.userId,
      userRole,
    });
    throw new ForbiddenError('User permissions not found');
  }

  if (!permissions.includes(permissionName)) {
    logger.warn('Permission guard failed: insufficient permissions', {
      userId: context.userId,
      userRole,
      requiredPermission: permissionName,
      userPermissions: permissions,
    });
    throw new ForbiddenError(
      `Access denied. Required permission: ${permissionName}`
    );
  }
}

