/**
 * Get Order By ID Use Case
 * 
 * Application layer use case for retrieving an order by ID.
 * 
 * Architecture:
 * - Orchestrates repository calls
 * - Returns domain entities
 * - No infrastructure dependencies
 * - No business logic (delegates to domain)
 */

import { IOrderRepository } from '../../../repositories/order.repository.interface.js';
import { OrderWithItems } from '../../../repositories/order.repository.interface.js';
import { OrderId, CompanyId } from '../../../domain/value-objects/ids.vo.js';

export interface GetOrderByIdInput {
  id: string;
  companyId: string;
}

export interface GetOrderByIdOutput {
  order: OrderWithItems | null;
}

export class GetOrderByIdUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository
  ) {}

  async execute(input: GetOrderByIdInput): Promise<GetOrderByIdOutput> {
    // TODO: Add authorization check (companyId validation)
    // TODO: Add error handling
    const order = await this.orderRepository.findByIdAndCompany(
      input.id,
      input.companyId
    );

    return { order };
  }
}

