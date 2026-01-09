import { Router, RequestHandler } from 'express';
import { orderController } from '../controllers/order.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

// GET routes
router.get('/', orderController.getOrders as RequestHandler);
router.get('/stats', orderController.getStats as RequestHandler);
router.get('/daily-products', orderController.getDailyOrderedProducts as RequestHandler);
router.get('/by-shipping-code', orderController.getByShippingCode as RequestHandler);
router.get('/barcode/:barcode', orderController.findOrderByBarcode as RequestHandler); // Must be before /:id route
router.get('/:id', orderController.getOrder as RequestHandler);

// POST routes
router.post('/', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, orderController.createOrder as RequestHandler);
router.post('/:id/cancel', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, orderController.cancelOrder as RequestHandler);

// PUT routes
router.put('/:id/status', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, orderController.updateStatus as RequestHandler);
router.put('/bulk-update', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, orderController.bulkUpdateStatus as RequestHandler);

// POST routes (scan item)
router.post('/:id/scan-item', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, orderController.scanOrderItem as RequestHandler);

export default router;

