import { Request } from 'express';

/**
 * AppRequest - Extended Express Request with required context
 * 
 * This type is used for authenticated requests where context is guaranteed
 * to be set by the authentication middleware.
 */
export interface AppRequest extends Request {
  context: {
    userId: string;
    companyId: string;
    role: string;
    permissions?: string[];
  };
}
