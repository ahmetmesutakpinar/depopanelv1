/**
 * Error Mapper
 * 
 * Maps domain errors to HTTP responses.
 * 
 * Architecture:
 * - Interface layer only
 * - Maps domain errors to HTTP status codes
 * - Provides consistent error response format
 */

import { Response } from 'express';
import { DomainError } from '../../domain/errors/domain-error.js';
import { InvalidStateError } from '../../domain/errors/invalid-state-error.js';
import { BusinessRuleViolation } from '../../domain/errors/business-rule-violation.js';
import { ExternalServiceUnavailableError } from '../../domain/errors/external-service-unavailable.error.js';
import { ExternalAuthenticationError } from '../../domain/errors/external-authentication.error.js';
import { ExternalRateLimitError } from '../../domain/errors/external-rate-limit.error.js';
import { UnauthorizedError } from '../../domain/errors/unauthorized.error.js';
import { ForbiddenError } from '../../domain/errors/forbidden.error.js';
import { ZodError } from 'zod';

/**
 * HTTP Error Response
 */
export interface HttpErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    context?: Record<string, unknown>;
  };
}

/**
 * Map Domain Error to HTTP Status Code
 */
export function mapDomainErrorToHttpStatus(error: DomainError): number {
  if (error instanceof UnauthorizedError) {
    return 401;
  }

  if (error instanceof ForbiddenError) {
    return 403;
  }

  if (error instanceof ExternalAuthenticationError) {
    return 401;
  }

  if (error instanceof ExternalRateLimitError) {
    return 429;
  }

  if (error instanceof ExternalServiceUnavailableError) {
    return 503;
  }

  if (error instanceof InvalidStateError) {
    return 400;
  }

  if (error instanceof BusinessRuleViolation) {
    return 400;
  }

  // Default domain error
  return 400;
}

/**
 * Map Error to HTTP Response
 * 
 * Handles:
 * - Domain errors
 * - Validation errors (Zod)
 * - Unknown errors
 */
export function mapErrorToHttpResponse(error: unknown): {
  statusCode: number;
  response: HttpErrorResponse;
} {
  // Domain errors
  if (error instanceof DomainError) {
    return {
      statusCode: mapDomainErrorToHttpStatus(error),
      response: {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          context: error.context,
        },
      },
    };
  }

  // Validation errors (Zod)
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      response: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          context: {
            issues: error.errors,
          },
        },
      },
    };
  }

  // Unknown errors
  const message = error instanceof Error ? error.message : String(error);
  return {
    statusCode: 500,
    response: {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: message || 'An unexpected error occurred',
      },
    },
  };
}

/**
 * Send Error Response
 * 
 * Maps error to HTTP response and sends it.
 */
export function sendErrorResponse(res: Response, error: unknown): Response {
  const { statusCode, response } = mapErrorToHttpResponse(error);
  return res.status(statusCode).json(response);
}

