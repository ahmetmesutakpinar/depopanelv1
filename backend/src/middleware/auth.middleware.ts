import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env, prisma } from '../config/index.js';
import { sendUnauthorized, sendForbidden } from '../utils/response.js';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  companyId: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    permissions?: any;
    companyId: string;
    company: {
      id: string;
      name: string;
      status: string;
    };
  };
  context: {
    companyId: string;
    userId: string;
    role: UserRole;
    permissions?: string[];
  };
}

/**
 * JWT Token doğrulama middleware
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const { logger } = await import('../utils/logger.js');
      logger.warn('[authenticate] Token eksik', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      sendUnauthorized(res, 'Token gerekli');
      return;
    }

    const token = authHeader.split(' ')[1];

    if (!token || token.trim().length === 0) {
      const { logger } = await import('../utils/logger.js');
      logger.warn('[authenticate] Boş token', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      sendUnauthorized(res, 'Geçersiz token formatı');
      return;
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    } catch (jwtError: any) {
      const { logger } = await import('../utils/logger.js');
      
      if (jwtError instanceof jwt.TokenExpiredError) {
        logger.warn('[authenticate] Token süresi dolmuş', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          expiredAt: jwtError.expiredAt,
        });
        sendUnauthorized(res, 'Token süresi dolmuş');
        return;
      }
      
      if (jwtError instanceof jwt.JsonWebTokenError) {
        logger.warn('[authenticate] Geçersiz token', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          error: jwtError.message,
        });
        sendUnauthorized(res, 'Geçersiz token');
        return;
      }
      
      const errorMessage = jwtError instanceof Error ? jwtError.message : String(jwtError);
      const errorStack = jwtError instanceof Error ? jwtError.stack : undefined;
      logger.error('[authenticate] JWT doğrulama hatası', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: errorMessage,
        stack: errorStack,
      });
      sendUnauthorized(res, 'Token doğrulama hatası');
      return;
    }

    if (!decoded.userId) {
      const { logger } = await import('../utils/logger.js');
      logger.warn('[authenticate] Token içinde userId yok', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      sendUnauthorized(res, 'Geçersiz token içeriği');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
        isActive: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      const { logger } = await import('../utils/logger.js');
      logger.warn('[authenticate] Kullanıcı bulunamadı', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: decoded.userId,
      });
      sendUnauthorized(res, 'Kullanıcı bulunamadı');
      return;
    }

    if (!user.isActive) {
      const { logger } = await import('../utils/logger.js');
      logger.warn('[authenticate] Kullanıcı hesabı devre dışı', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: user.id,
        email: user.email,
      });
      sendUnauthorized(res, 'Hesabınız devre dışı');
      return;
    }

    // SUPER_ADMIN için company kontrolü yapma
    if (user.role !== 'SUPER_ADMIN') {
      if (!user.company) {
        const { logger } = await import('../utils/logger.js');
        logger.warn('[authenticate] Şirket bilgisi bulunamadı', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          userId: user.id,
          email: user.email,
          companyId: user.companyId,
        });
        sendForbidden(res, 'Şirket bilgisi bulunamadı');
        return;
      }
      if (user.company.status !== 'APPROVED') {
        const { logger } = await import('../utils/logger.js');
        logger.warn('[authenticate] Şirket hesabı onaylanmamış', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          userId: user.id,
          email: user.email,
          companyId: user.companyId,
          companyStatus: user.company.status,
        });
        sendForbidden(res, 'Şirket hesabınız henüz onaylanmamış');
        return;
      }
    }

    // SUPER_ADMIN için company null olabilir
    req.user = {
      ...user,
      company: user.company || {
        id: '',
        name: 'System',
        status: 'APPROVED',
      },
    };

    // Request context'e companyId, userId ve role ekle (multi-tenant güvenlik)
    req.context = {
      companyId: user.companyId || '',
      userId: user.id,
      role: user.role,
    };

    next();
  } catch (error: unknown) {
    const { logger } = await import('../utils/logger.js');
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('[authenticate] Beklenmeyen kimlik doğrulama hatası', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      error: errorMessage,
      stack: errorStack,
    });
    sendUnauthorized(res, 'Kimlik doğrulama hatası');
  }
}

/**
 * Role bazlı yetkilendirme middleware
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendUnauthorized(res, 'Kimlik doğrulaması gerekli');
      return;
    }

    // Flatten array in case it's nested (rest parameter creates nested array when called with array)
    const flatAllowedRoles = allowedRoles.flat().map(r => String(r).trim());
    const userRole = String(req.user.role).trim();

    if (!flatAllowedRoles.includes(userRole)) {
      sendForbidden(res, `Bu işlem için yetkiniz yok. Gerekli roller: ${flatAllowedRoles.join(', ')}, Sizin rolünüz: ${req.user.role}`);
      return;
    }

    next();
  };
}

/**
 * Super Admin kontrolü
 */
export function superAdminOnly(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    sendForbidden(res, 'Bu işlem sadece süper admin için');
    return;
  }
  next();
}

/**
 * Company bazlı erişim kontrolü
 */
export function companyAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    sendUnauthorized(res, 'Kimlik doğrulaması gerekli');
    return;
  }

  // Super admin tüm şirketlere erişebilir
  if (req.user.role === 'SUPER_ADMIN') {
    next();
    return;
  }

  // Diğer kullanıcılar sadece kendi şirketlerine erişebilir
  const companyId = req.params.companyId || req.body.companyId || req.query.companyId;

  if (companyId && companyId !== req.user.companyId) {
    sendForbidden(res, 'Bu şirkete erişim yetkiniz yok');
    return;
  }

  next();
}

/**
 * Permission bazlı erişim kontrolü (STAFF rolü için)
 */
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendUnauthorized(res, 'Kimlik doğrulaması gerekli');
      return;
    }

    // ADMIN ve SUPER_ADMIN tüm izinlere sahip
    if (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') {
      next();
      return;
    }

    // STAFF için permission kontrolü
    if (req.user.role === 'STAFF') {
      const userPermissions = req.user.permissions || {};
      
      if (!userPermissions[permission]) {
        sendForbidden(res, `Bu işlem için yetkiniz yok. Gerekli izin: ${permission}`);
        return;
      }
    }

    next();
  };
}

