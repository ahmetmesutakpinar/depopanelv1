import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { prisma } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { metricsService } from '../services/metrics.service.js';

class HealthController {
  /**
   * GET /api/health
   * Basic health check endpoint
   */
  getHealth = asyncHandler(async (req: Request, res: Response) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
    };

    sendSuccess(res, 'System is healthy', health);
  });

  /**
   * GET /api/health/detailed
   * Detailed health check with database and system metrics
   */
  getDetailedHealth = asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    // Check database connection
    let dbStatus = 'unknown';
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'disconnected';
      logger.error('[Health] Database connection check failed:', error);
    }

    // System metrics
    const memory = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const health = {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      database: {
        status: dbStatus,
        latency: `${dbLatency}ms`,
      },
      system: {
        memory: {
          rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memory.external / 1024 / 1024)}MB`,
        },
        cpu: {
          user: `${Math.round(cpuUsage.user / 1000)}ms`,
          system: `${Math.round(cpuUsage.system / 1000)}ms`,
        },
        nodeVersion: process.version,
        platform: process.platform,
      },
      responseTime: `${Date.now() - startTime}ms`,
    };

    const statusCode = dbStatus === 'connected' ? 200 : 503;
    sendSuccess(res, 'Health check completed', health, statusCode);
  });

  /**
   * GET /api/cron/status
   * Get cron job execution status
   */
  getCronStatus = asyncHandler(async (req: Request, res: Response) => {
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    const [
      productSyncs,
      orderSyncs,
      stockSyncs,
      returnSyncs,
      totalSyncs,
      failedSyncs,
    ] = await Promise.all([
      prisma.syncLog.findMany({
        where: {
          type: 'PRODUCT_SYNC',
          createdAt: { gte: last24Hours },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.syncLog.findMany({
        where: {
          type: 'ORDER_SYNC',
          createdAt: { gte: last24Hours },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.syncLog.findMany({
        where: {
          type: 'STOCK_SYNC',
          createdAt: { gte: last24Hours },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.syncLog.findMany({
        where: {
          type: 'RETURN_SYNC',
          createdAt: { gte: last24Hours },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.syncLog.count({
        where: {
          createdAt: { gte: last24Hours },
        },
      }),
      prisma.syncLog.count({
        where: {
          status: 'FAILED',
          createdAt: { gte: last24Hours },
        },
      }),
    ]);

    const status = {
      last24Hours: {
        total: totalSyncs,
        failed: failedSyncs,
        success: totalSyncs - failedSyncs,
        successRate: totalSyncs > 0 ? ((totalSyncs - failedSyncs) / totalSyncs * 100).toFixed(2) : '0.00',
      },
      recent: {
        productSync: productSyncs[0] || null,
        orderSync: orderSyncs[0] || null,
        stockSync: stockSyncs[0] || null,
        returnSync: returnSyncs[0] || null,
      },
      history: {
        productSyncs: productSyncs.slice(0, 5).map(s => ({
          status: s.status,
          message: s.message,
          recordsProcessed: s.recordsProcessed,
          recordsFailed: s.recordsFailed,
          createdAt: s.createdAt,
        })),
        orderSyncs: orderSyncs.slice(0, 5).map(s => ({
          status: s.status,
          message: s.message,
          recordsProcessed: s.recordsProcessed,
          recordsFailed: s.recordsFailed,
          createdAt: s.createdAt,
        })),
        stockSyncs: stockSyncs.slice(0, 5).map(s => ({
          status: s.status,
          message: s.message,
          recordsProcessed: s.recordsProcessed,
          recordsFailed: s.recordsFailed,
          createdAt: s.createdAt,
        })),
        returnSyncs: returnSyncs.slice(0, 5).map(s => ({
          status: s.status,
          message: s.message,
          recordsProcessed: s.recordsProcessed,
          recordsFailed: s.recordsFailed,
          createdAt: s.createdAt,
        })),
      },
    };

    sendSuccess(res, 'Cron job status retrieved', status);
  });

  /**
   * GET /api/metrics
   * Get system metrics (enhanced with integration and job metrics)
   */
  getMetrics = asyncHandler(async (req: Request, res: Response) => {
    const [
      totalCompanies,
      activeCompanies,
      totalUsers,
      activeUsers,
      totalProducts,
      totalOrders,
      totalWarehouses,
      totalIntegrations,
      activeIntegrations,
      last24Hours,
      last7Days,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.company.count({ where: { status: 'APPROVED' } }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.product.count(),
      prisma.order.count(),
      prisma.warehouse.count(),
      prisma.marketplaceIntegration.count(),
      prisma.marketplaceIntegration.count({ where: { status: 'ACTIVE' } }),
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    ]);

    // Get integration-specific metrics from sync logs
    const integrationMetrics = await prisma.syncLog.groupBy({
      by: ['marketplace', 'status'],
      where: {
        createdAt: { gte: last24Hours },
      },
      _count: {
        id: true,
      },
    });

    // Get job execution metrics
    const jobMetrics = await prisma.syncLog.groupBy({
      by: ['type', 'status'],
      where: {
        createdAt: { gte: last24Hours },
      },
      _count: {
        id: true,
      },
    });

    // Get time-series data (last 24h and last 7d)
    const [ordersLast24h, ordersLast7d, productsSyncedLast24h, productsSyncedLast7d] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: last24Hours } } }),
      prisma.order.count({ where: { createdAt: { gte: last7Days } } }),
      prisma.syncLog.count({
        where: {
          type: 'PRODUCT_SYNC',
          status: 'SUCCESS',
          createdAt: { gte: last24Hours },
        },
      }),
      prisma.syncLog.count({
        where: {
          type: 'PRODUCT_SYNC',
          status: 'SUCCESS',
          createdAt: { gte: last7Days },
        },
      }),
    ]);

    // Get metrics summary from metrics service
    const metricsSummary = await metricsService.getMetricsSummary();

    const memory = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: {
          rss: Math.round(memory.rss / 1024 / 1024),
          heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
          external: Math.round(memory.external / 1024 / 1024),
        },
        cpu: {
          user: Math.round(cpuUsage.user / 1000),
          system: Math.round(cpuUsage.system / 1000),
        },
        nodeVersion: process.version,
        platform: process.platform,
      },
      database: {
        companies: {
          total: totalCompanies,
          active: activeCompanies,
        },
        users: {
          total: totalUsers,
          active: activeUsers,
        },
        products: totalProducts,
        orders: totalOrders,
        warehouses: totalWarehouses,
        integrations: {
          total: totalIntegrations,
          active: activeIntegrations,
        },
      },
      integrations: {
        byMarketplace: integrationMetrics.reduce((acc, item) => {
          if (!acc[item.marketplace]) {
            acc[item.marketplace] = { success: 0, failed: 0 };
          }
          if (item.status === 'SUCCESS') {
            acc[item.marketplace].success = item._count.id;
          } else {
            acc[item.marketplace].failed = item._count.id;
          }
          return acc;
        }, {} as Record<string, { success: number; failed: number }>),
      },
      jobs: {
        byType: jobMetrics.reduce((acc, item) => {
          if (!acc[item.type]) {
            acc[item.type] = { success: 0, failed: 0 };
          }
          if (item.status === 'SUCCESS') {
            acc[item.type].success = item._count.id;
          } else {
            acc[item.type].failed = item._count.id;
          }
          return acc;
        }, {} as Record<string, { success: number; failed: number }>),
      },
      timeSeries: {
        last24Hours: {
          orders: ordersLast24h,
          productsSynced: productsSyncedLast24h,
        },
        last7Days: {
          orders: ordersLast7d,
          productsSynced: productsSyncedLast7d,
        },
      },
      prometheus: metricsSummary,
    };

    sendSuccess(res, 'System metrics retrieved', metrics);
  });
}

export const healthController = new HealthController();







