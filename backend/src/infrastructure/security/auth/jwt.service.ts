/**
 * JWT Service
 * 
 * JWT token operations (sign, verify, decode).
 * 
 * Architecture:
 * - Infrastructure layer only
 * - No business logic
 * - Framework-agnostic
 * 
 * Usage:
 * ```ts
 * const token = jwtService.sign({ userId: '...', companyId: '...', role: 'ADMIN' });
 * const payload = jwtService.verify(token);
 * ```
 */

import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';
import { JwtPayload } from '../types.js';
import { UnauthorizedError } from '../../../domain/errors/unauthorized.error.js';

/**
 * JWT Service
 * 
 * Handles JWT token operations.
 */
export class JwtService {
  private readonly secret: string;
  private readonly expiresIn: string;

  constructor() {
    this.secret = env.JWT_SECRET;
    this.expiresIn = env.JWT_EXPIRES_IN;
  }

  /**
   * Sign JWT Token
   * 
   * Creates a new JWT token with the provided payload.
   * 
   * @param payload JWT payload
   * @returns Signed token
   */
  sign(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.secret, {
      expiresIn: this.expiresIn,
    });
  }

  /**
   * Verify JWT Token
   * 
   * Verifies and decodes a JWT token.
   * Throws UnauthorizedError if token is invalid or expired.
   * 
   * @param token JWT token to verify
   * @returns Decoded payload
   * @throws UnauthorizedError if token is invalid
   */
  verify(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.secret) as JwtPayload;

      if (!decoded.userId) {
        throw new UnauthorizedError('Token payload missing userId');
      }

      if (!decoded.companyId && decoded.role !== 'SUPER_ADMIN') {
        throw new UnauthorizedError('Token payload missing companyId');
      }

      return decoded;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired', {
          expiredAt: error.expiredAt,
        });
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token', {
          error: error.message,
        });
      }

      throw new UnauthorizedError('Token verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Decode JWT Token (without verification)
   * 
   * Decodes a JWT token without verifying its signature.
   * Use this only when you need to read an expired token.
   * 
   * @param token JWT token to decode
   * @returns Decoded payload or null if invalid
   */
  decode(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload | null;
    } catch {
      return null;
    }
  }
}

/**
 * Default JWT Service Instance
 */
export const jwtService = new JwtService();

