/**
 * Prisma Product Repository Implementation
 * 
 * Implements IProductRepository using Prisma ORM.
 * This is the infrastructure layer implementation.
 * 
 * Architecture:
 * - Implements repository interface (Dependency Inversion)
 * - Uses PrismaClient for database access
 * - Maps Prisma models to domain entities
 * - No business logic, only data access
 */

import { PrismaClient } from '@prisma/client';
import { IProductRepository, ProductWithStock, FindProductsOptions } from '../../../repositories/product.repository.interface.js';
import { Product } from '../../../domain/entities/product.entity.js';
import { SKU, CompanyId, ProductId } from '../../../domain/value-objects/ids.vo.js';
import { mapProduct } from './mappers.js';
import { toNumber } from '../../../utils/decimal.js';
import { Prisma } from '@prisma/client';

export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: ProductId | string): Promise<ProductWithStock | null> {
    const record = await this.prisma.product.findUnique({
      where: { id: typeof id === 'string' ? id : id.value },
      include: {
        stocks: {
          include: {
            warehouse: {
              select: { id: true, name: true, code: true },
            },
            location: {
              select: { id: true, code: true, name: true },
            },
          },
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    if (!record) return null;

    // TODO: Complete mapping for ProductWithStock (stocks array)
    const product = mapProduct(record);
    return {
      ...product,
      stocks: record.stocks.map(stock => ({
        id: stock.id,
        quantity: stock.quantity,
        reservedQty: stock.reservedQty,
        locationId: stock.locationId,
        warehouse: stock.warehouse,
        location: stock.location,
      })),
      category: record.category,
    };
  }

  async findByIdAndCompany(id: ProductId | string, companyId: CompanyId | string): Promise<ProductWithStock | null> {
    const record = await this.prisma.product.findFirst({
      where: {
        id: typeof id === 'string' ? id : id.value,
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
      },
      include: {
        stocks: {
          include: {
            warehouse: {
              select: { id: true, name: true, code: true },
            },
            location: {
              select: { id: true, code: true, name: true },
            },
          },
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    if (!record) return null;

    // TODO: Complete mapping for ProductWithStock
    const product = mapProduct(record);
    return {
      ...product,
      stocks: record.stocks.map(stock => ({
        id: stock.id,
        quantity: stock.quantity,
        reservedQty: stock.reservedQty,
        locationId: stock.locationId,
        warehouse: stock.warehouse,
        location: stock.location,
      })),
      category: record.category,
    };
  }

  async findBySku(companyId: CompanyId | string, sku: SKU | string): Promise<Product | null> {
    const record = await this.prisma.product.findFirst({
      where: {
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
        sku: typeof sku === 'string' ? sku : sku.value,
      },
    });

    if (!record) return null;
    return mapProduct(record);
  }

  async findByBarcode(companyId: CompanyId | string, barcode: string): Promise<Product | null> {
    // TODO: Handle variant barcode lookup if needed
    let record = await this.prisma.product.findFirst({
      where: {
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
        barcode: barcode.trim(),
      },
    });

    if (!record) {
      record = await this.prisma.product.findFirst({
        where: {
          companyId: typeof companyId === 'string' ? companyId : companyId.value,
          gtin: barcode.trim(),
        },
      });
    }

    if (!record) return null;
    return mapProduct(record);
  }

  async findByCompany(companyId: CompanyId | string, options?: FindProductsOptions): Promise<{
    products: ProductWithStock[];
    total: number;
  }> {
    const where: Prisma.ProductWhereInput = {
      companyId: typeof companyId === 'string' ? companyId : companyId.value,
      ...(options?.categoryId && { categoryId: options.categoryId }),
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
      ...(options?.search && {
        OR: [
          { name: { contains: options.search, mode: 'insensitive' } },
          { sku: { contains: options.search, mode: 'insensitive' } },
          { barcode: { contains: options.search, mode: 'insensitive' } },
          { brand: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [options?.sortBy || 'createdAt']: options?.sortOrder || 'desc',
    };

    const [records, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy,
        include: {
          stocks: {
            include: {
              warehouse: {
                select: { id: true, name: true, code: true },
              },
              location: {
                select: { id: true, code: true, name: true },
              },
            },
          },
          category: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    // TODO: Complete mapping for all products
    const products: ProductWithStock[] = records.map(record => {
      const product = mapProduct(record);
      return {
        ...product,
        stocks: record.stocks.map(stock => ({
          id: stock.id,
          quantity: stock.quantity,
          reservedQty: stock.reservedQty,
          locationId: stock.locationId,
          warehouse: stock.warehouse,
          location: stock.location,
        })),
        category: record.category,
      };
    });

    return { products, total };
  }

  async create(product: Product): Promise<Product> {
    const record = await this.prisma.product.create({
      data: {
        sku: product.sku,
        barcode: product.barcode,
        gtin: product.gtin,
        name: product.name,
        description: product.description,
        brand: product.brand,
        price: product.price,
        costPrice: product.costPrice,
        taxRate: product.taxRate,
        weight: product.weight,
        width: product.width,
        height: product.height,
        depth: product.depth,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
        categoryId: product.categoryId,
        companyId: product.companyId,
        type: product.type,
        campaignSetId: product.campaignSetId,
        minQuantity: product.minQuantity,
      },
    });

    return mapProduct(record);
  }

  async update(id: ProductId | string, product: Partial<Product>): Promise<Product> {
    const record = await this.prisma.product.update({
      where: { id: typeof id === 'string' ? id : id.value },
      data: {
        ...(product.sku && { sku: product.sku }),
        ...(product.barcode !== undefined && { barcode: product.barcode }),
        ...(product.gtin !== undefined && { gtin: product.gtin }),
        ...(product.name && { name: product.name }),
        ...(product.description !== undefined && { description: product.description }),
        ...(product.brand !== undefined && { brand: product.brand }),
        ...(product.price !== undefined && { price: product.price }),
        ...(product.costPrice !== undefined && { costPrice: product.costPrice }),
        ...(product.taxRate !== undefined && { taxRate: product.taxRate }),
        ...(product.weight !== undefined && { weight: product.weight }),
        ...(product.width !== undefined && { width: product.width }),
        ...(product.height !== undefined && { height: product.height }),
        ...(product.depth !== undefined && { depth: product.depth }),
        ...(product.imageUrl !== undefined && { imageUrl: product.imageUrl }),
        ...(product.isActive !== undefined && { isActive: product.isActive }),
        ...(product.categoryId !== undefined && { categoryId: product.categoryId }),
        ...(product.campaignSetId !== undefined && { campaignSetId: product.campaignSetId }),
        ...(product.minQuantity !== undefined && { minQuantity: product.minQuantity }),
      },
    });

    return mapProduct(record);
  }

  async delete(id: ProductId | string): Promise<void> {
    await this.prisma.product.delete({
      where: { id: typeof id === 'string' ? id : id.value },
    });
  }

  async existsBySku(companyId: CompanyId | string, sku: SKU | string, excludeId?: ProductId | string): Promise<boolean> {
    const record = await this.prisma.product.findFirst({
      where: {
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
        sku: typeof sku === 'string' ? sku : sku.value,
        ...(excludeId && { NOT: { id: typeof excludeId === 'string' ? excludeId : excludeId.value } }),
      },
    });

    return !!record;
  }

  async getLowStockProducts(companyId: CompanyId | string): Promise<ProductWithStock[]> {
    // TODO: Implement low stock query logic
    const records = await this.prisma.product.findMany({
      where: {
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
        isActive: true,
        stocks: {
          some: {
            quantity: {
              lte: this.prisma.stock.fields.minQuantity,
            },
          },
        },
      },
      include: {
        stocks: {
          include: {
            warehouse: {
              select: { id: true, name: true, code: true },
            },
            location: {
              select: { id: true, code: true, name: true },
            },
          },
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    // TODO: Complete mapping
    return records.map(record => {
      const product = mapProduct(record);
      return {
        ...product,
        stocks: record.stocks.map(stock => ({
          id: stock.id,
          quantity: stock.quantity,
          reservedQty: stock.reservedQty,
          locationId: stock.locationId,
          warehouse: stock.warehouse,
          location: stock.location,
        })),
        category: record.category,
      };
    });
  }

  async getTotalProductCount(companyId: CompanyId | string): Promise<number> {
    return this.prisma.product.count({
      where: {
        companyId: typeof companyId === 'string' ? companyId : companyId.value,
      },
    });
  }
}

