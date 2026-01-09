import { Router, RequestHandler } from 'express';
import { bulkOperationsController } from '../controllers/bulk-operations.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

/**
 * @route   POST /api/products/bulk-update
 * @desc    Create a new bulk operation
 * @access  Private (Company-scoped)
 */
router.post('/bulk-update', bulkOperationsController.createBulkOperation as RequestHandler);

/**
 * @route   GET /api/products/bulk-operations/:id/status
 * @desc    Get bulk operation status
 * @access  Private (Company-scoped)
 */
router.get('/bulk-operations/:id/status', bulkOperationsController.getBulkOperationStatus as RequestHandler);

/**
 * @route   GET /api/products/bulk-operations
 * @desc    Get all bulk operations for company
 * @access  Private (Company-scoped)
 */
router.get('/bulk-operations', bulkOperationsController.getBulkOperations as RequestHandler);

export default router;

