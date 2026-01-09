import { userRepository, CreateUserData, UpdateUserData } from '../repositories/user.repository.js';
import { companyRepository } from '../repositories/company.repository.js';
import { AppError, NotFoundError, ForbiddenError, ConflictError } from '../middleware/error.middleware.js';
import { strongPasswordSchema } from '../utils/password-validator.js';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: UserRole;
  permissions?: Record<string, boolean>;
  companyId?: string; // For SUPER_ADMIN to create users for any company
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
  permissions?: Record<string, boolean>;
  email?: string; // For SUPER_ADMIN only
  companyId?: string; // For SUPER_ADMIN only
}

export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: UserRole;
  permissions?: any;
  isActive: boolean;
  companyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

class UserService {
  /**
   * Get users by company (with permission checks)
   */
  async getUsers(
    currentUser: { companyId: string; role: UserRole },
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      role?: UserRole;
      isActive?: boolean;
    }
  ): Promise<{ users: UserResponse[]; total: number }> {
    // Only ADMIN can list users
    if (currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Bu işlem için yetkiniz yok');
    }

    // Super Admin can see all users, Admin only their company
    const queryCompanyId = currentUser.role === 'SUPER_ADMIN' ? undefined : currentUser.companyId;

    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    const { users, total } = await userRepository.findByCompany(queryCompanyId, {
      skip,
      take,
      search: options?.search,
      role: options?.role,
      isActive: options?.isActive,
    });

    // Remove passwords from response
    const sanitizedUsers: UserResponse[] = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      permissions: user.permissions,
      isActive: user.isActive,
      companyId: user.companyId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    return { users: sanitizedUsers, total };
  }

  /**
   * Get user by ID (with permission checks)
   */
  async getUserById(
    id: string,
    currentUser: { companyId: string; role: UserRole }
  ): Promise<UserResponse> {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new NotFoundError('Kullanıcı bulunamadı');
    }

    // Check company isolation (Super Admin can see all)
    if (user.companyId !== currentUser.companyId && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Bu kullanıcıya erişim yetkiniz yok');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      permissions: user.permissions,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Create user (with permission checks and validation)
   */
  async createUser(
    input: CreateUserInput,
    currentUser: { companyId: string; role: UserRole; id: string }
  ): Promise<UserResponse> {
    // Only ADMIN can create users
    if (currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Kullanıcı oluşturma yetkiniz yok');
    }

    // Check if email exists
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError('Bu e-posta adresi zaten kullanılıyor');
    }

    // Admin cannot create SUPER_ADMIN
    if (input.role === 'SUPER_ADMIN' && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Süper Admin oluşturma yetkiniz yok');
    }

    // Admin cannot create another ADMIN (only STAFF)
    if (input.role === 'ADMIN' && currentUser.role === 'ADMIN') {
      throw new ForbiddenError('Sadece personel oluşturabilirsiniz');
    }

    // Super Admin can create users for any company, Admin only for their company
    const targetCompanyId = currentUser.role === 'SUPER_ADMIN' && input.companyId
      ? input.companyId
      : currentUser.companyId;

    // Validate password strength
    const passwordValidation = strongPasswordSchema.safeParse(input.password);
    if (!passwordValidation.success) {
      throw new AppError(
        passwordValidation.error.errors.map(e => e.message).join(', '),
        400
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(input.password, 12);

    const createData: CreateUserData = {
      email: input.email,
      password: hashedPassword,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      role: input.role || 'STAFF',
      permissions: input.role === 'STAFF' ? input.permissions : null, // Only STAFF needs permissions
      companyId: targetCompanyId,
      isActive: true, // Admin creates active users (no email verification needed)
    };

    const user = await userRepository.create(createData);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      permissions: user.permissions,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Update user (with permission checks and validation)
   */
  async updateUser(
    id: string,
    input: UpdateUserInput,
    currentUser: { companyId: string; role: UserRole; id: string }
  ): Promise<UserResponse> {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new NotFoundError('Kullanıcı bulunamadı');
    }

    // Check company isolation
    if (user.companyId !== currentUser.companyId && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Bu kullanıcıya erişim yetkiniz yok');
    }

    // Only ADMIN can update other users (users can update themselves)
    if (id !== currentUser.id && currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Başka kullanıcıları düzenleme yetkiniz yok');
    }

    // Cannot change SUPER_ADMIN role
    if (user.role === 'SUPER_ADMIN' && currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Süper Admin düzenleme yetkiniz yok');
    }

    // Prepare update data
    const updateData: UpdateUserData = {};
    if (input.firstName) updateData.firstName = input.firstName;
    if (input.lastName) updateData.lastName = input.lastName;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.isActive !== undefined && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN')) {
      updateData.isActive = input.isActive;
    }

    // Email change (only SUPER_ADMIN can change email)
    if (input.email !== undefined) {
      if (currentUser.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('E-posta değiştirme yetkiniz yok');
      }
      
      // Check if email is already taken by another user
      if (input.email !== user.email) {
        const emailExists = await userRepository.existsByEmail(input.email, id);
        if (emailExists) {
          throw new ConflictError('Bu e-posta adresi zaten kullanılıyor');
        }
        updateData.email = input.email;
      }
    }

    // CompanyId change (only SUPER_ADMIN can change company)
    if (input.companyId !== undefined) {
      if (currentUser.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Şirket değiştirme yetkiniz yok');
      }
      
      // Validate that company exists
      const company = await companyRepository.findById(input.companyId);
      if (!company) {
        throw new NotFoundError('Şirket bulunamadı');
      }
      
      updateData.companyId = input.companyId;
    }

    // Password change
    if (input.password) {
      // Validate password strength
      const passwordValidation = strongPasswordSchema.safeParse(input.password);
      if (!passwordValidation.success) {
        throw new AppError(
          passwordValidation.error.errors.map(e => e.message).join(', '),
          400
        );
      }
      updateData.password = await bcrypt.hash(input.password, 12);
    }

    // Role change (only ADMIN/SUPER_ADMIN can do this)
    if (input.role && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN')) {
      // Admin cannot promote to SUPER_ADMIN
      if (input.role === 'SUPER_ADMIN' && currentUser.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Süper Admin rolü atama yetkiniz yok');
      }
      // Admin cannot change another admin's role
      if (user.role === 'ADMIN' && currentUser.role === 'ADMIN') {
        throw new ForbiddenError('Başka bir adminin rolünü değiştiremezsiniz');
      }
      updateData.role = input.role;
    }

    // Permissions update (only for STAFF role)
    // Only update permissions if explicitly provided and user has permission to update
    if (input.permissions !== undefined && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN')) {
      const finalRole = input.role || user.role;
      if (finalRole === 'STAFF') {
        // Update permissions for STAFF role
        updateData.permissions = input.permissions;
      } else if (input.role && input.role !== 'STAFF') {
        // If role is being changed from STAFF to something else, clear permissions
        updateData.permissions = null;
      }
      // If role is not STAFF and not changing, don't update permissions
    }

    const updated = await userRepository.update(id, updateData);

    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phone: updated.phone,
      role: updated.role,
      permissions: updated.permissions,
      isActive: updated.isActive,
      companyId: updated.companyId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Delete user (with permission checks)
   */
  async deleteUser(
    id: string,
    currentUser: { companyId: string; role: UserRole; id: string }
  ): Promise<void> {
    // Cannot delete yourself (even SUPER_ADMIN cannot delete themselves)
    if (id === currentUser.id) {
      throw new AppError('Kendinizi silemezsiniz', 400);
    }

    const user = await userRepository.findById(id);

    if (!user) {
      throw new NotFoundError('Kullanıcı bulunamadı');
    }

    // SUPER_ADMIN can delete anyone (except themselves, checked above)
    if (currentUser.role === 'SUPER_ADMIN') {
      // No restrictions for SUPER_ADMIN - can delete anyone including other SUPER_ADMINs
      await userRepository.delete(id);
      return;
    }

    // For non-SUPER_ADMIN users, apply restrictions
    // Check company isolation
    if (user.companyId !== currentUser.companyId) {
      throw new ForbiddenError('Bu kullanıcıya erişim yetkiniz yok');
    }

    // Only ADMIN can delete users
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenError('Kullanıcı silme yetkiniz yok');
    }

    // Admin cannot delete another ADMIN
    if (user.role === 'ADMIN') {
      throw new ForbiddenError('Başka bir admin silinemez');
    }

    await userRepository.delete(id);
  }
}

export const userService = new UserService();

