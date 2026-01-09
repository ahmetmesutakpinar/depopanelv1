import { Router, RequestHandler } from 'express';
import { stockController } from '../controllers/stock.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

// GET routes
router.get('/product/:productId', stockController.getProductStocks as RequestHandler);
router.get('/warehouse/:warehouseId', stockController.getWarehouseStocks as RequestHandler);
router.get('/logs', stockController.getStockLogs as RequestHandler);
router.get('/summary', stockController.getStockSummary as RequestHandler);

// POST routes (Admin/Staff)
router.post('/adjust', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, stockController.adjustStock as RequestHandler);
router.post('/transfer', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, stockController.transferStock as RequestHandler);
router.post('/transfer-location', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, stockController.transferLocationStock as RequestHandler);
router.post('/min-quantity', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, stockController.setMinQuantity as RequestHandler);

export default router;

