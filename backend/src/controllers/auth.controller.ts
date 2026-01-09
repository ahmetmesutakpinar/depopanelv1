import { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { strongPasswordSchema } from '../utils/password-validator.js';

// ==================== VALIDATION SCHEMAS ====================

export const registerSchema = z.object({
  // Company
  companyName: z.string().min(2, 'Şirket adı en az 2 karakter olmalı'),
  companyEmail: z.string().email('Geçerli bir şirket e-postası girin'),
  companyPhone: z.string().optional(),
  companyAddress: z.string().optional(),
  taxNumber: z.string().optional(),
  // User
  firstName: z.string().min(2, 'Ad en az 2 karakter olmalı'),
  lastName: z.string().min(2, 'Soyad en az 2 karakter olmalı'),
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: strongPasswordSchema,
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Şifre gerekli'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut şifre gerekli'),
  newPassword: strongPasswordSchema,
});

export const sendCodeSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  companyName: z.string().min(2, 'Şirket adı gerekli'),
});

export const verifyRegisterSchema = registerSchema.extend({
  verificationCode: z.string().length(6, 'Doğrulama kodu 6 haneli olmalı'),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(2, 'Ad en az 2 karakter olmalı').optional(),
  lastName: z.string().min(2, 'Soyad en az 2 karakter olmalı').optional(),
  phone: z.string().optional(),
});

// ==================== CONTROLLERS ====================

class AuthController {
  /**
   * POST /api/auth/send-verification-code
   * E-posta doğrulama kodu gönder
   */
  sendVerificationCode = asyncHandler(async (req: Request, res: Response) => {
    const data = sendCodeSchema.parse(req.body);
    const result = await authService.sendVerificationCode(data.email, data.companyName);

    sendSuccess(res, result.message);
  });

  /**
   * POST /api/auth/verify-register
   * Doğrulama koduyla kayıt tamamla
   */
  verifyAndRegister = asyncHandler(async (req: Request, res: Response) => {
    const data = verifyRegisterSchema.parse(req.body);
    const result = await authService.verifyAndRegister(data);

    sendCreated(res, 'Kayıt başarılı. Şirket hesabınız onay bekliyor.', result);
  });

  /**
   * POST /api/auth/register
   * Yeni şirket ve admin kullanıcı kaydı (legacy - dev only)
   */
  register = asyncHandler(async (req: Request, res: Response) => {
    const data = registerSchema.parse(req.body);
    const result = await authService.registerCompany(data);

    sendCreated(res, 'Kayıt başarılı. Şirket hesabınız onay bekliyor.', result);
  });

  /**
   * POST /api/auth/login
   * Kullanıcı girişi
   */
  login = asyncHandler(async (req: Request, res: Response) => {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data);

    sendSuccess(res, 'Giriş başarılı', result);
  });

  /**
   * GET /api/auth/profile
   * Mevcut kullanıcı profili
   */
  getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const profile = await authService.getProfile(req.user.id);

    sendSuccess(res, 'Profil bilgileri', profile);
  });

  /**
   * PUT /api/auth/profile
   * Profil güncelleme
   */
  updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateProfileSchema.parse(req.body);
    const profile = await authService.updateProfile(req.user.id, data);

    sendSuccess(res, 'Profil güncellendi', profile);
  });

  /**
   * POST /api/auth/change-password
   * Şifre değiştirme
   */
  changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user.id, data.currentPassword, data.newPassword);

    sendSuccess(res, 'Şifre başarıyla değiştirildi');
  });

  /**
   * GET /api/auth/me
   * Token kontrolü ve kullanıcı bilgisi
   */
  me = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    sendSuccess(res, 'Kullanıcı bilgileri', {
      user: req.user,
    });
  });

  /**
   * POST /api/auth/refresh
   * Token yenileme
   */
  refresh = asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Token gerekli');
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new Error('Token gerekli');
    }

    const result = await authService.refreshToken(token);
    sendSuccess(res, 'Token yenilendi', result);
  });
}

export const authController = new AuthController();

