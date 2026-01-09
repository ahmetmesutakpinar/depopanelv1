import { Router, RequestHandler } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { stockAlertController } from '../controllers/stock-alert.controller.js';

const router = Router();

// Tüm route'lar authentication gerektirir
router.use(authenticate as unknown as RequestHandler);

/**
 * @route   GET /api/stock-alerts
 * @desc    Şirket için düşük stok uyarıları
 * @access  Private (ADMIN, STAFF)
 */
router.get(
  '/',
  authorize('ADMIN', 'STAFF') as unknown as RequestHandler,
  stockAlertController.getCompanyAlerts as RequestHandler
);

/**
 * @route   GET /api/stock-alerts/warehouse/:warehouseId
 * @desc    Depo için düşük stok uyarıları
 * @access  Private (ADMIN, STAFF)
 */
router.get(
  '/warehouse/:warehouseId',
  authorize('ADMIN', 'STAFF') as unknown as RequestHandler,
  stockAlertController.getWarehouseAlerts as RequestHandler
);

/**
 * @route   GET /api/stock-alerts/widget
 * @desc    Dashboard widget verisi
 * @access  Private (ADMIN, STAFF)
 */
router.get(
  '/widget',
  authorize('ADMIN', 'STAFF') as unknown as RequestHandler,
  stockAlertController.getWidget as RequestHandler
);

export default router;

