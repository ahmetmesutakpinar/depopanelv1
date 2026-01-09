import { prisma } from '../config/index.js';
import { Company, CompanyStatus, Prisma } from '@prisma/client';

export interface CreateCompanyData {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
}

export interface UpdateCompanyData {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  status?: CompanyStatus;
}

export class CompanyRepository {
  async findById(id: string): Promise<Company | null> {
    return prisma.company.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<Company | null> {
    return prisma.company.findUnique({
      where: { email },
    });
  }

  async findAll(options?: {
    skip?: number;
    take?: number;
    search?: string;
    status?: CompanyStatus;
  }): Promise<{ companies: Company[]; total: number }> {
    const where: Prisma.CompanyWhereInput = {
      ...(options?.status && { status: options.status }),
      ...(options?.search && {
        OR: [
          { name: { contains: options.search, mode: 'insensitive' } },
          { email: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              warehouses: true,
              products: true,
            },
          },
        },
      }),
      prisma.company.count({ where }),
    ]);

    return { companies, total };
  }

  async create(data: CreateCompanyData): Promise<Company> {
    return prisma.company.create({
      data,
    });
  }

  async update(id: string, data: UpdateCompanyData): Promise<Company> {
    return prisma.company.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.company.delete({
      where: { id },
    });
  }

  async existsByEmail(email: string, excludeId?: string): Promise<boolean> {
    const company = await prisma.company.findFirst({
      where: {
        email,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
    });
    return !!company;
  }

  async updateStatus(id: string, status: CompanyStatus): Promise<Company> {
    return prisma.company.update({
      where: { id },
      data: { status },
    });
  }

  async getPendingCompanies(): Promise<Company[]> {
    return prisma.company.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export const companyRepository = new CompanyRepository();

