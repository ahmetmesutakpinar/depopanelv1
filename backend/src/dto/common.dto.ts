/**
 * Common DTOs used across multiple modules
 */

import { z } from 'zod';

/**
 * Pagination DTO
 */
export const PaginationDTO = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export type PaginationDTO = z.infer<typeof PaginationDTO>;

/**
 * ID Parameter DTO
 */
export const IdParamDTO = z.object({
  id: z.string().uuid('Geçersiz ID formatı'),
});

export type IdParamDTO = z.infer<typeof IdParamDTO>;

/**
 * Success Response DTO
 */
export interface SuccessResponseDTO<T = any> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Error Response DTO
 */
export interface ErrorResponseDTO {
  success: false;
  message: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
  code?: string;
}

