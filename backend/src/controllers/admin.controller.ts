import { Request, Response } from 'express';
import { prisma } from '../config/index.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { companyService } from '../services/company.service.js';
import { productService } from '../services/product.service.js';
import { marketplaceProductLinkerService } from '../services/marketplace-product-linker.service.js';
import { orderItemFixerService } from '../services/order-item-fixer.service.js';
import { z } from 'zod';

// ==================== VALIDATION SCHEMAS ====================

const createCompanySchema = z.object({
  companyName: z.string().min(2, 'Şirket adı en az 2 karakter olmalı'),
  companyEmail: z.string().email('Geçerli bir e-posta adresi girin'),
  companyPhone: z.string().optional(),
  companyAddress: z.string().optional(),
  taxNumber: z.string().optional(),
  adminFirstName: z.string().min(2, 'Ad en az 2 karakter olmalı'),
  adminLastName: z.string().min(2, 'Soyad en az 2 karakter olmalı'),
  adminEmail: z.string().email('Geçerli bir e-posta adresi girin'),
  adminPassword: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
  adminPhone: z.string().optional(),
  autoApprove: z.boolean().optional().default(false),
});

const companyQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
});

// ==================== CONTROLLER ====================

class AdminController {
  /**
   * POST /api/admin/companies
   * Create company manually (Super Admin only)
   */
  createCompany = asyncHandler(async (req: Request, res: Response) => {
    const data = createCompanySchema.parse(req.body);
    const result = await companyService.createCompanyWithAdmin(data);
    sendCreated(res, 'Şirket oluşturuldu', result);
  });

  /**
   * GET /api/admin/companies
   * Get all companies (Super Admin only)
   */
  getCompanies = asyncHandler(async (req: Request, res: Response) => {
    const query = companyQuerySchema.parse(req.query);
    const result = await companyService.getCompanies({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
    });

    sendSuccess(res, 'Şirketler listelendi', result.companies, 200, {
      page: query.page || 1,
      limit: query.limit || 20,
      total: result.total,
      totalPages: Math.ceil(result.total / (query.limit || 20)),
    });
  });

  /**
   * GET /api/admin/companies/:id
   * Get company details
   */
  getCompany = asyncHandler(async (req: Request, res: Response) => {
    const company = await companyService.getCompanyById(req.params.id);
    sendSuccess(res, 'Şirket bulundu', company);
  });

  /**
   * POST /api/admin/companies/:id/approve
   * Approve company
   */
  approveCompany = asyncHandler(async (req: Request, res: Response) => {
    await companyService.approveCompany(req.params.id);
    sendSuccess(res, 'Şirket onaylandı');
  });

  /**
   * POST /api/admin/companies/:id/reject
   * Reject company
   */
  rejectCompany = asyncHandler(async (req: Request, res: Response) => {
    await companyService.rejectCompany(req.params.id);
    sendSuccess(res, 'Şirket reddedildi');
  });

  /**
   * POST /api/admin/companies/:id/suspend
   * Suspend company
   */
  suspendCompany = asyncHandler(async (req: Request, res: Response) => {
    await companyService.suspendCompany(req.params.id);
    sendSuccess(res, 'Şirket askıya alındı');
  });

  /**
   * POST /api/admin/companies/:id/reactivate
   * Reactivate company
   */
  reactivateCompany = asyncHandler(async (req: Request, res: Response) => {
    await companyService.reactivateCompany(req.params.id);
    sendSuccess(res, 'Şirket yeniden aktifleştirildi');
  });

  /**
   * DELETE /api/admin/companies/:id
   * Delete company completely (Super Admin only)
   */
  deleteCompany = asyncHandler(async (req: Request, res: Response) => {
    const counts = await companyService.deleteCompany(req.params.id);
    sendSuccess(
      res,
      `Şirket ve tüm ilişkili veriler silindi (${counts.users} kullanıcı, ${counts.products} ürün, ${counts.orders} sipariş, ${counts.warehouses} depo)`
    );
  });

