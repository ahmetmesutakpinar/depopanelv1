/**
 * Get Product By ID Use Case
 * 
 * Application layer use case for retrieving a product by ID.
 * 
 * Architecture:
 * - Orchestrates repository calls
 * - Returns domain entities
 * - No infrastructure dependencies
 * - No business logic (delegates to domain)
 */

import { IProductRepository } from '../../../repositories/product.repository.interface.js';
import { ProductWithStock } from '../../../repositories/product.repository.interface.js';
import { ProductId } from '../../../domain/value-objects/ids.vo.js';

export interface GetProductByIdInput {
  id: string;
  companyId: string;
}

export interface GetProductByIdOutput {
  product: ProductWithStock | null;
}

export class GetProductByIdUseCase {
  constructor(
    private readonly productRepository: IProductRepository
  ) {}

  async execute(input: GetProductByIdInput): Promise<GetProductByIdOutput> {
    // TODO: Add authorization check (companyId validation)
    // TODO: Add error handling
    const product = await this.productRepository.findByIdAndCompany(
      input.id,
      input.companyId
    );

    return { product };
  }
}

