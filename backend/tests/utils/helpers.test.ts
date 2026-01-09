/**
 * Tests for Helper Functions
 */

import { describe, expect, it } from '@jest/globals';
import {
  generateOrderNumber,
  generateReturnNumber,
  slugify,
  getPagination,
  getPaginationMeta,
  removeEmptyValues,
} from '../../src/utils/helpers.js';

describe('Helper Functions', () => {
  describe('generateOrderNumber', () => {
    it('should generate order number with correct format', () => {
      const orderNumber = generateOrderNumber();

      expect(orderNumber).toMatch(/^DP-\d{8}-\d{4}$/);
    });

    it('should generate unique order numbers', () => {
      const numbers = new Set();
      
      for (let i = 0; i < 100; i++) {
        numbers.add(generateOrderNumber());
      }

      // Should have at least 90% unique numbers (random part may collide occasionally)
      expect(numbers.size).toBeGreaterThan(90);
    });
  });

  describe('generateReturnNumber', () => {
    it('should generate return number with correct format', () => {
      const returnNumber = generateReturnNumber();

      expect(returnNumber).toMatch(/^RT-\d{8}-\d{4}$/);
    });
  });

  describe('slugify', () => {
    it('should convert to lowercase slug', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('should handle Turkish characters', () => {
      expect(slugify('Çalışan Ürün Şöyle')).toBe('calisan-urun-soyle');
    });

    it('should remove special characters', () => {
      expect(slugify('Product @#$% Name!')).toBe('product-name');
    });

    it('should handle multiple spaces', () => {
      expect(slugify('Too   Many    Spaces')).toBe('too-many-spaces');
    });

    it('should remove leading/trailing dashes', () => {
      expect(slugify('-Dash Test-')).toBe('dash-test');
    });
  });

  describe('getPagination', () => {
    it('should calculate correct skip and take', () => {
      const result = getPagination(1, 20);

      expect(result).toEqual({ skip: 0, take: 20 });
    });

    it('should calculate for page 2', () => {
      const result = getPagination(2, 20);

      expect(result).toEqual({ skip: 20, take: 20 });
    });

    it('should limit max take to 100', () => {
      const result = getPagination(1, 200);

      expect(result.take).toBe(100);
    });

    it('should default to page 1 and limit 20', () => {
      const result = getPagination();

      expect(result).toEqual({ skip: 0, take: 20 });
    });

    it('should handle invalid page numbers', () => {
      const result = getPagination(0, 20);

      expect(result.skip).toBe(0);
    });
  });

  describe('getPaginationMeta', () => {
    it('should calculate pagination metadata', () => {
      const meta = getPaginationMeta(100, 1, 20);

      expect(meta).toEqual({
        page: 1,
        limit: 20,
        total: 100,
        totalPages: 5,
      });
    });

    it('should handle odd total counts', () => {
      const meta = getPaginationMeta(95, 1, 20);

      expect(meta.totalPages).toBe(5);
    });

    it('should handle zero total', () => {
      const meta = getPaginationMeta(0, 1, 20);

      expect(meta.totalPages).toBe(0);
    });
  });

  describe('removeEmptyValues', () => {
    it('should remove null values', () => {
      const obj = { a: 'value', b: null, c: 'test' };
      const result = removeEmptyValues(obj);

      expect(result).toEqual({ a: 'value', c: 'test' });
    });

    it('should remove undefined values', () => {
      const obj = { a: 'value', b: undefined, c: 'test' };
      const result = removeEmptyValues(obj);

      expect(result).toEqual({ a: 'value', c: 'test' });
    });

    it('should remove empty strings', () => {
      const obj = { a: 'value', b: '', c: 'test' };
      const result = removeEmptyValues(obj);

      expect(result).toEqual({ a: 'value', c: 'test' });
    });

    it('should keep zero values', () => {
      const obj = { a: 0, b: null, c: 'test' };
      const result = removeEmptyValues(obj);

      expect(result).toEqual({ a: 0, c: 'test' });
    });

    it('should keep false values', () => {
      const obj = { a: false, b: null, c: 'test' };
      const result = removeEmptyValues(obj);

      expect(result).toEqual({ a: false, c: 'test' });
    });
  });
});

