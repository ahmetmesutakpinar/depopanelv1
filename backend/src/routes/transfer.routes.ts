import { Router, RequestHandler } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { transferController } from '../controllers/transfer.controller.js';

const router = Router();

// Tüm route'lar authentication gerektirir
router.use(authenticate as unknown as RequestHandler);

/**
 * @route   GET /api/transfers
 * @desc    Transferleri listele
 * @access  Private (ADMIN, STAFF)
 */
router.get(
  '/',
  authorize('ADMIN', 'STAFF') as unknown as RequestHandler,
  transferController.getTransfers as RequestHandler
);

/**
 * @route   GET /api/transfers/:id
 * @desc    Transfer detayı getir
 * @access  Private (ADMIN, STAFF)
 */
router.get(
  '/:id',
  authorize('ADMIN', 'STAFF') as unknown as RequestHandler,
  transferController.getTransferById as RequestHandler
);

/**
 * @route   POST /api/transfers
 * @desc    Yeni transfer oluştur
 * @access  Private (ADMIN, STAFF)
 */
router.post(
  '/',
  authorize('ADMIN', 'STAFF') as unknown as RequestHandler,
  transferController.createTransfer as RequestHandler
);

/**
 * @route   POST /api/transfers/:id/approve
 * @desc    Transfer onayla
 * @access  Private (ADMIN)
 */
router.post(
  '/:id/approve',
  authorize('ADMIN') as unknown as RequestHandler,
  transferController.approveTransfer as RequestHandler
);

/**
 * @route   POST /api/transfers/:id/complete
 * @desc    Transfer tamamla
 * @access  Private (ADMIN, STAFF)
 */
router.post(
  '/:id/complete',
  authorize('ADMIN', 'STAFF') as unknown as RequestHandler,
  transferController.completeTransfer as RequestHandler
);

/**
 * @route   POST /api/transfers/:id/cancel
 * @desc    Transfer iptal et
 * @access  Private (ADMIN)
 */
router.post(
  '/:id/cancel',
  authorize('ADMIN') as unknown as RequestHandler,
  transferController.cancelTransfer as RequestHandler
);

/**
 * @route   DELETE /api/transfers/:id
 * @desc    Transfer sil
 * @access  Private (ADMIN)
 */
router.delete(
  '/:id',
  authorize('ADMIN') as unknown as RequestHandler,
  transferController.deleteTransfer as RequestHandler
);

/**
 * @route   POST /api/transfers/:id/items
 * @desc    Transfer'a item ekle
 * @access  Private (ADMIN, STAFF)
 */
router.post(
  '/:id/items',
  authorize('ADMIN', 'STAFF') as unknown as RequestHandler,
  transferController.addItem as RequestHandler
);

/**
 * @route   PUT /api/transfers/:id/items/:itemId
 * @desc    Transfer item güncelle
 * @access  Private (ADMIN, STAFF)
 */
router.put(
  '/:id/items/:itemId',
  authorize('ADMIN', 'STAFF') as unknown as RequestHandler,
  transferController.updateItem as RequestHandler
);

/**
 * @route   DELETE /api/transfers/:id/items/:itemId
 * @desc    Transfer item sil
 * @access  Private (ADMIN, STAFF)
 */
router.delete(
  '/:id/items/:itemId',
  authorize('ADMIN', 'STAFF') as unknown as RequestHandler,
  transferController.deleteItem as RequestHandler
);

export default router;

