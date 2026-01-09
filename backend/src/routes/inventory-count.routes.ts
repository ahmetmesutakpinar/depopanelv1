import { Router, RequestHandler } from 'express';
import { inventoryCountController } from '../controllers/inventory-count.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

// GET routes
router.get('/', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, inventoryCountController.getCounts as RequestHandler);
router.get('/:id', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, inventoryCountController.getCount as RequestHandler);

// POST routes
router.post('/', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, inventoryCountController.createCount as RequestHandler);
router.post('/:id/start', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, inventoryCountController.startCount as RequestHandler);
router.post('/:id/items', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, inventoryCountController.addCountItem as RequestHandler);
router.post('/:id/complete', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, inventoryCountController.completeCount as RequestHandler);
router.post('/:id/approve', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, inventoryCountController.approveCount as RequestHandler);

// PUT routes
router.put('/:id/items/:itemId', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, inventoryCountController.updateCountItem as RequestHandler);

// DELETE routes
router.delete('/:id/items/:itemId', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, inventoryCountController.deleteCountItem as RequestHandler);
router.delete('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, inventoryCountController.deleteCount as RequestHandler);

export default router;

