import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware.js';
import crypto from 'crypto';

// Extend Request interface to include optional session
interface RequestWithSession extends Request {
  session?: {
    id?: string;
  };
}

// Store CSRF tokens in memory (in production, use Redis)
const csrfTokens = new Map<string, { token: string; expiresAt: number }>();

// Clean expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of csrfTokens.entries()) {
    if (value.expiresAt < now) {
      csrfTokens.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate CSRF token
 */
export function generateCsrfToken(req: RequestWithSession): string {
  const sessionId = (req as RequestWithSession).session?.id || req.ip || 'anonymous';
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

  csrfTokens.set(sessionId, { token, expiresAt });
  return token;
}

/**
 * Verify CSRF token
 */
export function verifyCsrfToken(req: RequestWithSession, token: string): boolean {
  const sessionId = (req as RequestWithSession).session?.id || req.ip || 'anonymous';
  const stored = csrfTokens.get(sessionId);

  if (!stored) {
    return false;
  }

  if (stored.expiresAt < Date.now()) {
    csrfTokens.delete(sessionId);
    return false;
  }

  return stored.token === token;
}

/**
 * CSRF protection middleware
 * Only applies to state-changing methods (POST, PUT, PATCH, DELETE)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for API routes that use JWT (they don't need CSRF)
  if (req.path.startsWith('/api/') && req.headers.authorization) {
    return next();
  }

  // Get token from header or body
  const token = req.headers['x-csrf-token'] as string || req.body?._csrf;

  if (!token) {
    throw new AppError('CSRF token gerekli', 403);
  }

  if (!verifyCsrfToken(req, token)) {
    throw new AppError('Geçersiz CSRF token', 403);
  }

  next();
}

/**
 * Middleware to add CSRF token to response
 */
export function csrfToken(req: Request, res: Response, next: NextFunction) {
  const token = generateCsrfToken(req);
  res.locals.csrfToken = token;
  res.setHeader('X-CSRF-Token', token);
  next();
}

