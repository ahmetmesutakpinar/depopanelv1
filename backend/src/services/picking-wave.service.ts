import { pickingWaveRepository, CreatePickingWaveData } from '../repositories/picking-wave.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { orderRepository } from '../repositories/order.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { NotFoundError, AppError } from '../middleware/error.middleware.js';
import { PickingStrategy, WaveStatus } from '@prisma/client';
import { auditService, AuditAction, AuditResource } from './audit.service.js';
import { prisma } from '../config/index.js';
import { waveCreationService } from './wave-creation.service.js';
import { pickListService } from './pick-list.service.js';
import { logger } from '../utils/logger.js';

class PickingWaveService {
  async getWaves(companyId: string, options?: {
    page?: number;
    limit?: number;
    status?: WaveStatus;
    warehouseId?: string;
    strategy?: PickingStrategy;
  }) {
    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    return pickingWaveRepository.findByCompany(companyId, {
      skip,
      take,
      status: options?.status,
      warehouseId: options?.warehouseId,
      strategy: options?.strategy,
    });
  }

  async getWaveById(id: string, companyId: string) {
    const wave = await pickingWaveRepository.findById(id, companyId);
    if (!wave) {
      throw new NotFoundError('Toplama dalgası bulunamadı');
    }
    return wave;
  }

  async createWave(companyId: string, data: {
    warehouseId: string;
    strategy: PickingStrategy;
    priority?: number;
    orderIds?: string[];
  }) {
    // Yeni sistem: Her zaman otomatik wave oluştur (waveCreationService kullan)
    const rules = {
      orderStatus: 'READY_TO_PICK' as const,
      requireStockAvailable: false, // Stock kontrolünü esnek yap
    };

    logger.info(`[Wave] Creating wave automatically`, {
      companyId,
      warehouseId: data.warehouseId,
      priority: data.priority || 0,
    });

    const waves = await waveCreationService.createWaveAutomatically({
      companyId,
      warehouseId: data.warehouseId,
      type: 'MIXED',
      rules,
      maxOrdersPerWave: 100,
      minOrdersPerWave: 1,
      priority: data.priority || 0,
      createdBy: 'system',
    });

    if (waves.length === 0) {
      throw new AppError('Toplama için uygun sipariş bulunamadı', 400);
    }

    logger.info(`[Wave] Wave created successfully`, {
      wavesCreated: waves.length,
      totalOrders: waves.reduce((sum, w) => sum + w.totalOrders, 0),
    });

    // İlk wave'i döndür
    return this.getWaveById(waves[0].waveId, companyId);
  }

  async updateWave(id: string, companyId: string, data: {
    status?: WaveStatus;
    priority?: number;
    assignedToId?: string;
    pickedById?: string;
    shippedById?: string;
  }, userId?: string) {
    const wave = await this.getWaveById(id, companyId);
    const updated = await pickingWaveRepository.update(id, {
      ...data,
      ...(data.pickedById && { pickedAt: new Date() }),
      ...(data.shippedById && { shippedAt: new Date() }),
    });

    // Audit log
    if (userId) {
      if (data.pickedById) {
        await auditService.log({
          action: AuditAction.UPDATE,
          resource: AuditResource.ORDER,
          resourceId: id,
          userId,
          companyId,
          details: {
            type: 'PICKING_WAVE_PICKED',
            waveCode: wave.code,
            pickedBy: data.pickedById,
          },
        });
      }
      if (data.shippedById) {
        await auditService.log({
          action: AuditAction.UPDATE,
          resource: AuditResource.ORDER,
          resourceId: id,
          userId,
          companyId,
          details: {
            type: 'PICKING_WAVE_SHIPPED',
            waveCode: wave.code,
            shippedBy: data.shippedById,
          },
        });
      }
    }

    return updated;
  }

  async addOrdersToWave(waveId: string, companyId: string, orderIds: string[]) {
    const wave = await this.getWaveById(waveId, companyId);

    if (wave.status === 'COMPLETED') {
      throw new AppError('Tamamlanmış dalgaya sipariş eklenemez', 400);
    }

    // Verify orders
    for (const orderId of orderIds) {
      const order = await orderRepository.findByIdAndCompany(orderId, companyId);
      if (!order) {
        throw new NotFoundError(`Sipariş bulunamadı: ${orderId}`);
      }
      if (order.warehouseId !== wave.warehouseId) {
        throw new AppError(`Sipariş ${order.orderNumber} farklı depoda`, 400);
      }
    }

    await pickingWaveRepository.addOrders(waveId, orderIds);
    return this.getWaveById(waveId, companyId);
  }

