/**
 * Role Guard
 * 
 * Authorization guard for role-based access control.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Reads context (not request directly)
 * - Throws domain errors
 * - No business logic
 * 
 * Usage:
 * ```ts
 * import { ensureRole } from './infrastructure/security/index.js';
 * 
 * // In controller or middleware
 * ensureRole('ADMIN', 'SUPER_ADMIN');
 * ```
 */

import { UserRole } from '@prisma/client';
import { getContext } from '../../observability/context.js';
import { ForbiddenError } from '../../../domain/errors/forbidden.error.js';
import { logger } from '../../observability/logger.js';

/**
 * Ensure User Has Required Role
 * 
 * Checks if the current user (from context) has one of the required roles.
 * Throws ForbiddenError if user lacks required role.
 * 
 * @param roles Required roles (user must have at least one)
 * @throws ForbiddenError if user lacks required role
 */
export function ensureRole(...roles: UserRole[]): void {
  const context = getContext();

  if (!context?.userId) {
    throw new ForbiddenError('Authentication required');
  }

  // Get role from context metadata
  const userRole = context.metadata?.role as UserRole | undefined;

  if (!userRole) {
    logger.warn('Role guard failed: role not found in context', {
      userId: context.userId,
    });
    throw new ForbiddenError('User role not found');
  }

  if (!roles.includes(userRole)) {
    logger.warn('Role guard failed: insufficient permissions', {
      userId: context.userId,
      userRole,
      requiredRoles: roles,
    });
    throw new ForbiddenError(
      `Access denied. Required roles: ${roles.join(', ')}, Your role: ${userRole}`
    );
  }
}

