import { warehouseRepository, CreateWarehouseData, UpdateWarehouseData } from '../repositories/warehouse.repository.js';
import { ConflictError, NotFoundError, AppError } from '../middleware/error.middleware.js';
import { generateWarehouseCode } from '../utils/helpers.js';

class WarehouseService {
  async getWarehouses(companyId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  }) {
    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    const { warehouses, total } = await warehouseRepository.findByCompany(companyId, {
      skip,
      take,
      search: options?.search,
      isActive: options?.isActive,
    });

    return {
      warehouses,
      pagination: {
        page: options?.page || 1,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async getWarehouseById(id: string, companyId: string) {
    const warehouse = await warehouseRepository.findByIdAndCompany(id, companyId);

    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    return warehouse;
  }

  async createWarehouse(companyId: string, data: Omit<CreateWarehouseData, 'companyId' | 'code'> & { code?: string }) {
    // Generate code if not provided
    const code = data.code || generateWarehouseCode(data.name);

    // Check if code exists
    const exists = await warehouseRepository.existsByCode(companyId, code);
    if (exists) {
      throw new ConflictError('Bu depo kodu zaten kullanımda');
    }

    return warehouseRepository.create({
      ...data,
      code,
      companyId,
    });
  }

  async updateWarehouse(id: string, companyId: string, data: UpdateWarehouseData) {
    const warehouse = await warehouseRepository.findByIdAndCompany(id, companyId);

    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    // Check if new code conflicts
    if (data.code && data.code !== warehouse.code) {
      const exists = await warehouseRepository.existsByCode(companyId, data.code, id);
      if (exists) {
        throw new ConflictError('Bu depo kodu zaten kullanımda');
      }
    }

    return warehouseRepository.update(id, companyId, data);
  }

  async deleteWarehouse(id: string, companyId: string) {
    const warehouse = await warehouseRepository.findByIdAndCompany(id, companyId);

    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    // Default warehouse cannot be deleted unless another default exists
    if (warehouse.isDefault) {
      // Check if there's another default warehouse
      const otherDefault = await warehouseRepository.findByCompany(companyId, {
        isActive: true,
      });
      
      const hasOtherDefault = otherDefault.warehouses.some(
        w => w.id !== id && w.isDefault
      );
      
      if (!hasOtherDefault) {
        throw new AppError('Varsayılan depo silinemez. Önce başka bir depoyu varsayılan yapın.', 400);
      }
    }

    await warehouseRepository.delete(id);
  }

  async getActiveWarehouses(companyId: string) {
    return warehouseRepository.getActiveWarehouses(companyId);
  }

  async setDefaultWarehouse(id: string, companyId: string) {
    const warehouse = await warehouseRepository.findByIdAndCompany(id, companyId);

    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    // Unset all other default warehouses for this company
    const { prisma } = await import('../config/index.js');
    await prisma.warehouse.updateMany({
      where: {
        companyId,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });

    // Set this warehouse as default
    return warehouseRepository.update(id, companyId, { isDefault: true });
  }

  // Depo istatistiklerini getir
  async getWarehouseStats(id: string, companyId: string) {
    const warehouse = await warehouseRepository.findByIdAndCompany(id, companyId);

    if (!warehouse) {
      throw new NotFoundError('Depo bulunamadı');
    }

    return warehouseRepository.getWarehouseStats(id);
  }

  // Tüm depoların istatistiklerini getir
  async getAllWarehouseStats(companyId: string) {
    return warehouseRepository.getAllWarehouseStats(companyId);
  }
}

export const warehouseService = new WarehouseService();

