/**
 * Company Repository Interface
 * 
 * Defines the contract for company persistence operations.
 * This interface is implementation-agnostic and depends only on domain entities.
 * 
 * Architecture:
 * - Domain layer depends on this interface (Dependency Inversion Principle)
 * - Infrastructure layer provides concrete implementation (Prisma-based)
 * - No Prisma types or infrastructure details exposed
 */

import { Company, CompanyStatus } from '../domain/entities/company.entity.js';
import { CompanyId } from '../domain/value-objects/ids.vo.js';

/**
 * Options for finding companies
 */
export interface FindCompaniesOptions {
  skip?: number;
  take?: number;
  search?: string;
  status?: CompanyStatus;
}

/**
 * Company Repository Interface
 * 
 * Defines all company persistence operations using domain entities.
 */
export interface ICompanyRepository {
  /**
   * Find company by ID
   */
  findById(id: CompanyId | string): Promise<Company | null>;

  /**
   * Find company by email
   */
  findByEmail(email: string): Promise<Company | null>;

  /**
   * Find all companies with optional filters
   */
  findAll(options?: FindCompaniesOptions): Promise<{
    companies: Company[];
    total: number;
  }>;

  /**
   * Create a new company
   */
  create(company: Company): Promise<Company>;

  /**
   * Update an existing company
   */
  update(id: CompanyId | string, company: Partial<Company>): Promise<Company>;

  /**
   * Delete a company
   */
  delete(id: CompanyId | string): Promise<void>;
}

