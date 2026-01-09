import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

/**
 * Base types for the application
 */

/**
 * Standard API Response structure
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  errors?: any[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Standard Controller Method signature
 */
export type ControllerMethod = (
  req: AuthenticatedRequest,
  res: Response,
  next?: NextFunction
) => Promise<void> | void;

/**
 * Standard Service Method signature
 */
export type ServiceMethod<T = any, R = any> = (params: T) => Promise<R>;

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  skip?: number;
  take?: number;
}

/**
 * Pagination result
 */
export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Standard query options
 */
export interface QueryOptions extends PaginationOptions {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Standard filter options
 */
export interface FilterOptions {
  [key: string]: any;
}

