import { prisma } from '../config/index.js';
import { Prisma, User, UserRole } from '@prisma/client';

export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: UserRole;
  permissions?: any;
  companyId: string;
  isActive?: boolean;
}

export interface UpdateUserData {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: UserRole;
  permissions?: any;
  isActive?: boolean;
  companyId?: string;
}

export interface UserWithCompany extends User {
  company: {
    id: string;
    name: string;
    status: string;
  };
}

export class UserRepository {
  async findById(id: string): Promise<UserWithCompany | null> {
    return prisma.user.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });
  }

  async findByEmail(email: string): Promise<UserWithCompany | null> {
    return prisma.user.findUnique({
      where: { email },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });
  }

  async findByCompany(companyId?: string, options?: {
    skip?: number;
    take?: number;
    search?: string;
    role?: UserRole;
    isActive?: boolean;
  }): Promise<{ users: User[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...(companyId && { companyId }),
      ...(options?.role && { role: options.role }),
      ...(options?.isActive !== undefined && { isActive: options.isActive }),
      ...(options?.search && {
        OR: [
          { firstName: { contains: options.search, mode: 'insensitive' } },
          { lastName: { contains: options.search, mode: 'insensitive' } },
          { email: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role || 'STAFF',
        companyId: data.companyId,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id },
    });
  }

  async existsByEmail(email: string, excludeId?: string): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: {
        email,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
    });
    return !!user;
  }

  async countByCompany(companyId: string): Promise<number> {
    return prisma.user.count({
      where: { companyId },
    });
  }
}

export const userRepository = new UserRepository();

