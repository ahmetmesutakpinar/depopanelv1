import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { sendSuccess, sendError } from '../utils/response.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { prisma } from '../config/index.js';
import { metricsService } from '../services/metrics.service.js';
import { tracer } from '../utils/tracing.js';
import { jobOrchestrator } from '../services/job-orchestrator.service.js';
import { BaseController } from './base.controller.js';

const integrationWithCompany = Prisma.validator<Prisma.MarketplaceIntegrationFindManyArgs>()({
  include: {
    company: true,
  },
});

class ObservabilityController extends BaseController {
  /**
   * GET /api/observability/integrations
   */
  getIntegrationHealth = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);

    const integrations = await prisma.marketplaceIntegration.findMany({
      ...(companyId ? { where: { companyId } } : {}),
      ...integrationWithCompany,
      orderBy: {
        lastSyncAt: 'desc',
      },
    });

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const integrationHealth = await Promise.all(
      integrations.map(async (integration) => {
        const recentSyncs = await prisma.syncLog.findMany({
          where: {
            marketplace: integration.type,
            companyId: integration.companyId,
            createdAt: { gte: last24Hours },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });

        const successCount = recentSyncs.filter(s => s.status === 'SUCCESS').length;
        const failureCount = recentSyncs.filter(s => s.status === 'FAILED').length;

        const successRate =
          recentSyncs.length > 0
            ? (successCount / recentSyncs.length) * 100
            : null;

        return {
          id: integration.id,
          type: integration.type,
          name: integration.name,
          status: integration.status,
          isActive: integration.isActive,
          lastSyncAt: integration.lastSyncAt,
          company: integration.company,
          health: {
            successRate: successRate !== null ? `${successRate.toFixed(2)}%` : 'N/A',
            recentSyncs: recentSyncs.length,
            successCount,
            failureCount,
            lastSync: recentSyncs[0] ?? null,
          },
        };
      })
    );

    sendSuccess(res, 'Integration health retrieved', { integrations: integrationHealth });
  });

  /**
   * GET /api/observability/jobs
   */
  getJobHistory = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const syncLogs = await prisma.syncLog.findMany({
      where: {
        createdAt: { gte: last24Hours },
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const jobStatuses = jobOrchestrator.getAllJobStatuses();

    sendSuccess(res, 'Job history retrieved', {
      syncLogs,
      orchestratorJobs: jobStatuses,
    });
  });

  /**
   * GET /api/observability/traces/:traceId
   */
  getTrace = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { traceId } = req.params;

    const trace = tracer.exportTrace(traceId);
    if (!trace) {
      return sendError(res, 'Trace not found', 404);
    }

    sendSuccess(res, 'Trace retrieved', trace);
  });

  /**
   * GET /api/observability/metrics/summary
   */
  getMetricsSummary = this.asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const summary = await metricsService.getMetricsSummary();
    sendSuccess(res, 'Metrics summary retrieved', summary);
  });
}

export const observabilityController = new ObservabilityController();
