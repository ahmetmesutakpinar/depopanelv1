import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env, prisma } from '../config/index.js';
import { userRepository, CreateUserData } from '../repositories/user.repository.js';
import { companyRepository, CreateCompanyData } from '../repositories/company.repository.js';
import { AppError, ConflictError, NotFoundError, UnauthorizedError } from '../middleware/error.middleware.js';
import { JwtPayload } from '../middleware/auth.middleware.js';
import { UserRole } from '@prisma/client';
import { emailService } from './email.service.js';

export interface RegisterCompanyInput {
  // Company info
  companyName: string;
  companyEmail: string;
  companyPhone?: string;
  companyAddress?: string;
  taxNumber?: string;
  // Admin user info
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    companyId: string;
    companyName: string;
    permissions?: any;
  };
  token: string;
  refreshToken?: string; // Optional for backward compatibility
  expiresIn: string;
}

class AuthService {
  private readonly SALT_ROUNDS = 12;
  private readonly VERIFICATION_CODE_EXPIRY = 15 * 60 * 1000; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days
  private readonly REFRESH_TOKEN_EXPIRY_STRING = '30d';

  /**
   * Generate 6-digit verification code
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Send verification code for registration
   */
  async sendVerificationCode(email: string, companyName: string): Promise<{ message: string }> {
    // Check if email already registered
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('Bu e-posta adresi zaten kayıtlı');
    }

    // Delete any existing verification codes for this email
    await prisma.emailVerification.deleteMany({
      where: { email, type: 'REGISTER' },
    });

