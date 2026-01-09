/**
 * Stock Helper Functions
 * 
 * Merkezi stock oluşturma ve yönetim fonksiyonları.
 * Tüm stock işlemleri bu helper fonksiyonlar üzerinden yapılmalı.
 */

import { prisma } from '../config/index.js';
import { Stock, StockLog, StockLogType } from '@prisma/client';
import { logger } from './logger.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';

export interface CreateStockOptions {
  productId: string;
  warehouseId: string;
  variantId?: string;
  locationId?: string;
  quantity?: number;
  minQuantity?: number;
  note?: string;
  userId?: string;
}

export interface UpdateStockOptions {
  productId: string;
  warehouseId: string;
  variantId?: string;
  quantity?: number;
  minQuantity?: number;
  note?: string;
  userId?: string;
}

/**
 * Ürünün depoda stock kaydı olduğundan emin ol
 * Yoksa 0 quantity ile oluştur
 */
export async function ensureProductStockInWarehouse(
  productId: string,
  warehouseId: string,
  variantId?: string,
  locationId?: string
): Promise<Stock> {
  const stock = await prisma.stock.findFirst({
    where: {
      productId,
      warehouseId,
      variantId: variantId || null,
      locationId: locationId || null,
    },
  });

  if (stock) {
    return stock;
  }

  // Stock kaydı yoksa oluştur
  return await prisma.stock.create({
    data: {
      productId,
      warehouseId,
      variantId: variantId || null,
      locationId: locationId || null,
      quantity: 0,
      reservedQty: 0,
      minQuantity: 0,
    },
  });
}

/**
 * Ürün için stock kaydı oluştur (StockLog ile)
 * Transaction içinde kullanılmalı
 */
export async function createProductStock(
  tx: any,
  options: CreateStockOptions
): Promise<{ stock: Stock; log?: StockLog }> {
  const {
    productId,
    warehouseId,
    variantId,
    locationId,
    quantity = 0,
    minQuantity = 0,
    note,
    userId,
  } = options;

  // Location validation - location varsa warehouse'a ait olmalı
  if (locationId) {
    const location = await tx.location.findFirst({
      where: {
        id: locationId,
        warehouseId,
      },
    });

    if (!location) {
      throw new Error(`Lokasyon ${locationId} bu depoya (${warehouseId}) ait değil`);
    }
  }

  // Stock kaydı oluştur
  const stock = await tx.stock.create({
    data: {
      productId,
      warehouseId,
      variantId: variantId || null,
      locationId: locationId || null,
      quantity,
      reservedQty: 0,
      minQuantity,
    },
  });

  // Quantity > 0 ise StockLog oluştur
  let log: StockLog | undefined;
  if (quantity > 0) {
    log = await tx.stockLog.create({
      data: {
        type: StockLogType.IN,
        quantity,
        previousQty: 0,
        newQty: quantity,
        note: note || 'Başlangıç stoğu',
        productId,
        variantId: variantId || null,
        warehouseId,
        userId: userId || null,
      },
    });
  }

  return { stock, log };
}

/**
 * Ürün stock'unu güncelle (StockLog ile)
 * Transaction içinde kullanılmalı
 */
export async function updateProductStock(
  tx: any,
  options: UpdateStockOptions
): Promise<{ stock: Stock; log: StockLog }> {
  const {
    productId,
    warehouseId,
    variantId,
    quantity,
    minQuantity,
    note,
    userId,
  } = options;

  // Mevcut stock'u bul veya oluştur
  let stock = await tx.stock.findFirst({
    where: {
      productId,
      warehouseId,
      variantId: variantId || null,
    },
  });

  if (!stock) {
    stock = await tx.stock.create({
      data: {
        productId,
        warehouseId,
        variantId: variantId || null,
        quantity: quantity || 0,
        reservedQty: 0,
        minQuantity: minQuantity || 0,
      },
    });
  }

  const previousQty = stock.quantity;
  const newQty = quantity !== undefined ? quantity : stock.quantity;
  const quantityChange = newQty - previousQty;

  // Stock güncelle
  const updatedStock = await tx.stock.update({
    where: { id: stock.id },
    data: {
      quantity: newQty,
      ...(minQuantity !== undefined && { minQuantity }),
    },
  });

  // StockLog oluştur (sadece değişiklik varsa)
  let log: StockLog;
  if (quantityChange !== 0) {
    log = await tx.stockLog.create({
      data: {
        type: quantityChange > 0 ? StockLogType.IN : StockLogType.OUT,
        quantity: Math.abs(quantityChange),
        previousQty,
        newQty,
        note: note || 'Stok güncelleme',
        productId,
        variantId: variantId || null,
        warehouseId,
        userId: userId || null,
      },
    });
  } else {
    // Değişiklik yoksa sadece minQuantity güncellenmiş olabilir
    // Bu durumda log oluşturma (opsiyonel)
    log = await tx.stockLog.create({
      data: {
        type: StockLogType.ADJUSTMENT,
        quantity: 0,
        previousQty,
        newQty,
        note: note || 'Stok ayarı (minQuantity güncellendi)',
        productId,
        variantId: variantId || null,
        warehouseId,
        userId: userId || null,
      },
    });
  }

  return { stock: updatedStock, log };
}

/**
 * Ürünün hangi depolarda stock'u var
 */
export async function getProductWarehouses(
  productId: string,
  companyId: string
): Promise<Array<{
  warehouse: {
    id: string;
    name: string;
    code: string;
    isDefault: boolean;
  };
  stock: Stock;
  location?: {
    id: string;
    code: string;
    name: string | null;
  } | null;
}>> {
  const stocks = await prisma.stock.findMany({
    where: {
      productId,
      warehouse: {
        companyId,
        isActive: true,
      },
    },
    include: {
      warehouse: {
        select: {
          id: true,
          name: true,
          code: true,
          isDefault: true,
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
    orderBy: [
      { warehouse: { isDefault: 'desc' } },
      { warehouse: { name: 'asc' } },
    ],
  });

  return stocks.map(s => ({
    warehouse: s.warehouse,
    stock: s,
    location: s.location,
  }));
}

/**
 * Default warehouse'da stock kaydı olduğundan emin ol
 * Transaction içinde kullanılmalı
 */
export async function ensureDefaultWarehouseStock(
  tx: any,
  productId: string,
  companyId: string,
  quantity: number = 0
): Promise<{ stock: Stock; log?: StockLog }> {
  const defaultWarehouse = await warehouseRepository.findDefaultByCompany(companyId);
  
  if (!defaultWarehouse) {
    throw new Error(`Şirket için varsayılan depo bulunamadı (companyId: ${companyId})`);
  }

  return await createProductStock(tx, {
    productId,
    warehouseId: defaultWarehouse.id,
    quantity,
    note: quantity > 0 ? 'Varsayılan depo başlangıç stoğu' : 'Varsayılan depo stock kaydı',
  });
}

/**
 * Ürün için tüm depolardaki toplam stock miktarını hesapla
 */
export async function getProductTotalStock(
  productId: string,
  companyId: string
): Promise<number> {
  const stocks = await prisma.stock.findMany({
    where: {
      productId,
      warehouse: {
        companyId,
        isActive: true,
      },
    },
    select: {
      quantity: true,
    },
  });

  return stocks.reduce((total, stock) => total + stock.quantity, 0);
}

