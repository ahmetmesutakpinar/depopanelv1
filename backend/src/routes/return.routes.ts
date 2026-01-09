import { Router, RequestHandler } from 'express';
import { returnController } from '../controllers/return.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

// GET routes
router.get('/', returnController.getReturns as RequestHandler);
router.get('/:id', returnController.getReturn as RequestHandler);

// POST routes (Admin/Staff)
router.post('/', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, returnController.createReturn as RequestHandler);
router.post('/:id/approve', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, returnController.approveReturn as RequestHandler);
router.post('/:id/reject', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, returnController.rejectReturn as RequestHandler);
router.post('/:id/complete', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, returnController.completeReturn as RequestHandler);

export default router;