  /**
   * GET /api/admin/health
   * Get system health
   */
  getSystemHealth = asyncHandler(async (req: Request, res: Response) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const last7Days = new Date();
      last7Days.setDate(last7Days.getDate() - 7);

      const [
        companiesCount,
        approvedCompanies,
        pendingCompanies,
        rejectedCompanies,
        suspendedCompanies,
        usersCount,
        activeUsers,
        staffUsers,
        adminUsers,
        superAdminUsers,
        ordersTotal,
        ordersToday,
        ordersLast7Days,
        ordersPending,
        ordersProcessing,
        ordersShipped,
        ordersDelivered,
        productsTotal,
        warehousesTotal,
        activeIntegrations,
        totalStock,
        lowStockProducts,
        ticketsOpen,
        ticketsResolved,
      ] = await Promise.all([
        prisma.company.count(),
        prisma.company.count({ where: { status: 'APPROVED' } }),
        prisma.company.count({ where: { status: 'PENDING' } }),
        prisma.company.count({ where: { status: 'REJECTED' } }),
        prisma.company.count({ where: { status: 'SUSPENDED' } }),
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.count({ where: { role: 'STAFF' } }),
        prisma.user.count({ where: { role: 'ADMIN' } }),
        prisma.user.count({ where: { role: 'SUPER_ADMIN' } }),
        prisma.order.count(),
        prisma.order.count({
          where: {
            createdAt: { gte: today },
          },
        }),
        prisma.order.count({
          where: {
            createdAt: { gte: last7Days },
          },
        }),
        prisma.order.count({ where: { status: 'PENDING' } }),
        prisma.order.count({ where: { status: 'PROCESSING' } }),
        prisma.order.count({ where: { status: 'SHIPPED' } }),
        prisma.order.count({ where: { status: 'DELIVERED' } }),
        prisma.product.count(),
        prisma.warehouse.count(),
        prisma.marketplaceIntegration.count({ where: { status: 'ACTIVE' } }),
        // STOCK LEDGER: Calculate total stock from movements instead of stock.quantity
        prisma.$queryRaw<[{ total: bigint | number | null }]>`
          WITH stock_balances AS (
            SELECT 
              sl."productId",
              sl."warehouseId",
              sl."variantId",
              SUM(
                CASE 
                  WHEN sl.type IN ('IN', 'RETURN', 'RETURN_SET_READY', 'RETURN_SET_COMPONENT', 'PACKING_IN') 
                  THEN sl.quantity
                  WHEN sl.type IN ('OUT', 'OUT_SET_READY', 'OUT_SET_COMPONENT', 'TRANSFER') 
                  THEN -sl.quantity
                  ELSE 0
                END
              ) as current_quantity
            FROM stock_logs sl
            GROUP BY sl."productId", sl."warehouseId", sl."variantId"
          )
          SELECT COALESCE(SUM(sb.current_quantity), 0) as total
          FROM stock_balances sb
          WHERE sb.current_quantity > 0
        `.then(result => ({ _sum: { quantity: Number(result[0]?.total || 0) } }))
          .catch(() => ({ _sum: { quantity: 0 } })),
        // STOCK LEDGER: Calculate low stock products from movements
        prisma.$queryRaw<[{ count: bigint }]>`
          WITH stock_balances AS (
            SELECT 
              sl."productId",
              sl."warehouseId",
              sl."variantId",
              SUM(
                CASE 
                  WHEN sl.type IN ('IN', 'RETURN', 'RETURN_SET_READY', 'RETURN_SET_COMPONENT', 'PACKING_IN') 
                  THEN sl.quantity
                  WHEN sl.type IN ('OUT', 'OUT_SET_READY', 'OUT_SET_COMPONENT', 'TRANSFER') 
                  THEN -sl.quantity
                  ELSE 0
                END
              ) as current_quantity,
              MAX(s.minQuantity) as min_quantity
            FROM stock_logs sl
            LEFT JOIN stocks s ON s."productId" = sl."productId" 
              AND s."warehouseId" = sl."warehouseId" 
              AND (s."variantId" = sl."variantId" OR (s."variantId" IS NULL AND sl."variantId" IS NULL))
            GROUP BY sl."productId", sl."warehouseId", sl."variantId"
          )
          SELECT COUNT(DISTINCT sb."productId") as count
          FROM stock_balances sb
          WHERE sb.current_quantity > 0 
            AND sb.min_quantity > 0 
            AND sb.current_quantity <= sb.min_quantity
        `.then(result => Number(result[0]?.count || 0))
          .catch(() => 0),
        prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
      ]);

      // Calculate total revenue
      const revenueResult = await prisma.order.aggregate({
        where: {
          status: { in: ['DELIVERED', 'SHIPPED'] },
        },
        _sum: { total: true },
      });

      const memory = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      return sendSuccess(res, 'Sistem sağlığı', {
        database: {
          status: 'connected',
          provider: 'PostgreSQL',
        },
        server: {
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          memory: {
            rss: memory.rss,
            heapTotal: memory.heapTotal,
            heapUsed: memory.heapUsed,
            external: memory.external,
            arrayBuffers: memory.arrayBuffers,
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
        },
        companies: {
          total: companiesCount,
          approved: approvedCompanies,
          pending: pendingCompanies,
          rejected: rejectedCompanies,
          suspended: suspendedCompanies,
        },
        users: {
          total: usersCount,
          active: activeUsers,
          byRole: {
            staff: staffUsers,
            admin: adminUsers,
            superAdmin: superAdminUsers,
          },
        },
        orders: {
          total: ordersTotal,
          today: ordersToday,
          last7Days: ordersLast7Days,
          byStatus: {
            pending: ordersPending,
            processing: ordersProcessing,
            shipped: ordersShipped,
            delivered: ordersDelivered,
          },
          totalRevenue: revenueResult._sum.total || 0,
        },
        inventory: {
          totalProducts: productsTotal,
          totalWarehouses: warehousesTotal,
          totalStock: totalStock._sum.quantity || 0,
          lowStockProducts,
        },
        integrations: {
          active: activeIntegrations,
        },
        support: {
          open: ticketsOpen,
          resolved: ticketsResolved,
        },
      });
  });