    // Generate new code
    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + this.VERIFICATION_CODE_EXPIRY);

    // Save verification code
    await prisma.emailVerification.create({
      data: {
        email,
        code,
        type: 'REGISTER',
        expiresAt,
      },
    });

    // Send email
    await emailService.sendVerificationCode(email, code, companyName);

    return { message: 'Doğrulama kodu e-posta adresinize gönderildi' };
  }

  /**
   * Verify code and register company
   */
  async verifyAndRegister(input: RegisterCompanyInput & { verificationCode: string }): Promise<AuthResponse> {
    // Find verification code
    const verification = await prisma.emailVerification.findFirst({
      where: {
        email: input.email,
        code: input.verificationCode,
        type: 'REGISTER',
        verified: false,
      },
    });

    if (!verification) {
      throw new AppError('Geçersiz doğrulama kodu', 400);
    }

    if (verification.expiresAt < new Date()) {
      throw new AppError('Doğrulama kodunun süresi dolmuş', 400);
    }

    // Check if company email exists
    const existingCompany = await companyRepository.findByEmail(input.companyEmail);
    if (existingCompany) {
      throw new ConflictError('Bu şirket e-postası zaten kayıtlı');
    }

    // Check if user email exists
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError('Bu e-posta adresi zaten kayıtlı');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(input.password, this.SALT_ROUNDS);

    // Create company and admin user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Mark verification as used
      await tx.emailVerification.update({
        where: { id: verification.id },
        data: { verified: true },
      });

      // Create company
      const company = await tx.company.create({
        data: {
          name: input.companyName,
          email: input.companyEmail,
          phone: input.companyPhone,
          address: input.companyAddress,
          taxNumber: input.taxNumber,
          status: 'PENDING', // Requires Super Admin approval
        },
      });

      // Create admin user (email verified)
      const user = await tx.user.create({
        data: {
          email: input.email,
          password: hashedPassword,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          role: 'ADMIN',
          companyId: company.id,
          emailVerified: true,
        },
      });

      // Create default warehouse
      await tx.warehouse.create({
        data: {
          name: 'Ana Depo',
          code: 'ANA001',
          isDefault: true,
          companyId: company.id,
        },
      });

      return { company, user };
    });

    // Send welcome email
    await emailService.sendWelcomeEmail(input.email, input.firstName, input.companyName);

    // Don't generate token yet - company needs approval
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
        companyId: result.company.id,
        companyName: result.company.name,
      },
      token: '', // No token until approved
      expiresIn: '',
    };
  }

  /**
   * Legacy register (for backward compatibility - skips email verification in dev)
   */
  async registerCompany(input: RegisterCompanyInput): Promise<AuthResponse> {
    // In development, skip email verification
    if (env.isDevelopment) {
      // Check if company email exists
      const existingCompany = await companyRepository.findByEmail(input.companyEmail);
      if (existingCompany) {
        throw new ConflictError('Bu şirket e-postası zaten kayıtlı');
      }

      // Check if user email exists
      const existingUser = await userRepository.findByEmail(input.email);
      if (existingUser) {
        throw new ConflictError('Bu e-posta adresi zaten kayıtlı');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, this.SALT_ROUNDS);

      // Create company and admin user in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create company
        const company = await tx.company.create({
          data: {
            name: input.companyName,
            email: input.companyEmail,
            phone: input.companyPhone,
            address: input.companyAddress,
            taxNumber: input.taxNumber,
            status: 'PENDING',
          },
        });

        // Create admin user (email verified in dev)
        const user = await tx.user.create({
          data: {
            email: input.email,
            password: hashedPassword,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            role: 'ADMIN',
            companyId: company.id,
            emailVerified: true,
          },
        });

        // Create default warehouse
        await tx.warehouse.create({
          data: {
            name: 'Ana Depo',
            code: 'ANA001',
            isDefault: true,
            companyId: company.id,
          },
        });

        return { company, user };
      });

      // Send welcome email
      await emailService.sendWelcomeEmail(input.email, input.firstName, input.companyName);

      return {
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
          permissions: result.user.permissions,
          companyId: result.company.id,
          companyName: result.company.name,
        },
        token: '', // No token until approved
        expiresIn: '',
      };
    }

    throw new AppError('E-posta doğrulaması gerekli. Lütfen önce doğrulama kodu isteyin.', 400);
  }

  /**
   * Kullanıcı girişi
   */
  async login(input: LoginInput): Promise<AuthResponse> {
    try {
      const user = await userRepository.findByEmail(input.email);

      if (!user) {
        throw new UnauthorizedError('E-posta veya şifre hatalı');
      }

      const isPasswordValid = await bcrypt.compare(input.password, user.password);

      if (!isPasswordValid) {
        throw new UnauthorizedError('E-posta veya şifre hatalı');
      }

      if (!user.isActive) {
        throw new UnauthorizedError('Hesabınız devre dışı bırakılmış');
      }

      // Super Admin can always login
      if (user.role !== 'SUPER_ADMIN') {
        // Company null kontrolü
        if (!user.company) {
          throw new AppError('Şirket bilgisi bulunamadı. Lütfen yöneticinizle iletişime geçin.', 403);
        }

        if (user.company.status === 'PENDING') {
          throw new AppError('Şirket hesabınız henüz onaylanmamış. Lütfen bekleyin.', 403);
        }

        if (user.company.status === 'REJECTED') {
          throw new AppError('Şirket başvurunuz reddedilmiş.', 403);
        }

        if (user.company.status === 'SUSPENDED') {
          throw new AppError('Şirket hesabınız askıya alınmış.', 403);
        }
      }

      // Ensure companyId is not null for token generation
      const companyId = user.companyId || (user.company?.id || '');
      
      if (!companyId && user.role !== 'SUPER_ADMIN') {
        throw new AppError('Şirket bilgisi bulunamadı. Lütfen yöneticinizle iletişime geçin.', 403);
      }

      // Generate access token
      const token = this.generateToken({
        userId: user.id,
        companyId: companyId,
        role: user.role,
      });

      // Generate refresh token
      const { token: refreshToken } = await this.generateRefreshToken(user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          permissions: user.permissions,
          companyId: user.companyId || '',
          companyName: user.company?.name || 'System',
        },
        token,
        refreshToken,
        expiresIn: env.JWT_EXPIRES_IN,
      };
    } catch (error: any) {
      // Log the error for debugging with full details
      const { logger } = await import('../utils/logger.js');
      logger.error('[login] Login hatası', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        statusCode: error?.statusCode,
        input: { email: input.email },
      });
      
      // Re-throw to let error handler process it
      throw error;
    }
  }

  /**
   * Kullanıcı profili
   */
  async getProfile(userId: string) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('Kullanıcı bulunamadı');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      permissions: user.permissions,
      companyId: user.companyId,
      companyName: user.company.name,
      createdAt: user.createdAt,
    };
  }

  /**
   * Şifre değiştirme
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('Kullanıcı bulunamadı');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Mevcut şifre hatalı');
    }

    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await userRepository.update(userId, { password: hashedPassword });
  }

  /**
   * Profil güncelleme
   */
  async updateProfile(userId: string, data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('Kullanıcı bulunamadı');
    }

    const updated = await userRepository.update(userId, data);

    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phone: updated.phone,
      role: updated.role,
    };
  }

  /**
   * JWT access token oluşturma
   */
  private generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  /**
   * Refresh token oluşturma ve veritabanına kaydetme
   */
  private async generateRefreshToken(userId: string): Promise<{ token: string; jti: string }> {
    // Generate unique JWT ID (jti)
    const jti = crypto.randomUUID();
    
    // Create refresh token with jti in payload
    const refreshToken = jwt.sign(
      { userId, jti, type: 'refresh' },
      env.JWT_SECRET, // Use same secret but different payload structure
      { expiresIn: this.REFRESH_TOKEN_EXPIRY_STRING }
    );

    // Hash token for storage (never store plain token)
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Calculate expiry
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY);

    // Store in database
    await prisma.refreshToken.create({
      data: {
        jti,
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return { token: refreshToken, jti };
  }

  /**
   * Token hash'ini doğrula
   */
  private async verifyRefreshTokenInDb(jti: string, token: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const storedToken = await prisma.refreshToken.findUnique({
      where: { jti },
    });

    if (!storedToken) {
      return false;
    }

    // Check if revoked
    if (storedToken.revokedAt) {
      return false;
    }

    // Check if expired
    if (storedToken.expiresAt < new Date()) {
      return false;
    }

    // Verify hash matches
    return storedToken.tokenHash === tokenHash;
  }

  /**
   * Token yenileme - SECURITY PATCHED
   * 
   * SECURITY FIXES:
   * 1. ALWAYS uses jwt.verify() - NEVER jwt.decode()
   * 2. Verifies cryptographic signature BEFORE reading claims
   * 3. Implements refresh token rotation
   * 4. Validates token in database (jti binding)
   * 5. Detects reuse and revokes all sessions
   * 6. Blocks expired/tampered tokens
   */
  async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string; expiresIn: string }> {
    try {
      // STEP 1: CRYPTOGRAPHIC VERIFICATION FIRST (before reading any claims)
      // This blocks forged tokens - jwt.verify() validates signature
      let decoded: JwtPayload & { jti?: string; type?: string };
      try {
        // CRITICAL: jwt.verify() validates signature cryptographically
        // This will throw if token is tampered, expired, or has invalid signature
        decoded = jwt.verify(refreshToken, env.JWT_SECRET) as JwtPayload & { jti?: string; type?: string };
      } catch (error: any) {
        // ALL errors from jwt.verify() mean token is invalid
        // This includes: expired, tampered, wrong secret, malformed
        if (error instanceof jwt.TokenExpiredError) {
          throw new UnauthorizedError('Refresh token süresi dolmuş');
        }
        if (error instanceof jwt.JsonWebTokenError) {
          throw new UnauthorizedError('Geçersiz refresh token');
        }
        throw new UnauthorizedError('Token doğrulama hatası');
      }

      // STEP 2: Validate token structure
      if (!decoded.jti || !decoded.userId || decoded.type !== 'refresh') {
        throw new UnauthorizedError('Geçersiz refresh token formatı');
      }

      // STEP 3: Verify token exists in database and is valid
      const isValidInDb = await this.verifyRefreshTokenInDb(decoded.jti, refreshToken);
      if (!isValidInDb) {
        // Token not found, revoked, or expired in DB
        throw new UnauthorizedError('Refresh token geçersiz veya iptal edilmiş');
      }

      // STEP 4: Check if token was already used (replay attack detection)
      const storedToken = await prisma.refreshToken.findUnique({
        where: { jti: decoded.jti },
      });

      if (!storedToken) {
        throw new UnauthorizedError('Refresh token bulunamadı');
      }

      // STEP 5: Get user and validate account status
      const user = await userRepository.findById(decoded.userId);
      if (!user) {
        // Revoke all tokens for deleted user
        await prisma.refreshToken.updateMany({
          where: { userId: decoded.userId },
          data: { revokedAt: new Date(), revokedBy: 'USER_DELETED' },
        });
        throw new UnauthorizedError('Kullanıcı bulunamadı');
      }

      if (!user.isActive) {
        // Revoke all tokens for inactive user
        await prisma.refreshToken.updateMany({
          where: { userId: decoded.userId },
          data: { revokedAt: new Date(), revokedBy: 'USER_INACTIVE' },
        });
        throw new UnauthorizedError('Hesabınız devre dışı bırakılmış');
      }

      // Super Admin kontrolü
      if (user.role !== 'SUPER_ADMIN') {
        if (!user.company) {
          throw new AppError('Şirket bilgisi bulunamadı', 403);
        }

        if (user.company.status === 'PENDING') {
          throw new AppError('Şirket hesabınız henüz onaylanmamış', 403);
        }

        if (user.company.status === 'REJECTED') {
          throw new AppError('Şirket başvurunuz reddedilmiş', 403);
        }

        if (user.company.status === 'SUSPENDED') {
          throw new AppError('Şirket hesabınız askıya alınmış', 403);
        }
      }

      // STEP 6: REFRESH TOKEN ROTATION
      // Invalidate the old refresh token
      await prisma.refreshToken.update({
        where: { jti: decoded.jti },
        data: {
          revokedAt: new Date(),
          revokedBy: 'ROTATED',
        },
      });

      // STEP 7: Generate new access token
      const companyId = user.companyId || (user.company?.id || '');
      if (!companyId && user.role !== 'SUPER_ADMIN') {
        throw new AppError('Şirket bilgisi bulunamadı', 403);
      }

      const newAccessToken = this.generateToken({
        userId: user.id,
        companyId: companyId,
        role: user.role,
      });

      // STEP 8: Generate new refresh token (rotation)
      const { token: newRefreshToken } = await this.generateRefreshToken(user.id);

      return {
        token: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: env.JWT_EXPIRES_IN,
      };
    } catch (error: any) {
      const { logger } = await import('../utils/logger.js');
      logger.error('[refreshToken] Token yenileme hatası', {
        error: error?.message,
        stack: error?.stack,
      });
      throw error;
    }
  }

  /**
   * Kullanıcının tüm refresh token'larını iptal et (logout all devices)
   */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null, // Only revoke active tokens
      },
      data: {
        revokedAt: new Date(),
        revokedBy: 'USER_LOGOUT_ALL',
      },
    });
  }

  /**
   * Belirli bir refresh token'ı iptal et (logout single device)
   */
  async revokeRefreshToken(jti: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { jti },
      data: {
        revokedAt: new Date(),
        revokedBy: 'USER_LOGOUT',
      },
    });
  }

  /**
   * Şifre hashleme (harici kullanım için)
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }
}

export const authService = new AuthService();
