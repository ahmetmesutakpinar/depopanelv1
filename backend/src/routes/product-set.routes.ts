import { Router, RequestHandler } from 'express';
import { productSetController } from '../controllers/product-set.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  createSetSchema,
  updateSetSchema,
  packSetSchema,
  returnSetSchema,
  pickSetSchema,
} from '../controllers/product-set.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate as unknown as RequestHandler);

/**
 * GET /api/sets
 * SET listesi
 */
router.get('/', productSetController.getSets as RequestHandler);

/**
 * GET /api/sets/:id
 * SET detayı
 */
router.get('/:id', productSetController.getSetById as RequestHandler);

/**
 * GET /api/sets/sku/:sku
 * SET SKU ile getir
 */
router.get('/sku/:sku', productSetController.getSetBySku as RequestHandler);

/**
 * POST /api/sets
 * SET oluştur
 */
router.post(
  '/',
  validateBody(createSetSchema),
  productSetController.createSet as RequestHandler
);

/**
 * PUT /api/sets/:id
 * SET güncelle
 */
router.put(
  '/:id',
  validateBody(updateSetSchema),
  productSetController.updateSet as RequestHandler
);

/**
 * DELETE /api/sets/:id
 * SET sil
 */
router.delete('/:id', productSetController.deleteSet as RequestHandler);

/**
 * POST /api/sets/:id/pick
 * SET picking algoritması
 */
router.post(
  '/:id/pick',
  validateBody(pickSetSchema),
  productSetController.pickSet as RequestHandler
);

/**
 * POST /api/sets/pack
 * SET paketleme/üretim
 */
router.post(
  '/pack',
  validateBody(packSetSchema),
  productSetController.packSet as RequestHandler
);

/**
 * POST /api/sets/return
 * SET iadesi
 */
router.post(
  '/return',
  validateBody(returnSetSchema),
  productSetController.returnSet as RequestHandler
);

export default router;

