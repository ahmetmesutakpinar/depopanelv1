/**
 * Product Repository Interface
 * 
 * Defines the contract for product persistence operations.
 * This interface is implementation-agnostic and depends only on domain entities.
 * 
 * Architecture:
 * - Domain layer depends on this interface (Dependency Inversion Principle)
 * - Infrastructure layer provides concrete implementation (Prisma-based)
 * - No Prisma types or infrastructure details exposed
 */

import { Product } from '../domain/entities/product.entity.js';
import { SKU, CompanyId, ProductId } from '../domain/value-objects/ids.vo.js';

/**
 * Options for finding products by company
 */
export interface FindProductsOptions {
  skip?: number;
  take?: number;
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Product with stock information
 */
export interface ProductWithStock extends Product {
  stocks: Array<{
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
  }>;
  category: {
    id: string;
    name: string;
  } | null;
}

/**
 * Product Repository Interface
 * 
 * Defines all product persistence operations using domain entities.
 */
export interface IProductRepository {
  /**
   * Find product by ID
   */
  findById(id: ProductId | string): Promise<ProductWithStock | null>;

  /**
   * Find product by ID and company (for multi-tenant security)
   */
  findByIdAndCompany(id: ProductId | string, companyId: CompanyId | string): Promise<ProductWithStock | null>;

  /**
   * Find product by SKU within a company
   */
  findBySku(companyId: CompanyId | string, sku: SKU | string): Promise<Product | null>;

  /**
   * Find product by barcode within a company
   */
  findByBarcode(companyId: CompanyId | string, barcode: string): Promise<Product | null>;

  /**
   * Find products by company with optional filters
   */
  findByCompany(companyId: CompanyId | string, options?: FindProductsOptions): Promise<{
    products: ProductWithStock[];
    total: number;
  }>;

  /**
   * Create a new product
   */
  create(product: Product): Promise<Product>;

  /**
   * Update an existing product
   */
  update(id: ProductId | string, product: Partial<Product>): Promise<Product>;

  /**
   * Delete a product
   */
  delete(id: ProductId | string): Promise<void>;

  /**
   * Check if SKU already exists in company
   */
  existsBySku(companyId: CompanyId | string, sku: SKU | string, excludeId?: ProductId | string): Promise<boolean>;

  /**
   * Get products with low stock (below minimum quantity)
   */
  getLowStockProducts(companyId: CompanyId | string): Promise<ProductWithStock[]>;

  /**
   * Get total product count for a company
   */
  getTotalProductCount(companyId: CompanyId | string): Promise<number>;
}

