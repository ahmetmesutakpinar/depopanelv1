/**
 * Update Product Use Case
 * 
 * Application layer use case for updating an existing product.
 * 
 * Architecture:
 * - Orchestrates repository calls
 * - Validates business rules
 * - Returns domain entities
 * - No infrastructure dependencies
 */

import { IProductRepository } from '../../../repositories/product.repository.interface.js';
import { Product } from '../../../domain/entities/product.entity.js';
import { ProductId, CompanyId } from '../../../domain/value-objects/ids.vo.js';

export interface UpdateProductInput {
  id: string;
  companyId: string;
  updates: {
    sku?: string;
    name?: string;
    price?: number;
    barcode?: string | null;
    gtin?: string | null;
    description?: string | null;
    brand?: string | null;
    costPrice?: number | null;
    taxRate?: number;
    weight?: number | null;
    width?: number | null;
    height?: number | null;
    depth?: number | null;
    imageUrl?: string | null;
    isActive?: boolean;
    categoryId?: string | null;
    type?: string;
    campaignSetId?: string | null;
    minQuantity?: number;
  };
}

export interface UpdateProductOutput {
  product: Product;
}

export class UpdateProductUseCase {
  constructor(
    private readonly productRepository: IProductRepository
  ) {}

  async execute(input: UpdateProductInput): Promise<UpdateProductOutput> {
    // TODO: Add authorization check (companyId validation)
    // TODO: Add validation
    // TODO: Add transaction support

    // Verify product exists and belongs to company
    const existing = await this.productRepository.findByIdAndCompany(
      input.id,
      input.companyId
    );

    if (!existing) {
      throw new Error(`Product not found: ${input.id}`);
    }

    // Check SKU uniqueness if SKU is being updated
    if (input.updates.sku && input.updates.sku !== existing.sku) {
      const skuExists = await this.productRepository.existsBySku(
        input.companyId,
        input.updates.sku,
        input.id
      );

      if (skuExists) {
        throw new Error(`Product with SKU ${input.updates.sku} already exists`);
      }
    }

    // Update via repository
    const updated = await this.productRepository.update(input.id, {
      ...input.updates,
      // TODO: Map updates to domain entity properly
    } as Partial<Product>);

    return { product: updated };
  }
}

