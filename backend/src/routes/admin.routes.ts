import { Router, RequestHandler } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { unresolvedProductController } from '../controllers/unresolved-product.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// Public route for support tickets
router.post('/tickets', adminController.createTicket as RequestHandler);

// Unresolved products routes (require authentication, accessible to company admins)
router.use('/unresolved-products', authenticate as unknown as RequestHandler);
router.get('/unresolved-products', unresolvedProductController.getUnresolvedProducts as RequestHandler);
router.post('/unresolved-products/link-existing', unresolvedProductController.linkExistingProduct as RequestHandler);
router.post('/unresolved-products/create-and-link', unresolvedProductController.createAndLinkProduct as RequestHandler);

// All other routes require Super Admin
router.use(authenticate as unknown as RequestHandler);
router.use(authorize('SUPER_ADMIN') as unknown as RequestHandler);

// Companies management
router.post('/companies', adminController.createCompany as RequestHandler);
router.get('/companies', adminController.getCompanies as RequestHandler);
router.get('/companies/:id', adminController.getCompany as RequestHandler);
router.post('/companies/:id/approve', adminController.approveCompany as RequestHandler);
router.post('/companies/:id/reject', adminController.rejectCompany as RequestHandler);
router.post('/companies/:id/suspend', adminController.suspendCompany as RequestHandler);
router.post('/companies/:id/reactivate', adminController.reactivateCompany as RequestHandler);
router.delete('/companies/:id', adminController.deleteCompany as RequestHandler);

// System health
router.get('/health', adminController.getSystemHealth as RequestHandler);

// Support tickets
router.get('/tickets', adminController.getTickets as RequestHandler);
router.put('/tickets/:id', adminController.updateTicket as RequestHandler);

// Fix orphaned marketplace links (Super Admin only)
router.post('/fix-marketplace-links', adminController.fixMarketplaceLinks as RequestHandler);

// Auto-link WooCommerce products to other marketplaces (Super Admin only)
router.post('/auto-link-woo-products', adminController.autoLinkWooProducts as RequestHandler);

// Validate marketplace product links (Super Admin only)
router.post('/validate-marketplace-links', adminController.validateMarketplaceLinks as RequestHandler);

// Fix unlinked OrderItems by SKU matching (Super Admin only)
router.post('/fix-unlinked-order-items', adminController.fixUnlinkedOrderItems as RequestHandler);

export default router;