  async removeOrdersFromWave(waveId: string, companyId: string, orderIds: string[]) {
    await this.getWaveById(waveId, companyId);
    await pickingWaveRepository.removeOrders(waveId, orderIds);
    return this.getWaveById(waveId, companyId);
  }

  /**
   * Start picking (CREATED → PICKING)
   * Pick list oluşturulur, toplama başlar
   */
  async startWave(id: string, companyId: string) {
    const wave = await this.getWaveById(id, companyId);

    // Status kontrolü: CREATED veya PENDING (backward compatibility)
    if (wave.status !== 'CREATED' && wave.status !== 'PENDING') {
      throw new AppError(`Wave status is ${wave.status}, must be CREATED to start picking`, 400);
    }

    if (wave.orders.length === 0) {
      throw new AppError('Wave must contain at least one order', 400);
    }

    // Check for stock exceptions before starting (sadece flag'le, engelleme)
    await waveCreationService.checkStockExceptions(id, companyId);
    
    const updatedWave = await prisma.pickingWave.findUnique({
      where: { id },
    });

    // Type assertion - Prisma Client generate edildikten sonra kaldırılabilir
    const waveWithStock = updatedWave as any;
    if (waveWithStock?.hasStockIssue) {
      // Stock issue varsa sadece log'la, wave'i başlatmaya devam et
      logger.warn(`[Wave] Wave ${wave.code} has stock issues but starting anyway`, {
        waveId: id,
        stockIssueNote: waveWithStock.stockIssueNote,
      });
    }

    // Status: CREATED → PICKING (yeni sistem) veya IN_PROGRESS (eski sistem backward compatibility)
    const started = await prisma.pickingWave.update({
      where: { id },
      data: {
        status: 'PICKING', // Gerçek PICKING status'ü
        startedAt: new Date(),
      },
    });

    logger.info(`[Wave] Wave ${wave.code} started picking`, {
      waveId: id,
      totalOrders: wave.orders.length,
    });

    return started;
  }

  /**
   * Complete picking (PICKING → PACKING)
   * Tüm ürünler toplandı, siparişler PICKED durumuna geçer, paketleme aşamasına geçilir
   */
  async completePicking(id: string, companyId: string) {
    const wave = await this.getWaveById(id, companyId);

    // Status kontrolü: PICKING veya IN_PROGRESS (backward compatibility)
    if (wave.status !== 'PICKING' && wave.status !== 'IN_PROGRESS') {
      throw new AppError(`Wave status is ${wave.status}, must be PICKING to complete picking`, 400);
    }

    // Eğer siparişler zaten PACKED veya SHIPPED ise, toplama kontrolünü atla
    const alreadyPackedOrShipped = wave.orders.every(o => 
      o.status === 'PACKED' || o.status === 'SHIPPED' || o.status === 'DELIVERED' || o.status === 'PICKED'
    );

    if (!alreadyPackedOrShipped) {
      // Tüm ürünlerin toplandığını kontrol et
      const aggregated = await this.aggregateOrderItems(id, companyId);
      const incompleteItems = aggregated.aggregatedItems.filter(item => 
        item.pickedQuantity < item.totalQuantity
      );

      if (incompleteItems.length > 0) {
        const missingItems = incompleteItems.map(item => 
          `${item.productName} (${item.productSku}): ${item.pickedQuantity}/${item.totalQuantity}`
        ).join(', ');
        
        throw new AppError(
          `Not all items are picked. Missing: ${missingItems}`,
          400
        );
      }

      // Siparişleri PICKED durumuna geçir (eğer henüz PICKED değillerse)
      await prisma.order.updateMany({
        where: {
          pickingWaveId: id,
          companyId,
          status: { in: ['READY_TO_PICK', 'PENDING', 'PROCESSING'] as any },
        },
        data: {
          status: 'PICKED' as any,
        },
      });
    }

    // Status: PICKING → PACKING
    const updated = await prisma.pickingWave.update({
      where: { id },
      data: {
        status: 'PACKING',
        pickedAt: new Date(),
      },
    });

    logger.info(`[Wave] Wave ${wave.code} completed picking, moved to packing`, {
      waveId: id,
      totalOrders: wave.orders.length,
    });

    return updated;
  }

  /**
   * Transition wave from PICKING to PACKING (backward compatibility)
   * @deprecated Use completePicking instead
   */
  async transitionToPacking(id: string, companyId: string) {
    return this.completePicking(id, companyId);
  }

