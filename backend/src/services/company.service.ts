import { prisma } from '../config/index.js';
import { companyRepository, CreateCompanyData } from '../repositories/company.repository.js';
import { userRepository, CreateUserData } from '../repositories/user.repository.js';
import { warehouseRepository, CreateWarehouseData } from '../repositories/warehouse.repository.js';
import { NotFoundError, ConflictError, AppError } from '../middleware/error.middleware.js';
import { emailService } from './email.service.js';
import bcrypt from 'bcrypt';
import { CompanyStatus } from '@prisma/client';

export interface CreateCompanyWithAdminInput {
  companyName: string;
  companyEmail: string;
  companyPhone?: string;
  companyAddress?: string;
  taxNumber?: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPassword: string;
  adminPhone?: string;
  autoApprove?: boolean;
}

export interface CompanyWithStats {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: CompanyStatus;
  taxNumber?: string | null;
  createdAt: Date;
  admin: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  stats: {
    users: number;
    warehouses: number;
    products: number;
    orders: number;
  };
}

export interface CompanyDetail {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  status: CompanyStatus;
  createdAt: Date;
  updatedAt: Date;
  users: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
  }>;
  warehouses: Array<{
    id: string;
    name: string;
    code: string;
    isDefault: boolean;
    isActive: boolean;
  }>;
  _count: {
    products: number;
    orders: number;
  };
}

class CompanyService {
  /**
   * Create company with admin user and default warehouse (Super Admin only)
   */
  async createCompanyWithAdmin(input: CreateCompanyWithAdminInput) {
    // Check if company email exists
    const existingCompany = await companyRepository.findByEmail(input.companyEmail);
    if (existingCompany) {
      throw new ConflictError('Bu şirket e-postası zaten kayıtlı');
    }

    // Check if admin email exists
    const existingUser = await userRepository.findByEmail(input.adminEmail);
    if (existingUser) {
      throw new ConflictError('Bu admin e-postası zaten kayıtlı');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(input.adminPassword, 12);

    // Create company and admin user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create company
      const company = await tx.company.create({
        data: {
          name: input.companyName,
          email: input.companyEmail,
          phone: input.companyPhone,
          address: input.companyAddress,
          taxNumber: input.taxNumber,
          status: input.autoApprove ? 'APPROVED' : 'PENDING',
        },
      });

      // Create admin user
      const user = await tx.user.create({
        data: {
          email: input.adminEmail,
          password: hashedPassword,
          firstName: input.adminFirstName,
          lastName: input.adminLastName,
          phone: input.adminPhone,
          role: 'ADMIN',
          companyId: company.id,
          emailVerified: true, // Super Admin creates verified users
        },
      });

      // Create default warehouse
      await tx.warehouse.create({
        data: {
          name: 'Ana Depo',
          code: 'ANA001',
          isDefault: true,
          companyId: company.id,
        },
      });

      return { company, user };
    });

    // Send welcome email if approved
    if (result.company.status === 'APPROVED') {
      await emailService.sendApprovalEmail(
        result.user.email,
        result.user.firstName,
        result.company.name
      );
    } else {
      await emailService.sendWelcomeEmail(
        result.user.email,
        result.user.firstName,
        result.company.name
      );
    }

