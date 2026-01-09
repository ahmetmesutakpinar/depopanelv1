import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
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
  expiresIn: string;
}

class AuthService {
  private readonly SALT_ROUNDS = 12;
  private readonly VERIFICATION_CODE_EXPIRY = 15 * 60 * 1000; // 15 minutes

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

      const token = this.generateToken({
        userId: user.id,
        companyId: companyId,
        role: user.role,
      });

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
   * JWT token oluşturma
   */
  private generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  /**
   * Token yenileme
   * Mevcut token'ı decode edip, kullanıcı hala aktifse yeni token oluşturur
   */
  async refreshToken(token: string): Promise<{ token: string; expiresIn: string }> {
    try {
      // Token'ı decode et (expired olsa bile decode edilebilir)
      let decoded: JwtPayload;
      try {
        decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      } catch (error: any) {
        // Token expired veya invalid
        if (error instanceof jwt.TokenExpiredError) {
          // Expired token's signature MUST be verified. This is the fix.
          decoded = jwt.verify(token, env.JWT_SECRET, { ignoreExpiration: true }) as JwtPayload;
          if (!decoded || !decoded.userId) {
            throw new UnauthorizedError('Geçersiz token');
          }
        } else {
          throw new UnauthorizedError('Geçersiz token');
        }
      }

      // Kullanıcıyı kontrol et
      const user = await userRepository.findById(decoded.userId);
      if (!user) {
        throw new UnauthorizedError('Kullanıcı bulunamadı');
      }

      if (!user.isActive) {
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

      // Yeni token oluştur
      const companyId = user.companyId || (user.company?.id || '');
      if (!companyId && user.role !== 'SUPER_ADMIN') {
        throw new AppError('Şirket bilgisi bulunamadı', 403);
      }

      const newToken = this.generateToken({
        userId: user.id,
        companyId: companyId,
        role: user.role,
      });

      return {
        token: newToken,
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
   * Şifre hashleme (harici kullanım için)
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }
}

export const authService = new AuthService();
