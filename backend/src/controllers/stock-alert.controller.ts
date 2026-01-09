import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { stockAlertService } from '../services/stock-alert.service.js';
import { sendSuccess } from '../utils/response.js';
import { BaseController } from './base.controller.js';

export class StockAlertController extends BaseController {
  /**
   * GET /api/stock-alerts
   * Şirket için düşük stok uyarılarını getir
   */
  getCompanyAlerts = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);

    const summary = await stockAlertService.checkCompanyStock(companyId);

    sendSuccess(res, 'Stok uyarıları getirildi', summary);
  });

  /**
   * GET /api/stock-alerts/warehouse/:warehouseId
   * Belirli bir depo için düşük stok uyarıları
   */
  getWarehouseAlerts = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);
    const { warehouseId } = req.params;

    const alerts = await stockAlertService.getWarehouseLowStock(warehouseId, companyId);

    sendSuccess(res, 'Depo stok uyarıları getirildi', alerts);
  });

  /**
   * GET /api/stock-alerts/widget
   * Dashboard widget verisi
   */
  getWidget = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const companyId = this.getCompanyId(req);

    const widget = await stockAlertService.getCriticalStockWidget(companyId);

    sendSuccess(res, 'Kritik stok widget verisi getirildi', widget);
  });
}

export const stockAlertController = new StockAlertController();

