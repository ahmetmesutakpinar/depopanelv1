import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { metricsService } from '../services/metrics.service.js';

class MetricsController {
  /**
   * GET /api/metrics/prometheus
   * Prometheus format metrics endpoint
   */
  getPrometheusMetrics = asyncHandler(async (req: Request, res: Response) => {
    const metrics = await metricsService.getPrometheusMetrics();
    
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  });

  /**
   * GET /api/metrics/summary
   * Custom JSON metrics summary
   */
  getMetricsSummary = asyncHandler(async (req: Request, res: Response) => {
    const summary = await metricsService.getMetricsSummary();
    
    sendSuccess(res, 'Metrics summary retrieved', summary);
  });
}

export const metricsController = new MetricsController();

