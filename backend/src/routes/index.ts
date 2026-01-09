import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import adminRoutes from './admin.routes.js';
import warehouseRoutes from './warehouse.routes.js';
import productRoutes from './product.routes.js';
import stockRoutes from './stock.routes.js';
import orderRoutes from './order.routes.js';
import integrationRoutes from './integration.routes.js';
import locationRoutes from './location.routes.js';
import inventoryCountRoutes from './inventory-count.routes.js';
import pickingWaveRoutes from './picking-wave.routes.js';
import cargoCompanyRoutes from './cargo-company.routes.js';
import returnRoutes from './return.routes.js';
import campaignSetRoutes from './campaign-set.routes.js';
import productSetRoutes from './product-set.routes.js';
import healthRoutes from './health.routes.js';
import transferRoutes from './transfer.routes.js';
import stockAlertRoutes from './stock-alert.routes.js';
import metricsRoutes from './metrics.routes.js';
import observabilityRoutes from './observability.routes.js';

const router = Router();

// Health check routes (public, no auth required)
router.use(healthRoutes);

// Metrics routes (public, can be restricted in production)
router.use('/metrics', metricsRoutes);

// Observability routes (private)
router.use('/observability', observabilityRoutes);

// API routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/warehouses', warehouseRoutes);
router.use('/products', productRoutes);
router.use('/stocks', stockRoutes);
router.use('/orders', orderRoutes);
router.use('/integrations', integrationRoutes);
router.use('/locations', locationRoutes);
router.use('/inventory-counts', inventoryCountRoutes);
router.use('/picking-waves', pickingWaveRoutes);
router.use('/cargo-companies', cargoCompanyRoutes);
router.use('/returns', returnRoutes);
router.use('/campaign-sets', campaignSetRoutes);
router.use('/sets', productSetRoutes);
router.use('/transfers', transferRoutes);
router.use('/stock-alerts', stockAlertRoutes);

export default router;

