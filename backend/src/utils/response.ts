import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: any;
  code?: string; // Error code for programmatic handling
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function sendSuccess<T>(
  res: Response,
  message: string,
  data?: T,
  statusCode: number = 200,
  pagination?: ApiResponse['pagination']
): Response {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
  };

  if (pagination) {
    response.pagination = pagination;
  }

  return res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  message: string,
  statusCode: number = 400,
  errors?: any,
  code?: string
): Response {
  const response: ApiResponse = {
    success: false,
    message,
    errors,
    ...(code && { code }),
  };

  return res.status(statusCode).json(response);
}

export function sendCreated<T>(res: Response, message: string, data?: T): Response {
  return sendSuccess(res, message, data, 201);
}

export function sendNotFound(res: Response, message: string = 'Kayıt bulunamadı'): Response {
  return sendError(res, message, 404);
}

export function sendUnauthorized(res: Response, message: string = 'Yetkisiz erişim'): Response {
  return sendError(res, message, 401);
}

export function sendForbidden(res: Response, message: string = 'Bu işlem için yetkiniz yok'): Response {
  return sendError(res, message, 403);
}

export function sendValidationError(res: Response, errors: any): Response {
  return sendError(res, 'Doğrulama hatası', 422, errors);
}

export function sendServerError(res: Response, message: string = 'Sunucu hatası'): Response {
  return sendError(res, message, 500);
}

