/**
 * Tests for AppError Class
 */

import { describe, expect, it } from '@jest/globals';
import { AppError } from '../../src/utils/app-error.js';

describe('AppError', () => {
  describe('Basic error creation', () => {
    it('should create error with message and status code', () => {
      const error = new AppError('Test error', 400);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('should default to status code 400', () => {
      const error = new AppError('Test error');

      expect(error.statusCode).toBe(400);
    });

    it('should include errors object', () => {
      const errors = { field: 'error message' };
      const error = new AppError('Validation error', 422, errors);

      expect(error.errors).toEqual(errors);
    });
  });

  describe('Factory methods', () => {
    it('should create badRequest error', () => {
      const error = AppError.badRequest('Bad request');

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Bad request');
    });

    it('should create unauthorized error', () => {
      const error = AppError.unauthorized();

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Yetkisiz erişim');
    });

    it('should create forbidden error', () => {
      const error = AppError.forbidden();

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Bu işlem için yetkiniz yok');
    });

    it('should create notFound error', () => {
      const error = AppError.notFound();

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Kayıt bulunamadı');
    });

    it('should create conflict error', () => {
      const error = AppError.conflict('Duplicate entry');

      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Duplicate entry');
    });

    it('should create validation error', () => {
      const errors = { email: 'Invalid email' };
      const error = AppError.validation('Validation failed', errors);

      expect(error.statusCode).toBe(422);
      expect(error.errors).toEqual(errors);
    });

    it('should create internal error', () => {
      const error = AppError.internal();

      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('Multi-tenant specific errors', () => {
    it('should create companyMismatch error', () => {
      const error = AppError.companyMismatch();

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Bu kaynağa erişim yetkiniz yok');
    });

    it('should create companyRequired error', () => {
      const error = AppError.companyRequired();

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Şirket bilgisi gerekli');
    });
  });

  describe('Integration specific errors', () => {
    it('should create integrationError', () => {
      const error = AppError.integrationError('Connection failed', 'WooCommerce');

      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('WooCommerce entegrasyonu: Connection failed');
    });

    it('should create integrationNotActive error', () => {
      const error = AppError.integrationNotActive('Trendyol');

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Trendyol entegrasyonu aktif değil');
    });
  });

  describe('Stock specific errors', () => {
    it('should create insufficientStock error', () => {
      const error = AppError.insufficientStock('Product A', 10, 5);

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Product A');
      expect(error.message).toContain('10 adet istendi');
      expect(error.message).toContain('5 adet mevcut');
    });
  });

  describe('toJSON method', () => {
    it('should convert error to JSON', () => {
      const error = new AppError('Test error', 400, { field: 'error' });
      const json = error.toJSON();

      expect(json).toEqual({
        success: false,
        message: 'Test error',
        statusCode: 400,
        errors: { field: 'error' },
      });
    });
  });
});

