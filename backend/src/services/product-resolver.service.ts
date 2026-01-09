/**
 * Product Resolver Service
 * 
 * SINGLE SOURCE OF TRUTH for product identity resolution.
 * 
 * This service implements the Product Resolver Architecture as defined in
 * PRODUCT_RESOLVER_ARCHITECTURE_DESIGN.md
 * 
 * Resolution Hierarchy:
 * 1. Barcode (PRIMARY)
 * 2. SKU (SECONDARY)
 * 3. UNRESOLVED (requires manual intervention)
 * 
 * Rules:
 * - Barcode is ALWAYS checked first
 * - SKU is ONLY used when barcode is missing/null
 * - Duplicate barcodes MUST return DUPLICATE_BARCODE status
 * - Product creation is controlled by allowCreate option
 */

import { productRepository } from '../repositories/product.repository.js';
import { logger } from '../utils/logger.js';
import { Product, MarketplaceType } from '@prisma/client';
import {
  DuplicateBarcodeError,
  DuplicateSkuError,
  InvalidResolverInputError,
} from '../errors/product-resolver.errors.js';

export type ResolutionSource = 'ORDER_IMPORT' | 'MARKETPLACE_SYNC' | 'MANUAL' | 'CAMPAIGNSET';

export type ResolutionStatus = 
  | 'RESOLVED'
  | 'UNRESOLVED'
  | 'ERROR'
  | 'DUPLICATE_BARCODE'
  | 'DUPLICATE_SKU';

export type ResolutionType =
  | 'BARCODE_EXACT'
  | 'BARCODE_VARIANT'
  | 'SKU_EXACT'
  | 'SKU_CASE_INSENSITIVE'
  | 'CREATED'
  | 'NONE';

export interface ProductResolverInput {
  // REQUIRED
  companyId: string;
  
  // IDENTIFIERS (at least one required)
  barcode?: string | null;
  sku?: string | null;
  
  // METADATA (for creation/validation)
  name?: string | null;
  marketplace?: MarketplaceType | null;
  marketplaceProductId?: string | null;
  
  // CONTEXT (for special handling)
  source: ResolutionSource;
  campaignSetId?: string | null;
  
  // OPTIONS
  options?: {
    allowCreate?: boolean;        // Default: false for orders, true for manual
    strictBarcode?: boolean;      // Default: true - fail on duplicate barcode
    validateUniqueness?: boolean; // Default: true
  };
}

export interface ProductResolverResult {
  // RESOLUTION STATUS
  status: ResolutionStatus;
  
  // RESOLVED PRODUCT (if status = RESOLVED)
  product?: {
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
    companyId: string;
  };
  
  // RESOLUTION METHOD
  resolutionType: ResolutionType;
  
  // WARNINGS & ERRORS
  warnings: string[];
  errors: string[];
  
  // METADATA
  metadata: {
    matchedProductId?: string;
    duplicateBarcodeProducts?: string[];
    duplicateSkuProducts?: string[];
    resolutionTime: number;
    queriesExecuted: number;
  };
}

