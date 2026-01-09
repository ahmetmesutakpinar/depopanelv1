import { Router, RequestHandler } from 'express';
import { integrationController } from '../controllers/integration.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication and admin access
router.use(authenticate as unknown as RequestHandler);
router.use(authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler);

// GET routes
router.get('/', integrationController.getIntegrations as RequestHandler);
router.get('/system-status', integrationController.getSystemStatus as RequestHandler);
router.get('/:id', integrationController.getIntegration as RequestHandler);
router.get('/:id/logs', integrationController.getSyncLogs as RequestHandler);
router.get('/:id/unmatched-products', integrationController.getUnmatchedProducts as RequestHandler);

// POST routes
router.post('/', integrationController.createIntegration as RequestHandler);
router.post('/:id/test', integrationController.testIntegration as RequestHandler);
router.post('/:id/sync', integrationController.syncIntegration as RequestHandler);
router.post('/:id/manual-sync', integrationController.manualSync as RequestHandler);
router.post('/:id/match-product', integrationController.matchProduct as RequestHandler);

// PUT routes
router.put('/:id', integrationController.updateIntegration as RequestHandler);

// DELETE routes
router.delete('/:id', integrationController.deleteIntegration as RequestHandler);
router.delete('/:id/product-sources/:productSourceId', integrationController.unmatchProduct as RequestHandler);

// POST routes for destructive operations
router.post('/clear-active', integrationController.clearActiveIntegrations as RequestHandler);
router.post('/cleanup-orphans', integrationController.cleanupOrphans as RequestHandler);

export default router;

