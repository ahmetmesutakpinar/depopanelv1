/**
 * Security Types
 * 
 * Type definitions for security layer.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Defines security-related types
 * - No business logic
 */

import { UserRole } from '@prisma/client';

/**
 * JWT Payload
 * 
 * Structure of JWT token payload.
 */
export interface JwtPayload {
  /**
   * User ID
   */
  userId: string;

  /**
   * Company ID (for multi-tenant isolation)
   */
  companyId: string;

  /**
   * User role
   */
  role: UserRole;

  /**
   * Token issued at (timestamp)
   */
  iat?: number;

  /**
   * Token expiration (timestamp)
   */
  exp?: number;
}

/**
 * Authentication Context
 * 
 * Context attached to request after authentication.
 */
export interface AuthContext {
  /**
   * User ID
   */
  userId: string;

  /**
   * Company ID
   */
  companyId: string;

  /**
   * User role
   */
  role: UserRole;

  /**
   * User permissions (optional)
   */
  permissions?: string[];

  /**
   * Authentication method (jwt, api-key)
   */
  authMethod: 'jwt' | 'api-key';
}

/**
 * API Key Info
 * 
 * Information about an API key.
 * 
 * TODO: Move to repository when persistence is added
 */
export interface ApiKeyInfo {
  /**
   * API key ID
   */
  id: string;

  /**
   * Company ID this key belongs to
   */
  companyId: string;

  /**
   * Key name/description
   */
  name: string;

  /**
   * Hashed key value
   */
  hashedKey: string;

  /**
   * Permissions granted to this key
   */
  permissions?: string[];

  /**
   * Whether key is active
   */
  isActive: boolean;

  /**
   * Expiration date (optional)
   */
  expiresAt?: Date;
}

