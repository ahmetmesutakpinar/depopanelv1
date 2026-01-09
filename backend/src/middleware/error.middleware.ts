import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { sendError, sendValidationError, sendServerError } from '../utils/response.js';
import { AppError as AppErrorNew, ErrorCode } from '../utils/app-error.js';
import { AuthenticatedRequest } from './auth.middleware.js';

// Legacy exports for backward compatibility
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  errors?: any;
  code?: string;

  constructor(message: string, statusCode: number = 400, errors?: any, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Kayıt bulunamadı', code?: string) {
    super(message, 404, undefined, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Yetkisiz erişim') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Bu işlem için yetkiniz yok') {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Doğrulama hatası', errors?: any) {
    super(message, 422, errors);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Bu kayıt zaten mevcut') {
    super(message, 409);
  }
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request | AuthenticatedRequest,
  res: Response,
  _next: NextFunction
): void {
  // Determine if this is a 500 error (server error)
  const isServerError = !(err instanceof ZodError) &&
    !(err instanceof AppErrorNew) &&
    !(err instanceof AppError) &&
    !(err instanceof Prisma.PrismaClientKnownRequestError) &&
    !(err instanceof Prisma.PrismaClientValidationError) &&
    err.name !== 'JsonWebTokenError' &&
    err.name !== 'TokenExpiredError';

  // Enhanced logging for 500 errors
  if (isServerError) {
    const requestContext = {
      method: req.method,
      path: req.path,
      url: req.url,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      headers: {
        'content-type': req.get('content-type'),
        'authorization': req.get('authorization') ? 'Bearer ***' : undefined,
      },
      body: req.body ? (typeof req.body === 'object' ? JSON.stringify(req.body).substring(0, 500) : req.body) : undefined,
      params: req.params,
      query: req.query,
      userId: 'user' in req ? req.user?.id : (req.context?.userId),
      companyId: 'user' in req ? req.user?.companyId : (req.context?.companyId),
    };

    // Detailed error logging for 500 errors
    logger.error(`[${req.method}] ${req.path} - 500 Internal Server Error`, {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      request: requestContext,
      timestamp: new Date().toISOString(),
    });
    
    // Log to console for immediate visibility (in addition to logger)
    // Note: logger already logged above, this is for dev visibility
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ 500 Internal Server Error:', {
        method: req.method,
        path: req.path,
        url: req.url,
        error: {
          name: err.name,
          message: err.message,
          stack: err.stack,
        },
      });
    }
  } else {
    // Standard logging for known errors
    logger.error(`[${req.method}] ${req.path} - ${err.message}`, {
      stack: err.stack,
      body: req.body,
      params: req.params,
      query: req.query,
      errorName: err.name,
      errorMessage: err.message,
      userId: 'user' in req ? req.user?.id : (req.context?.userId),
      companyId: 'user' in req ? req.user?.companyId : (req.context?.companyId),
    });
    
    // Log to console for immediate visibility in development
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ Error:', {
        method: req.method,
        path: req.path,
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
    }
  }

  // Zod validation error
  if (err instanceof ZodError) {
    const errors = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    sendValidationError(res, errors);
    return;
  }

  // Custom AppError (new version)
  if (err instanceof AppErrorNew) {
    if (err.errors) {
      sendValidationError(res, err.errors);
      return;
    }
    sendError(res, err.message, err.statusCode, undefined, err.code);
    return;
  }

  // Custom AppError (legacy)
  if (err instanceof AppError) {
    if (err instanceof ValidationError) {
      sendValidationError(res, err.errors);
      return;
    }
    sendError(res, err.message, err.statusCode, undefined, err.code);
    return;
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    handlePrismaError(err, res);
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    // Log detailed Prisma validation error
    logger.error('Prisma validation error:', {
      message: err.message,
      stack: err.stack,
    });
    sendError(res, `Geçersiz veri formatı: ${err.message}`, 400);
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    sendError(res, 'Geçersiz token', 401);
    return;
  }

  if (err.name === 'TokenExpiredError') {
    sendError(res, 'Token süresi dolmuş', 401);
    return;
  }

  // Default server error (500)
  // Log additional context for debugging
  logger.error('Unhandled server error', {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    request: {
      method: req.method,
      path: req.path,
      url: req.url,
      ip: req.ip || req.socket.remoteAddress,
    },
  });
  
  sendServerError(res, 'Beklenmeyen bir hata oluştu');
}

function handlePrismaError(err: Prisma.PrismaClientKnownRequestError, res: Response): void {
  // Log Prisma errors with details
  logger.error('Prisma database error', {
    code: err.code,
    meta: err.meta,
    message: err.message,
    stack: err.stack,
  });

  switch (err.code) {
    case 'P2002': // Unique constraint violation
      const target = (err.meta?.target as string[])?.join(', ') || 'alan';
      sendError(res, `Bu ${target} zaten kullanımda`, 409);
      break;
    case 'P2003': // Foreign key constraint violation
      sendError(res, 'İlişkili kayıt bulunamadı', 400);
      break;
    case 'P2025': // Record not found
      sendError(res, 'Kayıt bulunamadı', 404);
      break;
    default:
      // Log unknown Prisma errors
      logger.error('Unknown Prisma error code', {
        code: err.code,
        meta: err.meta,
        message: err.message,
      });
      sendError(res, 'Veritabanı hatası', 500);
  }
}

/**
 * 404 handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `${req.method} ${req.path} bulunamadı`, 404);
}

/**
 * Async handler wrapper
 * Supports both Request and AuthenticatedRequest
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: T, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

