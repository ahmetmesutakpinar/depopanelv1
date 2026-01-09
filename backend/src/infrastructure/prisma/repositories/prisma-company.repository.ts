/**
 * Prisma Company Repository Implementation
 * 
 * Implements ICompanyRepository using Prisma ORM.
 * This is the infrastructure layer implementation.
 * 
 * Architecture:
 * - Implements repository interface (Dependency Inversion)
 * - Uses PrismaClient for database access
 * - Maps Prisma models to domain entities
 * - No business logic, only data access
 */

import { PrismaClient } from '@prisma/client';
import { ICompanyRepository, FindCompaniesOptions } from '../../../repositories/company.repository.interface.js';
import { Company } from '../../../domain/entities/company.entity.js';
import { CompanyId } from '../../../domain/value-objects/ids.vo.js';
import { mapCompany } from './mappers.js';
import { Prisma } from '@prisma/client';

export class PrismaCompanyRepository implements ICompanyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: CompanyId | string): Promise<Company | null> {
    const record = await this.prisma.company.findUnique({
      where: { id: typeof id === 'string' ? id : id.value },
    });

    if (!record) return null;
    return mapCompany(record);
  }

  async findByEmail(email: string): Promise<Company | null> {
    const record = await this.prisma.company.findUnique({
      where: { email },
    });

    if (!record) return null;
    return mapCompany(record);
  }

  async findAll(options?: FindCompaniesOptions): Promise<{
    companies: Company[];
    total: number;
  }> {
    const where: Prisma.CompanyWhereInput = {
      ...(options?.status && { status: options.status }),
      ...(options?.search && {
        OR: [
          { name: { contains: options.search, mode: 'insensitive' } },
          { email: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [records, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      companies: records.map(mapCompany),
      total,
    };
  }

  async create(company: Company): Promise<Company> {
    // TODO: Company domain entity has slug but Prisma has email - need to align
    // For now, using slug as email placeholder - domain entity should be updated or Prisma should have slug
    const record = await this.prisma.company.create({
      data: {
        name: company.name,
        email: company.slug, // TODO: Domain entity has slug, Prisma has email - need to align
        status: company.status,
        // TODO: Add other fields (phone, address, taxNumber) if needed
      },
    });

    return mapCompany(record);
  }

  async update(id: CompanyId | string, company: Partial<Company>): Promise<Company> {
    const record = await this.prisma.company.update({
      where: { id: typeof id === 'string' ? id : id.value },
      data: {
        ...(company.name && { name: company.name }),
        ...(company.status && { status: company.status }),
        // TODO: Handle slug/email mapping
      },
    });

    return mapCompany(record);
  }

  async delete(id: CompanyId | string): Promise<void> {
    await this.prisma.company.delete({
      where: { id: typeof id === 'string' ? id : id.value },
    });
  }
}

