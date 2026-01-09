import { Router, RequestHandler } from 'express';
import { pickingWaveController } from '../controllers/picking-wave.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

// GET routes
router.get('/', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.getWaves as RequestHandler);
router.get('/:id', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.getWave as RequestHandler);
router.get('/:id/aggregate', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.aggregateOrderItems as RequestHandler);
router.get('/:id/pick-list', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.getPickList as RequestHandler);

// POST routes
router.post('/', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.createWave as RequestHandler);
router.post('/auto', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.autoCreateWave as RequestHandler);
// New wave system endpoints
router.post('/auto/time-based', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.createTimeBasedWave as RequestHandler);
router.post('/auto/sku-based', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.createSkuBasedWave as RequestHandler);
router.post('/auto/priority', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.createPriorityWave as RequestHandler);
router.post('/auto/custom', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.createCustomWave as RequestHandler);
router.post('/:id/orders', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.addOrders as RequestHandler);
router.post('/:id/start', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.startWave as RequestHandler);
router.post('/:id/complete', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.completeWave as RequestHandler);
router.post('/:id/pick', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.markAsPicked as RequestHandler);
router.post('/:id/ship', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.markAsShipped as RequestHandler);
router.post('/:id/scan', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.scanBarcode as RequestHandler);

// PUT routes
router.put('/:id', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.updateWave as RequestHandler);
router.put('/:id/orders/remove', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.removeOrders as RequestHandler);
router.put('/:id/complete-picking', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.completePicking as RequestHandler);
router.put('/:id/packing', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.transitionToPacking as RequestHandler);
router.put('/:id/orders/:orderId/pack', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.markOrderAsPacked as RequestHandler);
router.put('/:id/orders/:orderId/ship', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.markOrderAsShipped as RequestHandler);
router.put('/:id/shipped', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.transitionToShipped as RequestHandler);
router.put('/:id/close', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, pickingWaveController.closeWave as RequestHandler);

// DELETE routes - ✅ Sadece ADMIN ve SUPER_ADMIN silebilir
router.delete('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, pickingWaveController.deleteWave as RequestHandler);

export default router;

