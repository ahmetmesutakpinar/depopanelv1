import { prisma } from '../config/index.js';
import { Product, Prisma } from '@prisma/client';
import { generateUUID } from '../utils/helpers.js';

export interface CreateProductData {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  brand?: string;
  price: number;
  costPrice?: number;
  taxRate?: number;
  weight?: number;
  width?: number;
  height?: number;
  depth?: number;
  imageUrl?: string;
  categoryId?: string;
  companyId: string;
  wooCommerceId?: number;
  campaignSetId?: string | null; // Campaign Set ID (FK relation)
  isActive?: boolean; // Defaults to true in Prisma schema
}

export interface UpdateProductData {
  sku?: string;
  barcode?: string | null;
  name?: string;
  description?: string | null;
  brand?: string | null;
  price?: number;
  costPrice?: number;
  taxRate?: number;
  weight?: number;
  width?: number;
  height?: number;
  depth?: number;
  imageUrl?: string | null;
  categoryId?: string | null;
  isActive?: boolean;
  wooCommerceId?: number;
  campaignSetId?: string | null; // Campaign Set ID (FK relation)
  gtin?: string | null;
}

export interface ProductWithStock extends Product {
  stocks: {
    id: string;
    quantity: number;
    reservedQty: number;
    locationId: string | null;
    warehouse: {
      id: string;
      name: string;
      code: string;
    };
    location: {
      id: string;
      code: string;
      name: string | null;
    } | null;
  }[];
  variants?: {
    id: string;
    sku: string;
    name: string;
    barcode: string | null;
  }[];
  category: {
    id: string;
    name: string;
  } | null;
}