export class ProductResolverService {
  /**
   * Resolve product identity from identifiers
   * 
   * Implements the exact decision tree from PRODUCT_RESOLVER_ARCHITECTURE_DESIGN.md
   * 
   * @param input - Product resolution input
   * @returns ProductResolverResult
   */
  async resolve(input: ProductResolverInput): Promise<ProductResolverResult> {
    const startTime = Date.now();
    let queriesExecuted = 0;
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // ============================================
      // STEP 1: Validate & Normalize Input
      // ============================================
      
      // 1.1 Validate companyId exists
      if (!input.companyId || typeof input.companyId !== 'string' || input.companyId.trim() === '') {
        return this.createErrorResult(
          'Invalid companyId: companyId is required and must be a non-empty string',
          startTime,
          queriesExecuted
        );
      }

      // 1.2 Normalize barcode
      let normalizedBarcode: string | undefined;
      if (input.barcode !== null && input.barcode !== undefined) {
        const trimmed = input.barcode.trim();
        normalizedBarcode = trimmed === '' ? undefined : trimmed;
      }

      // 1.3 Normalize SKU
      let normalizedSku: string | undefined;
      if (input.sku !== null && input.sku !== undefined) {
        const trimmed = input.sku.trim();
        normalizedSku = trimmed === '' ? undefined : trimmed;
      }

      // 1.4 Validate at least one identifier exists
      if (!normalizedBarcode && !normalizedSku) {
        return this.createErrorResult(
          'Either barcode or SKU must be provided',
          startTime,
          queriesExecuted
        );
      }

      // 1.5 Determine allowCreate based on source (if not explicitly set)
      const allowCreate = input.options?.allowCreate ?? this.getDefaultAllowCreate(input.source);
      const strictBarcode = input.options?.strictBarcode ?? true;
      const validateUniqueness = input.options?.validateUniqueness ?? true;

      // ============================================
      // STEP 2: Barcode Resolution (PRIMARY PATH)
      // ============================================
      
      if (normalizedBarcode) {
        // 2.2 Query: Find ALL products by barcode (for duplicate detection)
        queriesExecuted++;
        const productsByBarcode = await productRepository.findAllByBarcode(
          input.companyId,
          normalizedBarcode
        );

        // 2.3 Analyze barcode query results
        if (productsByBarcode.length === 0) {
          // CASE A: No product found with this barcode
          // Continue to STEP 3 (SKU Resolution)
          // (Fall through to SKU resolution below)
        } else if (productsByBarcode.length === 1) {
          // CASE B: EXACT MATCH FOUND
          const matchedProduct = productsByBarcode[0];
          
          logger.debug('[ProductResolver] Product matched via barcode', {
            barcode: normalizedBarcode,
            productId: matchedProduct.id,
            productSku: matchedProduct.sku,
            companyId: input.companyId,
          });

          return {
            status: 'RESOLVED',
            product: {
              id: matchedProduct.id,
              sku: matchedProduct.sku,
              barcode: matchedProduct.barcode,
              name: matchedProduct.name,
              companyId: matchedProduct.companyId,
            },
            resolutionType: 'BARCODE_EXACT',
            warnings,
            errors,
            metadata: {
              matchedProductId: matchedProduct.id,
              resolutionTime: Date.now() - startTime,
              queriesExecuted,
            },
          };
        } else {
          // CASE C: DATA INTEGRITY ERROR - Duplicate barcodes exist
          const duplicateIds = productsByBarcode.map(p => p.id);
          
          const errorMessage = `Multiple products found with barcode: ${normalizedBarcode}. Product IDs: ${duplicateIds.join(', ')}`;
          errors.push(errorMessage);

          logger.error('[ProductResolver] Duplicate barcode detected', {
            barcode: normalizedBarcode,
            companyId: input.companyId,
            duplicateProductIds: duplicateIds,
          });

          return {
            status: 'DUPLICATE_BARCODE',
            resolutionType: 'NONE',
            warnings,
            errors,
            metadata: {
              duplicateBarcodeProducts: duplicateIds,
              resolutionTime: Date.now() - startTime,
              queriesExecuted,
            },
          };
        }
      }

      // ============================================
      // STEP 3: SKU Resolution (SECONDARY PATH)
      // ============================================
      
      if (normalizedSku) {
        // 3.2 Query: Find ALL products by SKU (case-insensitive, for duplicate detection)
        queriesExecuted++;
        const productsBySku = await productRepository.findAllBySkuCaseInsensitive(
          input.companyId,
          normalizedSku
        );

        // 3.3 Analyze SKU query results
        if (productsBySku.length === 0) {
          // CASE A: No product found with this SKU
          // Continue to STEP 4 (Unresolved/Creation)
          // (Fall through to unresolved handling below)
        } else if (productsBySku.length === 1) {
          // CASE B: EXACT MATCH FOUND
          const matchedProduct = productsBySku[0];
          
          // Check if this product has a different barcode
          if (normalizedBarcode && matchedProduct.barcode && matchedProduct.barcode !== normalizedBarcode) {
            warnings.push(
              `Product matched by SKU but barcode differs. Input barcode: '${normalizedBarcode}', Product barcode: '${matchedProduct.barcode}'`
            );
          }

          // Determine if case matches exactly
          const isExactCase = matchedProduct.sku === normalizedSku;
          const resolutionType: ResolutionType = isExactCase ? 'SKU_EXACT' : 'SKU_CASE_INSENSITIVE';

          logger.debug('[ProductResolver] Product matched via SKU', {
            sku: normalizedSku,
            productId: matchedProduct.id,
            productSku: matchedProduct.sku,
            resolutionType,
            companyId: input.companyId,
          });

          return {
            status: 'RESOLVED',
            product: {
              id: matchedProduct.id,
              sku: matchedProduct.sku,
              barcode: matchedProduct.barcode,
              name: matchedProduct.name,
              companyId: matchedProduct.companyId,
            },
            resolutionType,
            warnings,
            errors,
            metadata: {
              matchedProductId: matchedProduct.id,
              resolutionTime: Date.now() - startTime,
              queriesExecuted,
            },
          };
        } else {
          // CASE C: DATA INTEGRITY ERROR - Duplicate SKUs exist (should not happen due to DB constraint)
          const duplicateIds = productsBySku.map(p => p.id);
          
          const errorMessage = `Multiple products found with SKU: ${normalizedSku}. Product IDs: ${duplicateIds.join(', ')}`;
          errors.push(errorMessage);

          logger.error('[ProductResolver] Duplicate SKU detected', {
            sku: normalizedSku,
            companyId: input.companyId,
            duplicateProductIds: duplicateIds,
          });

          return {
            status: 'DUPLICATE_SKU',
            resolutionType: 'NONE',
            warnings,
            errors,
            metadata: {
              duplicateSkuProducts: duplicateIds,
              resolutionTime: Date.now() - startTime,
              queriesExecuted,
            },
          };
        }
      }

      // ============================================
      // STEP 4: Unresolved Product Handling
      // ============================================
      
      // 4.1 Check if product creation is allowed
      if (!allowCreate) {
        // 4.2 UNRESOLVED (Creation Not Allowed)
        warnings.push('Product could not be resolved and creation is not allowed');

        logger.info('[ProductResolver] Product unresolved - creation not allowed', {
          companyId: input.companyId,
          barcode: normalizedBarcode || null,
          sku: normalizedSku || null,
          source: input.source,
        });

        return {
          status: 'UNRESOLVED',
          resolutionType: 'NONE',
          warnings,
          errors,
          metadata: {
            resolutionTime: Date.now() - startTime,
            queriesExecuted,
          },
        };
      }

      // 4.3 CREATION (Creation Allowed)
      // Validate barcode uniqueness BEFORE creating
      if (normalizedBarcode && validateUniqueness) {
        queriesExecuted++;
        const barcodeExists = await productRepository.existsByBarcode(
          input.companyId,
          normalizedBarcode
        );

        if (barcodeExists) {
          // Defensive check - should not happen if STEP 2 worked correctly
          const errorMessage = `Barcode '${normalizedBarcode}' already exists (defensive check failed)`;
          errors.push(errorMessage);

          logger.error('[ProductResolver] Barcode uniqueness check failed during creation', {
            barcode: normalizedBarcode,
            companyId: input.companyId,
          });

          return {
            status: 'ERROR',
            resolutionType: 'NONE',
            warnings,
            errors,
            metadata: {
              resolutionTime: Date.now() - startTime,
              queriesExecuted,
            },
          };
        }
      }

      // Validate SKU uniqueness BEFORE creating
      if (normalizedSku && validateUniqueness) {
        queriesExecuted++;
        const skuExists = await productRepository.existsBySku(input.companyId, normalizedSku);

        if (skuExists) {
          const errorMessage = `SKU '${normalizedSku}' already exists (defensive check failed)`;
          errors.push(errorMessage);

          logger.error('[ProductResolver] SKU uniqueness check failed during creation', {
            sku: normalizedSku,
            companyId: input.companyId,
          });

          return {
            status: 'ERROR',
            resolutionType: 'NONE',
            warnings,
            errors,
            metadata: {
              resolutionTime: Date.now() - startTime,
              queriesExecuted,
            },
          };
        }
      }

      // Create new product
      const productName = input.name?.trim() || 'Unnamed Product';
      
      queriesExecuted++;
      const newProduct = await productRepository.create({
        sku: normalizedSku!,
        barcode: normalizedBarcode,
        name: productName,
        price: 0, // Default price - will be updated from order data if available
        isActive: true,
        companyId: input.companyId,
        taxRate: 20, // Default tax rate
      });

      warnings.push('New product created during resolution');

      logger.info('[ProductResolver] New product created', {
        productId: newProduct.id,
        sku: newProduct.sku,
        barcode: newProduct.barcode,
        name: newProduct.name,
        companyId: input.companyId,
      });

      return {
        status: 'RESOLVED',
        product: {
          id: newProduct.id,
          sku: newProduct.sku,
          barcode: newProduct.barcode,
          name: newProduct.name,
          companyId: newProduct.companyId,
        },
        resolutionType: 'CREATED',
        warnings,
        errors,
        metadata: {
          matchedProductId: newProduct.id,
          resolutionTime: Date.now() - startTime,
          queriesExecuted,
        },
      };

    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Unexpected error during resolution: ${errorMessage}`);

      logger.error('[ProductResolver] Unexpected error during resolution', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        input: {
          companyId: input.companyId,
          barcode: input.barcode,
          sku: input.sku,
          source: input.source,
        },
      });

      return {
        status: 'ERROR',
        resolutionType: 'NONE',
        warnings,
        errors,
        metadata: {
          resolutionTime: Date.now() - startTime,
          queriesExecuted,
        },
      };
    }
  }

  /**
   * Get default allowCreate value based on source
   */
  private getDefaultAllowCreate(source: ResolutionSource): boolean {
    switch (source) {
      case 'ORDER_IMPORT':
      case 'MARKETPLACE_SYNC':
      case 'CAMPAIGNSET':
        return false; // STRICT - must resolve existing
      case 'MANUAL':
        return true; // Allow creation
      default:
        return false; // Default to strict
    }
  }

  /**
   * Create error result for invalid input
   */
  private createErrorResult(
    errorMessage: string,
    startTime: number,
    queriesExecuted: number
  ): ProductResolverResult {
    return {
      status: 'ERROR',
      resolutionType: 'NONE',
      warnings: [],
      errors: [errorMessage],
      metadata: {
        resolutionTime: Date.now() - startTime,
        queriesExecuted,
      },
    };
  }
}

// Export singleton instance
export const productResolverService = new ProductResolverService();

