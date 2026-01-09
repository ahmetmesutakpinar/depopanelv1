/**
 * HTTP Routes
 * 
 * Defines HTTP routes for the application.
 * 
 * Architecture:
 * - Interface layer only
 * - Routes map to controller methods
 * - Uses Express router
 * - Requires authentication middleware
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { marketplaceController } from './controllers/marketplace.controller.js';
import { ordersController } from './controllers/orders.controller.js';
import { stockController } from './controllers/stock.controller.js';
import { RequestHandler } from 'express';

/**
 * Create HTTP Routes
 * 
 * Sets up all HTTP routes for the application.
 * All routes require authentication.
 */
export function createHttpRoutes(): Router {
  const router = Router();

  // Apply authentication middleware to all routes
  router.use(authenticate as unknown as RequestHandler);

  // DISABLED v3.1 - API integrations hard reset
  // TODO: Re-enable when re-adding integrations from scratch
  // All marketplace/order/stock sync routes are disabled
  
  /**
   * Marketplace Routes - DISABLED
   */
  // router.post(
  //   '/marketplaces/:id/connect',
  //   marketplaceController.connect.bind(marketplaceController) as RequestHandler
  // );

  // router.post(
  //   '/marketplaces/:id/sync',
  //   marketplaceController.sync.bind(marketplaceController) as RequestHandler
  // );

  /**
   * Orders Routes - DISABLED
   */
  // router.post(
  //   '/orders/sync',
  //   ordersController.sync.bind(ordersController) as RequestHandler
  // );

  /**
   * Stock Routes - DISABLED
   */
  // router.post(
  //   '/stock/sync',
  //   stockController.sync.bind(stockController) as RequestHandler
  // );

  return router;
}