export class ProductRepository {
  async findById(id: string): Promise<ProductWithStock | null> {
    return prisma.product.findUnique({
      where: { id },
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
  }

  async findByIdAndCompany(id: string, companyId: string): Promise<ProductWithStock | null> {
    return prisma.product.findFirst({
      where: { id, companyId },
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
        variants: {
          select: {
            id: true,
            sku: true,
            name: true,
            barcode: true,
          },
        },
        locationAssignments: {
          where: { isPrimary: true },
          include: {
            location: {
              select: { id: true, code: true, name: true, zone: true, aisle: true, shelf: true, bin: true, warehouseId: true },
            },
          },
          take: 1,
        },
      },
    });
  }

  async findBySku(companyId: string, sku: string): Promise<Product | null> {
    return prisma.product.findFirst({
      where: { companyId, sku },
    });
  }

  async findBySkuCaseInsensitive(companyId: string, sku: string): Promise<Product | null> {
    return prisma.product.findFirst({
      where: {
        companyId,
        sku: {
          equals: sku,
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Find ALL products with the given SKU (case-insensitive, for duplicate detection)
   * Should return at most 1 product due to DB constraint, but defensive check
   */
  async findAllBySkuCaseInsensitive(companyId: string, sku: string): Promise<Product[]> {
    return prisma.product.findMany({
      where: {
        companyId,
        sku: {
          equals: sku,
          mode: 'insensitive',
        },
      },
    });
  }

  async findByBarcode(companyId: string, barcode: string): Promise<Product | null> {
    const query = barcode.trim();
    
    // Önce product barcode'a bak
    let product = await prisma.product.findFirst({
      where: { 
        companyId, 
        barcode: query
      },
    });

    // Bulunamazsa GTIN'e bak
    if (!product) {
      product = await prisma.product.findFirst({
        where: { 
          companyId, 
          gtin: query
        },
      });
    }

    // ✅ YENİ: Bulunamazsa SKU'ya bak
    if (!product) {
      product = await prisma.product.findFirst({
        where: {
          companyId,
          sku: query,
        },
      });
    }

    // Bulunamazsa variant barcode'larına bak
    if (!product) {
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
          product: true,
        },
      });
      
      if (variant) {
        product = variant.product;
      }
    }

    return product;
  }

  /**
   * Find ALL products with the given barcode (for duplicate detection)
   * Only checks the barcode field directly, not GTIN or variants
   */
  async findAllByBarcode(companyId: string, barcode: string): Promise<Product[]> {
    return prisma.product.findMany({
      where: {
        companyId,
        barcode: barcode.trim(),
      },
    });
  }

  /**
   * Check if a barcode exists for the given company
   * @param companyId - Company ID
   * @param barcode - Barcode to check
   * @param excludeId - Optional product ID to exclude from check
   * @returns true if barcode exists, false otherwise
   */
  async existsByBarcode(companyId: string, barcode: string, excludeId?: string): Promise<boolean> {
    const product = await prisma.product.findFirst({
      where: {
        companyId,
        barcode: barcode.trim(),
        ...(excludeId && { NOT: { id: excludeId } }),
      },
    });
    return !!product;
  }

  async findByWooCommerceId(companyId: string, wooCommerceId: number): Promise<Product | null> {
    return prisma.product.findFirst({
      where: { companyId, wooCommerceId },
    });
  }

  async findByCompany(companyId: string, options?: {
    skip?: number;
    take?: number;
    search?: string;
    categoryId?: string;
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ products: ProductWithStock[]; total: number }> {
    const where: Prisma.ProductWhereInput = {
      companyId,
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

    // Handle stock sorting with aggregation
    if (options?.sortBy === 'stock') {
      // Fetch all products matching criteria to calculate total stock
      const allProducts = await prisma.product.findMany({
        where,
        include: {
          stocks: {
            include: {
              warehouse: {
                select: { id: true, name: true, code: true },
              },
              location: {
                select: { id: true, code: true, name: true, zone: true, aisle: true, shelf: true, bin: true },
              },
            },
          },
          locationAssignments: {
            where: { isPrimary: true },
            include: {
              location: {
                select: { id: true, code: true, name: true, zone: true, aisle: true, shelf: true, bin: true, warehouseId: true },
              },
            },
            take: 1,
          },
          category: {
            select: { id: true, name: true },
          },
        },
      });

      // Calculate total stock and sort
      const productsWithTotalStock = allProducts.map(product => {
        const totalStock = product.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
        return { ...product, totalStock };
      });

      const sortOrder = options?.sortOrder || 'desc';
      
      // Sort by total stock, with zero stock items at bottom
      productsWithTotalStock.sort((a, b) => {
        // Zero stock items always go to bottom
        if (a.totalStock === 0 && b.totalStock > 0) return 1;
        if (a.totalStock > 0 && b.totalStock === 0) return -1;
        
        // Sort by stock amount
        if (sortOrder === 'desc') {
          return b.totalStock - a.totalStock;
        } else {
          return a.totalStock - b.totalStock;
        }
      });

      // Apply pagination
      const total = productsWithTotalStock.length;
      const skip = options?.skip || 0;
      const take = options?.take || 20;
      const paginatedProducts = productsWithTotalStock.slice(skip, skip + take);

      // Remove totalStock from result
      const products = paginatedProducts.map(({ totalStock, ...product }) => product) as ProductWithStock[];

      return { products, total };
    }

    // For non-stock sorting, use normal Prisma query with secondary sort for zero stock
    const sortBy = options?.sortBy || 'createdAt';
    const sortOrder = options?.sortOrder || 'desc';
    
    // Fetch all products first to calculate total stock and sort
    const allProducts = await prisma.product.findMany({
      where,
      include: {
        stocks: {
          include: {
            warehouse: {
              select: { id: true, name: true, code: true },
            },
            location: {
              select: { id: true, code: true, name: true, zone: true, aisle: true, shelf: true, bin: true },
            },
          },
        },
        locationAssignments: {
          where: { isPrimary: true },
          include: {
            location: {
              select: { id: true, code: true, name: true, zone: true, aisle: true, shelf: true, bin: true, warehouseId: true },
            },
          },
          take: 1,
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    // Calculate total stock for each product and sort
    const productsWithTotalStock = allProducts.map(product => {
      const totalStock = product.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
      return { ...product, totalStock };
    });

    // Sort by primary field, then by total stock (zero stock to bottom)
    productsWithTotalStock.sort((a, b) => {
      // Primary sort
      let primaryComparison = 0;
      if (sortBy === 'name') {
        primaryComparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'sku') {
        primaryComparison = a.sku.localeCompare(b.sku);
      } else if (sortBy === 'price') {
        primaryComparison = Number(a.price) - Number(b.price);
      } else if (sortBy === 'createdAt') {
        primaryComparison = a.createdAt.getTime() - b.createdAt.getTime();
      }
      
      if (sortOrder === 'desc') {
        primaryComparison = -primaryComparison;
      }

      // Secondary sort: zero stock items to bottom
      if (primaryComparison === 0 || Math.abs(primaryComparison) < 0.001) {
        // If primary sort is equal, sort by stock (zero stock to bottom)
        if (a.totalStock === 0 && b.totalStock > 0) return 1;
        if (a.totalStock > 0 && b.totalStock === 0) return -1;
        return b.totalStock - a.totalStock; // Higher stock first among non-zero
      }

      return primaryComparison;
    });

    // Apply pagination
    const total = productsWithTotalStock.length;
    const skip = options?.skip || 0;
    const take = options?.take || 20;
    const paginatedProducts = productsWithTotalStock.slice(skip, skip + take);

    // Remove totalStock from result (it's not part of ProductWithStock type)
    const products = paginatedProducts.map(({ totalStock, ...product }) => product) as ProductWithStock[];

    return { products, total };
  }

  async create(data: CreateProductData): Promise<Product> {
    return prisma.product.create({
      data: {
        sku: data.sku,
        barcode: data.barcode,
        name: data.name,
        description: data.description,
        brand: data.brand,
        price: data.price,
        costPrice: data.costPrice,
        taxRate: data.taxRate || 20,
        weight: data.weight,
        width: data.width,
        height: data.height,
        depth: data.depth,
        imageUrl: data.imageUrl,
        categoryId: data.categoryId,
        companyId: data.companyId,
        wooCommerceId: data.wooCommerceId,
        isActive: data.isActive ?? true, // Default to true if not specified
      },
    });
  }

  async update(id: string, data: UpdateProductData): Promise<Product> {
    // Clean up data: convert empty strings to null for nullable fields
    const cleanData: Partial<UpdateProductData> = { ...data };
    
    // Convert empty strings to null for nullable string fields
    if (cleanData.barcode === '') cleanData.barcode = null;
    if (cleanData.description === '') cleanData.description = null;
    if (cleanData.brand === '') cleanData.brand = null;
    if (cleanData.imageUrl === '') cleanData.imageUrl = null;
    if (cleanData.gtin === '') cleanData.gtin = null;
    if (cleanData.categoryId === '') cleanData.categoryId = null;
    if (cleanData.campaignSetId === '') cleanData.campaignSetId = null;
    
    // Remove undefined fields to avoid Prisma errors
    const prismaData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(cleanData)) {
      if (value !== undefined) {
        prismaData[key] = value;
      }
    }
    
    return prisma.product.update({
      where: { id },
      data: prismaData as UpdateProductData,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.product.delete({
      where: { id },
    });
  }

  async existsBySku(companyId: string, sku: string, excludeId?: string): Promise<boolean> {
    const product = await prisma.product.findFirst({
      where: {
        companyId,
        sku,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
    });
    return !!product;
  }

  async getLowStockProducts(companyId: string): Promise<ProductWithStock[]> {
    return prisma.product.findMany({
      where: {
        companyId,
        isActive: true,
        stocks: {
          some: {
            quantity: { lte: prisma.stock.fields.minQuantity },
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
  }

  async getTotalProductCount(companyId: string): Promise<number> {
    return prisma.product.count({
      where: { companyId, isActive: true },
    });
  }

  /**
   * READ-ONLY: Detect duplicate products by barcode per company
   * 
   * Groups products by (companyId, barcode) where barcode IS NOT NULL
   * Returns only groups where count > 1 (duplicates)
   * 
   * @returns Array of duplicate groups with product details
   */
  async findDuplicateProductsByBarcode(): Promise<Array<{
    companyId: string;
    barcode: string;
    productIds: string[];
    productNames: string[];
    createdAt: Date[];
    isActive: boolean[];
    count: number;
  }>> {
    // Use raw SQL for efficient grouping and aggregation
    const duplicates = await prisma.$queryRaw<Array<{
      companyId: string;
      barcode: string;
      productIds: string[];
      productNames: string[];
      createdAt: Date[];
      isActive: boolean[];
      count: bigint;
    }>>`
      SELECT 
        p."companyId",
        p."barcode",
        ARRAY_AGG(p.id ORDER BY p."createdAt" ASC) as "productIds",
        ARRAY_AGG(p.name ORDER BY p."createdAt" ASC) as "productNames",
        ARRAY_AGG(p."createdAt" ORDER BY p."createdAt" ASC) as "createdAt",
        ARRAY_AGG(p."isActive" ORDER BY p."createdAt" ASC) as "isActive",
        COUNT(*)::bigint as count
      FROM products p
      WHERE p."barcode" IS NOT NULL
        AND p."barcode" != ''
      GROUP BY p."companyId", p."barcode"
      HAVING COUNT(*) > 1
      ORDER BY p."companyId", p."barcode", MIN(p."createdAt") ASC
    `;

    // Convert bigint to number and ensure proper typing
    return duplicates.map(dup => ({
      companyId: dup.companyId,
      barcode: dup.barcode,
      productIds: dup.productIds,
      productNames: dup.productNames,
      createdAt: dup.createdAt.map(d => new Date(d)),
      isActive: dup.isActive,
      count: Number(dup.count),
    }));
  }

  /**
   * READ-ONLY: Detect duplicate products by barcode for a specific company
   * 
   * @param companyId - Company ID to filter duplicates
   * @returns Array of duplicate groups with product details
   */
  async findDuplicateProductsByBarcodeForCompany(companyId: string): Promise<Array<{
    companyId: string;
    barcode: string;
    productIds: string[];
    productNames: string[];
    createdAt: Date[];
    isActive: boolean[];
    count: number;
  }>> {
    const duplicates = await prisma.$queryRaw<Array<{
      companyId: string;
      barcode: string;
      productIds: string[];
      productNames: string[];
      createdAt: Date[];
      isActive: boolean[];
      count: bigint;
    }>>`
      SELECT 
        p."companyId",
        p."barcode",
        ARRAY_AGG(p.id ORDER BY p."createdAt" ASC) as "productIds",
        ARRAY_AGG(p.name ORDER BY p."createdAt" ASC) as "productNames",
        ARRAY_AGG(p."createdAt" ORDER BY p."createdAt" ASC) as "createdAt",
        ARRAY_AGG(p."isActive" ORDER BY p."createdAt" ASC) as "isActive",
        COUNT(*)::bigint as count
      FROM products p
      WHERE p."companyId" = ${companyId}::uuid
        AND p."barcode" IS NOT NULL
        AND p."barcode" != ''
      GROUP BY p."companyId", p."barcode"
      HAVING COUNT(*) > 1
      ORDER BY p."barcode", MIN(p."createdAt") ASC
    `;

    return duplicates.map(dup => ({
      companyId: dup.companyId,
      barcode: dup.barcode,
      productIds: dup.productIds,
      productNames: dup.productNames,
      createdAt: dup.createdAt.map(d => new Date(d)),
      isActive: dup.isActive,
      count: Number(dup.count),
    }));
  }

  /**
   * SAFE MERGE: Merge duplicate products into master product
   * 
   * This operation:
   * - Re-links OrderItem.productId → masterProductId
   * - Re-links StockLog.productId → masterProductId
   * - Re-links CampaignSet references → masterProductId
   * - Marks duplicate products: isActive = false, mergedIntoProductId = masterProductId, mergedAt = now()
   * 
   * DOES NOT:
   * - Touch stock quantity
   * - Delete products
   * - Modify orders
   * 
   * @param input - Merge operation input
   * @returns Merge operation summary
   */
  async mergeDuplicateProducts(input: {
    companyId: string;
    barcode: string;
    masterProductId: string;
    duplicateProductIds: string[];
    userId?: string;
  }): Promise<{
    masterProductId: string;
    mergedProductIds: string[];
    mergeId: string; // Unique identifier for this merge operation
    orderItemsMoved: number;
    stockLogsMoved: number;
    productSourcesMoved: number;
    productSourcesDeleted: number;
    campaignSetReferencesUpdated: number;
    productsDeactivated: number;
  }> {
    const { companyId, barcode, masterProductId, duplicateProductIds, userId } = input;

    // Validate master product exists and belongs to company
    const masterProduct = await this.findByIdAndCompany(masterProductId, companyId);
    if (!masterProduct) {
      throw new Error(`Master product not found: ${masterProductId}`);
    }

    // Validate master product has the correct barcode
    if (masterProduct.barcode !== barcode) {
      throw new Error(`Master product barcode mismatch: expected ${barcode}, got ${masterProduct.barcode}`);
    }

    // Validate duplicate products exist and belong to company
    const duplicateProducts = await prisma.product.findMany({
      where: {
        id: { in: duplicateProductIds },
        companyId,
        barcode,
      },
    });

    if (duplicateProducts.length !== duplicateProductIds.length) {
      const foundIds = duplicateProducts.map(p => p.id);
      const missingIds = duplicateProductIds.filter(id => !foundIds.includes(id));
      throw new Error(`Some duplicate products not found or barcode mismatch: ${missingIds.join(', ')}`);
    }

    // Ensure master is not in duplicate list
    if (duplicateProductIds.includes(masterProductId)) {
      throw new Error('Master product cannot be in duplicate list');
    }

    // Count before merge (for logging)
    const beforeCounts = {
      orderItems: await prisma.orderItem.count({
        where: { productId: { in: duplicateProductIds } },
      }),
      stockLogs: await prisma.stockLog.count({
        where: { productId: { in: duplicateProductIds } },
      }),
      campaignSetReferences: duplicateProducts.filter(p => p.campaignSetId !== null).length,
    };

    // Generate unique mergeId for this merge operation
    const mergeId = generateUUID();

    // Perform merge in single transaction
    const result = await prisma.$transaction(async (tx) => {
      // CRITICAL RULE: Create trace records BEFORE re-linking any entity
      
      // 1. Get all OrderItems that will be re-linked
      const orderItemsToMove = await tx.orderItem.findMany({
        where: { productId: { in: duplicateProductIds } },
        select: { id: true, productId: true },
      });

      // Create trace records for OrderItems BEFORE re-linking
      for (const item of orderItemsToMove) {
        await tx.productMergeReference.create({
          data: {
            mergeId,
            companyId,
            entityType: 'ORDER_ITEM',
            entityId: item.id,
            fromProductId: item.productId, // Original duplicate product
            toProductId: masterProductId,
          },
        });
      }

      // THEN re-link OrderItems
      const orderItemsResult = await tx.orderItem.updateMany({
        where: { productId: { in: duplicateProductIds } },
        data: { productId: masterProductId },
      });

      // 2. Get all StockLogs that will be re-linked
      const stockLogsToMove = await tx.stockLog.findMany({
        where: { productId: { in: duplicateProductIds } },
        select: { id: true, productId: true },
      });

      // Create trace records for StockLogs BEFORE re-linking
      for (const log of stockLogsToMove) {
        await tx.productMergeReference.create({
          data: {
            mergeId,
            companyId,
            entityType: 'STOCK_LOG',
            entityId: log.id,
            fromProductId: log.productId,
            toProductId: masterProductId,
          },
        });
      }

      // THEN re-link StockLogs
      const stockLogsResult = await tx.stockLog.updateMany({
        where: { productId: { in: duplicateProductIds } },
        data: { productId: masterProductId },
      });

      // 3. Get all MarketplaceProduct links that will be re-linked
      const marketplaceLinksToMove = await tx.marketplaceProduct.findMany({
        where: { productId: { in: duplicateProductIds } },
        select: { id: true, productId: true },
      });

      // Create trace records for MarketplaceProduct links BEFORE re-linking
      for (const link of marketplaceLinksToMove) {
        await tx.productMergeReference.create({
          data: {
            mergeId,
            companyId,
            entityType: 'MARKETPLACE_LINK',
            entityId: link.id,
            fromProductId: link.productId,
            toProductId: masterProductId,
          },
        });
      }

      // THEN re-link MarketplaceProduct links
      await tx.marketplaceProduct.updateMany({
        where: { productId: { in: duplicateProductIds } },
        data: { productId: masterProductId },
      });

      // 3b. Get all ProductSource records that will be re-linked
      const productSourcesToMove = await tx.productSource.findMany({
        where: { productId: { in: duplicateProductIds } },
        select: { id: true, productId: true, integrationId: true, externalProductId: true },
      });

      // Create trace records for ProductSource BEFORE re-linking
      for (const source of productSourcesToMove) {
        await tx.productMergeReference.create({
          data: {
            mergeId,
            companyId,
            entityType: 'MARKETPLACE_LINK', // Using same type as MarketplaceProduct
            entityId: source.id,
            fromProductId: source.productId,
            toProductId: masterProductId,
          },
        });
      }

      // Handle ProductSource conflicts: Check for duplicate (productId, integrationId, externalProductId)
      let productSourcesMoved = 0;
      let productSourcesDeleted = 0;
      
      for (const source of productSourcesToMove) {
        // Check if master already has this ProductSource
        const existingMasterSource = await tx.productSource.findFirst({
          where: {
            productId: masterProductId,
            integrationId: source.integrationId,
            externalProductId: source.externalProductId,
          },
        });

        if (existingMasterSource) {
          // Conflict: master already has this ProductSource, delete duplicate
          await tx.productSource.delete({ where: { id: source.id } });
          productSourcesDeleted++;
        } else {
          // No conflict, move to master
          await tx.productSource.update({
            where: { id: source.id },
            data: { productId: masterProductId },
          });
          productSourcesMoved++;
        }
      }

      // 4. Re-link CampaignSet references (campaignSetId) → masterProductId
      // Only update if master doesn't have a CampaignSet relation
      let campaignSetUpdates = 0;
      const masterHasCampaignSet = masterProduct.campaignSetId !== null;
      
      if (!masterHasCampaignSet) {
        // Find duplicate with CampaignSet and transfer to master
        const duplicateWithCampaignSet = duplicateProducts.find(p => p.campaignSetId !== null);
        if (duplicateWithCampaignSet) {
          // Create trace record for CampaignSet reference transfer
          await tx.productMergeReference.create({
            data: {
              mergeId,
              companyId,
              entityType: 'CAMPAIGN_SET_REFERENCE',
              entityId: masterProductId, // Master product receives the reference
              fromProductId: duplicateWithCampaignSet.id,
              toProductId: masterProductId,
            },
          });

          await tx.product.update({
            where: { id: masterProductId },
            data: { campaignSetId: duplicateWithCampaignSet.campaignSetId },
          });
          campaignSetUpdates = 1;
        }
      }

      // 4. Mark duplicate products: isActive = false, mergedIntoProductId = masterProductId, mergedAt = now()
      // NOTE: mergedIntoProductId, mergedAt, mergedBy fields require Prisma migration + generate
      const now = new Date();
      const deactivatedResult = await tx.product.updateMany({
        where: { id: { in: duplicateProductIds } },
        data: {
          isActive: false,
          mergedIntoProductId: masterProductId,
          mergedAt: now,
          ...(userId && { mergedBy: userId }),
        },
      });

      return {
        mergeId, // Include mergeId in transaction result
        orderItemsMoved: orderItemsResult.count,
        stockLogsMoved: stockLogsResult.count,
        productSourcesMoved,
        productSourcesDeleted,
        campaignSetReferencesUpdated: campaignSetUpdates,
        productsDeactivated: deactivatedResult.count,
      };
    });

    return {
      masterProductId,
      mergedProductIds: duplicateProductIds,
      mergeId: result.mergeId, // Return mergeId for potential revert
      orderItemsMoved: result.orderItemsMoved,
      stockLogsMoved: result.stockLogsMoved,
      productSourcesMoved: result.productSourcesMoved || 0,
      productSourcesDeleted: result.productSourcesDeleted || 0,
      campaignSetReferencesUpdated: result.campaignSetReferencesUpdated,
      productsDeactivated: result.productsDeactivated,
    };
  }

  /**
   * VERIFICATION: Check post-merge data integrity
   * 
   * Verifies:
   * - No duplicate barcodes remain (where barcode IS NOT NULL)
   * - No orphaned OrderItems (productId points to non-existent product)
   * - No orphaned StockLogs (productId points to non-existent product)
   * - Master products have all expected relations
   * 
   * @param companyId - Optional company ID to verify specific company
   * @returns Verification report
   */
  async verifyPostMergeIntegrity(companyId?: string): Promise<{
    duplicateBarcodes: Array<{
      companyId: string;
      barcode: string;
      productIds: string[];
      count: number;
    }>;
    orphanedOrderItems: Array<{
      orderItemId: string;
      orderId: string;
      productId: string | null;
      sku: string;
    }>;
    orphanedStockLogs: Array<{
      stockLogId: string;
      productId: string;
      type: string;
      createdAt: Date;
    }>;
    mergedProducts: Array<{
      productId: string;
      mergedIntoProductId: string | null;
      isActive: boolean;
      mergedAt: Date | null;
    }>;
    isReadyForUniqueIndex: boolean;
    summary: {
      totalDuplicateGroups: number;
      totalOrphanedOrderItems: number;
      totalOrphanedStockLogs: number;
      totalMergedProducts: number;
      invalidMergedProducts: number;
    };
  }> {
    // 1. Check for duplicate barcodes (where barcode IS NOT NULL)
    const duplicateBarcodes = companyId
      ? await this.findDuplicateProductsByBarcodeForCompany(companyId)
      : await this.findDuplicateProductsByBarcode();

    // 2. Check for orphaned OrderItems (productId points to non-existent product)
    const orphanedOrderItemsQuery = companyId
      ? prisma.$queryRaw<Array<{
          id: string;
          orderId: string;
          productId: string | null;
          sku: string;
        }>>`
          SELECT oi.id, oi."orderId", oi."productId", oi.sku
          FROM order_items oi
          INNER JOIN orders o ON oi."orderId" = o.id
          WHERE o."companyId" = ${companyId}::uuid
            AND oi."productId" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM products p 
              WHERE p.id = oi."productId"
            )
        `
      : prisma.$queryRaw<Array<{
          id: string;
          orderId: string;
          productId: string | null;
          sku: string;
        }>>`
          SELECT oi.id, oi."orderId", oi."productId", oi.sku
          FROM order_items oi
          WHERE oi."productId" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM products p 
              WHERE p.id = oi."productId"
            )
        `;

    const orphanedOrderItems = await orphanedOrderItemsQuery;

    // 3. Check for orphaned StockLogs (productId points to non-existent product)
    const orphanedStockLogsQuery = companyId
      ? prisma.$queryRaw<Array<{
          id: string;
          productId: string;
          type: string;
          createdAt: Date;
        }>>`
          SELECT sl.id, sl."productId", sl.type, sl."createdAt"
          FROM stock_logs sl
          WHERE sl."productId" IN (
            SELECT p.id FROM products p WHERE p."companyId" = ${companyId}::uuid
          )
            AND NOT EXISTS (
              SELECT 1 FROM products p2 
              WHERE p2.id = sl."productId"
            )
        `
      : prisma.$queryRaw<Array<{
          id: string;
          productId: string;
          type: string;
          createdAt: Date;
        }>>`
          SELECT sl.id, sl."productId", sl.type, sl."createdAt"
          FROM stock_logs sl
          WHERE NOT EXISTS (
            SELECT 1 FROM products p 
            WHERE p.id = sl."productId"
          )
        `;

    const orphanedStockLogs = await orphanedStockLogsQuery;

    // 4. Get merged products (products with mergedIntoProductId)
    // NOTE: mergedIntoProductId, mergedAt fields require Prisma migration + generate
    const mergedProducts = await prisma.product.findMany({
      where: {
        ...(companyId && { companyId }),
        mergedIntoProductId: { not: null },
      },
      select: {
        id: true,
        mergedIntoProductId: true,
        isActive: true,
        mergedAt: true,
      },
    });

    // 5. Verify master products have all relations
    // Check that merged products point to valid master products
    const invalidMergedProducts: string[] = [];
    for (const mergedProduct of mergedProducts) {
      const mergedIntoId = mergedProduct.mergedIntoProductId;
      const productId = mergedProduct.id;
      
      if (!mergedIntoId) {
        invalidMergedProducts.push(productId);
        continue;
      }
      const masterExists = await prisma.product.findUnique({
        where: { id: mergedIntoId },
        select: { id: true },
      });
      if (!masterExists) {
        invalidMergedProducts.push(productId);
      }
    }

    // 6. Determine if ready for unique index
    const isReadyForUniqueIndex = 
      duplicateBarcodes.length === 0 &&
      orphanedOrderItems.length === 0 &&
      orphanedStockLogs.length === 0 &&
      invalidMergedProducts.length === 0;

    return {
      duplicateBarcodes: duplicateBarcodes.map(dup => ({
        companyId: dup.companyId,
        barcode: dup.barcode,
        productIds: dup.productIds,
        count: dup.count,
      })),
      orphanedOrderItems: orphanedOrderItems.map(item => ({
        orderItemId: item.id,
        orderId: item.orderId,
        productId: item.productId,
        sku: item.sku,
      })),
      orphanedStockLogs: orphanedStockLogs.map(log => ({
        stockLogId: log.id,
        productId: log.productId,
        type: log.type,
        createdAt: new Date(log.createdAt),
      })),
      mergedProducts: mergedProducts.map(p => {
        return {
          productId: p.id,
          mergedIntoProductId: p.mergedIntoProductId,
          isActive: p.isActive,
          mergedAt: p.mergedAt,
        };
      }),
      isReadyForUniqueIndex,
      summary: {
        totalDuplicateGroups: duplicateBarcodes.length,
        totalOrphanedOrderItems: orphanedOrderItems.length,
        totalOrphanedStockLogs: orphanedStockLogs.length,
        totalMergedProducts: mergedProducts.length,
        invalidMergedProducts: invalidMergedProducts.length,
      },
    };
  }

  /**
   * REVERT MERGE: Safely revert a product merge operation using merge trace
   * 
   * This operation restores all references that were moved during merge back to
   * their original products, using the immutable merge trace records.
   * 
   * CRITICAL RULES:
   * - Merge trace MUST exist (revert is FORBIDDEN if trace missing)
   * - Only re-links entities that were moved during merge
   * - Does NOT touch new references created after merge
   * - StockLog quantities are NEVER changed (only productId reference)
   * - All operations are transactional (all or nothing)
   * 
   * @param input - Revert operation input
   * @returns Revert operation summary
   */
  async revertProductMerge(input: {
    mergeId: string;
    companyId: string;
    userId?: string;
    reason: string;
  }): Promise<{
    mergeId: string;
    revertedProductIds: string[];
    orderItemsRestored: number;
    stockLogsRestored: number;
    marketplaceLinksRestored: number;
    productSourcesRestored: number;
    campaignSetReferencesRestored: number;
    productsReactivated: number;
  }> {
    const { mergeId, companyId, userId, reason } = input;

    // Validation: Ensure merge trace exists
    const traceRecords = await prisma.productMergeReference.findMany({
      where: { mergeId, companyId },
    });

    if (traceRecords.length === 0) {
      throw new Error(`Merge trace not found for mergeId: ${mergeId}. Revert is FORBIDDEN.`);
    }

    // Get unique product IDs that were merged
    const mergedProductIds = [...new Set(traceRecords.map((t: any) => String(t.fromProductId)))] as string[];
    
    // Verify all merged products still exist and are marked as merged
    const mergedProducts = await prisma.product.findMany({
      where: {
        id: { in: mergedProductIds },
        mergedIntoProductId: { not: null },
      },
    });

    if (mergedProducts.length !== mergedProductIds.length) {
      throw new Error('Some merged products are missing or not properly marked. Revert is FORBIDDEN.');
    }

    // Get master product ID (should be same for all traces)
    const masterProductId = traceRecords[0].toProductId;

    // Verify all traces point to same master
    const allPointToSameMaster = traceRecords.every((t: any) => t.toProductId === masterProductId);
    if (!allPointToSameMaster) {
      throw new Error('Inconsistent merge trace: traces point to different master products. Revert is FORBIDDEN.');
    }

    // Perform revert in single transaction
    return await prisma.$transaction(async (tx) => {
      // 1. Re-link OrderItems back to original products
      const orderItemTraces = traceRecords.filter((t: any) => t.entityType === 'ORDER_ITEM');
      let orderItemsRestored = 0;
      
      for (const trace of orderItemTraces) {
        // Verify entity still exists and points to master
        const orderItem = await tx.orderItem.findUnique({
          where: { id: trace.entityId },
        });
        
        if (orderItem && orderItem.productId === masterProductId) {
          await tx.orderItem.update({
            where: { id: trace.entityId },
            data: { productId: trace.fromProductId },
          });
          orderItemsRestored++;
        }
        // If entity doesn't exist or points elsewhere, skip (new reference created after merge)
      }

      // 2. Re-link StockLogs back to original products
      const stockLogTraces = traceRecords.filter((t: any) => t.entityType === 'STOCK_LOG');
      let stockLogsRestored = 0;
      
      for (const trace of stockLogTraces) {
        const stockLog = await tx.stockLog.findUnique({
          where: { id: trace.entityId },
        });
        
        if (stockLog && stockLog.productId === masterProductId) {
          // CRITICAL: Only change productId reference, NEVER change quantity
          await tx.stockLog.update({
            where: { id: trace.entityId },
            data: { productId: trace.fromProductId },
          });
          stockLogsRestored++;
        }
        // If entity doesn't exist or points elsewhere, skip
      }

      // 3. Re-link MarketplaceProduct links and ProductSource records
      const marketplaceTraces = traceRecords.filter((t: any) => t.entityType === 'MARKETPLACE_LINK');
      let marketplaceLinksRestored = 0;
      let productSourcesRestored = 0;
      
      for (const trace of marketplaceTraces) {
        // Try MarketplaceProduct first
        const marketplaceLink = await tx.marketplaceProduct.findUnique({
          where: { id: trace.entityId },
        });
        
        if (marketplaceLink && marketplaceLink.productId === masterProductId) {
          await tx.marketplaceProduct.update({
            where: { id: trace.entityId },
            data: { productId: trace.fromProductId },
          });
          marketplaceLinksRestored++;
          continue;
        }

        // Try ProductSource if not found in MarketplaceProduct
        const productSource = await tx.productSource.findUnique({
          where: { id: trace.entityId },
        });
        
        if (productSource && productSource.productId === masterProductId) {
          await tx.productSource.update({
            where: { id: trace.entityId },
            data: { productId: trace.fromProductId },
          });
          productSourcesRestored++;
        }
      }

      // 4. Restore CampaignSet references
      const campaignSetTraces = traceRecords.filter((t: any) => t.entityType === 'CAMPAIGN_SET_REFERENCE');
      let campaignSetReferencesRestored = 0;
      
      for (const trace of campaignSetTraces) {
        // Restore CampaignSet to original product
        const originalProduct = await tx.product.findUnique({
          where: { id: trace.fromProductId },
          select: { campaignSetId: true },
        });
        
        if (originalProduct && originalProduct.campaignSetId === null) {
          // Get CampaignSet from master (if it was transferred)
          const masterProduct = await tx.product.findUnique({
            where: { id: masterProductId },
            select: { campaignSetId: true },
          });
          
          if (masterProduct?.campaignSetId) {
            await tx.product.update({
              where: { id: trace.fromProductId },
              data: { campaignSetId: masterProduct.campaignSetId },
            });
            
            // Clear CampaignSet from master
            await tx.product.update({
              where: { id: masterProductId },
              data: { campaignSetId: null },
            });
            
            campaignSetReferencesRestored++;
          }
        }
      }

      // 5. Reactivate merged products
      const now = new Date();
      const reactivatedResult = await tx.product.updateMany({
        where: { id: { in: mergedProductIds } },
        data: {
          isActive: true,
          mergedIntoProductId: null,
          mergedAt: null,
          mergedBy: null,
          mergeRevertedAt: now,
          mergeRevertedBy: userId,
          mergeRevertReason: reason,
        },
      });

      return {
        mergeId,
        revertedProductIds: mergedProductIds,
        orderItemsRestored,
        stockLogsRestored,
        marketplaceLinksRestored,
        productSourcesRestored,
        campaignSetReferencesRestored,
        productsReactivated: reactivatedResult.count,
      };
    });
  }

  /**
   * Fix orphaned MarketplaceProduct records linked to inactive merged products.
   * This fixes marketplace links that were not properly re-linked during merge.
   * 
   * @param companyId - Company ID to fix links for
   * @returns Summary of fixed records
   */
  async fixOrphanedMarketplaceProducts(companyId: string): Promise<{
    totalOrphaned: number;
    fixed: number;
    conflicts: number; // MarketplaceProduct records that couldn't be moved due to conflicts
    productSourcesFixed: number;
    productSourcesConflicts: number;
  }> {
    return await prisma.$transaction(async (tx) => {
      // 1. Find all MarketplaceProduct records linked to inactive merged products
      const orphanedMarketplaceProducts = await tx.marketplaceProduct.findMany({
        where: {
          product: {
            companyId,
            isActive: false,
            mergedIntoProductId: { not: null },
          },
        },
        include: {
          product: {
            select: {
              id: true,
              mergedIntoProductId: true,
            },
          },
          integration: {
            select: {
              id: true,
              type: true,
            },
          },
        },
      });

      // 2. Find all ProductSource records linked to inactive merged products
      const orphanedProductSources = await tx.productSource.findMany({
        where: {
          product: {
            companyId,
            isActive: false,
            mergedIntoProductId: { not: null },
          },
        },
        include: {
          product: {
            select: {
              id: true,
              mergedIntoProductId: true,
            },
          },
          integration: {
            select: {
              id: true,
            },
          },
        },
      });

      let fixed = 0;
      let conflicts = 0;
      let productSourcesFixed = 0;
      let productSourcesConflicts = 0;

      // 3. Fix MarketplaceProduct records
      for (const mp of orphanedMarketplaceProducts) {
        const masterProductId = mp.product.mergedIntoProductId;
        if (!masterProductId) continue;

        // Check if master already has a MarketplaceProduct for this integration+marketplaceId
        const existingMasterLink = await tx.marketplaceProduct.findFirst({
          where: {
            productId: masterProductId,
            integrationId: mp.integrationId,
            marketplaceId: mp.marketplaceId,
          },
        });

        if (existingMasterLink) {
          // Conflict: Master already has this link, delete orphaned one
          await tx.marketplaceProduct.delete({
            where: { id: mp.id },
          });
          conflicts++;
        } else {
          // No conflict, re-link to master
          await tx.marketplaceProduct.update({
            where: { id: mp.id },
            data: { productId: masterProductId },
          });
          fixed++;
        }
      }

      // 4. Fix ProductSource records
      for (const ps of orphanedProductSources) {
        const masterProductId = ps.product.mergedIntoProductId;
        if (!masterProductId) continue;

        // Check if master already has a ProductSource for this integration
        const existingMasterSource = await tx.productSource.findFirst({
          where: {
            productId: masterProductId,
            integrationId: ps.integrationId,
          },
        });

        if (existingMasterSource) {
          // Conflict: Master already has this ProductSource, delete orphaned one
          await tx.productSource.delete({
            where: { id: ps.id },
          });
          productSourcesConflicts++;
        } else {
          // No conflict, re-link to master
          await tx.productSource.update({
            where: { id: ps.id },
            data: { productId: masterProductId },
          });
          productSourcesFixed++;
        }
      }

      return {
        totalOrphaned: orphanedMarketplaceProducts.length + orphanedProductSources.length,
        fixed,
        conflicts,
        productSourcesFixed,
        productSourcesConflicts,
      };
    });
  }
}

export const productRepository = new ProductRepository();

