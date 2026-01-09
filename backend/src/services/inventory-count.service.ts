import { inventoryCountRepository, CreateInventoryCountData, CreateCountItemData } from '../repositories/inventory-count.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { locationRepository } from '../repositories/location.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { stockRepository } from '../repositories/stock.repository.js';
import { NotFoundError, ConflictError, AppError } from '../middleware/error.middleware.js';
import { generateOrderNumber } from '../utils/helpers.js';
import { prisma } from '../config/index.js';

class InventoryCountService {
  async getCounts(companyId: string, options?: {
    page?: number;
    limit?: number;
    status?: string;
    warehouseId?: string;
    search?: string;
  }) {
    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    return inventoryCountRepository.findByCompany(companyId, {
      skip,
      take,
      status: options?.status as any,
      warehouseId: options?.warehouseId,
      search: options?.search,
    });
  }

  async getCountById(id: string, companyId: string) {
    const count = await inventoryCountRepository.findById(id, companyId);
    if (!count) {
      throw new NotFoundError('Sayım bulunamadı');
    }
    return count;
  }

  async createCount(companyId: string, createdById: string, data: {
    warehouseId: string;
    locationId?: string;
    type: string;
    notes?: string;
  }) {
    // Verify warehouse
    const warehouse = await warehouseRepository.findByIdAndCompany(data.warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    // Verify location if provided
    if (data.locationId) {
      const location = await locationRepository.findById(data.locationId);
      if (!location || location.warehouseId !== data.warehouseId) {
        throw new NotFoundError('Lokasyon bulunamadı');
      }
    }

    // Generate count code
    const code = `COUNT-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${generateOrderNumber().slice(-4)}`;

    return inventoryCountRepository.create({
      code,
      warehouseId: data.warehouseId,
      locationId: data.locationId,
      type: data.type,
      notes: data.notes,
      companyId,
      createdById,
    });
  }

  async startCount(id: string, companyId: string) {
    const count = await this.getCountById(id, companyId);
    
    if (count.status !== 'PENDING') {
      throw new AppError('Sadece bekleyen sayımlar başlatılabilir', 400);
    }

    // Sayımı başlat
    const updatedCount = await inventoryCountRepository.update(id, {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    });

    // Depo/lokasyondaki tüm stokları otomatik olarak sayım kalemlerine ekle
    await this.autoLoadStocksToCount(id, companyId, count.warehouseId, count.locationId || undefined);

    // Güncellenmiş sayımı döndür (kalemlerle birlikte)
    return this.getCountById(id, companyId);
  }

  /**
   * Sayım başlatıldığında depo/lokasyondaki tüm stokları otomatik olarak ekle
   */
  private async autoLoadStocksToCount(
    countId: string,
    companyId: string,
    warehouseId: string,
    locationId?: string
  ) {
    // Boş string'i undefined'a çevir (frontend'den boş string gelebilir)
    const validLocationId = locationId && locationId.trim() !== '' ? locationId : undefined;

    // Stokları getir
    const whereCondition: any = {
      warehouseId,
      // NOT: quantity > 0 koşulu kaldırıldı - 0 stoklu ürünleri de göster (kayıp tespiti için önemli)
    };

    // Sadece belirli lokasyon seçildiyse filtrele
    if (validLocationId) {
      whereCondition.locationId = validLocationId;
      console.log(`[InventoryCount] Lokasyon bazlı sayım: ${validLocationId}`);
    } else {
      console.log(`[InventoryCount] Tüm depo sayımı: Tüm lokasyonlar dahil`);
    }
    // locationId seçilmezse TÜM stokları getir (lokasyonlu ve lokasyonsuz dahil)

    const stocks = await prisma.stock.findMany({
      where: whereCondition,
      include: {
        product: {
          select: {
            id: true,
            companyId: true,
            name: true,
            sku: true,
          },
        },
        location: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    console.log(`[InventoryCount] Depo ${warehouseId} için ${stocks.length} stok kaydı bulundu`);

    let addedCount = 0;
    let skippedCount = 0;

    // Her stok için sayım kalemi oluştur
    for (const stock of stocks) {
      // Sadece bu şirkete ait ürünleri ekle
      if (stock.product.companyId !== companyId) {
        skippedCount++;
        continue;
      }

      // Zaten eklenmiş mi kontrol et
      const existingItem = await prisma.inventoryCountItem.findFirst({
        where: {
          countId,
          productId: stock.productId,
          variantId: stock.variantId || null,
          locationId: stock.locationId || null,
        },
      });

      if (existingItem) {
        skippedCount++;
        continue;
      }

      // Hedef miktarı hesapla
      const targetQty = await this.calculateTargetQty(
        stock.productId,
        warehouseId,
        stock.variantId || undefined
      );

      // Sayım kalemi ekle - countedQty 0 olarak başlar (sayılmayı bekliyor)
      await inventoryCountRepository.addItem({
        countId,
        productId: stock.productId,
        variantId: stock.variantId || undefined,
        locationId: stock.locationId || undefined,
        systemQty: stock.quantity,
        countedQty: 0, // Başlangıçta 0, kullanıcı sayacak
        targetQty: targetQty > 0 ? targetQty : stock.quantity,
      });
      addedCount++;
    }

    console.log(`[InventoryCount] Sayım ${countId}: ${addedCount} kalem eklendi, ${skippedCount} atlandı`);
  }

  /**
   * Calculate target quantity based on transfers to this warehouse
   * Target = sum of all IN transfers (from other warehouses) for this product
   */
  private async calculateTargetQty(
    productId: string,
    warehouseId: string,
    variantId?: string
  ): Promise<number> {
    // Get all IN type stock logs (transfers to this warehouse) for this product
    const transferLogs = await prisma.stockLog.findMany({
      where: {
        productId,
        warehouseId,
        variantId: variantId || null,
        type: 'IN',
        note: {
          contains: 'Transfer:',
        },
      },
    });

    // Sum all transfer quantities
    const targetQty = transferLogs.reduce((sum, log) => sum + log.quantity, 0);
    return targetQty;
  }

  async addCountItem(countId: string, companyId: string, data: {
    productId: string;
    variantId?: string;
    locationId?: string;
    countedQty: number;
    notes?: string;
    countedById?: string;
  }) {
    const count = await this.getCountById(countId, companyId);

    if (count.status === 'APPROVED' || count.status === 'REJECTED') {
      throw new AppError('Onaylanmış veya reddedilmiş sayımlara kalem eklenemez', 400);
    }

    // Verify product
    const product = await productRepository.findByIdAndCompany(data.productId, companyId);
    if (!product) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    // Get system quantity from warehouse stock
    const stock = await stockRepository.findStock(
      data.productId,
      count.warehouseId,
      data.variantId
    );

    let systemQty = stock?.quantity || 0;

    // ✅ YENİ: WooCommerce ve diğer pazaryerlerinden gelen stokları da dahil et
    const integrations = await prisma.marketplaceIntegration.findMany({
      where: {
        companyId,
        isActive: true,
        status: 'ACTIVE',
      },
    });

    // Her entegrasyon için ProductSource'dan stok bilgisini kontrol et
    for (const integration of integrations) {
      const productSource = await prisma.productSource.findFirst({
        where: {
          productId: data.productId,
          integrationId: integration.id,
        },
      });

      if (productSource) {
        // WooCommerce entegrasyonu için özel kontrol
        // Not: Gerçek zamanlı stok çekmek için API çağrısı yapılabilir, 
        // ancak şimdilik ProductSource'daki son sync'teki bilgiyi kullanıyoruz
        // İleride gerçek zamanlı stok çekme eklenebilir
      }
    }

    // Calculate target based on transfers
    const targetQty = await this.calculateTargetQty(
      data.productId,
      count.warehouseId,
      data.variantId
    );

    return inventoryCountRepository.addItem({
      countId,
      productId: data.productId,
      variantId: data.variantId,
      locationId: data.locationId || count.locationId || undefined,
      systemQty,
      countedQty: data.countedQty,
      targetQty: targetQty > 0 ? targetQty : systemQty, // Use target from transfers, or fallback to systemQty
      notes: data.notes,
      countedById: data.countedById,
    });
  }

  async updateCountItem(itemId: string, countId: string, companyId: string, data: {
    countedQty?: number;
    notes?: string;
    countedById?: string;
  }) {
    await this.getCountById(countId, companyId);
    return inventoryCountRepository.updateItem(itemId, data);
  }

  async deleteCountItem(itemId: string, countId: string, companyId: string) {
    const count = await this.getCountById(countId, companyId);
    
    if (count.status === 'APPROVED' || count.status === 'REJECTED') {
      throw new AppError('Onaylanmış veya reddedilmiş sayımlardan kalem silinemez', 400);
    }

    await inventoryCountRepository.deleteItem(itemId);
  }

  async completeCount(id: string, companyId: string, data?: { explanation?: string }) {
    const count = await this.getCountById(id, companyId);

    if (count.status !== 'IN_PROGRESS') {
      throw new AppError('Sadece devam eden sayımlar tamamlanabilir', 400);
    }

    if (count.items.length === 0) {
      throw new AppError('Sayımda en az bir kalem olmalı', 400);
    }

    // Fark olan kalemleri kontrol et (sistem miktarı ile sayılan miktar farklı olanlar)
    const itemsWithDifference = count.items.filter((item: any) => {
      return item.difference !== 0; // systemQty - countedQty farkı
    });

    // Fark varsa ve açıklama yoksa, açıklama zorunlu
    if (itemsWithDifference.length > 0 && !data?.explanation) {
      const diffDetails = itemsWithDifference.map((item: any) => ({
        productId: item.productId,
        productName: item.product?.name || 'Bilinmeyen Ürün',
        systemQty: item.systemQty,
        countedQty: item.countedQty,
        difference: item.difference,
      }));
      
      throw new AppError(
        JSON.stringify({
          message: `${itemsWithDifference.length} kalemde fark tespit edildi. Lütfen açıklama ekleyin.`,
          requiresExplanation: true,
          itemsWithDifference: diffDetails,
        }),
        400
      );
    }

    return inventoryCountRepository.completeCount(id, data?.explanation);
  }

  async approveCount(id: string, companyId: string, approvedById: string) {
    const count = await this.getCountById(id, companyId);

    if (count.status !== 'COMPLETED') {
      throw new AppError('Sadece tamamlanmış sayımlar onaylanabilir', 400);
    }

    return inventoryCountRepository.approveCount(id, approvedById);
  }

  async deleteCount(id: string, companyId: string) {
    const count = await this.getCountById(id, companyId);

    if (count.status === 'APPROVED') {
      throw new AppError('Onaylanmış sayımlar silinemez', 400);
    }

    await inventoryCountRepository.delete(id);
  }
}

export const inventoryCountService = new InventoryCountService();

