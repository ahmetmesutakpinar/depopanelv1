/**
 * Update Stock Use Case
 * 
 * Application layer use case for updating stock quantities.
 * 
 * Architecture:
 * - Orchestrates repository calls
 * - Validates business rules
 * - Returns domain entities
 * - No infrastructure dependencies
 */

import { IStockRepository } from '../../../repositories/stock.repository.interface.js';
import { Stock } from '../../../domain/entities/stock.entity.js';
import { ProductId, CompanyId } from '../../../domain/value-objects/ids.vo.js';
import { Quantity } from '../../../domain/value-objects/quantity.vo.js';

export interface UpdateStockInput {
  productId: string;
  warehouseId: string;
  variantId?: string | null;
  quantity?: number;
  reservedQty?: number;
  minQuantity?: number;
  locationId?: string | null;
}

export interface UpdateStockOutput {
  stock: Stock;
}

export class UpdateStockUseCase {
  constructor(
    private readonly stockRepository: IStockRepository
  ) {}

  async execute(input: UpdateStockInput): Promise<UpdateStockOutput> {
    // TODO: Add validation (non-negative quantities, etc.)
    // TODO: Add business rule checks
    // TODO: Add transaction support
    // TODO: Add stock log entry creation

    // Find or create stock
    const stock = await this.stockRepository.findOrCreateStock(
      input.productId,
      input.warehouseId,
      input.variantId
    );

    // Update stock
    const updated = await this.stockRepository.updateStock(stock.id, {
      quantity: input.quantity,
      reservedQty: input.reservedQty,
      minQuantity: input.minQuantity,
      locationId: input.locationId,
    });

    // TODO: Create stock log entry
    // TODO: Trigger domain events (StockUpdated)

    return { stock: updated };
  }
}

