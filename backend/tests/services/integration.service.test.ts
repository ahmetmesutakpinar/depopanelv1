/**
 * Tests for Integration Service
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { IntegrationService } from '../../src/services/integration.service.js';
import { MarketplaceType } from '@prisma/client';

// Mock repository
jest.mock('../../src/repositories/integration.repository.js', () => ({
  integrationRepository: {
    findByCompany: jest.fn(),
    findByIdAndCompany: jest.fn(),
    findByTypeAndCompany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    hardDelete: jest.fn(),
    existsByType: jest.fn(),
    findActiveIntegrations: jest.fn(),
    findAllActiveIntegrations: jest.fn(),
    cleanupIntegrationData: jest.fn(),
    updateToken: jest.fn(),
    updateLastSync: jest.fn(),
  },
}));

describe('IntegrationService', () => {
  const service = new IntegrationService();
  const testCompanyId = 'company-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service instantiation', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(IntegrationService);
    });
  });

  describe('Method availability', () => {
    it('should have getIntegrations method', () => {
      expect(typeof service.getIntegrations).toBe('function');
    });

    it('should have getIntegrationById method', () => {
      expect(typeof service.getIntegrationById).toBe('function');
    });

    it('should have getIntegrationByType method', () => {
      expect(typeof service.getIntegrationByType).toBe('function');
    });

    it('should have createIntegration method', () => {
      expect(typeof service.createIntegration).toBe('function');
    });

    it('should have updateIntegration method', () => {
      expect(typeof service.updateIntegration).toBe('function');
    });

    it('should have deleteIntegration method', () => {
      expect(typeof service.deleteIntegration).toBe('function');
    });

    it('should have activateIntegration method', () => {
      expect(typeof service.activateIntegration).toBe('function');
    });

    it('should have updateToken method', () => {
      expect(typeof service.updateToken).toBe('function');
    });

    it('should have updateLastSync method', () => {
      expect(typeof service.updateLastSync).toBe('function');
    });

    it('should have isIntegrationActive method', () => {
      expect(typeof service.isIntegrationActive).toBe('function');
    });

    it('should have getActiveIntegrations method', () => {
      expect(typeof service.getActiveIntegrations).toBe('function');
    });

    it('should have getAllActiveIntegrations method', () => {
      expect(typeof service.getAllActiveIntegrations).toBe('function');
    });

    it('should have updateStatus method', () => {
      expect(typeof service.updateStatus).toBe('function');
    });

    it('should have testConnection method', () => {
      expect(typeof service.testConnection).toBe('function');
    });
  });

  describe('Marketplace types support', () => {
    it('should support WooCommerce type', () => {
      expect(MarketplaceType.WOOCOMMERCE).toBeDefined();
    });

    it('should support Trendyol type', () => {
      expect(MarketplaceType.TRENDYOL).toBeDefined();
    });

    it('should support Hepsiburada type', () => {
      expect(MarketplaceType.HEPSIBURADA).toBeDefined();
    });

    it('should support N11 type', () => {
      expect(MarketplaceType.N11).toBeDefined();
    });

    it('should support Pazarama type', () => {
      expect(MarketplaceType.PAZARAMA).toBeDefined();
    });

    it('should support Amazon type', () => {
      expect(MarketplaceType.AMAZON).toBeDefined();
    });
  });
});

