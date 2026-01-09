import { Router, RequestHandler } from 'express';
import { cargoCompanyController } from '../controllers/cargo-company.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

// GET routes
router.get('/', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, cargoCompanyController.getCargoCompanies as RequestHandler);
router.get('/:id', authorize('ADMIN', 'SUPER_ADMIN', 'STAFF') as unknown as RequestHandler, cargoCompanyController.getCargoCompany as RequestHandler);

// POST routes
router.post('/', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, cargoCompanyController.createCargoCompany as RequestHandler);

// PUT routes
router.put('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, cargoCompanyController.updateCargoCompany as RequestHandler);

// DELETE routes
router.delete('/:id', authorize('ADMIN', 'SUPER_ADMIN') as unknown as RequestHandler, cargoCompanyController.deleteCargoCompany as RequestHandler);

export default router;

