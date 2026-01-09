/**
 * Company Guard
 * 
 * Authorization guard for company-level access control.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Reads context (not request directly)
 * - Throws domain errors
 * - No business logic
 * 
 * Usage:
 * ```ts
 * import { ensureCompanyAccess } from './infrastructure/security/index.js';
 * 
 * // In controller or middleware
 * ensureCompanyAccess(resourceCompanyId);
 * ```
 */

import { getContext } from '../../observability/context.js';
import { ForbiddenError } from '../../../domain/errors/forbidden.error.js';
import { logger } from '../../observability/logger.js';

/**
 * Ensure User Has Access to Company
 * 
 * Checks if the current user (from context) has access to the specified company.
 * Super admins have access to all companies.
 * Other users can only access their own company.
 * 
 * @param resourceCompanyId Company ID of the resource being accessed
 * @throws ForbiddenError if user lacks access to company
 */
export function ensureCompanyAccess(resourceCompanyId: string): void {
  const context = getContext();

  if (!context?.userId) {
    throw new ForbiddenError('Authentication required');
  }

  if (!context.companyId) {
    logger.warn('Company guard failed: companyId not found in context', {
      userId: context.userId,
    });
    throw new ForbiddenError('User company not found');
  }

  // Get role from context metadata
  const userRole = context.metadata?.role as string | undefined;

  // Super admin has access to all companies
  if (userRole === 'SUPER_ADMIN') {
    return;
  }

  // Other users can only access their own company
  if (context.companyId !== resourceCompanyId) {
    logger.warn('Company guard failed: company access denied', {
      userId: context.userId,
      userCompanyId: context.companyId,
      resourceCompanyId,
    });
    throw new ForbiddenError('Access denied to this company');
  }
}

