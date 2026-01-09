import { Router, RequestHandler } from 'express';
import { observabilityController } from '../controllers/observability.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

/**
 * @route   GET /api/observability/integrations
 * @desc    Get integration health status
 * @access  Private
 */
router.get('/integrations', observabilityController.getIntegrationHealth as RequestHandler);

/**
 * @route   GET /api/observability/jobs
 * @desc    Get job execution history
 * @access  Private
 */
router.get('/jobs', observabilityController.getJobHistory as RequestHandler);

/**
 * @route   GET /api/observability/traces/:traceId
 * @desc    Get trace details
 * @access  Private
 */
router.get('/traces/:traceId', observabilityController.getTrace as RequestHandler);

/**
 * @route   GET /api/observability/metrics/summary
 * @desc    Get metrics summary
 * @access  Private
 */
router.get('/metrics/summary', observabilityController.getMetricsSummary as RequestHandler);

export default router;

