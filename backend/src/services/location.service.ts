import { locationRepository, CreateLocationData, UpdateLocationData } from '../repositories/location.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { productLocationAssignmentRepository } from '../repositories/product-location-assignment.repository.js';
import { NotFoundError, ConflictError } from '../middleware/error.middleware.js';
import { LocationType } from '@prisma/client';

class LocationService {
  async getLocations(warehouseId: string, companyId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  }) {
    // Verify warehouse belongs to company
    const warehouse = await warehouseRepository.findByIdAndCompany(warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    return locationRepository.findByWarehouse(warehouseId, {
      skip,
      take,
      search: options?.search,
      isActive: options?.isActive,
    });
  }

  async getLocationById(id: string, companyId: string) {
    const location = await locationRepository.findById(id);
    if (!location) {
      throw new NotFoundError('Lokasyon bulunamadı');
    }

    // Verify warehouse belongs to company
    const warehouse = await warehouseRepository.findByIdAndCompany(location.warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    return location;
  }

  async createLocation(warehouseId: string, companyId: string, data: CreateLocationData) {
    // Verify warehouse belongs to company
    const warehouse = await warehouseRepository.findByIdAndCompany(warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    // Check if code already exists
    const existing = await locationRepository.findByCode(warehouseId, data.code);
    if (existing) {
      throw new ConflictError('Bu lokasyon kodu zaten kullanımda');
    }

    return locationRepository.create({
      ...data,
      warehouseId,
    });
  }

  async updateLocation(id: string, companyId: string, data: UpdateLocationData) {
    const location = await this.getLocationById(id, companyId);

    // If code is being updated, check for conflicts
    if (data.code && data.code !== location.code) {
      const existing = await locationRepository.findByCode(location.warehouseId, data.code);
      if (existing && existing.id !== id) {
        throw new ConflictError('Bu lokasyon kodu zaten kullanımda');
      }
    }

    return locationRepository.update(id, data);
  }

  async deleteLocation(id: string, companyId: string) {
    await this.getLocationById(id, companyId);
    await locationRepository.delete(id);
  }

  async getLocationStock(locationId: string, companyId: string) {
    const location = await this.getLocationById(locationId, companyId);
    return locationRepository.getLocationStock(locationId);
  }

  // Hangi lokasyonda hangi üründen kaç tane - Detaylı görüntüleme
  async getLocationStockDetails(locationId: string, companyId: string) {
    await this.getLocationById(locationId, companyId);
    return locationRepository.getLocationStockDetails(locationId);
  }

  // Depo bazlı tüm lokasyonlar ve stokları
  async getWarehouseLocationStock(warehouseId: string, companyId: string) {
    const warehouse = await warehouseRepository.findByIdAndCompany(warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }
    return locationRepository.getWarehouseLocationStock(warehouseId);
  }

  // Ürün-lokasyon ataması ekle (Özel raf için)
  async assignProductToLocation(
    locationId: string,
    companyId: string,
    data: {
      productId: string;
      variantId?: string;
      isPrimary?: boolean;
    }
  ) {
    const location = await this.getLocationById(locationId, companyId);
    
    // DEDICATED lokasyon ise, sadece bir ürün atanabilir
    if (location.locationType === 'DEDICATED') {
      const existingAssignments = await productLocationAssignmentRepository.findByLocation(locationId);
      if (existingAssignments.length > 0) {
        throw new ConflictError('Bu özel raf zaten bir ürüne atanmış');
      }
    }

    return productLocationAssignmentRepository.create({
      productId: data.productId,
      variantId: data.variantId,
      locationId,
      isPrimary: data.isPrimary,
    });
  }

  // Ürün-lokasyon atamasını kaldır
  async removeProductFromLocation(
    locationId: string,
    companyId: string,
    productId: string,
    variantId?: string
  ) {
    await this.getLocationById(locationId, companyId);
    await productLocationAssignmentRepository.deleteByProductAndLocation(
      productId,
      locationId,
      variantId
    );
  }

  // Ürünün lokasyon atamalarını getir
  async getProductLocations(productId: string, companyId: string, variantId?: string) {
    // Verify product belongs to company
    const { prisma } = await import('../config/index.js');
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        companyId,
      },
    });

    if (!product) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    return productLocationAssignmentRepository.findByProduct(productId, variantId);
  }

  // Barkod/SKU ile ürün ara ve lokasyonlarını getir
  async searchProductLocations(companyId: string, query: string) {
    const result = await locationRepository.findProductByBarcodeOrSku(companyId, query);
    
    if (!result) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    const { product, matchedVariant } = result;

    // Ürünün bulunduğu lokasyonları getir
    const locations = await locationRepository.findProductLocations(
      product.id,
      matchedVariant?.id
    );

    return {
      product,
      matchedVariant,
      locations,
    };
  }

  // Lokasyona stok yerleştir (mevcut stoktan - toplam stok değişmez)
  async addStockToLocation(
    companyId: string,
    data: {
      productId: string;
      variantId?: string;
      warehouseId: string;
      locationId: string;
      quantity: number;
    }
  ) {
    // Depo kontrolü
    const warehouse = await warehouseRepository.findByIdAndCompany(data.warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    // Lokasyon kontrolü
    const location = await this.getLocationById(data.locationId, companyId);
    if (location.warehouseId !== data.warehouseId) {
      throw new ConflictError('Lokasyon bu depoya ait değil');
    }

    // Stok yerleştir (mevcut stoktan transfer)
    const stock = await locationRepository.addStockToLocation(data);

    // StockLog kaydı - İç transfer olarak kaydet
    const { prisma } = await import('../config/index.js');
    await prisma.stockLog.create({
      data: {
        type: 'TRANSFER',
        quantity: data.quantity,
        previousQty: 0,
        newQty: stock.quantity,
        note: `Rafa yerleştirme: ${location.code}`,
        productId: data.productId,
        variantId: data.variantId || null,
        warehouseId: data.warehouseId,
      },
    });

    return stock;
  }

  // Depodaki lokasyonsuz (rafa atanmamış) stok miktarını getir
  async getUnassignedStock(companyId: string, productId: string, variantId: string | null, warehouseId: string) {
    // Depo kontrolü
    const warehouse = await warehouseRepository.findByIdAndCompany(warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    return locationRepository.getUnassignedStock(productId, variantId, warehouseId);
  }

  // Lokasyonlar arası stok taşı
  async transferStockBetweenLocations(
    companyId: string,
    data: {
      productId: string;
      variantId?: string;
      warehouseId: string;
      fromLocationId: string;
      toLocationId: string;
      quantity: number;
    }
  ) {
    // Depo kontrolü
    const warehouse = await warehouseRepository.findByIdAndCompany(data.warehouseId, companyId);
    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    // Lokasyon kontrolleri
    const fromLocation = await this.getLocationById(data.fromLocationId, companyId);
    const toLocation = await this.getLocationById(data.toLocationId, companyId);

    if (fromLocation.warehouseId !== data.warehouseId || toLocation.warehouseId !== data.warehouseId) {
      throw new ConflictError('Lokasyonlar aynı depoya ait olmalı');
    }

    return locationRepository.transferStockBetweenLocations(data);
  }
}

export const locationService = new LocationService();

