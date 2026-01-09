import { Router, RequestHandler } from 'express';
import { userController } from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

// Get all users (Admin only)
router.get('/', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, userController.getUsers as RequestHandler);

// Get single user
router.get('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, userController.getUser as RequestHandler);

// Create user (Admin only - no email verification needed)
router.post('/', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, userController.createUser as RequestHandler);

// Update user
router.put('/:id', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, userController.updateUser as RequestHandler);

// Delete user (Admin only)
router.delete('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, userController.deleteUser as RequestHandler);

export default router;

