import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';

const router = Router();

// Health check endpoints
router.get('/health', healthController.getHealth);
router.get('/health/detailed', healthController.getDetailedHealth);
router.get('/cron/status', healthController.getCronStatus);
router.get('/metrics', healthController.getMetrics);

export default router;


