import { Router, RequestHandler } from 'express';
import { productController } from '../controllers/product.controller.js';
import { matchingController } from '../controllers/matching.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import bulkOperationsRoutes from './bulk-operations.routes.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

// GET routes
router.get('/', productController.getProducts as RequestHandler);
router.get('/stats', productController.getStats as RequestHandler);
router.get('/low-stock', productController.getLowStock as RequestHandler);
router.get('/sku/:sku', productController.getProductBySku as RequestHandler);
router.get('/barcode/:barcode', productController.getProductByBarcode as RequestHandler);
// Matching routes (must be before /:id route)
router.get('/unmatched', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, matchingController.getUnmatched as RequestHandler);
// Product-warehouse stock routes (must be before /:id route)
router.get('/:id/warehouses', productController.getProductWarehouses as RequestHandler);
router.get('/:id/warehouses/:warehouseId/stock', productController.getProductWarehouseStock as RequestHandler);
router.get('/:id', productController.getProduct as RequestHandler);
router.post('/:productId/match', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, matchingController.matchProduct as RequestHandler);
router.post('/:productId/unmatch', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, matchingController.unmatchProduct as RequestHandler);

// POST routes (Admin/Staff)
router.post('/', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, productController.createProduct as RequestHandler);

// PUT routes (Admin/Staff)
router.put('/:id', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, productController.updateProduct as RequestHandler);

// POST routes - Merge products (Admin/Staff)
// NOTE: This route must be before /:id route to avoid route conflicts
router.post('/:masterProductId/merge/:duplicateProductId', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, productController.mergeProducts as RequestHandler);

// POST routes - Product stock management (Admin/Staff)
router.post('/:id/warehouses/:warehouseId/stock', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, productController.createOrUpdateProductStock as RequestHandler);

// DELETE routes (Admin only)
router.delete('/:id/warehouses/:warehouseId/stock', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, productController.deleteProductStock as RequestHandler);
router.delete('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, productController.deleteProduct as RequestHandler);

// Bulk operations routes
router.use('/', bulkOperationsRoutes);

export default router;

