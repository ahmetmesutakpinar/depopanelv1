import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { sendValidationError } from '../utils/response.js';

/**
 * Request body validation middleware
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      sendValidationError(res, errors);
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Request params validation middleware
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const errors = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      sendValidationError(res, errors);
      return;
    }

    req.params = result.data as any;
    next();
  };
}

/**
 * Request query validation middleware
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      sendValidationError(res, errors);
      return;
    }

    req.query = result.data as any;
    next();
  };
}

// ==================== COMMON SCHEMAS ====================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(1000).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid('Geçersiz ID formatı'),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;
export type UuidParam = z.infer<typeof uuidParamSchema>;

