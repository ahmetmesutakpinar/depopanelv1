import { prisma } from '../config/index.js';
import { CargoCompany, Prisma } from '@prisma/client';

export interface CreateCargoCompanyData {
  name: string;
  code: string;
  apiUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  companyId?: string;
  settings?: Record<string, any>;
}

export interface UpdateCargoCompanyData {
  name?: string;
  apiUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  isActive?: boolean;
  settings?: Record<string, any>;
}

export class CargoCompanyRepository {
  async findByCompany(companyId: string | null, options?: {
    skip?: number;
    take?: number;
    isActive?: boolean;
  }) {
    const where: Prisma.CargoCompanyWhereInput = {
      OR: [
        { companyId },
        { companyId: null }, // System-wide companies
      ],
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
    };

    const [companies, total] = await Promise.all([
      prisma.cargoCompany.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { name: 'asc' },
      }),
      prisma.cargoCompany.count({ where }),
    ]);

    return { companies, total };
  }

  async findById(id: string, companyId?: string): Promise<CargoCompany | null> {
    return prisma.cargoCompany.findFirst({
      where: {
        id,
        ...(companyId && {
          OR: [
            { companyId },
            { companyId: null },
          ],
        }),
      },
    });
  }

  async findByCode(code: string, companyId?: string): Promise<CargoCompany | null> {
    return prisma.cargoCompany.findFirst({
      where: {
        code,
        ...(companyId && {
          OR: [
            { companyId },
            { companyId: null },
          ],
        }),
      },
    });
  }

  async create(data: CreateCargoCompanyData): Promise<CargoCompany> {
    return prisma.cargoCompany.create({
      data,
    });
  }

  async update(id: string, data: UpdateCargoCompanyData): Promise<CargoCompany> {
    // Don't update masked secrets
    const updateData: any = { ...data };
    if (data.apiKey === '••••••••') delete updateData.apiKey;
    if (data.apiSecret === '••••••••') delete updateData.apiSecret;

    return prisma.cargoCompany.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.cargoCompany.delete({
      where: { id },
    });
  }
}

export const cargoCompanyRepository = new CargoCompanyRepository();

