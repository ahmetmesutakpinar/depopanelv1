/**
 * Security Infrastructure
 * 
 * Authentication and authorization for the application.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Framework-agnostic (except middleware which is Express-specific)
 * - Integrates with observability context
 * - Uses domain errors
 * - No business logic
 * - No Prisma imports
 * 
 * Components:
 * - auth/ - Authentication (JWT, API Key)
 * - authorization/ - Authorization guards (Role, Company, Permission)
 * - types.ts - Type definitions
 * 
 * Usage:
 * ```ts
 * import {
 *   jwtMiddleware,
 *   apiKeyMiddleware,
 *   ensureRole,
 *   ensureCompanyAccess,
 *   ensurePermission,
 * } from './infrastructure/security/index.js';
 * 
 * // In routes
 * router.use(jwtMiddleware);
 * router.get('/admin', (req, res, next) => {
 *   ensureRole('ADMIN', 'SUPER_ADMIN');
 *   next();
 * }, controller.method);
 * 
 * // In controllers
 * export class ProductController {
 *   async update(req, res) {
 *     ensureCompanyAccess(req.body.companyId);
 *     ensurePermission('products:write');
 *     // ... controller logic
 *   }
 * }
 * ```
 */

// Types
export {
  type JwtPayload,
  type AuthContext,
  type ApiKeyInfo,
} from './types.js';

// JWT Service
export {
  JwtService,
  jwtService,
} from './auth/jwt.service.js';

// JWT Middleware
export {
  jwtMiddleware,
  type AuthenticatedRequest,
} from './auth/jwt.middleware.js';

// API Key Middleware
export {
  apiKeyMiddleware,
  type ApiKeyAuthenticatedRequest,
} from './auth/api-key.middleware.js';

// Authorization Guards
export { ensureRole } from './authorization/role.guard.js';
export { ensureCompanyAccess } from './authorization/company.guard.js';
export { ensurePermission } from './authorization/permission.guard.js';

