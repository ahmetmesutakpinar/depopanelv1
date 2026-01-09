import { prisma } from '../config/index.js';
import { Location, LocationType, Prisma } from '@prisma/client';

export interface CreateLocationData {
  code: string;
  name?: string;
  zone?: string;
  aisle?: string;
  shelf?: string;
  bin?: string;
  warehouseId: string;
  locationType?: LocationType;
  capacity?: number;
  notes?: string;
}

export interface UpdateLocationData {
  code?: string;
  name?: string;
  zone?: string;
  aisle?: string;
  shelf?: string;
  bin?: string;
  locationType?: LocationType;
  capacity?: number;
  notes?: string;
  isActive?: boolean;
}

export class LocationRepository {
  async findByWarehouse(warehouseId: string, options?: {
    skip?: number;
    take?: number;
    search?: string;
    isActive?: boolean;
    locationType?: LocationType;
  }) {
    const where: Prisma.LocationWhereInput = {
      warehouseId,
      ...(options?.search && {
        OR: [
          { code: { contains: options.search, mode: 'insensitive' } },
          { name: { contains: options.search, mode: 'insensitive' } },
          { zone: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
      ...(options?.locationType && { locationType: options.locationType }),
    };

    const [locations, total] = await Promise.all([
      prisma.location.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        include: {
          productAssignments: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                },
              },
              variant: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                },
              },
            },
          },
          _count: {
            select: {
              stocks: true,
            },
          },
        },
        orderBy: [
          { zone: 'asc' },
          { aisle: 'asc' },
          { shelf: 'asc' },
          { bin: 'asc' },
        ],
      }),
      prisma.location.count({ where }),
    ]);

    return { locations, total };
  }

  async findById(id: string): Promise<Location | null> {
    return prisma.location.findUnique({
      where: { id },
      include: {
        warehouse: true,
        stocks: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async findByCode(warehouseId: string, code: string): Promise<Location | null> {
    return prisma.location.findFirst({
      where: {
        warehouseId,
        code,
      },
    });
  }

  async create(data: CreateLocationData): Promise<Location> {
    return prisma.location.create({
      data,
    });
  }

  async update(id: string, data: UpdateLocationData): Promise<Location> {
    return prisma.location.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.location.delete({
      where: { id },
    });
  }

  async getLocationStock(locationId: string) {
    return prisma.stock.findMany({
      where: { locationId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            gtin: true,
            imageUrl: true,
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
          },
        },
      },
      orderBy: {
        product: {
          name: 'asc',
        },
      },
    });
  }

  // Hangi lokasyonda hangi üründen kaç tane - Detaylı görüntüleme
  async getLocationStockDetails(locationId: string) {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: {
        warehouse: true,
        stocks: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
                gtin: true,
                imageUrl: true,
              },
            },
            variant: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
              },
            },
          },
        },
        productAssignments: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
            variant: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
          },
        },
      },
    });

    return location;
  }

  // Depo bazlı tüm lokasyonlar ve stokları
  async getWarehouseLocationStock(warehouseId: string) {
    return prisma.location.findMany({
      where: {
        warehouseId,
        isActive: true,
      },
      include: {
        stocks: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
                gtin: true,
              },
            },
            variant: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
          },
        },
        productAssignments: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
          },
        },
      },
      orderBy: [
        { zone: 'asc' },
        { aisle: 'asc' },
        { shelf: 'asc' },
        { bin: 'asc' },
      ],
    });
  }

  // Ürünün bulunduğu tüm lokasyonları getir (Ürün Nerede?)
  async findProductLocations(productId: string, variantId?: string) {
    const where: Prisma.StockWhereInput = {
      productId,
      quantity: { gt: 0 },
      locationId: { not: null },
      ...(variantId && { variantId }),
    };

    return prisma.stock.findMany({
      where,
      include: {
        location: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            gtin: true,
            imageUrl: true,
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
          },
        },
      },
      orderBy: {
        quantity: 'desc',
      },
    });
  }

  // Barkod/GTIN/SKU ile ürün ara ve lokasyonlarını getir
  async findProductByBarcodeOrSku(companyId: string, query: string) {
    // Önce ürünü bul - barcode, GTIN ve SKU'ya bak
    const product = await prisma.product.findFirst({
      where: {
        companyId,
        OR: [
          { barcode: query },
          { gtin: query },
          { sku: query }, // ✅ YENİ: SKU'ya da bak
        ],
      },
      include: {
        variants: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
          },
        },
      },
    });

    if (!product) {
      // Varyant barcode veya SKU ile ara
      const variant = await prisma.productVariant.findFirst({
        where: {
          OR: [
            { barcode: query },
            { sku: query }, // ✅ YENİ: Variant SKU'ya da bak
          ],
          product: {
            companyId,
          },
        },
        include: {
          product: {
            include: {
              variants: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  barcode: true,
                },
              },
            },
          },
        },
      });

      if (variant) {
        return {
          product: variant.product,
          matchedVariant: variant,
        };
      }
      return null;
    }

    return { product, matchedVariant: null };
  }

  // Lokasyona stok yerleştir (mevcut stoktan transfer - stok miktarını değiştirmez)
  async addStockToLocation(data: {
    productId: string;
    variantId?: string;
    warehouseId: string;
    locationId: string;
    quantity: number;
  }) {
    // Depodaki toplam stoğu kontrol et (lokasyonsuz stok)
    const unassignedStock = await prisma.stock.findFirst({
      where: {
        productId: data.productId,
        variantId: data.variantId || null,
        warehouseId: data.warehouseId,
        locationId: null, // Henüz lokasyona atanmamış stok
      },
    });

    if (!unassignedStock || unassignedStock.quantity < data.quantity) {
      const available = unassignedStock?.quantity || 0;
      throw new Error(`Yeterli stok yok. Rafa atanmamış stok: ${available}, İstenen: ${data.quantity}`);
    }

    return prisma.$transaction(async (tx) => {
      // Lokasyonsuz stoktan düş
      if (unassignedStock.quantity === data.quantity) {
        // Tam miktar ise kaydı sil
        await tx.stock.delete({
          where: { id: unassignedStock.id },
        });
      } else {
        // Kısmi miktar ise güncelle
        await tx.stock.update({
          where: { id: unassignedStock.id },
          data: {
            quantity: unassignedStock.quantity - data.quantity,
          },
        });
      }

      // Hedef lokasyona ekle veya güncelle
      const existingLocationStock = await tx.stock.findFirst({
        where: {
          productId: data.productId,
          variantId: data.variantId || null,
          warehouseId: data.warehouseId,
          locationId: data.locationId,
        },
      });

      if (existingLocationStock) {
        return tx.stock.update({
          where: { id: existingLocationStock.id },
          data: {
            quantity: existingLocationStock.quantity + data.quantity,
          },
          include: {
            location: true,
            product: true,
            variant: true,
          },
        });
      } else {
        return tx.stock.create({
          data: {
            productId: data.productId,
            variantId: data.variantId || null,
            warehouseId: data.warehouseId,
            locationId: data.locationId,
            quantity: data.quantity,
            reservedQty: 0,
            minQuantity: 0,
          },
          include: {
            location: true,
            product: true,
            variant: true,
          },
        });
      }
    });
  }

  // Depodaki lokasyonsuz (rafa atanmamış) stok miktarını getir
  async getUnassignedStock(productId: string, variantId: string | null, warehouseId: string) {
    const stock = await prisma.stock.findFirst({
      where: {
        productId,
        variantId: variantId || null,
        warehouseId,
        locationId: null,
      },
    });
    return stock?.quantity || 0;
  }

  // Lokasyonlar arası stok taşı
  async transferStockBetweenLocations(data: {
    productId: string;
    variantId?: string;
    warehouseId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
  }) {
    // Kaynak lokasyondaki stoğu kontrol et
    const sourceStock = await prisma.stock.findFirst({
      where: {
        productId: data.productId,
        variantId: data.variantId || null,
        warehouseId: data.warehouseId,
        locationId: data.fromLocationId,
      },
    });

    if (!sourceStock || sourceStock.quantity < data.quantity) {
      throw new Error('Kaynak lokasyonda yeterli stok yok');
    }

    // Transaction ile taşıma yap
    return prisma.$transaction(async (tx) => {
      // Kaynaktan düş
      await tx.stock.update({
        where: { id: sourceStock.id },
        data: {
          quantity: sourceStock.quantity - data.quantity,
        },
      });

      // Hedefe ekle
      const targetStock = await tx.stock.findFirst({
        where: {
          productId: data.productId,
          variantId: data.variantId || null,
          warehouseId: data.warehouseId,
          locationId: data.toLocationId,
        },
      });

      if (targetStock) {
        await tx.stock.update({
          where: { id: targetStock.id },
          data: {
            quantity: targetStock.quantity + data.quantity,
          },
        });
      } else {
        await tx.stock.create({
          data: {
            productId: data.productId,
            variantId: data.variantId || null,
            warehouseId: data.warehouseId,
            locationId: data.toLocationId,
            quantity: data.quantity,
            reservedQty: 0,
            minQuantity: 0,
          },
        });
      }

      // Lokasyon kodlarını al
      const fromLocation = await tx.location.findUnique({ where: { id: data.fromLocationId }, select: { code: true } });
      const toLocation = await tx.location.findUnique({ where: { id: data.toLocationId }, select: { code: true } });

      // StockLog kayıtları
      await tx.stockLog.create({
        data: {
          type: 'OUT',
          quantity: data.quantity,
          previousQty: sourceStock.quantity,
          newQty: sourceStock.quantity - data.quantity,
          note: `Lokasyon transferi: ${fromLocation?.code || data.fromLocationId} -> ${toLocation?.code || data.toLocationId}`,
          productId: data.productId,
          variantId: data.variantId || null,
          warehouseId: data.warehouseId,
        },
      });

      await tx.stockLog.create({
        data: {
          type: 'IN',
          quantity: data.quantity,
          previousQty: targetStock?.quantity || 0,
          newQty: (targetStock?.quantity || 0) + data.quantity,
          note: `Lokasyon transferi: ${fromLocation?.code || data.fromLocationId} -> ${toLocation?.code || data.toLocationId}`,
          productId: data.productId,
          variantId: data.variantId || null,
          warehouseId: data.warehouseId,
        },
      });

      return { success: true };
    });
  }
}

export const locationRepository = new LocationRepository();