  /**
   * GET /api/admin/tickets
   * Get support tickets
   */
  getTickets = asyncHandler(async (req: Request, res: Response) => {
      const { status, type } = req.query;

      const where: any = {};
      if (status) where.status = status;
      if (type) where.type = type;

      const tickets = await prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

    sendSuccess(res, 'Talepler listelendi', tickets);
  });

  /**
   * PUT /api/admin/tickets/:id
   * Update ticket
   */
  updateTicket = asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const { status, response } = req.body;

      const ticket = await prisma.supportTicket.update({
        where: { id },
        data: {
          ...(status && { status }),
          ...(response && { response }),
        },
      });

    sendSuccess(res, 'Talep güncellendi', ticket);
  });

  /**
   * POST /api/admin/tickets
   * Create support ticket (public)
   */
  createTicket = asyncHandler(async (req: Request, res: Response) => {
      const { type, subject, message, email, companyName } = req.body;

      const ticket = await prisma.supportTicket.create({
        data: {
          type,
          subject,
          message,
          email,
          companyName,
        },
      });

    sendCreated(res, 'Talebiniz alındı', ticket);
  });

  /**
   * POST /api/admin/fix-marketplace-links
   * Fix orphaned marketplace links for merged products (Super Admin only)
   */
  fixMarketplaceLinks = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.body.companyId || req.query.companyId;
    
    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const result = await productService.fixOrphanedMarketplaceLinks(companyId);
    
    sendSuccess(
      res,
      'Marketplace links fixed successfully',
      result.summary
    );
  });

  /**
   * POST /api/admin/auto-link-woo-products
   * Auto-link WooCommerce master products to other active marketplaces (Super Admin only)
   */
  autoLinkWooProducts = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.body.companyId || req.query.companyId;
    
    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const result = await marketplaceProductLinkerService.autoLinkProductsFromWoo(companyId);
    
    sendSuccess(
      res,
      `Auto-link completed: ${result.linksCreated} links created, ${result.linksSkipped} skipped`,
      result
    );
  });

  /**
   * POST /api/admin/validate-marketplace-links
   * Validate marketplace product links by checking if marketplaceId exists in marketplace API (Super Admin only)
   */
  validateMarketplaceLinks = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.body.companyId || req.query.companyId;
    
    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const result = await marketplaceProductLinkerService.validateMarketplaceLinks(companyId);
    
    sendSuccess(
      res,
      `Validation completed: ${result.verified} verified, ${result.failed} failed, ${result.skipped} skipped`,
      result
    );
  });

  /**
   * POST /api/admin/fix-unlinked-order-items
   * Fix unlinked OrderItems by matching SKU with existing products (Super Admin only)
   */
  fixUnlinkedOrderItems = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.body.companyId || req.query.companyId;
    
    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const result = await orderItemFixerService.fixUnlinkedOrderItemsBySku(companyId);
    
    sendSuccess(
      res,
      `Fix completed: ${result.fixed} fixed, ${result.skipped} skipped (${result.ambiguous} ambiguous)`,
      result
    );
  });
}

export const adminController = new AdminController();

