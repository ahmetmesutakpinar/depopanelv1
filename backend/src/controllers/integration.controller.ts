import { Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../config/index.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response.js';
import { createMarketplaceIntegration, SyncMode, IntegrationSettings } from '../utils/integration-index.js';
import { MarketplaceType } from '@prisma/client';
import { syncIntegrationOrders } from '../utils/job-order-sync.js';
import { syncIntegrationProducts } from '../utils/job-product-sync.js';
import { syncIntegrationReturns } from '../utils/job-return-sync.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { createMarketplaceIntegrationWithDecryption } from '../utils/integration-helper.js';
import { orphanCleanerService } from '../utils/services/orphan-cleaner.service.js';
import { integrationService } from '../services/integration.service.js';
import { logger } from '../utils/logger.js';
import { BaseController } from './base.controller.js';
import { IntegrationDisabledError } from '../errors/integration-disabled.error.js';
import { env } from '../config/env.js';

// ==================== VALIDATION SCHEMAS ====================

const createIntegrationSchema = z.object({
  type: z.enum(['WOOCOMMERCE', 'TRENDYOL', 'HEPSIBURADA', 'N11', 'PAZARAMA', 'AMAZON', 'SHOPIFY', 'IKAS']),
  name: z.string().min(2, 'Entegrasyon adı gerekli'),
  apiUrl: z.string().url().nullable().optional(),
  apiKey: z.string().nullable().optional(),
  apiSecret: z.string().nullable().optional(),
  sellerId: z.string().nullable().optional(),
  accessToken: z.string().nullable().optional(),
  settings: z.object({
    syncMode: z.enum(['AUTO', 'MANUAL', 'WEBHOOK', 'MIDDLEWARE']).optional(),
    skipApiTest: z.boolean().optional(),
    middlewareType: z.enum(['SOPYO', 'CUSTOM']).optional(),
    middlewareConfig: z.record(z.any()).optional(),
    readOnly: z.boolean().optional(),
    merchantId: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    marketplaceId: z.string().optional(),
  }).optional(),
});

const updateIntegrationSchema = createIntegrationSchema.partial();

// ==================== CONTROLLER ====================

class IntegrationController extends BaseController {
  /**
   * GET /api/integrations
   */
  getIntegrations = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const integrations = await prisma.marketplaceIntegration.findMany({
      where: { companyId: this.getCompanyId(req) },
      orderBy: { createdAt: 'desc' },
    });

    // Hide sensitive data
    const safeIntegrations = integrations.map(int => ({
      ...int,
      apiKey: int.apiKey ? '••••••••' : null,
      apiSecret: int.apiSecret ? '••••••••' : null,
      accessToken: int.accessToken ? '••••••••' : null,
      refreshToken: int.refreshToken ? '••••••••' : null,
    }));

    sendSuccess(res, 'Entegrasyonlar listelendi', safeIntegrations);
  });

  /**
   * GET /api/integrations/:id
   */
  getIntegration = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const integration = await prisma.marketplaceIntegration.findFirst({
      where: {
        id: req.params.id,
        companyId: this.getCompanyId(req),
      },
    });

    if (!integration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }

    sendSuccess(res, 'Entegrasyon detayı', {
      ...integration,
      apiKey: integration.apiKey ? '••••••••' : null,
      apiSecret: integration.apiSecret ? '••••••••' : null,
    });
  });

  /**
   * POST /api/integrations
   */
  createIntegration = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createIntegrationSchema.parse(req.body);

    // Check if integration type already exists for this company
    const existing = await prisma.marketplaceIntegration.findFirst({
      where: {
        companyId: this.getCompanyId(req),
        type: data.type as MarketplaceType,
      },
    });

    if (existing) {
      return sendSuccess(res, 'Bu pazaryeri için zaten bir entegrasyon mevcut', null, 409);
    }

    // Encrypt sensitive data before saving
    const integration = await prisma.marketplaceIntegration.create({
      data: {
        type: data.type as MarketplaceType,
        name: data.name,
        apiUrl: data.apiUrl,
        apiKey: data.apiKey ? encrypt(data.apiKey) : null,
        apiSecret: data.apiSecret ? encrypt(data.apiSecret) : null,
        sellerId: data.sellerId,
        accessToken: data.accessToken ? encrypt(data.accessToken) : null,
        settings: data.settings,
        status: 'INACTIVE',
        companyId: this.getCompanyId(req),
      },
    });

    // Try to test connection automatically when creating integration
    // This helps users know immediately if their API credentials are correct
    try {
      // Decrypt API credentials for testing
      const marketplace = createMarketplaceIntegrationWithDecryption(integration.type, integration);

      const isConnected = await marketplace.testConnection();
      
      if (isConnected) {
        await prisma.marketplaceIntegration.update({
          where: { id: integration.id },
          data: { status: 'ACTIVE' },
        });
        integration.status = 'ACTIVE';
      }
    } catch (error) {
      // Connection test failed, but integration is still created
      // User can test manually later
      const { logger } = await import('../utils/logger.js');
      logger.error('[createIntegration] Auto connection test başarısız', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    sendCreated(res, 'Entegrasyon oluşturuldu', {
      ...integration,
      apiKey: integration.apiKey ? '••••••••' : null,
      apiSecret: integration.apiSecret ? '••••••••' : null,
    });
  });

  /**
   * PUT /api/integrations/:id
   */
  updateIntegration = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateIntegrationSchema.parse(req.body);

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: {
        id: req.params.id,
        companyId: this.getCompanyId(req),
      },
    });

    if (!integration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }

    // If API credentials are being updated, test connection automatically
    const shouldTestConnection = 
      (data.apiKey !== undefined || data.apiSecret !== undefined || 
       data.apiUrl !== undefined || data.sellerId !== undefined || 
       data.accessToken !== undefined);

    // Only update fields that are provided and not masked
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.apiUrl !== undefined) updateData.apiUrl = data.apiUrl;
    if (data.apiKey !== undefined && data.apiKey !== '••••••••' && data.apiKey !== null) {
      updateData.apiKey = encrypt(data.apiKey);
    }
    if (data.apiSecret !== undefined && data.apiSecret !== '••••••••' && data.apiSecret !== null) {
      updateData.apiSecret = encrypt(data.apiSecret);
    }
    if (data.sellerId !== undefined) updateData.sellerId = data.sellerId;
    if (data.accessToken !== undefined && data.accessToken !== '••••••••' && data.accessToken !== null) {
      updateData.accessToken = encrypt(data.accessToken);
    }
    if (data.settings) {
      // Merge with existing settings to preserve other settings
      const existingSettings = (integration.settings as Record<string, any>) || {};
      updateData.settings = { ...existingSettings, ...data.settings };
    }

    const updated = await prisma.marketplaceIntegration.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // If API credentials were updated, test connection automatically
    if (shouldTestConnection) {
      try {
        // Decrypt API credentials for testing
        const marketplace = createMarketplaceIntegration(updated.type, {
          apiUrl: updated.apiUrl || '',
          apiKey: updated.apiKey ? decrypt(updated.apiKey) : undefined,
          apiSecret: updated.apiSecret ? decrypt(updated.apiSecret) : undefined,
          sellerId: updated.sellerId || undefined,
          accessToken: updated.accessToken ? decrypt(updated.accessToken) : undefined,
          settings: updated.settings as Record<string, any> | undefined,
        });

        const isConnected = await marketplace.testConnection();
        
        if (isConnected) {
          await prisma.marketplaceIntegration.update({
            where: { id: updated.id },
            data: { status: 'ACTIVE' },
          });
          updated.status = 'ACTIVE';
        } else {
          await prisma.marketplaceIntegration.update({
            where: { id: updated.id },
            data: { status: 'ERROR' },
          });
          updated.status = 'ERROR';
        }
      } catch (error) {
        // Connection test failed
        await prisma.marketplaceIntegration.update({
          where: { id: updated.id },
          data: { status: 'ERROR' },
        });
        updated.status = 'ERROR';
      }
    }

    sendSuccess(res, 'Entegrasyon güncellendi', {
      ...updated,
      apiKey: updated.apiKey ? '••••••••' : null,
      apiSecret: updated.apiSecret ? '••••••••' : null,
    });
  });

  /**
   * DELETE /api/integrations/:id
   * Query params: cleanup=true (verileri temizle), hardDelete=true (kalıcı sil)
   */
  deleteIntegration = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const companyId = this.getCompanyId(req);
    
    // Query parameters
    const cleanup = req.query.cleanup === 'true';
    const hardDelete = req.query.hardDelete === 'true';

    logger.info(`Deleting integration: ${id}, cleanup: ${cleanup}, hardDelete: ${hardDelete}`);

    // Yeni integration service'i kullan
    const result = await integrationService.deleteIntegration(id, companyId, {
      cleanupData: cleanup,
      hardDelete,
    });

    sendSuccess(res, result.message, result.details);
  });

  /**
   * DELETE /api/integrations/:id (LEGACY - backward compatibility)
   * Eski versiyon için backup
   */
  deleteIntegrationLegacy = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const integration = await prisma.marketplaceIntegration.findFirst({
      where: {
        id: req.params.id,
        companyId: this.getCompanyId(req),
      },
    });

    if (!integration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }

    // Transaction içinde entegrasyon ve ilgili verileri sil
    const result = await prisma.$transaction(async (tx) => {
      // 1. Entegrasyona ait ProductSource kayıtlarını bul (PRIMARY METHOD)
      // @ts-ignore - Prisma generate gerekebilir
      const productSources = await tx.productSource.findMany({
        where: {
          integrationId: integration.id,
        },
        select: {
          productId: true,
        },
      });

      // 2. Eski MarketplaceProduct kayıtlarını da bul (legacy support)
      const marketplaceProducts = await tx.marketplaceProduct.findMany({
        where: {
          integrationId: integration.id,
        },
        select: {
          productId: true,
        },
      });

      // Her iki kaynaktan product ID'lerini birleştir
      const allProductIds = [
        ...new Set([
          ...productSources.map((ps: { productId: string }) => ps.productId),
          ...marketplaceProducts.map((mp: { productId: string }) => mp.productId),
        ])
      ];

      // 3. Bu Product'ların başka entegrasyona bağlı olup olmadığını kontrol et
      // Hem ProductSource hem de MarketplaceProduct üzerinden kontrol et
      let productsToDelete: string[] = [];
      
      if (allProductIds.length > 0) {
        // Her Product için başka entegrasyona bağlı olup olmadığını kontrol et
        for (const productId of allProductIds) {
          // ProductSource üzerinden kontrol
          // @ts-ignore - Prisma generate gerekebilir
          const otherProductSource = await tx.productSource.findFirst({
            where: {
              productId: productId,
              integrationId: { not: integration.id },
            },
          });

          // MarketplaceProduct üzerinden kontrol (legacy)
          const otherMarketplaceProduct = await tx.marketplaceProduct.findFirst({
            where: {
              productId: productId,
              integrationId: { not: integration.id },
            },
          });

          // Eğer hiçbir entegrasyona bağlı değilse, silinecek listesine ekle
          if (!otherProductSource && !otherMarketplaceProduct) {
            productsToDelete.push(productId);
          }
        }
      }

      // 4. Sadece bu entegrasyona ait olan Product'ları sil
      // (Cascade delete ile ProductSource, MarketplaceProduct, Stock, StockLog, vb. de silinecek)
      let deletedProductsCount = 0;
      if (productsToDelete.length > 0) {
        const deletedProducts = await tx.product.deleteMany({
          where: {
            id: { in: productsToDelete },
            companyId: integration.companyId, // Güvenlik: sadece aynı şirkete ait ürünleri sil
          },
        });
        deletedProductsCount = deletedProducts.count;
      }

      // 5. Delete SyncLogs for this integration (by marketplace type and company)
      const deletedSyncLogs = await tx.syncLog.deleteMany({
        where: {
          companyId: integration.companyId,
          marketplace: integration.type,
        },
      });

      logger.info(`[${integration.type}] ${deletedSyncLogs.count} sync log silindi`);

      // 6. Entegrasyonu sil
      // (ProductSource, OrderSource ve MarketplaceProduct kayıtları cascade ile otomatik silinecek)
      await tx.marketplaceIntegration.delete({
        where: { id: integration.id },
      });

      return {
        deletedProductsCount,
        deletedSyncLogs: deletedSyncLogs.count,
        totalProductSources: productSources.length,
        totalMarketplaceProducts: marketplaceProducts.length,
        totalProductsChecked: allProductIds.length,
      };
    });

    // Clean up any orphaned records after deletion
    try {
      await orphanCleanerService.cleanAll();
      logger.info('Orphan cleanup tamamlandı');
    } catch (error) {
      logger.error('Orphan cleanup hatası (kritik değil):', error);
    }

    const message = result.deletedProductsCount > 0
      ? `Entegrasyon silindi. ${result.deletedProductsCount} ürün ve ${result.deletedSyncLogs} sync log silindi. Toplam ${result.totalProductsChecked} ürün kontrol edildi.`
      : `Entegrasyon silindi. ${result.deletedSyncLogs} sync log silindi. Ürünler silinmedi (başka entegrasyonlara da bağlılar). Toplam ${result.totalProductsChecked} ürün kontrol edildi.`;

    sendSuccess(res, message, result);
  });

  /**
   * POST /api/integrations/:id/test
   */
  testIntegration = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const integration = await prisma.marketplaceIntegration.findFirst({
      where: {
        id: req.params.id,
        companyId: this.getCompanyId(req),
      },
    });

    if (!integration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }

    const settings = integration.settings as IntegrationSettings | undefined;
    
    // Sync mode kontrolü: MANUAL modda API testi atlanır
    if (settings?.skipApiTest || settings?.syncMode === SyncMode.MANUAL) {
      return sendSuccess(res, 'API testi atlandı (Manuel sync modu)', {
        connected: true,
        skipped: true,
      });
    }

    try {
      // Decrypt API credentials for testing
      const marketplace = createMarketplaceIntegrationWithDecryption(integration.type, integration);

      const isConnected = await marketplace.testConnection();

      await prisma.marketplaceIntegration.update({
        where: { id: integration.id },
        data: {
          status: isConnected ? 'ACTIVE' : 'ERROR',
        },
      });

      sendSuccess(res, isConnected ? 'Bağlantı başarılı' : 'Bağlantı başarısız', {
        connected: isConnected,
      });
    } catch (error: any) {
      await prisma.marketplaceIntegration.update({
        where: { id: integration.id },
        data: { status: 'ERROR' },
      });

      sendSuccess(res, 'Bağlantı testi başarısız', {
        connected: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/integrations/:id/sync
   */
  syncIntegration = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    let integration = await prisma.marketplaceIntegration.findFirst({
      where: {
        id: req.params.id,
        companyId: this.getCompanyId(req),
      },
    });

    if (!integration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }

    // If integration is not active, try to test connection first
    if (integration.status !== 'ACTIVE') {
      const settings = integration.settings as IntegrationSettings | undefined;
      const skipApiTest = settings?.skipApiTest === true || 
                         settings?.syncMode === SyncMode.MANUAL ||
                         settings?.syncMode === SyncMode.MIDDLEWARE;
      
      if (!skipApiTest) {
        try {
          // Decrypt API credentials for testing
          const marketplace = createMarketplaceIntegration(integration.type, {
            apiUrl: integration.apiUrl || '',
            apiKey: integration.apiKey ? decrypt(integration.apiKey) : undefined,
            apiSecret: integration.apiSecret ? decrypt(integration.apiSecret) : undefined,
            sellerId: integration.sellerId || undefined,
            accessToken: integration.accessToken ? decrypt(integration.accessToken) : undefined,
            settings: integration.settings as Record<string, any> | undefined,
          });

          let isConnected = false;
          let connectionError: Error | null = null;
          
          try {
            isConnected = await marketplace.testConnection();
          } catch (testError: any) {
            // testConnection exception throw ettiyse yakala
            connectionError = testError;
            isConnected = false;
            logger.error(`[${integration.type}] Test connection exception:`, {
              error: testError.message,
              stack: testError.stack,
            });
          }
          
          if (!isConnected) {
            // Test connection hatasını SyncLog'a kaydet
            const errorMessage = connectionError?.message || 'API bağlantısı başarısız. Lütfen API bilgilerinizi kontrol edin.';
            
            await prisma.syncLog.create({
              data: {
                type: 'TEST_CONNECTION',
                marketplace: integration.type,
                status: 'FAILED',
                message: 'Test connection başarısız',
                error: errorMessage,
                companyId: integration.companyId,
                details: {
                  integrationId: integration.id,
                  integrationName: integration.name,
                  errorType: connectionError?.name || 'ConnectionError',
                },
              },
            }).catch((err) => {
              logger.error('[Integration] SyncLog kayıt hatası:', err);
            });

            await prisma.marketplaceIntegration.update({
              where: { id: integration.id },
              data: { status: 'ERROR' },
            });
            
            return sendSuccess(res, errorMessage, {
              errorType: connectionError?.name || 'ConnectionError',
              errorMessage: errorMessage,
            }, 400);
          }

          // Update status to ACTIVE if connection is successful
          await prisma.marketplaceIntegration.update({
            where: { id: integration.id },
            data: { status: 'ACTIVE' },
          });
          
          // Refresh integration object to get updated status
          const refreshedIntegration = await prisma.marketplaceIntegration.findFirst({
            where: { id: integration.id },
          });
          
          if (!refreshedIntegration) {
            return sendNotFound(res, 'Entegrasyon bulunamadı');
          }
          
          integration = refreshedIntegration;
        } catch (error: any) {
          if (integration) {
            // Test connection hatasını SyncLog'a kaydet
            await prisma.syncLog.create({
              data: {
                type: 'TEST_CONNECTION',
                marketplace: integration.type,
                status: 'FAILED',
                message: 'Test connection exception',
                error: error.message || 'Bilinmeyen hata',
                companyId: integration.companyId,
                details: {
                  integrationId: integration.id,
                  integrationName: integration.name,
                  errorType: error.name || 'Error',
                  errorStack: error.stack,
                },
              },
            }).catch((err) => {
              logger.error('[Integration] SyncLog kayıt hatası:', err);
            });

            await prisma.marketplaceIntegration.update({
              where: { id: integration.id },
              data: { status: 'ERROR' },
            });
          }
          return sendSuccess(res, `Bağlantı hatası: ${error.message}`, {
            errorType: error.name,
            errorMessage: error.message,
          }, 400);
        }
      } else {
        logger.info(`[${integration.type}] API testi atlandı (syncMode: ${settings?.syncMode})`);
        
        // Status'u INACTIVE olarak bırak (manuel sync için)
        if (settings?.syncMode === SyncMode.MANUAL) {
          await prisma.marketplaceIntegration.update({
            where: { id: integration.id },
            data: { status: 'INACTIVE' },
          });
        }
      }
    }

    // Trigger actual sync in background (non-blocking)
    // Run sync asynchronously without blocking the response
    // Use fresh integration object to ensure we have the latest data
    const freshIntegration = await prisma.marketplaceIntegration.findFirst({
      where: { id: integration.id },
    });
    
    if (!freshIntegration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }
    
    // Create marketplace integration instance to check capabilities
    const marketplace = createMarketplaceIntegrationWithDecryption(
      freshIntegration.type,
      freshIntegration
    );

    // PRODUCTION SAFETY: Check capabilities before sync
    const capabilities = marketplace.capabilities;
    
    if (!capabilities.orders && !capabilities.stock && !capabilities.products) {
      logger.error(`[${freshIntegration.type}] Sync attempted but all capabilities disabled`, {
        integrationId: freshIntegration.id,
        capabilities,
      });
      return sendError(res, 'Bu entegrasyon için hiçbir özellik aktif değil. Lütfen entegrasyonu kontrol edin.', 400);
    }

    // Log sync start with capabilities
    logger.info(`[${freshIntegration.type}] Sync başlatılıyor...`, {
      integrationId: freshIntegration.id,
      type: freshIntegration.type,
      status: freshIntegration.status,
      companyId: freshIntegration.companyId,
      capabilities,
    });
    
    // Trigger sync in background - each sync runs independently
    // This way if one fails, others can still succeed
    // Only run syncs for enabled capabilities
    Promise.all([
      capabilities.orders && syncIntegrationOrders(freshIntegration).catch(async (error) => {
        logger.error(`[${freshIntegration.type}] Sipariş sync hatası`, {
          integrationId: freshIntegration.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error; // Re-throw to be caught by outer catch
      }),
      capabilities.products && syncIntegrationProducts(freshIntegration).catch(async (error) => {
        logger.error(`[${freshIntegration.type}] Ürün sync hatası`, {
          integrationId: freshIntegration.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error; // Re-throw to be caught by outer catch
      }),
      syncIntegrationReturns(freshIntegration).catch(async (error) => {
        logger.error(`[${freshIntegration.type}] İade sync hatası`, {
          integrationId: freshIntegration.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error; // Re-throw to be caught by outer catch
      }),
    ]).catch(async (error) => {
      logger.error(`[${freshIntegration.type}] Genel sync hatası`, {
        integrationId: freshIntegration.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Update integration status to ERROR if all syncs fail
      // But don't update if only one fails - others might succeed
      try {
        await prisma.marketplaceIntegration.update({
          where: { id: freshIntegration.id },
          data: { status: 'ERROR' },
        });
      } catch (updateError) {
        logger.error('[createIntegration] Integration status güncelleme hatası', {
          integrationId: freshIntegration.id,
          error: updateError instanceof Error ? updateError.message : String(updateError),
        });
      }
    });

    // Return immediately - sync runs in background
    const enabledFeatures = [];
    if (capabilities.orders) enabledFeatures.push('siparişler');
    if (capabilities.products) enabledFeatures.push('ürünler');
    if (capabilities.stock) enabledFeatures.push('stok');
    
    sendSuccess(res, `Senkronizasyon başlatıldı. ${enabledFeatures.join(', ')} arka planda çekiliyor...`);
  });

  /**
   * GET /api/integrations/:id/logs
   */
  getSyncLogs = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const integration = await prisma.marketplaceIntegration.findFirst({
      where: {
        id: req.params.id,
        companyId: this.getCompanyId(req),
      },
    });

    if (!integration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }

    const logs = await prisma.syncLog.findMany({
      where: {
        companyId: this.getCompanyId(req),
        marketplace: integration.type,
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Son 50 log
    });

    sendSuccess(res, 'Sync logları listelendi', logs);
  });

  /**
   * GET /api/integrations/system-status
   */
  getSystemStatus = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { env } = await import('../config/env.js');
    
    const activeIntegrations = await prisma.marketplaceIntegration.count({
      where: {
        companyId: this.getCompanyId(req),
        status: 'ACTIVE',
      },
    });

    const totalIntegrations = await prisma.marketplaceIntegration.count({
      where: {
        companyId: this.getCompanyId(req),
      },
    });

    const lastSyncLog = await prisma.syncLog.findFirst({
      where: {
        companyId: this.getCompanyId(req),
      },
      orderBy: { createdAt: 'desc' },
    });

    sendSuccess(res, 'Sistem durumu', {
      nodeEnv: env.NODE_ENV,
      cronJobsEnabled: env.NODE_ENV !== 'test',
      activeIntegrations,
      totalIntegrations,
      lastSyncAt: lastSyncLog?.createdAt || null,
      lastSyncStatus: lastSyncLog?.status || null,
    });
  });

  /**
   * POST /api/integrations/clear-active
   * Tüm aktif entegrasyonları siler (şifre korumalı)
   */
  clearActiveIntegrations = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { password } = z.object({
      password: z.string().min(1, 'Şifre gerekli'),
    }).parse(req.body);

    // Kullanıcının şifresini kontrol et
    const user = await prisma.user.findUnique({
      where: { id: this.getUserId(req) },
      select: { password: true },
    });

    if (!user) {
      return sendError(res, 'Kullanıcı bulunamadı', 404);
    }

    // Kullanıcının giriş şifresini kontrol et
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return sendError(res, 'Geçersiz şifre', 400);
    }

    // Tüm aktif entegrasyonları bul
    const activeIntegrations = await prisma.marketplaceIntegration.findMany({
      where: {
        companyId: this.getCompanyId(req),
        status: 'ACTIVE',
      },
      select: {
        id: true,
        type: true,
      },
    });

    if (activeIntegrations.length === 0) {
      return sendSuccess(res, 'Silinecek aktif entegrasyon bulunamadı', {
        deletedCount: 0,
        deletedOrders: 0,
        deletedProducts: 0,
        deletedSyncLogs: 0,
      });
    }

    const integrationIds = activeIntegrations.map(i => i.id);
    const marketplaceTypes = activeIntegrations.map(i => i.type);

    // Önce kaç tane veri olduğunu kontrol et
    // NOT: Eğer entegrasyonlar daha önce silinmişse, order'ların integrationId'si NULL olmuş olabilir
    // Bu durumda sadece aktif entegrasyonlara ait order'ları silebiliriz
    const ordersToDelete = await prisma.order.count({
      where: {
        integrationId: { in: integrationIds },
        companyId: this.getCompanyId(req),
      },
    });

    // Ayrıca integrationId NULL olan ama marketplaceOrderId olan order'ları da sayalım (daha önce silinmiş entegrasyonlar)
    const orphanedOrders = await prisma.order.count({
      where: {
        integrationId: null,
        marketplaceOrderId: { not: null },
        companyId: this.getCompanyId(req),
      },
    });

    const productsToDelete = await prisma.marketplaceProduct.count({
      where: {
        integrationId: { in: integrationIds },
      },
    });

    const syncLogsToDelete = await prisma.syncLog.count({
      where: {
        companyId: this.getCompanyId(req),
        marketplace: { in: marketplaceTypes },
      },
    });

    // Transaction içinde tüm ilgili verileri sil
    // ÖNEMLİ: Order'ların integrationId'si ON DELETE SET NULL olduğu için,
    // entegrasyonları silmeden ÖNCE order'ları silmeliyiz
    const result = await prisma.$transaction(async (tx) => {
      // 1. ÖNCE Entegrasyonla gelen siparişleri sil (Return'lar otomatik silinir - onDelete: Cascade)
      const deletedOrders = await tx.order.deleteMany({
        where: {
          integrationId: { in: integrationIds },
          companyId: this.getCompanyId(req),
        },
      });

      // 2. OrderSource kayıtlarını sil (cascade ile otomatik silinir ama explicit olarak da silelim)
      const deletedOrderSources = await tx.orderSource.deleteMany({
        where: {
          integrationId: { in: integrationIds },
        },
      });

      // 3. ProductSource kayıtlarını bul ve kontrol et
      const productSources = await tx.productSource.findMany({
        where: {
          integrationId: { in: integrationIds },
        },
        select: {
          productId: true,
        },
      });

      // 4. Eski MarketplaceProduct kayıtlarını da bul (legacy support)
      const marketplaceProducts = await tx.marketplaceProduct.findMany({
        where: {
          integrationId: { in: integrationIds },
        },
        select: {
          productId: true,
        },
      });

      // Her iki kaynaktan product ID'lerini birleştir
      const allProductIds = [
        ...new Set([
          ...productSources.map((ps: { productId: string }) => ps.productId),
          ...marketplaceProducts.map((mp: { productId: string }) => mp.productId),
        ])
      ];

      // 5. Bu Product'ların başka entegrasyona bağlı olup olmadığını kontrol et
      let productsToDelete: string[] = [];
      
      if (allProductIds.length > 0) {
        logger.info(`[CLEANUP] ${allProductIds.length} ürün kontrol ediliyor...`);
        
        for (const productId of allProductIds) {
          // ProductSource üzerinden kontrol
          const otherProductSource = await tx.productSource.findFirst({
            where: {
              productId: productId,
              integrationId: { notIn: integrationIds },
            },
          });

          // MarketplaceProduct üzerinden kontrol (legacy)
          const otherMarketplaceProduct = await tx.marketplaceProduct.findFirst({
            where: {
              productId: productId,
              integrationId: { notIn: integrationIds },
            },
          });

          // Eğer hiçbir başka entegrasyona bağlı değilse, silinecek listesine ekle
          if (!otherProductSource && !otherMarketplaceProduct) {
            productsToDelete.push(productId);
          }
        }
        
        logger.info(`[CLEANUP] ${productsToDelete.length} ürün silinecek (${allProductIds.length - productsToDelete.length} ürün başka entegrasyonlara bağlı)`);
      }

      // 6. BLOCKING RELATIONS: Check for records that prevent product deletion
      // InventoryCountItem has onDelete: Restrict - MUST be deleted first
      // OrderItem has onDelete: SetNull in schema but Restrict in migration - check both
      let deletedInventoryCountItems = 0;
      let deletedOrderItems = 0;
      
      if (productsToDelete.length > 0) {
        // Check for inventory count items (BLOCKS deletion)
        const inventoryCountItems = await tx.inventoryCountItem.findMany({
          where: {
            productId: { in: productsToDelete },
          },
          select: {
            id: true,
            countId: true,
            productId: true,
          },
        });

        if (inventoryCountItems.length > 0) {
          logger.info(`[CLEANUP] ${inventoryCountItems.length} inventory count item bulundu, siliniyor...`);
          
          // Delete inventory count items (they block product deletion with Restrict)
          const deletedItems = await tx.inventoryCountItem.deleteMany({
            where: {
              productId: { in: productsToDelete },
            },
          });
          deletedInventoryCountItems = deletedItems.count;
          logger.info(`[CLEANUP] ${deletedInventoryCountItems} inventory count item silindi`);
        }

        // Check for any order items referencing these products
        // OrderItem might have onDelete: Restrict in some database migrations
        // Even though orders are deleted first, there might be orphaned items
        const orderItemsCount = await tx.orderItem.count({
          where: {
            productId: { in: productsToDelete },
          },
        });

        if (orderItemsCount > 0) {
          logger.info(`[CLEANUP] ${orderItemsCount} order item bulundu, kontrol ediliyor...`);
          
          // Find orders that still exist for these order items
          const orderItems = await tx.orderItem.findMany({
            where: {
              productId: { in: productsToDelete },
            },
            select: {
              id: true,
              orderId: true,
              productId: true,
            },
          });

          // Check if any of these orders still exist
          const orderIds = [...new Set(orderItems.map(item => item.orderId))];
          const existingOrders = await tx.order.findMany({
            where: {
              id: { in: orderIds },
            },
            select: {
              id: true,
            },
          });

          const existingOrderIds = new Set(existingOrders.map(o => o.id));
          const orphanedItems = orderItems.filter(item => !existingOrderIds.has(item.orderId));

          if (orphanedItems.length > 0) {
            logger.info(`[CLEANUP] ${orphanedItems.length} orphaned order item bulundu, siliniyor...`);
            
            // Delete orphaned order items (orders already deleted)
            const deletedItems = await tx.orderItem.deleteMany({
              where: {
                id: { in: orphanedItems.map(item => item.id) },
              },
            });
            deletedOrderItems = deletedItems.count;
            logger.info(`[CLEANUP] ${deletedOrderItems} orphaned order item silindi`);
          } else {
            logger.warn(`[CLEANUP] ${orderItemsCount} order item bulundu ama hepsi aktif siparişlere ait. Bu ürünler silinemeyebilir.`);
          }
        }
      }

      // 7. Sadece bu entegrasyonlara ait olan Product'ları sil
      let deletedProductsCount = 0;
      if (productsToDelete.length > 0) {
        logger.info(`[CLEANUP] ${productsToDelete.length} ürün siliniyor... Product IDs: ${productsToDelete.slice(0, 10).join(', ')}${productsToDelete.length > 10 ? '...' : ''}`);
        
        try {
          const deletedProducts = await tx.product.deleteMany({
            where: {
              id: { in: productsToDelete },
              companyId: this.getCompanyId(req), // Güvenlik: sadece aynı şirkete ait ürünleri sil
            },
          });
          deletedProductsCount = deletedProducts.count;
          
          if (deletedProductsCount !== productsToDelete.length) {
            logger.warn(`[CLEANUP] UYARI: ${productsToDelete.length} ürün silinmeye çalışıldı ama sadece ${deletedProductsCount} ürün silindi!`);
            
            // Find which products were NOT deleted
            const remainingProducts = await tx.product.findMany({
              where: {
                id: { in: productsToDelete },
                companyId: this.getCompanyId(req),
              },
              select: {
                id: true,
                sku: true,
                name: true,
              },
            });
            
            if (remainingProducts.length > 0) {
              logger.error(`[CLEANUP] Silinmeyen ürünler: ${remainingProducts.map(p => `${p.sku} (${p.name})`).join(', ')}`);
              
              // Check what's blocking them
              for (const product of remainingProducts) {
                const blockingCountItems = await tx.inventoryCountItem.count({
                  where: { productId: product.id },
                });
                const blockingOrderItems = await tx.orderItem.count({
                  where: { productId: product.id },
                });
                
                logger.error(`[CLEANUP] Ürün ${product.sku} bloklanıyor: ${blockingCountItems} inventory count item, ${blockingOrderItems} order item`);
              }
            }
          } else {
            logger.info(`[CLEANUP] ✅ ${deletedProductsCount} ürün başarıyla silindi`);
          }
        } catch (error: any) {
          logger.error(`[CLEANUP] Ürün silme hatası:`, error);
          // Don't throw - continue with other deletions
          // The error might be due to foreign key constraints
        }
      }

      // 7. MarketplaceProduct'ları sil (legacy - ProductSource zaten cascade ile silinecek)
      const deletedMarketplaceProducts = await tx.marketplaceProduct.deleteMany({
        where: {
          integrationId: { in: integrationIds },
        },
      });

      // 8. ProductSource kayıtlarını sil (cascade ile otomatik silinir ama explicit olarak da silelim)
      const deletedProductSources = await tx.productSource.deleteMany({
        where: {
          integrationId: { in: integrationIds },
        },
      });

      // 9. SyncLog'ları sil
      const deletedSyncLogs = await tx.syncLog.deleteMany({
        where: {
          companyId: this.getCompanyId(req),
          marketplace: { in: marketplaceTypes },
        },
      });

      // 10. SON OLARAK Entegrasyonları sil (cascade ile ProductSource, OrderSource otomatik silinir)
      const deletedIntegrations = await tx.marketplaceIntegration.deleteMany({
        where: {
          id: { in: integrationIds },
        },
      });

      return {
        deletedCount: deletedIntegrations.count,
        deletedOrders: deletedOrders.count,
        deletedProducts: deletedProductsCount,
        deletedMarketplaceProducts: deletedMarketplaceProducts.count,
        deletedProductSources: deletedProductSources.count,
        deletedOrderSources: deletedOrderSources.count,
        deletedInventoryCountItems: deletedInventoryCountItems,
        deletedOrderItems: deletedOrderItems,
        deletedSyncLogs: deletedSyncLogs.count,
        expectedOrders: ordersToDelete,
        expectedProducts: productsToDelete.length,
        attemptedProducts: productsToDelete,
        expectedSyncLogs: syncLogsToDelete,
        orphanedOrders: orphanedOrders,
      };
    });

    // Detaylı log mesajı
    let message = `${result.deletedCount} aktif entegrasyon, ${result.deletedOrders} sipariş, ${result.deletedProducts} ürün, ${result.deletedMarketplaceProducts} marketplace ürün kaydı, ${result.deletedProductSources} ürün kaynağı, ${result.deletedOrderSources} sipariş kaynağı, ${result.deletedInventoryCountItems} inventory count item, ${result.deletedOrderItems} order item ve ${result.deletedSyncLogs} senkronizasyon logu silindi`;
    
    // Eğer beklenen ve silinen ürün sayısı eşleşmiyorsa uyarı ver
    if (result.expectedProducts > 0 && result.deletedProducts !== result.expectedProducts) {
      message += `. UYARI: ${result.expectedProducts} ürün silinmeye çalışıldı ama sadece ${result.deletedProducts} ürün silindi. Bazı ürünler bloklanıyor olabilir.`;
      logger.warn(`[CLEANUP] Ürün silme uyumsuzluğu: ${result.expectedProducts} beklenen, ${result.deletedProducts} silinen`);
    }
    
    // Eğer orphaned order'lar varsa uyarı ver
    if (result.orphanedOrders > 0) {
      message += `. Not: ${result.orphanedOrders} adet entegrasyonu silinmiş sipariş bulundu (integrationId NULL). Bu siparişler manuel olarak silinmelidir.`;
    }
    
    sendSuccess(res, message, {
      deletedCount: result.deletedCount,
      deletedOrders: result.deletedOrders,
      deletedProducts: result.deletedProducts,
      deletedMarketplaceProducts: result.deletedMarketplaceProducts,
      deletedProductSources: result.deletedProductSources,
      deletedOrderSources: result.deletedOrderSources,
      deletedSyncLogs: result.deletedSyncLogs,
      expectedOrders: result.expectedOrders,
      expectedProducts: result.expectedProducts,
      expectedSyncLogs: result.expectedSyncLogs,
      orphanedOrders: result.orphanedOrders,
    });
  });

  /**
   * POST /api/integrations/:id/manual-sync
   * Manuel sync endpoint (API testi olmadan)
   */
  manualSync = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const integration = await prisma.marketplaceIntegration.findFirst({
      where: {
        id: req.params.id,
        companyId: this.getCompanyId(req),
      },
    });

    if (!integration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }

    const settings = integration.settings as IntegrationSettings | undefined;
    if (settings?.syncMode !== SyncMode.MANUAL) {
      return sendError(res, 'Bu entegrasyon manuel sync modunda değil', 400);
    }

    logger.info(`[${integration.type}] Manuel sync başlatılıyor (ID: ${integration.id})`);

    try {
      // Create marketplace integration instance
      const marketplace = createMarketplaceIntegrationWithDecryption(
        integration.type,
        integration
      );

      // Check capabilities
      const capabilities = marketplace.capabilities;
      
      if (!capabilities.orders && !capabilities.stock && !capabilities.products) {
        return sendError(res, 'Bu entegrasyon için hiçbir özellik aktif değil', 400);
      }

      // Trigger sync operations (non-blocking)
      const syncPromises: Promise<void>[] = [];

      if (capabilities.orders) {
        syncPromises.push(
          syncIntegrationOrders(integration).catch((error) => {
            logger.error(`[${integration.type}] Manuel sync - Sipariş sync hatası:`, error);
          })
        );
      }

      if (capabilities.products) {
        syncPromises.push(
          syncIntegrationProducts(integration).catch((error) => {
            logger.error(`[${integration.type}] Manuel sync - Ürün sync hatası:`, error);
          })
        );
      }

      // Update lastSyncAt
      await prisma.marketplaceIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      });

      // Don't wait for sync to complete - return immediately
      Promise.all(syncPromises).catch((error) => {
        logger.error(`[${integration.type}] Manuel sync genel hatası:`, error);
      });

      sendSuccess(res, 'Manuel senkronizasyon başlatıldı', {
        integrationId: integration.id,
        integrationType: integration.type,
        capabilities,
      });
    } catch (error: any) {
      logger.error(`[${integration.type}] Manuel sync hatası:`, error);
      return sendError(res, `Manuel sync hatası: ${error.message}`, 500);
    }
  });

  /**
   * POST /api/integrations/cleanup-orphans
   * Temizlenmiş entegrasyonlardan kalan kalıntı kayıtları siler
   */
  cleanupOrphans = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    logger.info(`[CLEANUP] Orphan cleanup başlatılıyor - Şirket: ${this.getCompanyId(req)}`);

    try {
      const result = await orphanCleanerService.cleanAll();

      const totalDeleted = result.productSources.deleted + result.orderSources.deleted;
      const totalOrphans = result.productSources.orphans + result.orderSources.orphans;

      const message = totalDeleted > 0
        ? `${totalDeleted} kalıntı kayıt temizlendi (${result.productSources.deleted} ProductSource, ${result.orderSources.deleted} OrderSource)`
        : 'Temizlenecek kalıntı kayıt bulunamadı';

      sendSuccess(res, message, {
        productSources: result.productSources,
        orderSources: result.orderSources,
        totalDeleted,
        totalOrphans,
      });
    } catch (error) {
      logger.error('[CLEANUP] Orphan cleanup hatası:', error);
      throw error;
    }
  });

  /**
   * GET /api/integrations/:id/unmatched-products
   * Eşleşmemiş Trendyol ürünlerini listele
   */
  getUnmatchedProducts = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id: req.params.id, companyId: this.getCompanyId(req) },
    });

    if (!integration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }

    if (integration.type !== 'TRENDYOL') {
      return sendError(res, 'Bu özellik sadece Trendyol entegrasyonları için geçerlidir', 400);
    }

    try {
      // Trendyol'dan ürünleri çek
      const marketplace = createMarketplaceIntegrationWithDecryption(
        integration.type,
        integration
      );
      const products = await marketplace.syncProducts();

      // Eşleşmemiş ürünleri bul
      const unmatched = [];
      for (const productData of products) {
        if (!productData.barcode || !productData.marketplaceId) continue;

        const productSource = await prisma.productSource.findFirst({
          where: {
            integrationId: integration.id,
            externalProductId: String(productData.marketplaceId),
          },
        });

        if (!productSource) {
          // Yerel ürün var mı kontrol et
          const localProduct = await prisma.product.findFirst({
            where: {
              companyId: integration.companyId,
              OR: [
                { barcode: productData.barcode },
                { gtin: productData.barcode },
              ],
            },
            select: {
              id: true,
              sku: true,
              name: true,
              barcode: true,
              gtin: true,
            },
          });

          unmatched.push({
            marketplaceProduct: {
              id: productData.marketplaceId,
              sku: productData.sku,
              name: productData.name,
              barcode: productData.barcode,
              price: productData.price,
              stock: productData.stock,
            },
            localProduct: localProduct,
            suggestedMatch: localProduct !== null,
          });
        }
      }

      sendSuccess(res, 'Eşleşmemiş ürünler', {
        unmatched,
        total: unmatched.length,
        integrationId: integration.id,
        integrationType: integration.type,
      });
    } catch (error: any) {
      logger.error(`[${integration.type}] Eşleşmemiş ürünler listesi hatası:`, error);
      return sendError(res, `Eşleşmemiş ürünler listesi hatası: ${error.message}`, 500);
    }
  });

  /**
   * POST /api/integrations/:id/match-product
   * Manuel ürün eşleştirme yap
   */
  matchProduct = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { marketplaceProductId, localProductId } = z.object({
      marketplaceProductId: z.string().min(1, 'Marketplace ürün ID gerekli'),
      localProductId: z.string().min(1, 'Yerel ürün ID gerekli'),
    }).parse(req.body);

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id: req.params.id, companyId: this.getCompanyId(req) },
    });

    if (!integration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }

    if (integration.type !== 'TRENDYOL') {
      return sendError(res, 'Bu özellik sadece Trendyol entegrasyonları için geçerlidir', 400);
    }

    // Yerel ürünü kontrol et
    const localProduct = await prisma.product.findFirst({
      where: {
        id: localProductId,
        companyId: integration.companyId,
      },
    });

    if (!localProduct) {
      return sendNotFound(res, 'Yerel ürün bulunamadı');
    }

    // Mevcut ProductSource kontrolü
    const existingSource = await prisma.productSource.findFirst({
      where: {
        productId: localProductId,
        integrationId: integration.id,
      },
    });

    if (existingSource) {
      // Mevcut ProductSource'u güncelle
      await prisma.productSource.update({
        where: { id: existingSource.id },
        data: {
          externalProductId: marketplaceProductId,
          lastSyncAt: new Date(),
        },
      });

      logger.info(`[${integration.type}] ProductSource güncellendi: ${localProduct.sku} -> Marketplace ID: ${marketplaceProductId}`);
      return sendSuccess(res, 'Ürün eşleştirmesi güncellendi', {
        productSourceId: existingSource.id,
        productId: localProductId,
        marketplaceProductId,
      });
    }

    // Yeni ProductSource oluştur
    const productSource = await prisma.productSource.create({
      data: {
        productId: localProductId,
        integrationId: integration.id,
        externalProductId: marketplaceProductId,
        externalSku: localProduct.sku || null,
        externalBarcode: localProduct.barcode || null,
        externalPrice: localProduct.price || null,
        lastSyncAt: new Date(),
      },
    });

    logger.info(`[${integration.type}] ProductSource oluşturuldu (Manuel eşleştirme): ${localProduct.sku} -> Marketplace ID: ${marketplaceProductId}`);

    sendSuccess(res, 'Ürün eşleştirildi', {
      productSourceId: productSource.id,
      productId: localProductId,
      marketplaceProductId,
    });
  });

  /**
   * DELETE /api/integrations/:id/product-sources/:productSourceId
   * Ürün eşleştirmesini geri al
   */
  unmatchProduct = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id: req.params.id, companyId: this.getCompanyId(req) },
    });

    if (!integration) {
      return sendNotFound(res, 'Entegrasyon bulunamadı');
    }

    const productSource = await prisma.productSource.findFirst({
      where: {
        id: req.params.productSourceId,
        integrationId: integration.id,
      },
      include: {
        product: true,
      },
    });

    if (!productSource) {
      return sendNotFound(res, 'ProductSource bulunamadı');
    }

    await prisma.productSource.delete({
      where: { id: productSource.id },
    });

    logger.info(`[${integration.type}] ProductSource silindi (Eşleştirme geri alındı): ${productSource.product.sku} -> Marketplace ID: ${productSource.externalProductId}`);

    sendSuccess(res, 'Ürün eşleştirmesi geri alındı', {
      productSourceId: productSource.id,
      productId: productSource.productId,
    });
  });

}

export const integrationController = new IntegrationController();

