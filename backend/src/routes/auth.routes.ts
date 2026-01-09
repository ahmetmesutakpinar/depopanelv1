import { Router, RequestHandler } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// Public routes
router.post('/send-verification-code', authController.sendVerificationCode as RequestHandler);
router.post('/verify-register', authController.verifyAndRegister as RequestHandler);
router.post('/register', authController.register as RequestHandler); // Legacy - dev only
router.post('/login', authController.login as RequestHandler);
router.post('/refresh', authController.refresh as RequestHandler);

// Protected routes
router.get('/profile', authenticate as unknown as RequestHandler, authController.getProfile as RequestHandler);
router.put('/profile', authenticate as unknown as RequestHandler, authController.updateProfile as RequestHandler);
router.post('/change-password', authenticate as unknown as RequestHandler, authController.changePassword as RequestHandler);
router.get('/me', authenticate as unknown as RequestHandler, authController.me as RequestHandler);

export default router;

