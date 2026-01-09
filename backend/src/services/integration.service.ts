import { MarketplaceIntegration, MarketplaceType, IntegrationStatus } from '@prisma/client';
import { integrationRepository } from '../repositories/integration.repository.js';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';

export interface CreateIntegrationInput {
  type: MarketplaceType;
  name: string;
  apiUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  sellerId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: Date;
  settings?: any;
  status?: IntegrationStatus;
}

export interface UpdateIntegrationInput {
  name?: string;
  apiUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  sellerId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: Date;
  settings?: any;
  status?: IntegrationStatus;
}

export class IntegrationService {
  /**
   * Entegrasyon listele
   */
  async getIntegrations(
    companyId: string,
    options?: {
      includeInactive?: boolean;
      status?: IntegrationStatus;
    }
  ): Promise<MarketplaceIntegration[]> {
    return integrationRepository.findByCompany(companyId, options);
  }

  /**
   * ID ile entegrasyon getir
   */
  async getIntegrationById(
    id: string,
    companyId: string
  ): Promise<MarketplaceIntegration> {
    const integration = await integrationRepository.findByIdAndCompany(id, companyId);
    
    if (!integration) {
      throw AppError.notFound('Entegrasyon bulunamadı');
    }

    return integration;
  }

  /**
   * Type ile entegrasyon getir
   */
  async getIntegrationByType(
    type: MarketplaceType,
    companyId: string
  ): Promise<MarketplaceIntegration> {
    const integration = await integrationRepository.findByTypeAndCompany(type, companyId);
    
    if (!integration) {
      throw AppError.notFound(`${type} entegrasyonu bulunamadı`);
    }

    return integration;
  }

  /**
   * Yeni entegrasyon oluştur
   */
  async createIntegration(
    data: CreateIntegrationInput,
    companyId: string
  ): Promise<MarketplaceIntegration> {
    // Aynı tipte entegrasyon var mı kontrol et
    const exists = await integrationRepository.existsByType(data.type, companyId);
    
    if (exists) {
      throw AppError.conflict(`${data.type} entegrasyonu zaten mevcut`);
    }

    logger.info(`Creating integration: ${data.type} for company: ${companyId}`);

    const integration = await integrationRepository.create({
      ...data,
      companyId,
    });

    logger.info(`Integration created: ${integration.id}`);

    return integration;
  }

  /**
   * Entegrasyonu güncelle
   */
  async updateIntegration(
    id: string,
    companyId: string,
    data: UpdateIntegrationInput
  ): Promise<MarketplaceIntegration> {
    logger.info(`Updating integration: ${id} for company: ${companyId}`);

    const integration = await integrationRepository.update(id, companyId, data);

    logger.info(`Integration updated: ${integration.id}`);

    return integration;
  }

  /**
   * Entegrasyonu soft delete
   */
  async deleteIntegration(
    id: string,
    companyId: string,
    options?: {
      hardDelete?: boolean;
      cleanupData?: boolean;
    }
  ): Promise<{ success: boolean; message: string; details?: any }> {
    const integration = await this.getIntegrationById(id, companyId);

    logger.info(`Deleting integration: ${id} (type: ${integration.type}), hardDelete: ${options?.hardDelete}, cleanupData: ${options?.cleanupData}`);

    // Verileri temizle (istenirse)
    let cleanupResult;
    if (options?.cleanupData) {
      cleanupResult = await integrationRepository.cleanupIntegrationData(id, companyId);
      logger.info(`Integration data cleaned up:`, cleanupResult);
    }

    // Soft veya hard delete
    if (options?.hardDelete) {
      await integrationRepository.hardDelete(id, companyId);
      logger.info(`Integration hard deleted: ${id}`);
      
      return {
        success: true,
        message: 'Entegrasyon kalıcı olarak silindi',
        details: cleanupResult,
      };
    } else {
      await integrationRepository.softDelete(id, companyId);
      logger.info(`Integration soft deleted: ${id}`);
      
      return {
        success: true,
        message: 'Entegrasyon devre dışı bırakıldı',
        details: cleanupResult,
      };
    }
  }

  /**
   * Entegrasyonu aktif hale getir (soft delete'i geri al)
   */
  async activateIntegration(
    id: string,
    companyId: string
  ): Promise<MarketplaceIntegration> {
    logger.info(`Activating integration: ${id}`);

    const integration = await integrationRepository.update(id, companyId, {
      isActive: true,
      status: 'ACTIVE',
    });

    logger.info(`Integration activated: ${integration.id}`);

    return integration;
  }

  /**
   * Token güncelle
   */
  async updateToken(
    id: string,
    companyId: string,
    accessToken: string,
    refreshToken?: string,
    tokenExpiry?: Date
  ): Promise<MarketplaceIntegration> {
    logger.info(`Updating token for integration: ${id}`);

    return integrationRepository.updateToken(
      id,
      companyId,
      accessToken,
      refreshToken,
      tokenExpiry
    );
  }

  /**
   * Son senkronizasyon zamanını güncelle
   */
  async updateLastSync(id: string, companyId: string): Promise<void> {
    await integrationRepository.updateLastSync(id, companyId);
  }

  /**
   * Entegrasyon aktif mi kontrol et
   */
  async isIntegrationActive(
    type: MarketplaceType,
    companyId: string
  ): Promise<boolean> {
    try {
      const integration = await integrationRepository.findByTypeAndCompany(type, companyId);
      return integration?.isActive === true && integration?.status === 'ACTIVE';
    } catch {
      return false;
    }
  }

  /**
   * Aktif entegrasyonları getir (cron jobs için)
   */
  async getActiveIntegrations(companyId: string): Promise<MarketplaceIntegration[]> {
    return integrationRepository.findActiveIntegrations(companyId);
  }

  /**
   * Tüm aktif entegrasyonları getir (SUPER_ADMIN için)
   */
  async getAllActiveIntegrations(): Promise<MarketplaceIntegration[]> {
    return integrationRepository.findAllActiveIntegrations();
  }

  /**
   * Entegrasyon durumunu değiştir
   */
  async updateStatus(
    id: string,
    companyId: string,
    status: IntegrationStatus
  ): Promise<MarketplaceIntegration> {
    logger.info(`Updating status for integration: ${id} to ${status}`);

    return integrationRepository.update(id, companyId, { status });
  }

  /**
   * Test entegrasyon bağlantısı
   */
  async testConnection(
    id: string,
    companyId: string
  ): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegrationById(id, companyId);

    // Bu fonksiyon her entegrasyon tipine göre özelleştirilmeli
    // Şimdilik basit bir kontrol yapalım
    
    if (!integration.isActive) {
      return {
        success: false,
        message: 'Entegrasyon aktif değil',
      };
    }

    if (!integration.apiKey && !integration.accessToken) {
      return {
        success: false,
        message: 'API anahtarı veya access token eksik',
      };
    }

    // Gerçek bağlantı testi her integration için ayrı implement edilmeli
    logger.info(`Testing connection for integration: ${id} (${integration.type})`);

    return {
      success: true,
      message: 'Bağlantı başarılı (test modülü implement edilmeli)',
    };
  }
}

export const integrationService = new IntegrationService();