    return {
      id: result.company.id,
      name: result.company.name,
      email: result.company.email,
      status: result.company.status,
      admin: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
    };
  }

  /**
   * Get all companies with stats (Super Admin only)
   */
  async getCompanies(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: CompanyStatus;
  }): Promise<{ companies: CompanyWithStats[]; total: number }> {
    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    const { companies, total } = await companyRepository.findAll({
      skip,
      take,
      search: options?.search,
      status: options?.status,
    });

    // Get admin users for each company
    const companiesWithAdmin = await Promise.all(
      companies.map(async (company) => {
        const adminUser = await prisma.user.findFirst({
          where: {
            companyId: company.id,
            role: 'ADMIN',
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        });

        const stats = await prisma.company.findUnique({
          where: { id: company.id },
          select: {
            _count: {
              select: {
                users: true,
                warehouses: true,
                products: true,
                orders: true,
              },
            },
          },
        });

        return {
          id: company.id,
          name: company.name,
          email: company.email,
          phone: company.phone,
          status: company.status,
          taxNumber: company.taxNumber,
          createdAt: company.createdAt,
          admin: adminUser || null,
          stats: stats?._count || {
            users: 0,
            warehouses: 0,
            products: 0,
            orders: 0,
          },
        };
      })
    );

    return { companies: companiesWithAdmin, total };
  }

  /**
   * Get company by ID with details
   */
  async getCompanyById(id: string): Promise<CompanyDetail> {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
        warehouses: {
          select: {
            id: true,
            name: true,
            code: true,
            isDefault: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundError('Şirket bulunamadı');
    }

    return company as CompanyDetail;
  }

  /**
   * Approve company
   */
  async approveCompany(id: string): Promise<void> {
    const company = await companyRepository.findById(id);
    if (!company) {
      throw new NotFoundError('Şirket bulunamadı');
    }

    if (company.status !== 'PENDING') {
      throw new AppError('Bu şirket zaten işlem görmüş', 400);
    }

    await companyRepository.updateStatus(id, 'APPROVED');

    // Send approval email
    const adminUser = await prisma.user.findFirst({
      where: {
        companyId: id,
        role: 'ADMIN',
      },
    });

    if (adminUser) {
      await emailService.sendApprovalEmail(
        adminUser.email,
        adminUser.firstName,
        company.name
      );
    }
  }

  /**
   * Reject company
   */
  async rejectCompany(id: string): Promise<void> {
    const company = await companyRepository.findById(id);
    if (!company) {
      throw new NotFoundError('Şirket bulunamadı');
    }

    await companyRepository.updateStatus(id, 'REJECTED');
  }

  /**
   * Suspend company
   */
  async suspendCompany(id: string): Promise<void> {
    const company = await companyRepository.findById(id);
    if (!company) {
      throw new NotFoundError('Şirket bulunamadı');
    }

    await companyRepository.updateStatus(id, 'SUSPENDED');
  }

  /**
   * Reactivate company
   */
  async reactivateCompany(id: string): Promise<void> {
    const company = await companyRepository.findById(id);
    if (!company) {
      throw new NotFoundError('Şirket bulunamadı');
    }

    await companyRepository.updateStatus(id, 'APPROVED');
  }

  /**
   * Delete company completely (Super Admin only)
   * This will cascade delete all related data: users, products, orders, warehouses, etc.
   * 
   * ✅ FIX: Explicitly delete all related data before deleting company
   * to ensure data is completely removed even if cascade delete fails
   */
  async deleteCompany(id: string): Promise<{
    users: number;
    products: number;
    orders: number;
    warehouses: number;
  }> {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            products: true,
            orders: true,
            warehouses: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundError('Şirket bulunamadı');
    }

    const counts = company._count;

    // ✅ FIX: Explicitly delete all related data in transaction
    // This ensures data is deleted even if cascade delete constraints are missing
    await prisma.$transaction(async (tx) => {
      // Delete in correct order to respect foreign key constraints
      
      // 1. Delete order items first (they reference orders and products)
      await tx.orderItem.deleteMany({ where: { order: { companyId: id } } });
      
      // 2. Delete return items (they reference order items)
      await tx.returnItem.deleteMany({ where: { return: { order: { companyId: id } } } });
      
      // 3. Delete returns (they reference orders)
      await tx.return.deleteMany({ where: { order: { companyId: id } } });
      
      // 4. Delete orders (they reference warehouse, but warehouse will be deleted too)
      await tx.order.deleteMany({ where: { companyId: id } });
      
      // 5. Delete stock logs (they reference products and warehouses)
      await tx.stockLog.deleteMany({ where: { companyId: id } });
      
      // 6. Delete stocks (they reference products and warehouses)
      await tx.stock.deleteMany({ where: { product: { companyId: id } } });
      
      // 7. Delete marketplace products (they reference products and integrations)
      await tx.marketplaceProduct.deleteMany({ where: { product: { companyId: id } } });
      
      // 8. Delete product sources (they reference products and integrations)
      await tx.productSource.deleteMany({ where: { product: { companyId: id } } });
      
      // 9. Delete order sources (they reference orders and integrations)
      await tx.orderSource.deleteMany({ where: { order: { companyId: id } } });
      
      // 10. Delete product variants (they reference products)
      await tx.productVariant.deleteMany({ where: { product: { companyId: id } } });
      
      // 11. Delete product merge references (they reference products)
      await tx.productMergeReference.deleteMany({ where: { companyId: id } });
      
      // 12. Delete products (they reference categories, but categories will be deleted too)
      await tx.product.deleteMany({ where: { companyId: id } });
      
      // 13. Delete categories
      await tx.category.deleteMany({ where: { companyId: id } });
      
      // 14. Delete marketplace integrations
      await tx.marketplaceIntegration.deleteMany({ where: { companyId: id } });
      
      // 15. Delete picking waves
      await tx.pickingWave.deleteMany({ where: { companyId: id } });
      
      // 16. Delete inventory counts
      await tx.inventoryCountItem.deleteMany({ where: { count: { companyId: id } } });
      await tx.inventoryCount.deleteMany({ where: { companyId: id } });
      
      // 17. Delete transfers
      await tx.transferItem.deleteMany({ where: { transfer: { companyId: id } } });
      await tx.transfer.deleteMany({ where: { companyId: id } });
      
      // 18. Delete locations (they reference warehouses)
      await tx.location.deleteMany({ where: { warehouse: { companyId: id } } });
      
      // 19. Delete warehouses
      await tx.warehouse.deleteMany({ where: { companyId: id } });
      
      // 20. Delete cargo companies
      await tx.cargoCompany.deleteMany({ where: { companyId: id } });
      
      // 21. Delete campaign sets
      await tx.campaignSetItem.deleteMany({ where: { campaignSet: { companyId: id } } });
      await tx.campaignSet.deleteMany({ where: { companyId: id } });
      
      // 22. Delete bulk operations
      await tx.bulkOperation.deleteMany({ where: { companyId: id } });
      
      // 23. Delete settings
      await tx.setting.deleteMany({ where: { companyId: id } });
      
      // 24. Delete sync logs
      await tx.syncLog.deleteMany({ where: { integration: { companyId: id } } });
      
      // 25. Delete users (last, as they might be referenced by audit trails)
      await tx.user.deleteMany({ where: { companyId: id } });
      
      // 26. Finally, delete the company itself
      await tx.company.delete({ where: { id } });
    });

    return counts;
  }
}

export const companyService = new CompanyService();

