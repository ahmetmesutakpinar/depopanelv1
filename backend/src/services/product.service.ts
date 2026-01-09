import { productRepository, CreateProductData, UpdateProductData, ProductWithStock } from '../repositories/product.repository.js';
import { stockRepository } from '../repositories/stock.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { marketplaceProductRepository } from '../repositories/marketplace-product.repository.js';
import { ConflictError, NotFoundError, AppError } from '../middleware/error.middleware.js';
import { prisma } from '../config/index.js';
import { MarketplaceType } from '@prisma/client';
import { createProductStock, ensureDefaultWarehouseStock } from '../utils/stock-helper.js';

class ProductService {
  /**
   * Get marketplace links for products, ensuring:
   * - Only active integrations (status = 'ACTIVE', isActive = true)
   * - Only active MarketplaceProduct records (isActive = true)
   * - Merged products show master product's marketplace links
   * 
   * @param productIds - Array of product IDs (may include merged products)
   * @param companyId - Company ID
   * @returns Map of productId -> marketplace links (resolved to master if merged)
   */
  private async getMarketplaceLinksForProducts(
    productIds: string[],
    companyId: string
  ): Promise<{
    linksByProductId: Map<string, Set<MarketplaceType>>;
    linksByProductIdWithUrl: Map<string, Map<MarketplaceType, string | null>>;
    allMarketplaceTypes: MarketplaceType[];
  }> {
    // ✅ FIX: Get all ACTIVE integrations (isActive = true is sufficient)
    // CRITICAL: WooCommerce integration MUST be included if it exists, even if inactive
    // because WooCommerce is PRODUCT MASTER and products with wooCommerceId must be visible
    const integrations = await prisma.marketplaceIntegration.findMany({
      where: {
        companyId,
        isActive: true,
        // Removed status check - isActive is the primary indicator
      },
      select: { id: true, type: true },
    });

    // ✅ FIX: Always include WooCommerce in allMarketplaceTypes if products have wooCommerceId
    // This ensures WooCommerce products are always visible in product list
    const hasWooCommerceProducts = await prisma.product.count({
      where: {
        companyId,
        wooCommerceId: { not: null },
      },
      take: 1,
    });

    // If WooCommerce products exist but integration not in active list, add it
    let wooCommerceIntegrationInList = integrations.find(i => i.type === 'WOOCOMMERCE');
    if (hasWooCommerceProducts > 0 && !wooCommerceIntegrationInList) {
      // Try to find WooCommerce integration even if inactive
      const wooCommerceIntegration = await prisma.marketplaceIntegration.findFirst({
        where: {
          companyId,
          type: 'WOOCOMMERCE',
        },
        select: { id: true, type: true },
      });
      if (wooCommerceIntegration) {
        integrations.push(wooCommerceIntegration);
        wooCommerceIntegrationInList = wooCommerceIntegration;
      }
    }

    // Get products to resolve merged products to their masters
    const productsForMergeResolution = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId },
      select: { id: true, mergedIntoProductId: true },
    });

    // Create map: merged product -> master product
    const mergedToMaster = new Map<string, string>();
    const masterProductIds = new Set<string>();
    
    for (const productRecord of productsForMergeResolution) {
      const productId: string = String(productRecord.id);
      const mergedInto: string | null = productRecord.mergedIntoProductId;
      if (mergedInto) {
        mergedToMaster.set(productId, String(mergedInto));
        masterProductIds.add(String(mergedInto));
      } else {
        masterProductIds.add(productId);
      }
    }

    // Get marketplace product links for master products only
    // CRITICAL: Only active MarketplaceProduct records linked to active integrations
    const marketplaceLinks = await prisma.marketplaceProduct.findMany({
      where: {
        productId: { in: Array.from(masterProductIds) },
        integrationId: { in: integrations.map(i => i.id) },
        isActive: true, // CRITICAL: Only active marketplace product links
      },
      select: {
        productId: true,
        integrationId: true,
        listingUrl: true,
        marketplaceId: true,
        integration: {
          select: { type: true, isActive: true, settings: true },
        },
      },
    });
    
    // Get products with wooCommerceId for WooCommerce fallback
    const productsWithWooCommerceId = await prisma.product.findMany({
      where: {
        id: { in: Array.from(masterProductIds) },
        wooCommerceId: { not: null },
      },
      select: {
        id: true,
        wooCommerceId: true,
      },
    });
    
    // Create map: productId -> wooCommerceId
    const productWooCommerceIdMap = new Map<string, number>();
    for (const product of productsWithWooCommerceId) {
      if (product.wooCommerceId) {
        productWooCommerceIdMap.set(product.id, product.wooCommerceId);
      }
    }

    // Filter to ensure integration is still active (double-check)
    const validLinks = marketplaceLinks.filter(link => 
      link.integration.isActive === true
    );

    // Group marketplace links by productId (resolved to master for merged products)
    const linksByProductId = new Map<string, Set<MarketplaceType>>();
    const linksByProductIdWithUrl = new Map<string, Map<MarketplaceType, string | null>>();
    
    // Create reverse map: master product -> all original productIds that resolve to it
    const masterToOriginals = new Map<string, string[]>();
    for (const originalProductId of productIds) {
      const resolvedProductId = mergedToMaster.get(originalProductId) || originalProductId;
      if (!masterToOriginals.has(resolvedProductId)) {
        masterToOriginals.set(resolvedProductId, []);
      }
      masterToOriginals.get(resolvedProductId)!.push(originalProductId);
    }
    
    // For each link, find all original productIds that resolve to this link's productId
    for (const link of validLinks) {
      let originalProductIds = masterToOriginals.get(link.productId) || [];
      
      // If link.productId is directly in productIds (not merged), add it if not already in list
      if (productIds.includes(link.productId) && !originalProductIds.includes(link.productId)) {
        originalProductIds = [...originalProductIds, link.productId];
      }
      
      // Add link to all original productIds that resolve to this master
      for (const originalProductId of originalProductIds) {
        if (!linksByProductId.has(originalProductId)) {
          linksByProductId.set(originalProductId, new Set());
        }
        linksByProductId.get(originalProductId)!.add(link.integration.type);
        
        if (!linksByProductIdWithUrl.has(originalProductId)) {
          linksByProductIdWithUrl.set(originalProductId, new Map());
        }
        
        // For WooCommerce: If listingUrl is missing, try to generate it from API URL + product ID
        let finalListingUrl = link.listingUrl;
        if (link.integration.type === 'WOOCOMMERCE' && !finalListingUrl && link.marketplaceId) {
          const integrationSettings = link.integration.settings as Record<string, any> | null;
          const apiUrl = integrationSettings?.apiUrl;
          
          if (apiUrl) {
            // Extract base URL from WooCommerce API URL (remove /wp-json/wc/v3)
            const baseUrl = apiUrl.replace(/\/wp-json\/wc\/v3\/?$/, '').replace(/\/$/, '');
            // WooCommerce product URL: {baseUrl}/?p={id} (query param format)
            finalListingUrl = `${baseUrl}/?p=${link.marketplaceId}`;
          }
        }
        
        linksByProductIdWithUrl.get(originalProductId)!.set(link.integration.type, finalListingUrl);
      }
    }
    
    // ✅ FIX: WOOCOMMERCE FALLBACK: If product has wooCommerceId but no MarketplaceProduct link, create link entry
    // CRITICAL: This MUST work even if WooCommerce integration is inactive
    // WooCommerce is PRODUCT MASTER - all products with wooCommerceId must be visible
    const wooCommerceIntegration = integrations.find(i => i.type === 'WOOCOMMERCE');
    if (wooCommerceIntegration || productWooCommerceIdMap.size > 0) {
      // If integration not in list but products exist, fetch it
      let wooIntegration = wooCommerceIntegration;
      if (!wooIntegration && productWooCommerceIdMap.size > 0) {
        const wooIntegrationDb = await prisma.marketplaceIntegration.findFirst({
          where: {
            companyId,
            type: 'WOOCOMMERCE',
          },
          select: { id: true, settings: true },
        });
        if (wooIntegrationDb) {
          wooIntegration = { id: wooIntegrationDb.id, type: 'WOOCOMMERCE' as MarketplaceType };
        }
      }
      
      if (wooIntegration) {
        // Get WooCommerce API URL to generate listingUrl (fetch once for all products)
        const wooCommerceIntegrationFull = await prisma.marketplaceIntegration.findUnique({
          where: { id: wooIntegration.id },
          select: { settings: true },
        });
        
        let baseWooCommerceUrl: string | null = null;
        if (wooCommerceIntegrationFull?.settings) {
          const settings = wooCommerceIntegrationFull.settings as Record<string, any>;
          const apiUrl = settings.apiUrl;
          if (apiUrl) {
            // Extract base URL from WooCommerce API URL (remove /wp-json/wc/v3)
            baseWooCommerceUrl = apiUrl.replace(/\/wp-json\/wc\/v3\/?$/, '').replace(/\/$/, '');
          }
        }
        
        for (const [productId, wooCommerceId] of productWooCommerceIdMap.entries()) {
          // Check if this product already has a WooCommerce link
          const hasWooCommerceLink = validLinks.some(
            link => link.productId === productId && link.integration.type === 'WOOCOMMERCE'
          );
          
          if (!hasWooCommerceLink) {
            // Get all original productIds that resolve to this productId
            const originalProductIds = masterToOriginals.get(productId) || [];
            if (productIds.includes(productId) && !originalProductIds.includes(productId)) {
              originalProductIds.push(productId);
            }
            
            // Generate listingUrl from base URL + product ID
            let listingUrl: string | null = null;
            if (baseWooCommerceUrl) {
              // WooCommerce product URL format: {baseUrl}/?p={id} (works for all products)
              // Alternative: {baseUrl}/product/{slug}/ but we don't have slug
              listingUrl = `${baseWooCommerceUrl}/?p=${wooCommerceId}`;
            }
            
            // Add WooCommerce link for all original productIds
            for (const originalProductId of originalProductIds) {
              if (!linksByProductId.has(originalProductId)) {
                linksByProductId.set(originalProductId, new Set());
              }
              linksByProductId.get(originalProductId)!.add('WOOCOMMERCE');
              
              if (!linksByProductIdWithUrl.has(originalProductId)) {
                linksByProductIdWithUrl.set(originalProductId, new Map());
              }
              linksByProductIdWithUrl.get(originalProductId)!.set('WOOCOMMERCE', listingUrl);
            }
          }
        }
      }
    }

    // ✅ FIX: Ensure WOOCOMMERCE is always in allMarketplaceTypes if WooCommerce products exist
    // This ensures WooCommerce products are always visible in product list
    const allMarketplaceTypesList = integrations.map(i => i.type);
    if (productWooCommerceIdMap.size > 0 && !allMarketplaceTypesList.includes('WOOCOMMERCE')) {
      allMarketplaceTypesList.push('WOOCOMMERCE');
    }

    return {
      linksByProductId,
      linksByProductIdWithUrl,
      allMarketplaceTypes: allMarketplaceTypesList,
    };
  }

  async getProducts(companyId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    const { products, total } = await productRepository.findByCompany(companyId, {
      skip,
      take,
      search: options?.search,
      categoryId: options?.categoryId,
      isActive: options?.isActive,
      sortBy: options?.sortBy,
      sortOrder: options?.sortOrder,
    });

    // Get marketplace links with proper validation (active integrations + active links + merged product resolution)
    const productIds = products.map(p => p.id);
    const { linksByProductId, linksByProductIdWithUrl, allMarketplaceTypes } = 
      await this.getMarketplaceLinksForProducts(productIds, companyId);

    // Calculate total stock and primary location for each product
    // Ensure barcode is never null - use empty string if null
    const productsWithTotalStock = products.map(product => {
      const totalStock = product.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
      const totalReserved = product.stocks.reduce((sum, stock) => sum + stock.reservedQty, 0);
      
      // Get primary location assignment or first location with stock
      const productWithLocations = product as ProductWithStock & {
        locationAssignments?: Array<{ location: { id: string; code: string; name: string } | null }>;
      };
      const primaryLocation = productWithLocations.locationAssignments?.[0]?.location || 
        product.stocks.find(stock => stock.locationId && stock.quantity > 0)?.location ||
        null;
      
      // Get marketplace matching status
      const matchedMarketplaces = linksByProductId.get(product.id) 
        ? Array.from(linksByProductId.get(product.id)!)
        : [];
      const missingMarketplaces = allMarketplaceTypes.filter(
        type => !matchedMarketplaces.includes(type)
      );
      const isMatched = matchedMarketplaces.length > 0;
      
      // Get marketplace links with listingUrl
      const marketplaceLinksMap: Record<string, string | null> = {};
      const productMarketplaceLinks = linksByProductIdWithUrl.get(product.id);
      if (productMarketplaceLinks) {
        productMarketplaceLinks.forEach((url, type) => {
          marketplaceLinksMap[type] = url;
        });
      }
      
      return {
        ...product,
        barcode: product.barcode ?? '', // Never null - use empty string
        gtin: product.gtin ?? '', // Never null - use empty string
        totalStock,
        totalReserved,
        availableStock: totalStock - totalReserved,
        primaryLocation,
        // Marketplace matching status
        isMatched,
        matchedMarketplaces,
        missingMarketplaces,
        marketplaceLinks: marketplaceLinksMap,
      };
    });

    return {
      products: productsWithTotalStock,
      pagination: {
        page: options?.page || 1,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async getProductById(id: string, companyId: string) {
    const product = await productRepository.findByIdAndCompany(id, companyId);

    if (!product) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    const totalStock = product.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
    const totalReserved = product.stocks.reduce((sum, stock) => sum + stock.reservedQty, 0);
    
    // Get primary location
    const productWithLocations = product as ProductWithStock & {
      locationAssignments?: Array<{ location: { id: string; code: string; name: string } | null }>;
    };
    const primaryLocation = productWithLocations.locationAssignments?.[0]?.location || null;

    // Get marketplace matching status with proper validation
    // Resolve to master product if this product is merged
    const resolvedProductId = product.mergedIntoProductId || id;
    
    const { linksByProductId, linksByProductIdWithUrl, allMarketplaceTypes } = 
      await this.getMarketplaceLinksForProducts([id], companyId);

    const matchedMarketplaces = linksByProductId.get(id) 
      ? Array.from(linksByProductId.get(id)!)
      : [];
    const missingMarketplaces = allMarketplaceTypes.filter(
      type => !matchedMarketplaces.includes(type)
    );
    const isMatched = matchedMarketplaces.length > 0;

    // Create marketplace links map with listingUrl
    const marketplaceLinksMap: Record<string, string | null> = {};
    const productMarketplaceLinks = linksByProductIdWithUrl.get(id);
    if (productMarketplaceLinks) {
      productMarketplaceLinks.forEach((url, type) => {
        marketplaceLinksMap[type] = url;
      });
    }

    return {
      ...product,
      barcode: product.barcode ?? '', // Never null - use empty string
      gtin: product.gtin ?? '', // Never null - use empty string
      totalStock,
      totalReserved,
      availableStock: totalStock - totalReserved,
      primaryLocation,
      // Marketplace matching status
      isMatched,
      matchedMarketplaces,
      missingMarketplaces,
      marketplaceLinks: marketplaceLinksMap,
    };
  }

  async getProductBySku(companyId: string, sku: string) {
    const product = await productRepository.findBySku(companyId, sku);
    if (product) {
      return {
        ...product,
        barcode: product.barcode ?? '', // Never null - use empty string
        gtin: product.gtin ?? '', // Never null - use empty string
      };
    }
    return product;
  }

  async getProductByBarcode(companyId: string, barcode: string) {
    const product = await productRepository.findByBarcode(companyId, barcode);
    if (product) {
      return {
        ...product,
        barcode: product.barcode ?? '', // Never null - use empty string
        gtin: product.gtin ?? '', // Never null - use empty string
      };
    }
    return product;
  }

  async createProduct(companyId: string, data: Omit<CreateProductData, 'companyId'>, initialStock?: {
    warehouseId: string;
    locationId?: string;
    quantity: number;
  }) {
    // Check if SKU exists
    const skuExists = await productRepository.existsBySku(companyId, data.sku);
    if (skuExists) {
      throw new ConflictError('Bu SKU zaten kullanımda');
    }

    // Validate default warehouse exists
    const defaultWarehouse = await warehouseRepository.findDefaultByCompany(companyId);
    if (!defaultWarehouse) {
      throw new AppError('Varsayılan depo bulunamadı. Lütfen önce bir varsayılan depo oluşturun.', 400);
    }

    // Create product with initial stock if provided
    const product = await prisma.$transaction(async (tx) => {
      const newProduct = await tx.product.create({
        data: {
          ...data,
          companyId,
        },
      });

      // Create initial stock if warehouse provided
      if (initialStock?.warehouseId) {
        // Use stock helper to create stock with proper logging
        const note = initialStock.locationId 
          ? `Başlangıç stoğu - Lokasyon: ${initialStock.locationId}` 
          : 'Başlangıç stoğu';
        
        await createProductStock(tx, {
          productId: newProduct.id,
          warehouseId: initialStock.warehouseId,
          locationId: initialStock.locationId,
          quantity: initialStock.quantity || 0,
          note,
        });

        // If location is DEDICATED and product assignment not exists, create assignment
        if (initialStock.locationId) {
          const location = await tx.location.findUnique({
            where: { id: initialStock.locationId },
          });
          
          if (location && location.locationType === 'DEDICATED') {
            // Check if assignment already exists
            const existingAssignment = await tx.productLocationAssignment.findFirst({
              where: {
                locationId: initialStock.locationId,
                productId: newProduct.id,
              },
            });

            if (!existingAssignment) {
              // Make this the primary location for this product
              await tx.productLocationAssignment.create({
                data: {
                  productId: newProduct.id,
                  locationId: initialStock.locationId,
                  isPrimary: true,
                },
              });
            }
          }
        }
      } else {
        // Create stock entry for default warehouse (0 quantity)
        await ensureDefaultWarehouseStock(tx, newProduct.id, companyId, 0);
      }

      return newProduct;
    });

    return this.getProductById(product.id, companyId);
  }

  async updateProduct(id: string, companyId: string, data: UpdateProductData & { primaryLocationId?: string | null }) {
    const product = await productRepository.findByIdAndCompany(id, companyId);

    if (!product) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    // Check if new SKU conflicts
    if (data.sku && data.sku !== product.sku) {
      const skuExists = await productRepository.existsBySku(companyId, data.sku, id);
      if (skuExists) {
        throw new ConflictError('Bu SKU zaten kullanımda');
      }
    }

    // Handle location assignment if provided
    const { primaryLocationId, ...productUpdateData } = data;
    
    if (primaryLocationId !== undefined) {
      await prisma.$transaction(async (tx) => {
        // Remove existing primary assignments for this product
        await tx.productLocationAssignment.updateMany({
          where: {
            productId: id,
            isPrimary: true,
          },
          data: {
            isPrimary: false,
          },
        });

        if (primaryLocationId) {
          // Verify location exists and belongs to same company
          const location = await tx.location.findFirst({
            where: {
              id: primaryLocationId,
              warehouse: {
                companyId: companyId,
              },
            },
            include: {
              warehouse: true,
            },
          });

          if (!location) {
            throw new NotFoundError('Lokasyon bulunamadı veya bu şirkete ait değil');
          }

          // Check if assignment already exists
          let assignment = await tx.productLocationAssignment.findFirst({
            where: {
              productId: id,
              locationId: primaryLocationId,
            },
          });

          if (assignment) {
            // Update existing assignment to be primary
            await tx.productLocationAssignment.update({
              where: { id: assignment.id },
              data: { isPrimary: true },
            });
          } else {
            // Create new primary assignment
            await tx.productLocationAssignment.create({
              data: {
                productId: id,
                locationId: primaryLocationId,
                isPrimary: true,
              },
            });
          }
        }
      });
    }

    await productRepository.update(id, productUpdateData);
    return this.getProductById(id, companyId);
  }

  async deleteProduct(id: string, companyId: string) {
    const product = await productRepository.findByIdAndCompany(id, companyId);

    if (!product) {
      throw new NotFoundError('Ürün bulunamadı');
    }

    // Check if product has stock
    const totalStock = product.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
    if (totalStock > 0) {
      throw new ConflictError('Stoğu olan ürün silinemez. Önce stoğu sıfırlayın.');
    }

    await productRepository.delete(id);
  }

  /**
   * Merge two products - combine duplicate product into master product
   * 
   * REFACTORED: Now uses the safe mergeDuplicateProducts() method which:
   * - Does NOT delete products (only marks as inactive)
   * - Does NOT mutate stock.quantity directly (StockLog-only approach)
   * - Creates merge trace for safe revert
   * - Maintains frontend response format compatibility
   * 
   * @param masterProductId The product to keep (master)
   * @param duplicateProductId The product to merge (duplicate)
   * @param companyId Company ID for security
   */
  async mergeProducts(masterProductId: string, duplicateProductId: string, companyId: string) {
    // 1. Verify both products exist and belong to company
    const masterProduct = await productRepository.findByIdAndCompany(masterProductId, companyId);
    const duplicateProduct = await productRepository.findByIdAndCompany(duplicateProductId, companyId);

    if (!masterProduct) {
      throw new NotFoundError('Master ürün bulunamadı');
    }

    if (!duplicateProduct) {
      throw new NotFoundError('Birleştirilecek ürün bulunamadı');
    }

    if (masterProductId === duplicateProductId) {
      throw new ConflictError('Aynı ürün birleştirilemez');
    }

    // 2. Get barcode (required for new merge method)
    // Prefer master product's barcode, fallback to duplicate's barcode
    const barcode = masterProduct.barcode || duplicateProduct.barcode;
    if (!barcode) {
      throw new ConflictError('Ürünlerin birleştirilebilmesi için en az birinin barkodu olmalıdır');
    }

    // 3. Get marketplace information before merge (for response compatibility)
    const duplicateMarketplaceProducts = await prisma.marketplaceProduct.findMany({
      where: { productId: duplicateProductId },
      include: {
        integration: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    const mergedMarketplaces = duplicateMarketplaceProducts.map(mp => ({
      integrationId: mp.integration.id,
      integrationName: mp.integration.name,
      marketplaceType: mp.integration.type,
      marketplaceProductId: mp.marketplaceId,
    }));

    // 4. Use the new safe merge method
    await productRepository.mergeDuplicateProducts({
      companyId,
      barcode,
      masterProductId,
      duplicateProductIds: [duplicateProductId],
      userId: undefined, // TODO: Get from request context if available
    });

    // 5. Get master product and all marketplace products after merge
    const updatedMasterProduct = await productRepository.findByIdAndCompany(masterProductId, companyId);
    
    const masterMarketplaceProducts = await prisma.marketplaceProduct.findMany({
      where: { productId: masterProductId },
      include: {
        integration: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    // 6. Return in the same format as before (frontend compatibility)
    return {
      product: updatedMasterProduct,
      mergedMarketplaces: mergedMarketplaces,
      allMarketplaces: masterMarketplaceProducts.map(mp => ({
        integrationId: mp.integration.id,
        integrationName: mp.integration.name,
        marketplaceType: mp.integration.type,
        marketplaceProductId: mp.marketplaceId,
      })),
    };
  }

  async getLowStockProducts(companyId: string) {
    return productRepository.getLowStockProducts(companyId);
  }

  async getProductStats(companyId: string) {
    const [totalProducts, totalValue] = await Promise.all([
      productRepository.getTotalProductCount(companyId),
      stockRepository.getTotalStockValue(companyId),
    ]);

    return {
      totalProducts,
      totalStockValue: totalValue,
    };
  }

  /**
   * READ-ONLY: Detect duplicate products by barcode
   * 
   * This is a read-only operation that identifies products with duplicate barcodes
   * within the same company. No data is modified or deleted.
   * 
   * @param companyId - Optional company ID to filter duplicates for specific company
   * @returns Array of duplicate groups with product details
   */
  async detectDuplicateProductsByBarcode(companyId?: string): Promise<Array<{
    companyId: string;
    barcode: string;
    productIds: string[];
    productNames: string[];
    createdAt: Date[];
    isActive: boolean[];
    count: number;
  }>> {
    const { logger } = await import('../utils/logger.js');
    
    logger.info('[ProductService] Starting duplicate barcode detection', {
      companyId: companyId || 'all companies',
    });

    try {
      const duplicates = companyId
        ? await productRepository.findDuplicateProductsByBarcodeForCompany(companyId)
        : await productRepository.findDuplicateProductsByBarcode();

      logger.info('[ProductService] Duplicate barcode detection completed', {
        companyId: companyId || 'all companies',
        duplicateGroupsFound: duplicates.length,
        totalDuplicateProducts: duplicates.reduce((sum, dup) => sum + dup.count, 0),
      });

      // Log details for each duplicate group
      duplicates.forEach((dup, index) => {
        logger.warn('[ProductService] Duplicate barcode group detected', {
          groupIndex: index + 1,
          companyId: dup.companyId,
          barcode: dup.barcode,
          duplicateCount: dup.count,
          productIds: dup.productIds,
          productNames: dup.productNames,
          oldestProductCreatedAt: dup.createdAt[0],
          activeStatuses: dup.isActive,
        });
      });

      return duplicates;
    } catch (error: any) {
      logger.error('[ProductService] Error during duplicate barcode detection', {
        companyId: companyId || 'all companies',
        error: error?.message || String(error),
        stack: error?.stack,
      });
      throw error;
    }
  }

  /**
   * SAFE MERGE: Merge duplicate products into master product
   * 
   * This operation safely merges duplicate products by:
   * - Re-linking OrderItem.productId → masterProductId
   * - Re-linking StockLog.productId → masterProductId
   * - Re-linking CampaignSet references → masterProductId
   * - Marking duplicate products as inactive and merged
   * 
   * DOES NOT:
   * - Touch stock quantity
   * - Delete products
   * - Modify orders
   * 
   * @param input - Merge operation input
   * @returns Merge operation summary with before/after counts
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
    beforeCounts: {
      orderItems: number;
      stockLogs: number;
      campaignSetReferences: number;
    };
    afterCounts: {
      orderItems: number;
      stockLogs: number;
      campaignSetReferences: number;
    };
  }> {
    const { logger } = await import('../utils/logger.js');
    
    logger.info('[ProductService] Starting safe duplicate product merge', {
      companyId: input.companyId,
      barcode: input.barcode,
      masterProductId: input.masterProductId,
      duplicateProductIds: input.duplicateProductIds,
      duplicateCount: input.duplicateProductIds.length,
      userId: input.userId,
    });

    try {
      // Count before merge
      const beforeCounts = {
        orderItems: await prisma.orderItem.count({
          where: { productId: { in: input.duplicateProductIds } },
        }),
        stockLogs: await prisma.stockLog.count({
          where: { productId: { in: input.duplicateProductIds } },
        }),
        campaignSetReferences: (await prisma.product.findMany({
          where: { id: { in: input.duplicateProductIds } },
          select: { campaignSetId: true },
        })).filter(p => p.campaignSetId !== null).length,
      };

      logger.info('[ProductService] Pre-merge counts', {
        companyId: input.companyId,
        barcode: input.barcode,
        beforeCounts,
      });

      // Perform merge
      const mergeResult = await productRepository.mergeDuplicateProducts({
        companyId: input.companyId,
        barcode: input.barcode,
        masterProductId: input.masterProductId,
        duplicateProductIds: input.duplicateProductIds,
        userId: input.userId,
      });

      // Count after merge
      const afterCounts = {
        orderItems: await prisma.orderItem.count({
          where: { productId: input.masterProductId },
        }),
        stockLogs: await prisma.stockLog.count({
          where: { productId: input.masterProductId },
        }),
        campaignSetReferences: (await prisma.product.findUnique({
          where: { id: input.masterProductId },
          select: { campaignSetId: true },
        }))?.campaignSetId !== null ? 1 : 0,
      };

      logger.info('[ProductService] Safe duplicate product merge completed', {
        companyId: input.companyId,
        barcode: input.barcode,
        masterProductId: input.masterProductId,
        mergedProductIds: input.duplicateProductIds,
        orderItemsMoved: mergeResult.orderItemsMoved,
        stockLogsMoved: mergeResult.stockLogsMoved,
        productSourcesMoved: mergeResult.productSourcesMoved,
        productSourcesDeleted: mergeResult.productSourcesDeleted,
        campaignSetReferencesUpdated: mergeResult.campaignSetReferencesUpdated,
        productsDeactivated: mergeResult.productsDeactivated,
        beforeCounts,
        afterCounts,
        userId: input.userId,
      });

      // Verify merge success
      if (mergeResult.productsDeactivated !== input.duplicateProductIds.length) {
        logger.warn('[ProductService] Not all duplicate products were deactivated', {
          expected: input.duplicateProductIds.length,
          actual: mergeResult.productsDeactivated,
        });
      }

      return {
        masterProductId: mergeResult.masterProductId,
        mergedProductIds: mergeResult.mergedProductIds,
        mergeId: mergeResult.mergeId, // Include mergeId in return
        orderItemsMoved: mergeResult.orderItemsMoved,
        stockLogsMoved: mergeResult.stockLogsMoved,
        productSourcesMoved: mergeResult.productSourcesMoved,
        productSourcesDeleted: mergeResult.productSourcesDeleted,
        campaignSetReferencesUpdated: mergeResult.campaignSetReferencesUpdated,
        productsDeactivated: mergeResult.productsDeactivated,
        beforeCounts,
        afterCounts,
      };
    } catch (error: any) {
      logger.error('[ProductService] Error during safe duplicate product merge', {
        companyId: input.companyId,
        barcode: input.barcode,
        masterProductId: input.masterProductId,
        duplicateProductIds: input.duplicateProductIds,
        error: error?.message || String(error),
        stack: error?.stack,
      });
      throw error;
    }
  }

  /**
   * VERIFICATION: Verify post-merge data integrity
   * 
   * Verifies:
   * - No duplicate barcodes remain (where barcode IS NOT NULL)
   * - No orphaned OrderItems
   * - No orphaned StockLogs
   * - Master products have all relations
   * 
   * @param companyId - Optional company ID to verify specific company
   * @returns Verification report with READY FOR UNIQUE INDEX confirmation
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
    verificationReport: string;
  }> {
    const { logger } = await import('../utils/logger.js');
    
    logger.info('[ProductService] Starting post-merge data integrity verification', {
      companyId: companyId || 'all companies',
    });

    try {
      const verification = await productRepository.verifyPostMergeIntegrity(companyId);

      // Generate verification report
      const report = this.generateVerificationReport(verification);

      logger.info('[ProductService] Post-merge data integrity verification completed', {
        companyId: companyId || 'all companies',
        isReadyForUniqueIndex: verification.isReadyForUniqueIndex,
        summary: verification.summary,
      });

      if (verification.isReadyForUniqueIndex) {
        logger.info('[ProductService] ✅ DATABASE IS READY FOR UNIQUE INDEX', {
          companyId: companyId || 'all companies',
        });
      } else {
        logger.warn('[ProductService] ⚠️ DATABASE IS NOT READY FOR UNIQUE INDEX', {
          companyId: companyId || 'all companies',
          issues: {
            duplicateGroups: verification.summary.totalDuplicateGroups,
            orphanedOrderItems: verification.summary.totalOrphanedOrderItems,
            orphanedStockLogs: verification.summary.totalOrphanedStockLogs,
          },
        });
      }

      return {
        ...verification,
        verificationReport: report,
      };
    } catch (error: any) {
      logger.error('[ProductService] Error during post-merge integrity verification', {
        companyId: companyId || 'all companies',
        error: error?.message || String(error),
        stack: error?.stack,
      });
      throw error;
    }
  }

  /**
   * Generate human-readable verification report
   */
  private generateVerificationReport(verification: {
    duplicateBarcodes: Array<{ companyId: string; barcode: string; productIds: string[]; count: number }>;
    orphanedOrderItems: Array<{ orderItemId: string; orderId: string; productId: string | null; sku: string }>;
    orphanedStockLogs: Array<{ stockLogId: string; productId: string; type: string; createdAt: Date }>;
    mergedProducts: Array<{ productId: string; mergedIntoProductId: string | null; isActive: boolean; mergedAt: Date | null }>;
    isReadyForUniqueIndex: boolean;
    summary: {
      totalDuplicateGroups: number;
      totalOrphanedOrderItems: number;
      totalOrphanedStockLogs: number;
      totalMergedProducts: number;
      invalidMergedProducts: number;
    };
  }): string {
    const lines: string[] = [];
    
    lines.push('='.repeat(80));
    lines.push('POST-MERGE DATA INTEGRITY VERIFICATION REPORT');
    lines.push('='.repeat(80));
    lines.push('');

    // Summary
    lines.push('SUMMARY:');
    lines.push(`  Duplicate Barcode Groups: ${verification.summary.totalDuplicateGroups}`);
    lines.push(`  Orphaned OrderItems: ${verification.summary.totalOrphanedOrderItems}`);
    lines.push(`  Orphaned StockLogs: ${verification.summary.totalOrphanedStockLogs}`);
    lines.push(`  Merged Products: ${verification.summary.totalMergedProducts}`);
    if (verification.summary.invalidMergedProducts > 0) {
      lines.push(`  Invalid Merged Products: ${verification.summary.invalidMergedProducts} ⚠️`);
    }
    lines.push('');

    // Duplicate Barcodes
    if (verification.duplicateBarcodes.length > 0) {
      lines.push('❌ DUPLICATE BARCODES FOUND:');
      verification.duplicateBarcodes.forEach((dup, index) => {
        lines.push(`  ${index + 1}. Company: ${dup.companyId}, Barcode: ${dup.barcode}`);
        lines.push(`     Products: ${dup.productIds.join(', ')} (${dup.count} duplicates)`);
      });
      lines.push('');
    } else {
      lines.push('✅ NO DUPLICATE BARCODES FOUND');
      lines.push('');
    }

    // Orphaned OrderItems
    if (verification.orphanedOrderItems.length > 0) {
      lines.push('❌ ORPHANED ORDERITEMS FOUND:');
      verification.orphanedOrderItems.slice(0, 10).forEach((item, index) => {
        lines.push(`  ${index + 1}. OrderItem ID: ${item.orderItemId}, Order ID: ${item.orderId}`);
        lines.push(`     Product ID: ${item.productId}, SKU: ${item.sku}`);
      });
      if (verification.orphanedOrderItems.length > 10) {
        lines.push(`  ... and ${verification.orphanedOrderItems.length - 10} more`);
      }
      lines.push('');
    } else {
      lines.push('✅ NO ORPHANED ORDERITEMS FOUND');
      lines.push('');
    }

    // Orphaned StockLogs
    if (verification.orphanedStockLogs.length > 0) {
      lines.push('❌ ORPHANED STOCKLOGS FOUND:');
      verification.orphanedStockLogs.slice(0, 10).forEach((log, index) => {
        lines.push(`  ${index + 1}. StockLog ID: ${log.stockLogId}, Product ID: ${log.productId}`);
        lines.push(`     Type: ${log.type}, Created: ${log.createdAt.toISOString()}`);
      });
      if (verification.orphanedStockLogs.length > 10) {
        lines.push(`  ... and ${verification.orphanedStockLogs.length - 10} more`);
      }
      lines.push('');
    } else {
      lines.push('✅ NO ORPHANED STOCKLOGS FOUND');
      lines.push('');
    }

    // Merged Products
    if (verification.mergedProducts.length > 0) {
      lines.push(`ℹ️  MERGED PRODUCTS: ${verification.mergedProducts.length} products marked as merged`);
      lines.push('');
    }

    // Final Status
    lines.push('='.repeat(80));
    if (verification.isReadyForUniqueIndex) {
      lines.push('✅ DATABASE IS READY FOR UNIQUE INDEX');
      lines.push('');
      lines.push('All duplicate barcodes have been resolved.');
      lines.push('No orphaned references found.');
      lines.push('Safe to add unique constraint: @@unique([companyId, barcode]) WHERE barcode IS NOT NULL');
    } else {
      lines.push('❌ DATABASE IS NOT READY FOR UNIQUE INDEX');
      lines.push('');
      lines.push('Issues found that must be resolved before adding unique constraint:');
      if (verification.summary.totalDuplicateGroups > 0) {
        lines.push(`  - ${verification.summary.totalDuplicateGroups} duplicate barcode group(s) remain`);
      }
      if (verification.summary.totalOrphanedOrderItems > 0) {
        lines.push(`  - ${verification.summary.totalOrphanedOrderItems} orphaned OrderItem(s) found`);
      }
      if (verification.summary.totalOrphanedStockLogs > 0) {
        lines.push(`  - ${verification.summary.totalOrphanedStockLogs} orphaned StockLog(s) found`);
      }
      if (verification.summary.invalidMergedProducts > 0) {
        lines.push(`  - ${verification.summary.invalidMergedProducts} invalid merged product reference(s) found`);
      }
    }
    lines.push('='.repeat(80));

    return lines.join('\n');
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
   * @returns Revert operation summary with warnings
   */
  async revertProductMerge(input: {
    mergeId: string;
    companyId: string;
    userId?: string;
    reason: string;
  }): Promise<{
    success: boolean;
    mergeId: string;
    revertedProductIds: string[];
    orderItemsRestored: number;
    stockLogsRestored: number;
    marketplaceLinksRestored: number;
    campaignSetReferencesRestored: number;
    productsReactivated: number;
    warnings: string[];
  }> {
    const { logger } = await import('../utils/logger.js');
    
    logger.info('[ProductService] Starting merge revert', {
      mergeId: input.mergeId,
      companyId: input.companyId,
      userId: input.userId,
      reason: input.reason,
    });

    try {
      // Call repository method
      const revertResult = await productRepository.revertProductMerge({
        mergeId: input.mergeId,
        companyId: input.companyId,
        userId: input.userId,
        reason: input.reason,
      });

      // Collect warnings
      const warnings: string[] = [];

      // Check for potential issues
      const traceRecords = await prisma.productMergeReference.findMany({
        where: { mergeId: input.mergeId, companyId: input.companyId },
      });

      const orderItemTraces = traceRecords.filter((t: any) => t.entityType === 'ORDER_ITEM');
      const stockLogTraces = traceRecords.filter((t: any) => t.entityType === 'STOCK_LOG');

      if (revertResult.orderItemsRestored !== orderItemTraces.length) {
        warnings.push(
          `Expected to restore ${orderItemTraces.length} OrderItems, but restored ${revertResult.orderItemsRestored}. ` +
          `Some OrderItems may have been created after merge or already re-linked.`
        );
      }

      if (revertResult.stockLogsRestored !== stockLogTraces.length) {
        warnings.push(
          `Expected to restore ${stockLogTraces.length} StockLogs, but restored ${revertResult.stockLogsRestored}. ` +
          `Some StockLogs may have been created after merge or already re-linked.`
        );
      }

      // Run post-recovery verification
      const verification = await this.verifyPostMergeIntegrity(input.companyId);

      if (verification.orphanedOrderItems.length > 0) {
        throw new AppError(
          `Data corruption detected: ${verification.orphanedOrderItems.length} orphaned OrderItems found after revert`,
          500,
          { orphanedOrderItems: verification.orphanedOrderItems },
          'DATA_CORRUPTION'
        );
      }

      if (verification.orphanedStockLogs.length > 0) {
        throw new AppError(
          `Data corruption detected: ${verification.orphanedStockLogs.length} orphaned StockLogs found after revert`,
          500,
          { orphanedStockLogs: verification.orphanedStockLogs },
          'DATA_CORRUPTION'
        );
      }

      // Duplicate barcodes are expected temporarily after revert (they existed before merge)
      if (verification.duplicateBarcodes.length > 0) {
        warnings.push(
          `Duplicate barcodes detected: ${verification.duplicateBarcodes.length} duplicate group(s). ` +
          `This is expected after revert - these duplicates existed before the merge.`
        );
      }

      logger.info('[ProductService] Merge revert completed', {
        mergeId: input.mergeId,
        revertedProductIds: revertResult.revertedProductIds,
        orderItemsRestored: revertResult.orderItemsRestored,
        stockLogsRestored: revertResult.stockLogsRestored,
        marketplaceLinksRestored: revertResult.marketplaceLinksRestored,
        productSourcesRestored: revertResult.productSourcesRestored,
        campaignSetReferencesRestored: revertResult.campaignSetReferencesRestored,
        productsReactivated: revertResult.productsReactivated,
        warnings: warnings.length,
        userId: input.userId,
      });

      return {
        success: true,
        ...revertResult,
        warnings,
      };
    } catch (error: any) {
      logger.error('[ProductService] Error during merge revert', {
        mergeId: input.mergeId,
        companyId: input.companyId,
        userId: input.userId,
        error: error?.message || String(error),
        stack: error?.stack,
      });
      throw error;
    }
  }

  /**
   * Fix orphaned marketplace links for merged products.
   * This is a maintenance operation to fix links that weren't properly re-linked during merge.
   */
  async fixOrphanedMarketplaceLinks(companyId: string) {
    const result = await productRepository.fixOrphanedMarketplaceProducts(companyId);
    
    console.log(`[ProductService] Fixed orphaned marketplace links:`, {
      totalOrphaned: result.totalOrphaned,
      marketplaceProductsFixed: result.fixed,
      marketplaceProductsConflicts: result.conflicts,
      productSourcesFixed: result.productSourcesFixed,
      productSourcesConflicts: result.productSourcesConflicts,
    });

    return {
      success: true,
      summary: {
        totalOrphaned: result.totalOrphaned,
        marketplaceProducts: {
          fixed: result.fixed,
          conflicts: result.conflicts,
        },
        productSources: {
          fixed: result.productSourcesFixed,
          conflicts: result.productSourcesConflicts,
        },
      },
    };
  }
}

export const productService = new ProductService();

