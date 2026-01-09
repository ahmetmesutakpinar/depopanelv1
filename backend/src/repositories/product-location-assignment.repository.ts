import { prisma } from '../config/index.js';
import { ProductLocationAssignment } from '@prisma/client';

export interface CreateProductLocationAssignmentData {
  productId: string;
  variantId?: string;
  locationId: string;
  isPrimary?: boolean;
}

export interface UpdateProductLocationAssignmentData {
  isPrimary?: boolean;
}

export class ProductLocationAssignmentRepository {
  async findByProduct(productId: string, variantId?: string) {
    return prisma.productLocationAssignment.findMany({
      where: {
        productId,
        variantId: variantId || null,
      },
      include: {
        location: {
          include: {
            warehouse: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
      },
    });
  }

  async findByLocation(locationId: string) {
    return prisma.productLocationAssignment.findMany({
      where: { locationId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        location: true,
      },
    });
  }

  async findPrimaryLocation(productId: string, variantId?: string) {
    return prisma.productLocationAssignment.findFirst({
      where: {
        productId,
        variantId: variantId || null,
        isPrimary: true,
      },
      include: {
        location: true,
      },
    });
  }

  async create(data: CreateProductLocationAssignmentData): Promise<ProductLocationAssignment> {
    // Eğer bu primary olacaksa, diğer primary'leri false yap
    if (data.isPrimary) {
      await prisma.productLocationAssignment.updateMany({
        where: {
          productId: data.productId,
          variantId: data.variantId || null,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    return prisma.productLocationAssignment.create({
      data,
      include: {
        location: true,
        product: true,
        variant: true,
      },
    });
  }

  async update(id: string, data: UpdateProductLocationAssignmentData): Promise<ProductLocationAssignment> {
    // Eğer primary yapılıyorsa, diğerlerini false yap
    if (data.isPrimary) {
      const assignment = await prisma.productLocationAssignment.findUnique({
        where: { id },
      });

      if (assignment) {
        await prisma.productLocationAssignment.updateMany({
          where: {
            productId: assignment.productId,
            variantId: assignment.variantId ?? null,
            isPrimary: true,
            id: { not: id },
          },
          data: {
            isPrimary: false,
          },
        });
      }
    }

    return prisma.productLocationAssignment.update({
      where: { id },
      data,
      include: {
        location: true,
        product: true,
        variant: true,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.productLocationAssignment.delete({
      where: { id },
    });
  }

  async deleteByProductAndLocation(productId: string, locationId: string, variantId?: string): Promise<void> {
    await prisma.productLocationAssignment.deleteMany({
      where: {
        productId,
        locationId,
        variantId: variantId || null,
      },
    });
  }
}

export const productLocationAssignmentRepository = new ProductLocationAssignmentRepository();

