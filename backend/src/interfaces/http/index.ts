/**
 * HTTP Interface Layer
 * 
 * HTTP controllers and routes for the application.
 * 
 * Architecture:
 * - Interface layer (Clean Architecture)
 * - Controllers are thin (no business logic)
 * - Validates requests
 * - Maps DTOs to use case input
 * - Calls use cases or enqueues jobs
 * - Maps domain errors to HTTP responses
 * 
 * Structure:
 * - controllers/ - HTTP controllers
 * - routes.ts - Route definitions
 * - error-mapper.ts - Domain error to HTTP mapping
 * - request-context.ts - Request context extraction
 * 
 * Usage:
 * ```ts
 * import { createHttpRoutes } from './interfaces/http/index.js';
 * 
 * const router = createHttpRoutes();
 * app.use('/api', router);
 * ```
 */

// Controllers
export { MarketplaceController, marketplaceController } from './controllers/marketplace.controller.js';
export { OrdersController, ordersController } from './controllers/orders.controller.js';
export { StockController, stockController } from './controllers/stock.controller.js';

// Routes
export { createHttpRoutes } from './routes.js';

// Error Mapper
export {
  mapDomainErrorToHttpStatus,
  mapErrorToHttpResponse,
  sendErrorResponse,
  type HttpErrorResponse,
} from './error-mapper.js';

// Request Context
export { extractRequestContext, type RequestContext } from './request-context.js';

