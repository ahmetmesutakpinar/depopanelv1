import { prisma } from '../config/index.js';
import { stockRepository } from '../repositories/stock.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { NotFoundError, AppError } from '../middleware/error.middleware.js';
import { StockLogType } from '@prisma/client';

class StockService {
  async getProductStocks(productId: string, companyId: string) {
    const product = await productRepository.findByIdAndCompany(productId, companyId);

    if (!product) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    return stockRepository.getProductStocks(productId);
  }

  async getWarehouseStocks(warehouseId: string, companyId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
    lowStock?: boolean;
  }) {
    const warehouse = await warehouseRepository.findByIdAndCompany(warehouseId, companyId);

    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    const { stocks, total } = await stockRepository.getWarehouseStocks(warehouseId, {
      skip,
      take,
      search: options?.search,
      lowStock: options?.lowStock,
    });

    return {
      stocks,
      pagination: {
        page: options?.page || 1,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async adjustStock(
    companyId: string,
    data: {
      productId: string;
      warehouseId: string;
      quantity: number;
      type: StockLogType;
      note?: string;
      reference?: string;
      variantId?: string;
      locationId?: string;
    },
    userId?: string
  ) {
    // Validate product and check if it's a Campaign SET
    const product = await productRepository.findByIdAndCompany(data.productId, companyId);
    if (!product) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    // Validate warehouse
    const warehouse = await warehouseRepository.findByIdAndCompany(data.warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    // If product is a Campaign SET (using FK relation), handle differently
    if (product.campaignSetId) {
      // For Campaign SETs, adjust CampaignStock, not component stocks
      // Only allow OUT operations on CampaignStock
      if (data.type === 'OUT') {
        const campaignStock = await prisma.campaignStock.findUnique({
          where: {
            campaignSetId_warehouseId_locationId: {
              campaignSetId: product.campaignSetId,
              warehouseId: data.warehouseId,
              locationId: data.locationId || '',
            },
          },
        });

        const availableQty = (campaignStock?.quantity || 0) - (campaignStock?.reservedQty || 0);
        
        if (availableQty < data.quantity) {
          throw new AppError(`Yetersiz Campaign SET stok. Mevcut: ${availableQty}, Talep: ${data.quantity}`, 400);
        }

        const previousQty = campaignStock!.quantity;
        const newQty = previousQty - data.quantity;

        await prisma.campaignStock.update({
          where: { id: campaignStock!.id },
          data: { quantity: newQty },
        });

        // Create stock log with SET type
        await prisma.stockLog.create({
          data: {
            type: StockLogType.OUT_SET_READY,
            quantity: data.quantity,
            previousQty,
            newQty,
            productId: data.productId,
            warehouseId: data.warehouseId,
            userId,
            setSku: product.sku,
            note: data.note || 'Campaign SET stok düşürme',
            reference: data.reference,
          },
        });

        return { success: true, message: 'Campaign SET stok düşürüldü' };
      } else if (data.type === 'IN' || data.type === 'RETURN') {
        // For IN/RETURN operations, increase CampaignStock
        let campaignStock = await prisma.campaignStock.findUnique({
          where: {
            campaignSetId_warehouseId_locationId: {
              campaignSetId: product.campaignSetId,
              warehouseId: data.warehouseId,
              locationId: data.locationId || '',
            },
          },
        });

        if (!campaignStock) {
          campaignStock = await prisma.campaignStock.create({
            data: {
              campaignSetId: product.campaignSetId,
              warehouseId: data.warehouseId,
              locationId: data.locationId || null,
              quantity: 0,
              reservedQty: 0,
            },
          });
        }

        const previousQty = campaignStock.quantity;
        const newQty = previousQty + data.quantity;

        await prisma.campaignStock.update({
          where: { id: campaignStock.id },
          data: { quantity: newQty },
        });

        // Create stock log
        await prisma.stockLog.create({
          data: {
            type: data.type === 'RETURN' ? StockLogType.RETURN_SET_READY : StockLogType.IN,
            quantity: data.quantity,
            previousQty,
            newQty,
            productId: data.productId,
            warehouseId: data.warehouseId,
            userId,
            setSku: product.sku,
            note: data.note || 'Campaign SET stok artırma',
            reference: data.reference,
          },
        });

        return { success: true, message: 'Campaign SET stok artırıldı' };
      } else {
        throw new AppError('Campaign SET için bu işlem desteklenmiyor', 400);
      }
    }

    // Normal product stock adjustment
    // For OUT operations, check if enough stock
    if (data.type === 'OUT') {
      const stock = await stockRepository.findStock(data.productId, data.warehouseId, data.variantId);
      const availableQty = (stock?.quantity || 0) - (stock?.reservedQty || 0);
      
      if (availableQty < data.quantity) {
        throw new AppError(`Yetersiz stok. Mevcut: ${availableQty}, Talep: ${data.quantity}`, 400);
      }
    }

    return stockRepository.adjustStock(
      data.productId,
      data.warehouseId,
      data.quantity,
      data.type,
      userId,
      data.note,
      data.reference,
      data.variantId
    );
  }

  async transferStock(
    companyId: string,
    data: {
      productId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
      note?: string;
      variantId?: string;
    },
    userId?: string
  ) {
    // Validate product
    const product = await productRepository.findByIdAndCompany(data.productId, companyId);
    if (!product) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    // Validate warehouses
    const [fromWarehouse, toWarehouse] = await Promise.all([
      warehouseRepository.findByIdAndCompany(data.fromWarehouseId, companyId),
      warehouseRepository.findByIdAndCompany(data.toWarehouseId, companyId),
    ]);

    if (!fromWarehouse) {
      throw new NotFoundError('Kaynak depo bulunamadı');
    }

    if (!toWarehouse) {
      throw new NotFoundError('Hedef depo bulunamadı');
    }

    if (data.fromWarehouseId === data.toWarehouseId) {
      throw new AppError('Kaynak ve hedef depo aynı olamaz', 400);
    }

    // Check if enough stock in source
    const sourceStock = await stockRepository.findStock(data.productId, data.fromWarehouseId, data.variantId);
    const availableQty = (sourceStock?.quantity || 0) - (sourceStock?.reservedQty || 0);

    if (availableQty < data.quantity) {
      throw new AppError(`Yetersiz stok. Mevcut: ${availableQty}, Transfer: ${data.quantity}`, 400);
    }

    await stockRepository.transferStock(
      data.productId,
      data.fromWarehouseId,
      data.toWarehouseId,
      data.quantity,
      userId,
      data.note,
      data.variantId
    );

    return { message: 'Transfer başarılı' };
  }

  async transferStockBetweenLocations(
    companyId: string,
    data: {
      productId: string;
      fromLocationId: string;
      toLocationId: string;
      quantity: number;
      note?: string;
      variantId?: string;
    },
    userId?: string
  ) {
    // Validate product
    const product = await productRepository.findByIdAndCompany(data.productId, companyId);
    if (!product) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    // Validate locations
    const { locationRepository } = await import('../repositories/location.repository.js');
    const [fromLocation, toLocation] = await Promise.all([
      locationRepository.findById(data.fromLocationId),
      locationRepository.findById(data.toLocationId),
    ]);

    if (!fromLocation) {
      throw new NotFoundError('Kaynak lokasyon bulunamadı');
    }

    if (!toLocation) {
      throw new NotFoundError('Hedef lokasyon bulunamadı');
    }

    // Verify locations belong to company
    const fromWarehouse = await warehouseRepository.findByIdAndCompany(fromLocation.warehouseId, companyId);
    const toWarehouse = await warehouseRepository.findByIdAndCompany(toLocation.warehouseId, companyId);

    if (!fromWarehouse || !toWarehouse) {
      throw new NotFoundError('Lokasyon depoları bulunamadı');
    }

    if (data.fromLocationId === data.toLocationId) {
      throw new AppError('Kaynak ve hedef lokasyon aynı olamaz', 400);
    }

    // Check if enough stock in source location
    const sourceStock = await stockRepository.findStock(
      data.productId,
      fromLocation.warehouseId,
      data.variantId
    );
    
    // Find stock with location
    const { prisma } = await import('../config/index.js');
    const locationStock = await prisma.stock.findFirst({
      where: {
        productId: data.productId,
        warehouseId: fromLocation.warehouseId,
        locationId: data.fromLocationId,
        variantId: data.variantId || null,
      },
    });

    const availableQty = (locationStock?.quantity || 0) - (locationStock?.reservedQty || 0);

    if (availableQty < data.quantity) {
      throw new AppError(`Yetersiz stok. Mevcut: ${availableQty}, Transfer: ${data.quantity}`, 400);
    }

    await stockRepository.transferStockBetweenLocations(
      data.productId,
      data.fromLocationId,
      data.toLocationId,
      data.quantity,
      userId,
      data.note,
      data.variantId
    );

    return { message: 'Raf transferi başarılı' };
  }

  async getStockLogs(companyId: string, options: {
    productId?: string;
    warehouseId?: string;
    type?: StockLogType;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    // Validate product if provided
    if (options.productId) {
      const product = await productRepository.findByIdAndCompany(options.productId, companyId);
      if (!product) {
        throw new NotFoundError('Ürün bulunamadı');
      }
    }

    // Validate warehouse if provided
    if (options.warehouseId) {
      const warehouse = await warehouseRepository.findByIdAndCompany(options.warehouseId, companyId);
      if (!warehouse) {
        throw new NotFoundError('Depo bulunamadı');
      }
    }

    const skip = ((options.page || 1) - 1) * (options.limit || 20);
    const take = options.limit || 20;

    const { logs, total } = await stockRepository.getStockLogs({
      productId: options.productId,
      warehouseId: options.warehouseId,
      type: options.type,
      startDate: options.startDate,
      endDate: options.endDate,
      skip,
      take,
    });

    return {
      logs,
      pagination: {
        page: options.page || 1,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async setMinQuantity(
    companyId: string,
    productId: string,
    warehouseId: string,
    minQuantity: number
  ) {
    // Validate product
    const product = await productRepository.findByIdAndCompany(productId, companyId);
    if (!product) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    // Validate warehouse
    const warehouse = await warehouseRepository.findByIdAndCompany(warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    const stock = await stockRepository.findOrCreateStock(productId, warehouseId);
    return stockRepository.updateStock(stock.id, { minQuantity });
  }

  /**
   * Get stock summary calculated from StockLog (LEDGER ARCHITECTURE)
   */
  async getStockSummary(
    companyId: string,
    filters?: {
      productIds?: string[];
      warehouseId?: string;
    }
  ) {
    return stockRepository.getStockSummary(companyId, filters);
  }
}

export const stockService = new StockService();

