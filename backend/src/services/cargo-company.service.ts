import { cargoCompanyRepository, CreateCargoCompanyData, UpdateCargoCompanyData } from '../repositories/cargo-company.repository.js';
import { NotFoundError, ConflictError } from '../middleware/error.middleware.js';

class CargoCompanyService {
  async getCargoCompanies(companyId: string | null, options?: {
    page?: number;
    limit?: number;
    isActive?: boolean;
  }) {
    const skip = ((options?.page || 1) - 1) * (options?.limit || 20);
    const take = options?.limit || 20;

    return cargoCompanyRepository.findByCompany(companyId, {
      skip,
      take,
      isActive: options?.isActive,
    });
  }

  async getCargoCompanyById(id: string, companyId?: string) {
    const company = await cargoCompanyRepository.findById(id, companyId);
    if (!company) {
      throw new NotFoundError('Kargo firması bulunamadı');
    }
    return company;
  }

  async createCargoCompany(companyId: string | null, data: CreateCargoCompanyData) {
    // Check if code already exists
    const existing = await cargoCompanyRepository.findByCode(data.code, companyId ?? undefined);
    if (existing) {
      throw new ConflictError('Bu kargo firması kodu zaten kullanımda');
    }

    return cargoCompanyRepository.create({
      ...data,
      companyId: companyId ?? undefined,
    });
  }

  async updateCargoCompany(id: string, companyId: string | null, data: UpdateCargoCompanyData) {
    await this.getCargoCompanyById(id, companyId ?? undefined);
    return cargoCompanyRepository.update(id, data);
  }

  async deleteCargoCompany(id: string, companyId: string | null) {
    await this.getCargoCompanyById(id, companyId ?? undefined);
    await cargoCompanyRepository.delete(id);
  }
}

export const cargoCompanyService = new CargoCompanyService();

