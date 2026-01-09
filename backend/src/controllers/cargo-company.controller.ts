import { Response } from 'express';
import { z } from 'zod';
import { cargoCompanyService } from '../services/cargo-company.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { paginationSchema } from '../middleware/validation.middleware.js';
import { BaseController } from './base.controller.js';

const createCargoCompanySchema = z.object({
  name: z.string().min(2, 'Kargo firması adı gerekli'),
  code: z.string().min(2, 'Kargo firması kodu gerekli'),
  apiUrl: z.string().url().optional().or(z.literal('')),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  settings: z.record(z.any()).optional(),
});

const updateCargoCompanySchema = createCargoCompanySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const cargoCompanyQuerySchema = paginationSchema.extend({
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

class CargoCompanyController extends BaseController {
  getCargoCompanies = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = cargoCompanyQuerySchema.parse(req.query);

    const result = await cargoCompanyService.getCargoCompanies(this.getCompanyId(req), {
      page: query.page,
      limit: query.limit,
      isActive: query.isActive,
    });

    // Hide sensitive data
    const safeCompanies = result.companies.map(company => ({
      ...company,
      apiKey: company.apiKey ? '••••••••' : null,
      apiSecret: company.apiSecret ? '••••••••' : null,
    }));

    sendSuccess(res, 'Kargo firmaları listelendi', safeCompanies, 200, {
      page: query.page || 1,
      limit: query.limit || 20,
      total: result.total,
      totalPages: Math.ceil(result.total / (query.limit || 20)),
    });
  });

  getCargoCompany = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const company = await cargoCompanyService.getCargoCompanyById(
      req.params.id,
      this.getCompanyId(req)
    );
    
    sendSuccess(res, 'Kargo firması detayı', {
      ...company,
      apiKey: company.apiKey ? '••••••••' : null,
      apiSecret: company.apiSecret ? '••••••••' : null,
    });
  });

  createCargoCompany = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createCargoCompanySchema.parse(req.body);
    const company = await cargoCompanyService.createCargoCompany(this.getCompanyId(req), data);
    
    sendCreated(res, 'Kargo firması oluşturuldu', {
      ...company,
      apiKey: company.apiKey ? '••••••••' : null,
      apiSecret: company.apiSecret ? '••••••••' : null,
    });
  });

  updateCargoCompany = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateCargoCompanySchema.parse(req.body);
    const company = await cargoCompanyService.updateCargoCompany(
      req.params.id,
      this.getCompanyId(req),
      data
    );
    
    sendSuccess(res, 'Kargo firması güncellendi', {
      ...company,
      apiKey: company.apiKey ? '••••••••' : null,
      apiSecret: company.apiSecret ? '••••••••' : null,
    });
  });

  deleteCargoCompany = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await cargoCompanyService.deleteCargoCompany(req.params.id, this.getCompanyId(req));
    sendSuccess(res, 'Kargo firması silindi');
  });
}

export const cargoCompanyController = new CargoCompanyController();

