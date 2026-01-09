import { Response } from 'express';
import { userService } from '../services/user.service.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ForbiddenError } from '../middleware/error.middleware.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { BaseController } from './base.controller.js';

// ==================== VALIDATION SCHEMAS ====================

const createUserSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
  firstName: z.string().min(2, 'Ad en az 2 karakter olmalı'),
  lastName: z.string().min(2, 'Soyad en az 2 karakter olmalı'),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'STAFF', 'SUPER_ADMIN']).optional(),
  permissions: z.record(z.boolean()).optional(),
  companyId: z.string().uuid().optional(), // For SUPER_ADMIN only
});

const updateUserSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  phone: z.string().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'STAFF', 'SUPER_ADMIN']).optional(),
  isActive: z.boolean().optional(),
  permissions: z.record(z.boolean()).optional(),
  email: z.string().email('Geçerli bir e-posta adresi girin').optional(), // For SUPER_ADMIN only
  companyId: z.string().uuid().optional(), // For SUPER_ADMIN only
});

// ==================== CONTROLLER ====================

class UserController extends BaseController {
  /**
   * GET /api/users
   * Şirket kullanıcılarını listele (Admin only)
   */
  getUsers = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {

    const { page, limit, search, role, isActive } = req.query;

    const result = await userService.getUsers(req.user, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search: search as string | undefined,
      role: role as any,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });

    sendSuccess(res, 'Kullanıcılar listelendi', result.users, 200, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      total: result.total,
      totalPages: Math.ceil(result.total / (limit ? Number(limit) : 20)),
    });
  });

  /**
   * GET /api/users/:id
   * Kullanıcı detayı
   */
  getUser = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new ForbiddenError('Kimlik doğrulaması gerekli');
    }

    const user = await userService.getUserById(req.params.id, req.user);
    sendSuccess(res, 'Kullanıcı bulundu', user);
  });

  /**
   * POST /api/users
   * Yeni kullanıcı oluştur (Admin only - e-posta doğrulama gerekmez)
   */
  createUser = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new ForbiddenError('Kimlik doğrulaması gerekli');
    }

    const data = createUserSchema.parse(req.body);
    const user = await userService.createUser(data, req.user);

    sendCreated(res, 'Kullanıcı oluşturuldu', user);
  });

  /**
   * PUT /api/users/:id
   * Kullanıcı güncelle
   */
  updateUser = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new ForbiddenError('Kimlik doğrulaması gerekli');
    }

    const data = updateUserSchema.parse(req.body);
    const user = await userService.updateUser(req.params.id, data, req.user);

    sendSuccess(res, 'Kullanıcı güncellendi', user);
  });

  /**
   * DELETE /api/users/:id
   * Kullanıcı sil
   */
  deleteUser = this.asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new ForbiddenError('Kimlik doğrulaması gerekli');
    }

    await userService.deleteUser(req.params.id, req.user);
    sendSuccess(res, 'Kullanıcı silindi');
  });
}

export const userController = new UserController();
