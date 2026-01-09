import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { ControllerMethod } from '../types/base.types.js';

/**
 * Base Controller class
 * Provides common functionality for all controllers
 */
export abstract class BaseController {
  /**
   * Wraps async controller methods with error handling
   * This is a property that returns the asyncHandler function
   */
  protected get asyncHandler() {
    return asyncHandler;
  }

  /**
   * Get company ID from authenticated request
   */
  protected getCompanyId(req: AuthenticatedRequest): string {
    return req.context.companyId;
  }

  /**
   * Get user ID from authenticated request
   */
  protected getUserId(req: AuthenticatedRequest): string {
    return req.context.userId;
  }

  /**
   * Get user role from authenticated request
   */
  protected getUserRole(req: AuthenticatedRequest): string {
    return req.context.role;
  }

  /**
   * Check if user has required role
   */
  protected hasRole(req: AuthenticatedRequest, ...roles: string[]): boolean {
    return roles.includes(req.context.role);
  }

  /**
   * Check if user is admin
   */
  protected isAdmin(req: AuthenticatedRequest): boolean {
    return this.hasRole(req, 'ADMIN', 'SUPER_ADMIN');
  }

  /**
   * Check if user is super admin
   */
  protected isSuperAdmin(req: AuthenticatedRequest): boolean {
    return req.context.role === 'SUPER_ADMIN';
  }
}

