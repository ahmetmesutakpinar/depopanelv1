import 'express';

/**
 * Extended Express Request interface
 * Adds context for authenticated requests
 * Context is optional at the Express level, but required in AppRequest
 */
declare global {
  namespace Express {
    interface Request {
      context?: {
        userId?: string;
        companyId?: string;
        role?: string;
        permissions?: string[];
      };
    }
  }
}

export {};

