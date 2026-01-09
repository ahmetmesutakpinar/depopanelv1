import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { transferService, CreateTransferInput } from '../services/transfer.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { TransferStatus } from '@prisma/client';
import { BaseController } from './base.controller.js';

export class TransferController extends BaseController {
  /**
   * GET /api/transfers
   * Transferleri listele
   */
  getTransfers = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as TransferStatus | undefined;
    const fromWarehouseId = req.query.fromWarehouseId as string | undefined;
    const toWarehouseId = req.query.toWarehouseId as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await transferService.getTransfers(companyId, {
      page,
      limit,
      status,
      fromWarehouseId,
      toWarehouseId,
      search,
    });

    sendSuccess(res, 'Transferler listelendi', result.transfers, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / result.limit),
    });
  });

  /**
   * GET /api/transfers/:id
   * Transfer detayı getir
   */
  getTransferById = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const { id } = req.params;

    const transfer = await transferService.getTransferById(id, companyId);

    sendSuccess(res, 'Transfer detayı getirildi', transfer);
  });

  /**
   * POST /api/transfers
   * Yeni transfer oluştur
   */
  createTransfer = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);

    const data = req.body as CreateTransferInput;
    const transfer = await transferService.createTransfer(data, companyId, userId);

    sendCreated(res, 'Transfer oluşturuldu', transfer);
  });

  /**
   * POST /api/transfers/:id/approve
   * Transfer onayla
   */
  approveTransfer = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const { id } = req.params;

    const transfer = await transferService.approveTransfer(id, companyId, userId);

    sendSuccess(res, 'Transfer onaylandı', transfer);
  });

  /**
   * POST /api/transfers/:id/complete
   * Transfer tamamla
   */
  completeTransfer = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const { id } = req.params;

    const transfer = await transferService.completeTransfer(id, companyId, userId);

    sendSuccess(res, 'Transfer tamamlandı', transfer);
  });

  /**
   * POST /api/transfers/:id/cancel
   * Transfer iptal et
   */
  cancelTransfer = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    const transfer = await transferService.cancelTransfer(id, companyId, reason);

    sendSuccess(res, 'Transfer iptal edildi', transfer);
  });

  /**
   * DELETE /api/transfers/:id
   * Transfer sil
   */
  deleteTransfer = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const { id } = req.params;

    await transferService.deleteTransfer(id, companyId);

    sendSuccess(res, 'Transfer silindi');
  });

  /**
   * POST /api/transfers/:id/items
   * Transfer'a item ekle
   */
  addItem = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const { id } = req.params;

    const item = req.body as {
      productId: string;
      variantId?: string;
      quantity: number;
      notes?: string;
    };
    await transferService.addItem(id, companyId, item);

    sendSuccess(res, 'Ürün eklendi');
  });

  /**
   * PUT /api/transfers/:id/items/:itemId
   * Transfer item güncelle
   */
  updateItem = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const { id, itemId } = req.params;

    const data = req.body as {
      quantity?: number;
      notes?: string;
    };
    await transferService.updateItem(id, itemId, companyId, data);

    sendSuccess(res, 'Ürün güncellendi');
  });

  /**
   * DELETE /api/transfers/:id/items/:itemId
   * Transfer item sil
   */
  deleteItem = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const { id, itemId } = req.params;

    await transferService.deleteItem(id, itemId, companyId);

    sendSuccess(res, 'Ürün silindi');
  });
}

export const transferController = new TransferController();

