import { Router } from 'express';
import { metricsController } from '../controllers/metrics.controller.js';

const router = Router();

/**
 * @route   GET /api/metrics/prometheus
 * @desc    Get Prometheus format metrics
 * @access  Public (can be restricted in production)
 */
router.get('/prometheus', metricsController.getPrometheusMetrics);

/**
 * @route   GET /api/metrics/summary
 * @desc    Get metrics summary in JSON format
 * @access  Public (can be restricted in production)
 */
router.get('/summary', metricsController.getMetricsSummary);

export default router;

