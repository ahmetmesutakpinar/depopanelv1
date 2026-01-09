/**
 * Tests for Company Scope Utilities (Multi-Tenant)
 */

import { describe, expect, it } from '@jest/globals';
import {
  withCompanyScope,
  withCompanyScopeOr,
  validateCompanyId,
  assertCompanyAccess,
} from '../../src/utils/company-scope.js';

describe('Multi-Tenant Company Scope', () => {
  const testCompanyId = 'company-123';

  describe('withCompanyScope', () => {
    it('should add companyId to where clause', () => {
      const where = { isActive: true };
      const result = withCompanyScope(where, testCompanyId);

      expect(result).toEqual({
        isActive: true,
        companyId: testCompanyId,
      });
    });

    it('should throw error if companyId is empty', () => {
      expect(() => {
        withCompanyScope({}, '');
      }).toThrow('companyId is required');
    });

    it('should work with empty where object', () => {
      const result = withCompanyScope({}, testCompanyId);

      expect(result).toEqual({
        companyId: testCompanyId,
      });
    });
  });

  describe('withCompanyScopeOr', () => {
    it('should create OR clause with companyId', () => {
      const whereArray = [
        { status: 'PENDING' },
        { status: 'PROCESSING' },
      ];

      const result = withCompanyScopeOr(whereArray, testCompanyId);

      expect(result).toEqual({
        OR: whereArray,
        companyId: testCompanyId,
      });
    });

    it('should throw error if companyId is empty', () => {
      expect(() => {
        withCompanyScopeOr([], '');
      }).toThrow('companyId is required');
    });
  });

  describe('validateCompanyId', () => {
    it('should not throw for valid companyId', () => {
      expect(() => {
        validateCompanyId(testCompanyId);
      }).not.toThrow();
    });

    it('should throw for undefined companyId', () => {
      expect(() => {
        validateCompanyId(undefined);
      }).toThrow('companyId is required');
    });

    it('should throw for null companyId', () => {
      expect(() => {
        validateCompanyId(null);
      }).toThrow('companyId is required');
    });

    it('should throw for empty string companyId', () => {
      expect(() => {
        validateCompanyId('');
      }).toThrow('companyId is required');
    });
  });

  describe('assertCompanyAccess', () => {
    it('should not throw for matching companyIds', () => {
      expect(() => {
        assertCompanyAccess(testCompanyId, testCompanyId, false);
      }).not.toThrow();
    });

    it('should throw for mismatched companyIds', () => {
      expect(() => {
        assertCompanyAccess('company-1', 'company-2', false);
      }).toThrow('Access denied: Company mismatch');
    });

    it('should not throw for super admin', () => {
      expect(() => {
        assertCompanyAccess('company-1', 'company-2', true);
      }).not.toThrow();
    });
  });
});