  /**
   * Mark single order as PACKED (bireysel paketleme)
   * Wave PACKING durumunda kalır
   */
  async markOrderAsPacked(waveId: string, orderId: string, companyId: string) {
    const wave = await this.getWaveById(waveId, companyId);
    
    // Wave must be in PACKING status
    if (wave.status !== 'PACKING' && wave.status !== 'IN_PROGRESS') {
      throw new AppError(`Wave status is ${wave.status}, must be PACKING to pack orders`, 400);
    }
    
    // Verify order belongs to this wave
    const order = wave.orders.find(o => o.id === orderId);
    if (!order) {
      throw new AppError('Order does not belong to this wave', 404);
    }
    
    // Order must be PICKED before packing
    if (order.status !== 'PICKED' && order.status !== 'READY_TO_PICK' && order.status !== 'PENDING') {
      throw new AppError(`Order status is ${order.status}, must be PICKED to pack`, 400);
    }
    
    // Mark order as PACKED
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PACKED' as any,
      },
    });
    
    logger.info(`[Wave] Order ${order.orderNumber} marked as packed in wave ${wave.code}`, {
      waveId,
      orderId,
    });
    
    // Refresh wave to get updated order statuses
    const updatedWave = await this.getWaveById(waveId, companyId);
    
    return { wave: updatedWave, order: { ...order, status: 'PACKED' } };
  }

  /**
   * Mark single order as SHIPPED (partial shipment desteği)
   * Wave tüm siparişler SHIPPED olunca otomatik CLOSED olur
   */
  async markOrderAsShipped(waveId: string, orderId: string, companyId: string, data?: {
    trackingNumber?: string;
    cargoCompanyId?: string;
  }) {
    const wave = await this.getWaveById(waveId, companyId);
    
    // Wave must be in PACKING or SHIPPED status (partial shipment)
    if (wave.status !== 'PACKING' && wave.status !== 'SHIPPED' && wave.status !== 'IN_PROGRESS') {
      throw new AppError(`Wave status is ${wave.status}, cannot ship orders`, 400);
    }
    
    // Verify order belongs to this wave
    const order = wave.orders.find(o => o.id === orderId);
    if (!order) {
      throw new AppError('Order does not belong to this wave', 404);
    }
    
    // Order must be PACKED before shipping
    if (order.status !== 'PACKED' && order.status !== 'PROCESSING') {
      throw new AppError(`Order status is ${order.status}, must be PACKED to ship`, 400);
    }
    
    // Mark order as SHIPPED
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        shippedAt: new Date(),
        trackingNumber: data?.trackingNumber,
        cargoCompanyId: data?.cargoCompanyId,
      },
    });
    
    // Refresh wave to get updated order statuses
    const updatedWave = await this.getWaveById(waveId, companyId);
    
    // Check if all orders are shipped (current order is already SHIPPED, check others)
    const unshippedOrders = updatedWave.orders.filter(o => 
      o.status !== 'SHIPPED' && o.status !== 'DELIVERED'
    );
    
    if (unshippedOrders.length === 0) {
      // Tüm siparişler SHIPPED → Wave otomatik CLOSED
      await prisma.pickingWave.update({
        where: { id: waveId },
        data: {
          status: 'CLOSED',
          shippedAt: new Date(),
          closedAt: new Date(),
          completedAt: new Date(),
        } as any,
      });
      
      logger.info(`[Wave] All orders shipped in wave ${wave.code}, wave automatically closed`, {
        waveId,
        totalOrders: updatedWave.orders.length,
      });
    } else {
      // Partial shipment: Wave SHIPPED durumuna geç (ama açık kalır)
      if (wave.status !== 'SHIPPED') {
        await prisma.pickingWave.update({
          where: { id: waveId },
          data: {
            status: 'SHIPPED', // Partial shipment durumu
            shippedAt: new Date(),
          },
        });
      }
      
      logger.info(`[Wave] Order ${order.orderNumber} shipped in wave ${wave.code} (partial)`, {
        waveId,
        orderId,
        remainingUnshipped: unshippedOrders.length,
      });
    }
    
    return { wave: await this.getWaveById(waveId, companyId), order, allShipped: unshippedOrders.length === 0 };
  }

  /**
   * Transition wave from PACKING to SHIPPED (all orders shipped)
   * @deprecated Use markOrderAsShipped for individual orders instead
   */
  async transitionToShipped(id: string, companyId: string) {
    const wave = await this.getWaveById(id, companyId);

    // Check if all orders are shipped
    const unshippedOrders = wave.orders.filter(o => 
      o.status !== 'SHIPPED' && o.status !== 'DELIVERED'
    );

    if (unshippedOrders.length > 0) {
      throw new AppError(
        `Not all orders are shipped. Unshipped: ${unshippedOrders.map(o => o.orderNumber).join(', ')}`,
        400
      );
    }

    // All orders shipped → CLOSED
    const updated = await prisma.pickingWave.update({
      where: { id },
        data: {
          status: 'CLOSED',
          shippedAt: new Date(),
          completedAt: new Date(),
        } as any,
    });

    logger.info(`[Wave] Wave ${wave.code} all orders shipped, wave closed`, {
      waveId: id,
    });

    return updated;
  }

  /**
   * Close wave manually (SHIPPED → CLOSED)
   * Sadece tüm siparişler SHIPPED ise kapatılabilir
   */
  async closeWave(id: string, companyId: string) {
    const wave = await this.getWaveById(id, companyId);
    
    // Wave must be SHIPPED or CLOSED
    if (wave.status !== 'SHIPPED' && wave.status !== 'CLOSED' && wave.status !== 'COMPLETED') {
      throw new AppError(`Wave status is ${wave.status}, must be SHIPPED to close`, 400);
    }
    
    // Check if all orders are shipped
    const unshippedOrders = wave.orders.filter(o => 
      o.status !== 'SHIPPED' && o.status !== 'DELIVERED'
    );
    
    if (unshippedOrders.length > 0) {
      throw new AppError(
        `Cannot close wave. Unshipped orders: ${unshippedOrders.map(o => o.orderNumber).join(', ')}`,
        400
      );
    }
    
    const updated = await prisma.pickingWave.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        completedAt: wave.completedAt || new Date(),
      } as any,
    });
    
    logger.info(`[Wave] Wave ${wave.code} closed`, {
      waveId: id,
    });
    
    return updated;
  }

  async completeWave(id: string, companyId: string) {
    const wave = await this.getWaveById(id, companyId);

    // Eski sistem: IN_PROGRESS status'ünde olmalı
    if (wave.status !== 'IN_PROGRESS' && wave.status !== 'PICKING' && wave.status !== 'PACKING') {
      throw new AppError(`Wave status is ${wave.status}, cannot complete`, 400);
    }

    // ✅ YENİ: Tüm ürünlerin doğru miktarda toplandığını kontrol et
    const aggregated = await this.aggregateOrderItems(id, companyId);
    
    const incompleteItems = aggregated.aggregatedItems.filter(item => 
      item.pickedQuantity < item.totalQuantity
    );

    if (incompleteItems.length > 0) {
      const missingItems = incompleteItems.map(item => 
        `${item.productName} (${item.productSku}): ${item.pickedQuantity}/${item.totalQuantity} adet`
      ).join(', ');
      
      throw new AppError(
        `Tüm ürünler toplanmadı. Eksikler: ${missingItems}`,
        400
      );
    }

    // Check if all orders are processed (yeni sistem: PICKED, PACKED, SHIPPED olmalı)
    // Eski sistem backward compatibility: PENDING, PROCESSING kontrolü
    const unprocessedOrders = wave.orders.filter(o => {
      const status = o.status;
      // Yeni sistem status'leri: READY_TO_PICK, PICKED, PACKED, SHIPPED, DELIVERED
      // Eski sistem status'leri: PENDING, PROCESSING
      return status === 'PENDING' || status === 'PROCESSING' || 
             status === 'READY_TO_PICK' || status === 'NEW' || status === 'PAID';
    });

    if (unprocessedOrders.length > 0) {
      const orderNumbers = unprocessedOrders.map(o => o.orderNumber).join(', ');
      throw new AppError(
        `Tüm siparişler işlenmeden dalga tamamlanamaz. İşlenmemiş siparişler: ${orderNumbers}`,
        400
      );
    }

    // Eski sistem: IN_PROGRESS → COMPLETED
    return pickingWaveRepository.completeWave(id);
  }

  /**
   * Generate pick list for a wave
   */
  async generatePickList(waveId: string, companyId: string, format: 'print' | 'mobile' = 'mobile') {
    const wave = await this.getWaveById(waveId, companyId);

    // Eski sistem: PENDING veya IN_PROGRESS status'ünde olmalı
    if (wave.status !== 'PENDING' && wave.status !== 'IN_PROGRESS' && wave.status !== 'CREATED' && wave.status !== 'PICKING') {
      throw new AppError(`Wave must be in PENDING or IN_PROGRESS status to generate pick list`, 400);
    }

    if (format === 'print') {
      return pickListService.generatePrintablePickList(waveId, companyId);
    } else {
      return pickListService.generateMobilePickList(waveId, companyId);
    }
  }

  /**
   * Handle order cancellation - remove from wave
   */
  async handleOrderCancellation(orderId: string, companyId: string) {
    await waveCreationService.handleOrderCancellation(orderId, companyId);
  }

  async deleteWave(id: string, companyId: string) {
    const wave = await this.getWaveById(id, companyId);

    // ✅ DÜZELTME: Devam eden dalgalar da silinebilir (sadece admin tarafından)
    // Önceki kısıtlama kaldırıldı - tüm durumlardaki dalgalar silinebilir
    // if (wave.status === 'IN_PROGRESS' || wave.status === 'PICKING' || wave.status === 'PACKING') {
    //   throw new AppError('Devam eden dalgalar silinemez', 400);
    // }

    logger.info(`[Wave] Wave siliniyor: ${wave.code}`, {
      waveId: id,
      status: wave.status,
      totalOrders: wave.orders.length,
      warning: wave.status === 'IN_PROGRESS' || wave.status === 'PICKING' || wave.status === 'PACKING' 
        ? 'Devam eden dalga siliniyor - siparişler dalgadan çıkarılacak' 
        : undefined,
    });

    await pickingWaveRepository.delete(id);
    
    logger.info(`[Wave] Wave silindi: ${wave.code}`, {
      waveId: id,
      status: wave.status,
    });
  }

  async autoCreateWave(companyId: string, data: {
    warehouseId: string;
    strategy: PickingStrategy;
    maxOrders?: number;
    priority?: number;
  }) {
    // Yeni sistem: waveCreationService kullan
    // Stock kontrolünü esnek yap: Stock yetersiz olsa bile wave oluştur, sadece flag'le
    const rules = {
      orderStatus: 'READY_TO_PICK' as const,
      requireStockAvailable: false, // Stock kontrolünü devre dışı bırak (test için)
    };

    logger.info(`[Wave] Auto-creating wave`, {
      companyId,
      warehouseId: data.warehouseId,
      maxOrders: data.maxOrders || 50,
    });

    const waves = await waveCreationService.createWaveAutomatically({
      companyId,
      warehouseId: data.warehouseId,
      type: 'MIXED',
      rules,
      maxOrdersPerWave: data.maxOrders || 100, // Default'u 50'den 100'e çıkar
      minOrdersPerWave: 1,
      priority: data.priority || 0,
      createdBy: 'system',
    });

    logger.info(`[Wave] Auto-create result`, {
      wavesCreated: waves.length,
      totalOrdersInWaves: waves.reduce((sum, w) => sum + w.totalOrders, 0),
      waveDetails: waves.map(w => ({
        waveId: w.waveId,
        waveCode: w.waveCode,
        totalOrders: w.totalOrders,
        eligibleOrders: w.eligibleOrders,
        excludedOrders: w.excludedOrders,
      })),
    });

    if (waves.length === 0) {
      throw new AppError('Toplama için uygun sipariş bulunamadı', 400);
    }

    // MIXED type için tüm siparişler tek bir wave'de olmalı
    // Eğer birden fazla wave oluşturulduysa, ilkini döndür (ama bu normalde olmamalı)
    if (waves.length > 1) {
      logger.warn(`[Wave] Multiple waves created for MIXED type, returning first one`, {
        wavesCount: waves.length,
        totalOrders: waves.reduce((sum, w) => sum + w.totalOrders, 0),
      });
    }

    // İlk wave'i döndür
    return this.getWaveById(waves[0].waveId, companyId);
  }

  /**
   * Sipariş dalgasındaki tüm siparişlerin içeriklerini toplu liste haline getir
   * Örnek: A kişisi 1 kalem 1 defter, B kişisi 3 kalem 4 defter → toplam 4 kalem 5 defter
   * Barkod okutuldukça toplanan miktarları da gösterir
   */
  async aggregateOrderItems(waveId: string, companyId: string) {
    const wave = await this.getWaveById(waveId, companyId);

    // Toplanan ürünleri al (pickedItems JSON'dan)
    const pickedItems: Record<string, { pickedQty: number; lastScannedAt: string }> = 
      (wave.pickedItems as any) || {};

    // Tüm sipariş item'larını topla
    const aggregatedItems: Map<string, {
      productId: string;
      variantId: string | null;
      productName: string;
      productSku: string;
      productBarcode: string | null;
      variantName: string | null;
      totalQuantity: number;
      pickedQuantity: number;
      remainingQuantity: number;
      orders: Array<{
        id: string;
        orderNumber: string;
        customerName: string;
        items: Array<{
          productId: string;
          variantId: string | null;
          productName: string;
          productSku: string;
          barcode: string | null;
          quantity: number;
        }>;
      }>;
    }> = new Map();

    for (const order of wave.orders) {
      for (const item of order.items) {
        // ✅ YENİ MANTIK: SKU öncelikli (depo personeli SKU'ya göre toplama yapar)
        // 1. SKU + variantId (en öncelikli - aynı SKU'lar birleştirilir, productId farklı olsa bile)
        // 2. barcode + variantId (SKU yoksa)
        // 3. productId + variantId (son çare)
        // Bu sayede aynı SKU'ya sahip ürünler farklı siparişlerde tek satırda toplanır
        let key: string;
        let pickedKey: string;
        
        // Önce SKU'yu kontrol et (item.sku veya item.product?.sku)
        const sku = (item.sku || item.product?.sku || '').trim().toUpperCase();
        const barcode = (item.barcode || item.product?.barcode || '').trim().toUpperCase();
        
        if (sku && sku !== '') {
          // SKU varsa, SKU'ya göre birleştir (productId farklı olsa bile)
          key = `sku-${sku}-${item.variantId || 'no-variant'}`;
          pickedKey = key;
        } else if (barcode && barcode !== '') {
          // SKU yoksa, barcode'a göre birleştir
          key = `barcode-${barcode}-${item.variantId || 'no-variant'}`;
          pickedKey = key;
        } else if (item.productId) {
          // Son çare: productId (SKU ve barcode yoksa)
          key = `${item.productId}-${item.variantId || 'no-variant'}`;
          pickedKey = key;
        } else {
          // Hiçbiri yoksa, item ID kullan
          key = `item-${item.id}-${item.variantId || 'no-variant'}`;
          pickedKey = key;
        }
        
        if (!aggregatedItems.has(key)) {
          const pickedData = pickedItems[pickedKey] || null;
          
          aggregatedItems.set(key, {
            productId: item.productId || '',
            variantId: item.variantId || null,
            productName: item.name || item.product?.name || '', // Önce entegrasyondan gelen name
            productSku: item.sku || item.product?.sku || '', // Önce entegrasyondan gelen SKU
            productBarcode: item.barcode || item.product?.barcode || null, // Önce entegrasyondan gelen barcode
            variantName: item.variant?.name || null,
            totalQuantity: 0,
            pickedQuantity: pickedData?.pickedQty || 0,
            remainingQuantity: 0,
            orders: [],
          });
        }

        const aggregated = aggregatedItems.get(key)!;
        aggregated.totalQuantity += item.quantity;
        
        // Aynı siparişte aynı ürün birden fazla kez varsa, tüm item'ları ekle
        const existingOrder = aggregated.orders.find(o => o.id === order.id);
        if (existingOrder) {
          // Aynı siparişte aynı ürün zaten var, item'ı ekle
          existingOrder.items.push({
            productId: item.productId || '',
            variantId: item.variantId || null,
            productName: item.name || item.product?.name || '',
            productSku: item.sku || item.product?.sku || '',
            barcode: item.barcode || item.product?.barcode || null,
            quantity: item.quantity,
          });
        } else {
          // Yeni sipariş, ekle
          aggregated.orders.push({
            id: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            items: [{
              productId: item.productId || '',
              variantId: item.variantId || null,
              productName: item.name || item.product?.name || '',
              productSku: item.sku || item.product?.sku || '',
              barcode: item.barcode || item.product?.barcode || null,
              quantity: item.quantity,
            }],
          });
        }
      }
    }

    // Kalan miktarları hesapla
    const finalItems = Array.from(aggregatedItems.values()).map(item => ({
      ...item,
      remainingQuantity: Math.max(0, item.totalQuantity - item.pickedQuantity),
    }));

    return {
      waveId: wave.id,
      waveCode: wave.code,
      warehouseId: wave.warehouseId,
      totalOrders: wave.orders.length,
      aggregatedItems: finalItems,
      orders: wave.orders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        status: o.status, // Order status'ü eklendi
        items: o.items.map((i: any) => ({
          productId: i.productId,
          variantId: i.variantId,
          productName: i.name || i.product?.name || '', // Önce entegrasyondan gelen name
          productSku: i.sku || i.product?.sku || '', // Önce entegrasyondan gelen SKU
          barcode: i.barcode || i.product?.barcode || null, // Entegrasyondan gelen barcode
          quantity: i.quantity,
        })),
      })),
    };
  }

  /**
   * Toplama işlemini kaydet
   */
  async markAsPicked(waveId: string, companyId: string, userId: string) {
    const wave = await this.getWaveById(waveId, companyId);
    
    // Eski sistem: IN_PROGRESS veya PICKING status'ünde olmalı
    if (wave.status !== 'IN_PROGRESS' && wave.status !== 'PICKING') {
      throw new AppError('Sadece devam eden dalgalar toplanabilir', 400);
    }

    return this.updateWave(waveId, companyId, {
      pickedById: userId,
    }, userId);
  }

  /**
   * Gönderim işlemini kaydet
   */
  async markAsShipped(waveId: string, companyId: string, userId: string) {
    const wave = await this.getWaveById(waveId, companyId);
    
    if (!wave.pickedById) {
      throw new AppError('Önce toplama işlemi yapılmalı', 400);
    }

    return this.updateWave(waveId, companyId, {
      shippedById: userId,
    }, userId);
  }

  /**
   * Barkod okutulduğunda ürünü toplanan listesine ekle
   * Barkod: barcode, GTIN/EAN (WooCommerce _global_unique_id) olabilir
   * SKU'ya bakmaz - sadece gerçek barkod alanlarına bakılır
   */
  async scanBarcode(waveId: string, companyId: string, barcode: string, userId?: string) {
    const wave = await this.getWaveById(waveId, companyId);

    // Eski sistem: IN_PROGRESS veya PICKING status'ünde olmalı
    if (wave.status !== 'IN_PROGRESS' && wave.status !== 'PICKING') {
      throw new AppError('Sadece devam eden dalgalar için barkod okutulabilir', 400);
    }

    const normalizedBarcode = barcode.trim().toUpperCase();

    // Tüm siparişlerdeki item'ları kontrol et
    // ✅ SKU veya barkod ile eşleşen item'ı bul (productId olmasa bile)
    let matchedItem: {
      productId: string;
      variantId: string | null;
      productName: string;
      productSku: string;
      productBarcode: string | null;
      totalQuantity: number;
    } | null = null;

    // Barkod eşleştirme utility'sini kullan (SKU da dahil)
    const { findOrderItemByBarcode } = await import('../utils/barcode-matcher.js');

    for (const order of wave.orders) {
      const foundItem = findOrderItemByBarcode(normalizedBarcode, order.items);
      if (foundItem) {
        const itemAny = foundItem as any;
        matchedItem = {
          productId: itemAny.productId || (foundItem.product as any)?.id || '',
          variantId: itemAny.variantId || (foundItem.variant as any)?.id || null,
          productName: itemAny.name || (foundItem.product as any)?.name || '', // Önce entegrasyondan gelen name
          productSku: itemAny.sku || foundItem.product?.sku || '', // Önce entegrasyondan gelen SKU
          productBarcode: itemAny.barcode || foundItem.product?.barcode || null, // Önce entegrasyondan gelen barcode
          totalQuantity: itemAny.quantity || 0,
        };
        break;
      }
    }

    if (!matchedItem) {
      throw new NotFoundError(`Barkod dalgadaki siparişlerde bulunamadı: ${normalizedBarcode}`);
    }

    // If productId is null/empty, try to resolve from SKU
    if (!matchedItem.productId || matchedItem.productId === '') {
      const matchedSku = (matchedItem.productSku || '').trim();
      if (matchedSku) {
        const product = await productRepository.findBySkuCaseInsensitive(
          companyId,
          matchedSku
        );

        if (product && product.isActive) {
          // Update all order items with same SKU in the wave
          await prisma.$transaction(async (tx) => {
            // Find all order items in wave orders with matching SKU
            const orderIds = wave.orders.map(o => o.id);
            const orderItemsToUpdate = await tx.orderItem.findMany({
              where: {
                orderId: { in: orderIds },
                sku: {
                  equals: matchedSku,
                  mode: 'insensitive',
                },
                productId: null,
              },
            });

            // Update all matching order items
            if (orderItemsToUpdate.length > 0) {
              await tx.orderItem.updateMany({
                where: {
                  id: { in: orderItemsToUpdate.map(item => item.id) },
                },
                data: { productId: product.id },
              });
            }
          });

          // Update matchedItem reference
          matchedItem.productId = product.id;
        } else {
          throw new AppError(
            `SKU ile ürün bulunamadı: ${matchedSku}`,
            400
          );
        }
      } else {
        throw new AppError(
          `SKU ile ürün bulunamadı: Sipariş item'ında SKU bulunamadı`,
          400
        );
      }
    }

    // Toplanan ürünleri al
    const pickedItems: Record<string, { pickedQty: number; lastScannedAt: string }> = 
      (wave.pickedItems as any) || {};

    // ✅ Key oluşturma mantığı aggregation ile aynı olmalı (SKU öncelikli)
    // Önce SKU'yu kontrol et
    const matchedSku = (matchedItem.productSku || '').trim().toUpperCase();
    const matchedBarcode = normalizedBarcode; // Zaten normalize edilmiş
    
    let key: string;
    if (matchedSku && matchedSku !== '') {
      // SKU varsa, SKU'ya göre key oluştur
      key = `sku-${matchedSku}-${matchedItem.variantId || 'no-variant'}`;
    } else if (matchedBarcode && matchedBarcode !== '') {
      // SKU yoksa, barcode'a göre key oluştur
      key = `barcode-${matchedBarcode}-${matchedItem.variantId || 'no-variant'}`;
    } else if (matchedItem.productId) {
      // Son çare: productId
      key = `${matchedItem.productId}-${matchedItem.variantId || 'no-variant'}`;
    } else {
      throw new AppError('Ürün tanımlanamadı (SKU, barkod veya productId gerekli)', 400);
    }

    const currentPicked = pickedItems[key]?.pickedQty || 0;

    // ✅ Toplam miktarı kontrol et - aggregation mantığı ile aynı key kullanarak
    // Tüm siparişlerde aynı SKU/barcode/productId'ye sahip item'ları topla
    let totalRequired = 0;
    for (const order of wave.orders) {
      for (const item of order.items) {
        // Aynı key mantığını kullanarak eşleştir
        const itemSku = (item.sku || item.product?.sku || '').trim().toUpperCase();
        const itemBarcode = (item.barcode || item.product?.barcode || '').trim().toUpperCase();
        
        let itemKey: string;
        if (itemSku && itemSku !== '') {
          itemKey = `sku-${itemSku}-${item.variantId || 'no-variant'}`;
        } else if (itemBarcode && itemBarcode !== '') {
          itemKey = `barcode-${itemBarcode}-${item.variantId || 'no-variant'}`;
        } else if (item.productId) {
          itemKey = `${item.productId}-${item.variantId || 'no-variant'}`;
        } else {
          continue; // Key oluşturulamazsa atla
        }
        
        // Key eşleşiyorsa miktarı ekle
        if (itemKey === key) {
          totalRequired += item.quantity;
        }
      }
    }

    // Eğer zaten toplam miktara ulaşıldıysa
    if (currentPicked >= totalRequired) {
      throw new AppError(
        `${matchedItem.productName} için tüm miktar zaten toplandı (${totalRequired}/${totalRequired})`,
        400
      );
    }

    // Toplanan miktarı artır
    pickedItems[key] = {
      pickedQty: currentPicked + 1,
      lastScannedAt: new Date().toISOString(),
    };

    // Veritabanını güncelle
    const updated = await prisma.pickingWave.update({
      where: { id: waveId },
      data: {
        pickedItems: pickedItems as any,
      },
    });

    // Güncel durumu döndür
    const aggregated = await this.aggregateOrderItems(waveId, companyId);
    // ✅ Key'e göre eşleştir (SKU öncelikli mantık ile)
    const updatedItem = aggregated.aggregatedItems.find(item => {
      const itemSku = (item.productSku || '').trim().toUpperCase();
      const itemBarcode = (item.productBarcode || '').trim().toUpperCase();
      const matchedSku = (matchedItem!.productSku || '').trim().toUpperCase();
      const matchedBarcode = (matchedItem!.productBarcode || normalizedBarcode).trim().toUpperCase();
      
      // SKU eşleşiyorsa
      if (itemSku && matchedSku && itemSku === matchedSku && item.variantId === matchedItem!.variantId) {
        return true;
      }
      // Barcode eşleşiyorsa
      if (itemBarcode && matchedBarcode && itemBarcode === matchedBarcode && item.variantId === matchedItem!.variantId) {
        return true;
      }
      // ProductId eşleşiyorsa (son çare)
      if (item.productId && matchedItem!.productId && item.productId === matchedItem!.productId && item.variantId === matchedItem!.variantId) {
        return true;
      }
      return false;
    });

    return {
      success: true,
      message: `${matchedItem.productName} toplandı`,
      product: {
        productId: matchedItem.productId,
        productSku: matchedItem.productSku,
        productName: matchedItem.productName,
        totalQuantity: totalRequired,
        pickedQuantity: currentPicked + 1,
        remainingQuantity: totalRequired - (currentPicked + 1),
      },
      wave: updated,
      aggregatedItems: aggregated.aggregatedItems,
    };
  }
}

export const pickingWaveService = new PickingWaveService();

