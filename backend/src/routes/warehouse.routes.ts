import { Router, RequestHandler } from 'express';
import { warehouseController } from '../controllers/warehouse.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

// GET routes
router.get('/', warehouseController.getWarehouses as RequestHandler);
router.get('/active', warehouseController.getActiveWarehouses as RequestHandler);
router.get('/stats/all', warehouseController.getAllWarehouseStats as RequestHandler);
router.get('/:id', warehouseController.getWarehouse as RequestHandler);
router.get('/:id/stats', warehouseController.getWarehouseStats as RequestHandler);

// POST routes (Admin only)
router.post('/', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, warehouseController.createWarehouse as RequestHandler);
router.post('/:id/set-default', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, warehouseController.setDefault as RequestHandler);

// PUT routes (Admin only)
router.put('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, warehouseController.updateWarehouse as RequestHandler);

// DELETE routes (Admin only)
router.delete('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, warehouseController.deleteWarehouse as RequestHandler);

export default router;

