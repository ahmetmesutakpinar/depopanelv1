import { Router, RequestHandler } from 'express';
import { locationController } from '../controllers/location.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

// GET routes
router.get('/warehouse/:warehouseId', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.getLocations as RequestHandler);
router.get('/warehouse/:warehouseId/stock', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.getWarehouseLocationStock as RequestHandler);
router.get('/product/:productId', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.getProductLocations as RequestHandler);
router.get('/search', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.searchProductLocations as RequestHandler);
router.get('/unassigned-stock', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.getUnassignedStock as RequestHandler);
router.get('/:id', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.getLocation as RequestHandler);
router.get('/:id/stock', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.getLocationStock as RequestHandler);
router.get('/:id/stock-details', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.getLocationStockDetails as RequestHandler);

// POST routes
router.post('/warehouse/:warehouseId', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, locationController.createLocation as RequestHandler);
router.post('/:id/assign-product', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.assignProductToLocation as RequestHandler);
router.post('/add-stock', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.addStockToLocation as RequestHandler);
router.post('/transfer-stock', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.transferStockBetweenLocations as RequestHandler);

// PUT routes
router.put('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, locationController.updateLocation as RequestHandler);

// DELETE routes
router.delete('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, locationController.deleteLocation as RequestHandler);
router.delete('/:id/product', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, locationController.removeProductFromLocation as RequestHandler);

export default router;

