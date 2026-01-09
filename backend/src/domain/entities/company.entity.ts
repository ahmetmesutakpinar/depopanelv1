/**
 * Company Domain Entity
 * 
 * Represents a company/tenant in the multi-tenant system.
 * This is a pure domain model with no infrastructure dependencies.
 * 
 * Business Rules:
 * - Company must have a name
 * - Company must have a unique identifier
 * - Company status determines access level
 * 
 * TODO: Add validation logic
 * TODO: Add business methods
 */

export type CompanyStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

export class Company {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  settings: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: {
    id: string;
    name: string;
    slug: string;
    status?: CompanyStatus;
    settings?: Record<string, unknown> | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = data.id;
    this.name = data.name;
    this.slug = data.slug;
    this.status = data.status ?? 'PENDING';
    this.settings = data.settings ?? null;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }

  /**
   * Check if company is active
   * TODO: Implement business logic
   */
  isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  /**
   * Check if company can perform operations
   * TODO: Implement business logic
   */
  canOperate(): boolean {
    return this.status === 'ACTIVE';
  }
}

